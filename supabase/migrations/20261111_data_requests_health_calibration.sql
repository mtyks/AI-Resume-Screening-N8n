-- 1) คอลัมน์สำหรับ workflow n8n ใหม่ (ยืนยันรับใบสมัคร / แจ้ง HR คะแนนสูง)
--    ผู้สมัครเดิมถูกตั้งเป็น "ส่งแล้ว" เพื่อไม่ให้ระบบส่งอีเมลย้อนหลัง
alter table public.candidates add column if not exists receipt_email_at timestamptz;
alter table public.candidates add column if not exists hr_notified_at timestamptz;
update public.candidates set receipt_email_at = coalesce(receipt_email_at, now()), hr_notified_at = coalesce(hr_notified_at, now())
 where receipt_email_at is null or hr_notified_at is null;
comment on column public.candidates.receipt_email_at is 'เวลาที่ n8n ส่งอีเมลยืนยันรับใบสมัครถึงผู้สมัครแล้ว';
comment on column public.candidates.hr_notified_at is 'เวลาที่ n8n แจ้ง HR/Admin ว่ามีผู้สมัครผ่านเกณฑ์แล้ว';

-- 2) คำขอลบข้อมูลตาม PDPA
create table if not exists public.data_requests (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) between 5 and 254),
  full_name text check (full_name is null or char_length(full_name) <= 200),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open','done','rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text,
  deleted_count integer
);
comment on table public.data_requests is 'คำขอลบข้อมูลส่วนบุคคลจากผู้สมัคร (PDPA) HR/Admin อ่านและดำเนินการผ่านฟังก์ชันเท่านั้น';
alter table public.data_requests enable row level security;
drop policy if exists "staff read data_requests" on public.data_requests;
create policy "staff read data_requests" on public.data_requests for select to authenticated using (public.is_staff());

