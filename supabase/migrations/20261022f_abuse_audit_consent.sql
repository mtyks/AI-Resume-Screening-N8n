-- 1) PDPA: บันทึกเวลาที่ผู้สมัครกดยินยอม (ค่าเริ่มต้น = เวลาที่สร้างใบสมัคร เพราะฟอร์มบังคับติ๊กยินยอมก่อนส่ง)
alter table public.candidates add column if not exists consent_at timestamptz;
alter table public.candidates alter column consent_at set default now();
comment on column public.candidates.consent_at is 'เวลาที่ผู้สมัครยินยอมให้เก็บข้อมูล 90 วัน (ใบสมัครเก่าก่อนมีคอลัมน์นี้เป็น null)';

-- 2) Rate limit ฟรีด้วยฐานข้อมูล: นับจำนวนครั้งต่อ key ต่อช่วงเวลา (เรียกจาก Edge Function ด้วย service_role เท่านั้น)
create table if not exists public.rate_limits (
  k text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_secs int)
returns boolean  -- true = ยังไม่เกินโควตา
language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into rate_limits as r (k, window_start, hits) values (p_key, now(), 1)
  on conflict (k) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_secs) then now() else r.window_start end,
    hits = case when r.window_start < now() - make_interval(secs => p_window_secs) then 1 else r.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- 3) Audit log: ใครทำอะไรกับผู้สมัคร (ไม่เก็บเนื้อหาข้อมูลส่วนตัว เก็บแค่รหัสผู้สมัคร)
create table if not exists public.audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  text not null,
  action text not null,
  target text,
  detail jsonb
);
create index if not exists idx_audit_log_at on public.audit_log (at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists "admin reads audit_log" on public.audit_log;
create policy "admin reads audit_log" on public.audit_log for select to authenticated using (public.is_admin());

create or replace function public.audit_actor() returns text
language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'email', ''), 'ระบบอัตโนมัติ')
$$;

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
    return new;
  end if;
  insert into audit_log (actor, action, target) values (audit_actor(), 'candidate_removed', old.candidate_id);
  return old;
end $$;
revoke all on function public.trg_audit_candidates() from public, anon, authenticated;

drop trigger if exists audit_candidates_upd on public.candidates;
create trigger audit_candidates_upd after update on public.candidates for each row execute function public.trg_audit_candidates();
drop trigger if exists audit_candidates_del on public.candidates;
create trigger audit_candidates_del after delete on public.candidates for each row execute function public.trg_audit_candidates();

-- บันทึกการส่งออก CSV จากหน้าเว็บ (เฉพาะ HR/Admin และเฉพาะ action ที่อนุญาต)
create or replace function public.log_audit(p_action text, p_target text default null, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_action not in ('export_csv') then raise exception 'bad action'; end if;
  insert into audit_log (actor, action, target, detail) values (audit_actor(), p_action, left(p_target, 100), p_detail);
end $$;
revoke all on function public.log_audit(text, text, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, jsonb) to authenticated;
