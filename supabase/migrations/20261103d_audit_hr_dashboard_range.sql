-- (ก) ให้ HR ดู "ประวัติการใช้งาน" ได้ (อ่านอย่างเดียว) และบันทึกการกระทำเพิ่ม: แก้ตำแหน่งงาน/น้ำหนัก/เกณฑ์,
--     สั่งสแกนซ้ำ, เพิ่ม-ลบ-เปลี่ยนสิทธิ์ผู้ใช้, เปลี่ยนค่าตั้งระบบ (ไม่เก็บข้อมูลส่วนตัว เก็บแค่รหัส/ชื่อฟิลด์)
-- (ข) Dashboard เลือกช่วงวันที่ได้ (วันที่ตามเวลาไทย) และมีสรุปผู้สมัครรายตำแหน่ง รวม/อ่านแล้ว/ยังไม่อ่าน
-- ไม่ลบหรือแก้ข้อมูลเดิม รันซ้ำได้

-- (ก1) สิทธิ์อ่าน audit_log: จาก Admin อย่างเดียว -> HR และ Admin
drop policy if exists "admin reads audit_log" on public.audit_log;
drop policy if exists "staff reads audit_log" on public.audit_log;
create policy "staff reads audit_log" on public.audit_log for select to authenticated using (public.is_staff());

-- (ก2) ผู้สมัคร: เพิ่มการบันทึก "สั่งสแกนซ้ำ"
create or replace function public.trg_audit_candidates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.application_status is distinct from old.application_status then
      insert into audit_log (actor, action, target, detail)
      values (audit_actor(), 'status_change', new.candidate_id, jsonb_build_object('from', old.application_status, 'to', new.application_status));
    end if;
    if new.hr_note is distinct from old.hr_note then
      insert into audit_log (actor, action, target) values (audit_actor(), 'note_edit', new.candidate_id);
    end if;
    if new.rescan_requested_at is not null and new.rescan_requested_at is distinct from old.rescan_requested_at then
      insert into audit_log (actor, action, target) values (audit_actor(), 'rescan', new.candidate_id);
    end if;
    return new;
  end if;
  insert into audit_log (actor, action, target) values (audit_actor(), 'candidate_removed', old.candidate_id);
  return old;
end $$;
revoke all on function public.trg_audit_candidates() from public, anon, authenticated;

-- (ก3) ตำแหน่งงาน: ใครสร้าง/แก้/ลบ และแก้ฟิลด์ไหน (ค่าตัวเลข/สถานะเก็บ จาก->เป็น)
create or replace function public.trg_audit_jobs() returns trigger
language plpgsql security definer set search_path = public as $$
declare chg jsonb := '{}'::jsonb; k text; ks text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into audit_log (actor, action, target, detail) values (audit_actor(), 'job_create', new.job_id, jsonb_build_object('name', new.position_name));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (actor, action, target, detail) values (audit_actor(), 'job_delete', old.job_id, jsonb_build_object('name', old.position_name));
    return old;
  end if;
  for k in select jsonb_object_keys(to_jsonb(new)) loop
    if to_jsonb(new) -> k is distinct from to_jsonb(old) -> k then
      ks := ks || k;
      if k in ('weight_musthave', 'weight_preferred', 'weight_tool', 'match_threshold', 'min_experience_years', 'is_active', 'open_at', 'close_at', 'position_name') then
        chg := chg || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k));
      end if;
    end if;
  end loop;
  if array_length(ks, 1) is not null then
    insert into audit_log (actor, action, target, detail)
    values (audit_actor(), 'job_update', new.job_id, jsonb_build_object('name', new.position_name, 'fields', to_jsonb(ks), 'changes', chg));
  end if;
  return new;
end $$;
revoke all on function public.trg_audit_jobs() from public, anon, authenticated;
drop trigger if exists audit_jobs on public.job_requirements;
create trigger audit_jobs after insert or update or delete on public.job_requirements for each row execute function public.trg_audit_jobs();

