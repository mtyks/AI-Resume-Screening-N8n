-- นัดสัมภาษณ์: HR ตั้งวันเวลา ระบบส่งอีเมลยืนยัน (แนบไฟล์ปฏิทิน .ics) ผ่าน n8n
create table if not exists public.interviews (
  id bigint generated always as identity primary key,
  candidate_id text not null references public.candidates(candidate_id) on delete cascade,
  uid text not null default gen_random_uuid()::text,
  starts_at timestamptz not null,
  duration_min int not null default 60 check (duration_min between 15 and 480),
  mode text not null default 'onsite' check (mode in ('onsite','online')),
  location text check (location is null or char_length(location) <= 300),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  sequence int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirm_sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create unique index if not exists interviews_one_active on public.interviews (candidate_id) where status = 'scheduled';
create index if not exists interviews_pending_mail on public.interviews (id) where confirm_sent_at is null;
create index if not exists interviews_starts on public.interviews (starts_at);
alter table public.interviews enable row level security;
drop policy if exists "staff read interviews" on public.interviews;
create policy "staff read interviews" on public.interviews for select to authenticated using (public.is_staff());
revoke all on public.interviews from anon;
revoke insert, update, delete on public.interviews from authenticated;
grant all on public.interviews to service_role;

create or replace function public.schedule_interview(
  p_candidate_id text, p_starts_at timestamptz, p_duration int default 60, p_mode text default 'onsite',
  p_location text default null, p_note text default null, p_notify boolean default true)
returns bigint language plpgsql security definer set search_path = public as $$
declare c record; v_id bigint; v_notify boolean;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' then raise exception 'กรุณาเลือกวันเวลาในอนาคต'; end if;
  if p_starts_at > now() + interval '1 year' then raise exception 'วันนัดไกลเกินไป'; end if;
  if p_mode not in ('onsite','online') then raise exception 'รูปแบบการสัมภาษณ์ไม่ถูกต้อง'; end if;
  select * into c from public.candidates where candidate_id = p_candidate_id;
  if not found then raise exception 'ไม่พบผู้สมัคร'; end if;
  v_notify := p_notify and coalesce(c.email,'') <> '';
  update public.interviews set starts_at = p_starts_at, duration_min = greatest(15, least(coalesce(p_duration,60), 480)), mode = p_mode,
         location = left(nullif(trim(p_location),''), 300), note = left(nullif(trim(p_note),''), 1000),
         sequence = sequence + 1, updated_at = now(), attempts = 0, last_error = null,
         confirm_sent_at = case when v_notify then null else now() end, created_by = public.audit_actor()
   where candidate_id = p_candidate_id and status = 'scheduled' returning id into v_id;
  if v_id is null then
    insert into public.interviews (candidate_id, starts_at, duration_min, mode, location, note, created_by, confirm_sent_at)
    values (p_candidate_id, p_starts_at, greatest(15, least(coalesce(p_duration,60), 480)), p_mode,
            left(nullif(trim(p_location),''), 300), left(nullif(trim(p_note),''), 1000), public.audit_actor(),
            case when v_notify then null else now() end)
    returning id into v_id;
  end if;
  if c.application_status = 'In Review' then
    update public.candidates set application_status = 'Interview' where candidate_id = p_candidate_id;
  end if;
  insert into audit_log (actor, action, target, detail)
  values (public.audit_actor(), 'interview_schedule', p_candidate_id, jsonb_build_object('at', p_starts_at, 'mode', p_mode, 'notify', v_notify));
  return v_id;
end $$;
revoke all on function public.schedule_interview(text, timestamptz, int, text, text, text, boolean) from public, anon;
grant execute on function public.schedule_interview(text, timestamptz, int, text, text, text, boolean) to authenticated;

create or replace function public.cancel_interview(p_id bigint, p_notify boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare i record; c record; v_notify boolean;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into i from public.interviews where id = p_id and status = 'scheduled';
  if not found then return false; end if;
  select * into c from public.candidates where candidate_id = i.candidate_id;
  v_notify := p_notify and coalesce(c.email,'') <> '';
  update public.interviews set status = 'cancelled', sequence = sequence + 1, updated_at = now(), attempts = 0, last_error = null,
         confirm_sent_at = case when v_notify then null else now() end
   where id = p_id;
  insert into audit_log (actor, action, target, detail)
  values (public.audit_actor(), 'interview_cancel', i.candidate_id, jsonb_build_object('notify', v_notify));
  return true;
end $$;
revoke all on function public.cancel_interview(bigint, boolean) from public, anon;
grant execute on function public.cancel_interview(bigint, boolean) to authenticated;