-- ผู้สมัครส่งคำขอได้โดยไม่ต้องล็อกอิน: จำกัดอัตรา และตอบเหมือนกันเสมอ (ไม่เปิดเผยว่าอีเมลนี้เคยสมัครหรือไม่)
create or replace function public.submit_data_request(p_email text, p_name text default null, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 254 then raise exception 'อีเมลไม่ถูกต้อง'; end if;
  if not public.rate_limit_hit('dr:all', 60, 3600) or not public.rate_limit_hit('dr:' || e, 3, 86400) then
    raise exception 'ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ภายหลัง';
  end if;
  insert into data_requests (email, full_name, note) values (e, left(nullif(trim(p_name), ''), 200), left(nullif(trim(p_note), ''), 1000));
  return true;
end $$;
revoke all on function public.submit_data_request(text, text, text) from public;
grant execute on function public.submit_data_request(text, text, text) to anon, authenticated;

-- HR/Admin ดำเนินการลบ: ลบทุกใบสมัครของอีเมลนั้น คืนที่อยู่ไฟล์ Resume ให้เว็บลบไฟล์ใน Storage ต่อ
create or replace function public.fulfill_data_request(p_id bigint)
returns setof text language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r record; v_ids text[]; n int;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into r from data_requests where id = p_id for update;
  if not found then raise exception 'ไม่พบคำขอ'; end if;
  if r.status <> 'open' then raise exception 'คำขอนี้ดำเนินการไปแล้ว'; end if;
  select coalesce(array_agg(candidate_id), '{}') into v_ids from candidates where lower(email) = lower(r.email);
  n := coalesce(array_length(v_ids, 1), 0);
  delete from system_logs where candidate_id = any (v_ids);
  delete from status_email_outbox where candidate_id = any (v_ids);
  delete from match_results where candidate_id = any (v_ids);
  update data_requests set status = 'done', handled_at = now(), handled_by = public.audit_actor(), deleted_count = n where id = p_id;
  insert into audit_log (actor, action, target, detail) values (public.audit_actor(), 'data_request_delete', 'request #' || p_id, jsonb_build_object('candidates', n));
  return query with d as (delete from candidates where candidate_id = any (v_ids) returning resume_file_url) select d.resume_file_url from d;
end $$;
revoke all on function public.fulfill_data_request(bigint) from public, anon;
grant execute on function public.fulfill_data_request(bigint) to authenticated;

create or replace function public.reject_data_request(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  update data_requests set status = 'rejected', handled_at = now(), handled_by = public.audit_actor() where id = p_id and status = 'open';
  insert into audit_log (actor, action, target, detail) values (public.audit_actor(), 'data_request_reject', 'request #' || p_id, null);
end $$;
revoke all on function public.reject_data_request(bigint) from public, anon;
grant execute on function public.reject_data_request(bigint) to authenticated;

-- 3) เปลี่ยนสถานะหลายคนพร้อมกัน (ใช้กติกาเดียวกับ set_application_status) คืนจำนวนที่เปลี่ยนจริง
create or replace function public.set_application_status_many(p_ids text[], p_status text, p_notify boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare n int := 0; i text;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 200 then raise exception 'เปลี่ยนสถานะได้ครั้งละไม่เกิน 200 คน'; end if;
  foreach i in array p_ids loop
    if public.set_application_status(i, p_status, p_notify) then n := n + 1; end if;
  end loop;
  insert into audit_log (actor, action, target, detail) values (public.audit_actor(), 'bulk_status', left(p_status, 40), jsonb_build_object('changed', n, 'notify', p_notify));
  return n;
end $$;
revoke all on function public.set_application_status_many(text[], text, boolean) from public, anon;
grant execute on function public.set_application_status_many(text[], text, boolean) to authenticated;

-- 4) สุขภาพระบบ (เฉพาะ HR/Admin)
create or replace function public.system_health()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  select jsonb_build_object(
    'pending', count(*) filter (where processing_status = 'pending'),
    'failed', count(*) filter (where processing_status = 'failed'),
    'processed', count(*) filter (where processing_status = 'processed'),
    'total', count(*),
    'oldest_pending_minutes', coalesce((select extract(epoch from (now() - min(greatest(received_at, last_attempt_at, rescan_requested_at))))::int / 60 from candidates where processing_status = 'pending'), 0)
  ) into r from candidates;
  r := r || jsonb_build_object(
    'stuck', (select stuck from pipeline_health()),
    'last_processed_at', (select max(evaluated_at) from match_results),
    'last_success_log_at', (select max("timestamp") from system_logs where status = 'Success'),
    'errors_24h', (select count(*) from system_logs where status = 'Error' and "timestamp" > now() - interval '24 hours'),
    'outbox_waiting', (select count(*) from status_email_outbox where sent_at is null and attempts < 5),
    'outbox_failed', (select count(*) from status_email_outbox where sent_at is null and attempts >= 5),
    'receipt_waiting', (select count(*) from candidates where receipt_email_at is null and coalesce(email, '') <> ''),
    'open_data_requests', (select count(*) from data_requests where status = 'open'),
    'next_purge_count', (select count(*) from candidates where retention_until is not null and retention_until < now())
  );
  return r;
end $$;
revoke all on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;

-- 5) ตรวจเทียบคะแนนระบบกับผลตัดสินของ HR (ใช้ผลประเมินล่าสุดของแต่ละคน)
--    "ระบบแนะนำ" = Gate ผ่าน และคะแนน >= เกณฑ์ของตำแหน่ง ; "HR เห็นด้วย" = สถานะ Interview/Offer/Hired
create or replace function public.calibration_summary(p_job_id text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  with latest as (
    select distinct on (m.candidate_id) m.candidate_id, m.job_id, m.match_score, m.gate_status
      from match_results m order by m.candidate_id, m.evaluated_at desc
  ), x as (
    select c.candidate_id, c.full_name, c.applied_position, c.application_status st, l.match_score score, l.gate_status gate,
           j.match_threshold thr, (l.gate_status = 'Pass' and l.match_score >= j.match_threshold) as sys_yes,
           (c.application_status in ('Interview','Offer','Hired')) as hr_yes,
           (c.application_status <> 'In Review') as decided
      from candidates c join latest l on l.candidate_id = c.candidate_id
      join job_requirements j on j.job_id = l.job_id
     where p_job_id is null or l.job_id = p_job_id
  )
  select jsonb_build_object(
    'scored', (select count(*) from x),
    'decided', (select count(*) from x where decided),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('status', st, 'n', n, 'avg', avg, 'min', mn, 'max', mx) order by st) from (
        select st, count(*) n, round(avg(score), 1) avg, min(score) mn, max(score) mx from x group by st) s), '[]'::jsonb),
    'tp', (select count(*) from x where decided and sys_yes and hr_yes),
    'fp', (select count(*) from x where decided and sys_yes and not hr_yes),
    'fn', (select count(*) from x where decided and not sys_yes and hr_yes),
    'tn', (select count(*) from x where decided and not sys_yes and not hr_yes),
    'disagree', coalesce((select jsonb_agg(to_jsonb(d)) from (
        select candidate_id, full_name, applied_position, st as status, score, gate, thr from x
         where decided and sys_yes <> hr_yes order by abs(score - thr) desc limit 20) d), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.calibration_summary(text) from public, anon;
grant execute on function public.calibration_summary(text) to authenticated;