-- (ก4) ผู้ใช้ที่ได้รับสิทธิ์: เพิ่ม/ลบ/เปลี่ยนบทบาท
create or replace function public.trg_audit_users() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (actor, action, target, detail) values (audit_actor(), 'user_add', new.email, jsonb_build_object('role', new.role));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (actor, action, target, detail) values (audit_actor(), 'user_remove', old.email, jsonb_build_object('role', old.role));
    return old;
  end if;
  if new.role is distinct from old.role then
    insert into audit_log (actor, action, target, detail) values (audit_actor(), 'user_role', new.email, jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end $$;
revoke all on function public.trg_audit_users() from public, anon, authenticated;
drop trigger if exists audit_users on public.authorized_users;
create trigger audit_users after insert or update or delete on public.authorized_users for each row execute function public.trg_audit_users();

-- (ก5) ค่าตั้งระบบ (AI ที่ใช้): ค่าไม่ใช่ความลับ (gemini / gemini_backup)
create or replace function public.trg_audit_config() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.config_value is distinct from old.config_value then
    insert into audit_log (actor, action, target, detail)
    values (audit_actor(), 'config_change', new.config_key, jsonb_build_object('from', old.config_value, 'to', new.config_value));
  end if;
  return new;
end $$;
revoke all on function public.trg_audit_config() from public, anon, authenticated;
drop trigger if exists audit_config on public.system_config;
create trigger audit_config after update on public.system_config for each row execute function public.trg_audit_config();

-- (ข) Dashboard เลือกช่วงวันที่: dashboard_summary(p_job, p_from, p_to) วันที่เป็นเวลาไทย รวมวันที่ p_to ทั้งวัน
create or replace function public.dashboard_summary(p_job text, p_from date, p_to date)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_from date := least(coalesce(p_from, (now() at time zone 'Asia/Bangkok')::date), coalesce(p_to, (now() at time zone 'Asia/Bangkok')::date));
  v_to   date := greatest(coalesce(p_from, (now() at time zone 'Asia/Bangkok')::date), coalesce(p_to, (now() at time zone 'Asia/Bangkok')::date));
  d int;
  t0 timestamptz; t1 timestamptz; tp timestamptz;
  pos text;
  res jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if v_to - v_from > 365 then raise exception 'range too long'; end if;
  d := (v_to - v_from) + 1;
  t0 := v_from::timestamp at time zone 'Asia/Bangkok';
  t1 := (v_to + 1)::timestamp at time zone 'Asia/Bangkok';
  tp := t0 - (t1 - t0);
  if p_job is not null then select position_name into pos from public.job_requirements where job_id = p_job; end if;

  with
  c as (select cd.* from public.candidates cd where p_job is null or cd.applied_position = pos),
  cur as (select * from c where received_at >= t0 and received_at < t1),
  prv as (select * from c where received_at >= tp and received_at < t0),
  lt as (
    select distinct on (m.candidate_id, j.job_id)
      m.candidate_id, m.match_score::numeric as sc, m.gate_status, j.match_threshold as thr, c.received_at
    from public.match_results m
    join public.job_requirements j on j.job_id = m.job_id
    join c on c.candidate_id = m.candidate_id and c.applied_position = j.position_name
    order by m.candidate_id, j.job_id, m.evaluated_at desc
  ),
  ltc as (select * from lt where received_at >= t0 and received_at < t1),
  ltp as (select * from lt where received_at >= tp and received_at < t0),
  days as (select generate_series(v_from, v_to, interval '1 day')::date as dd)
  select jsonb_build_object(
    'days', d,
    'from', v_from, 'to', v_to,
    'active_openings', (select count(*) from public.job_requirements where is_active and (close_at is null or close_at > now())),
    'total', (select count(*) from cur),
    'prev_total', (select count(*) from prv),
    'avg_score', (select round(avg(sc), 1) from ltc),
    'prev_avg_score', (select round(avg(sc), 1) from ltp),
    'median_minutes', (select round((percentile_cont(0.5) within group (order by extract(epoch from (lm.lm - cur.last_attempt_at)) / 60))::numeric, 2)
                       from cur join (select m.candidate_id, max(m.evaluated_at) as lm from public.match_results m group by m.candidate_id) lm on lm.candidate_id = cur.candidate_id
                       where cur.last_attempt_at is not null and lm.lm >= cur.last_attempt_at),
    'funnel', jsonb_build_object(
      'applied', (select count(*) from cur),
      'scanned', (select count(*) from cur where processing_status = 'processed'),
      'passed', (select count(*) from ltc where gate_status = 'Pass' and sc >= thr),
      'interview', (select count(*) from cur where application_status in ('Interview', 'Offer', 'Hired')),
      'offer', (select count(*) from cur where application_status in ('Offer', 'Hired')),
      'hired', (select count(*) from cur where application_status = 'Hired'),
      'rejected', (select count(*) from cur where application_status = 'Rejected')),
    'inflow', (select coalesce(jsonb_agg(jsonb_build_object('d', dd, 'n', (select count(*) from cur where (cur.received_at at time zone 'Asia/Bangkok')::date = dd)) order by dd), '[]'::jsonb) from days),
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'n', n) order by n desc, nm), '[]'::jsonb)
               from (select min(trim(s)) as nm, count(distinct cur.candidate_id) as n from cur, jsonb_array_elements_text(case when jsonb_typeof(cur.skills) = 'array' then cur.skills else '[]'::jsonb end) s
                     where trim(s) <> '' group by lower(trim(s)) order by n desc limit 10) q),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'n', n) order by n desc, nm), '[]'::jsonb)
                from (select coalesce(nullif(trim(source), ''), 'ไม่ระบุ') as nm, count(*) as n from cur group by 1) q),
    'buckets', (select jsonb_agg((select count(*) from ltc where least(floor(sc / 10), 9) = g) order by g) from generate_series(0, 9) g),
    'positions', (select coalesce(jsonb_agg(jsonb_build_object('job_id', j.job_id, 'name', j.position_name, 'is_active', j.is_active,
                         'total', x.total, 'read', x.rd, 'unread', x.total - x.rd) order by x.total desc, j.position_name), '[]'::jsonb)
                  from public.job_requirements j
                  cross join lateral (select count(*) as total, count(*) filter (where cur.is_read) as rd from cur where cur.applied_position = j.position_name) x
                  where p_job is null or j.job_id = p_job)
  ) into res;
  return res;
end $$;
revoke all on function public.dashboard_summary(text, date, date) from public, anon;
grant execute on function public.dashboard_summary(text, date, date) to authenticated;
