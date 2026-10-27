-- แจ้งสถานะทางอีเมล + ตรวจสุขภาพคิวประมวลผล (ถูกรันในฐานข้อมูลจริงแล้ว ไม่ต้องรันซ้ำ)
alter table public.candidates add column if not exists rescan_requested_at timestamptz;

create table if not exists public.status_email_outbox (
  id bigint generated always as identity primary key,
  candidate_id text not null references public.candidates(candidate_id) on delete cascade,
  to_email text not null,
  full_name text,
  position_name text,
  status text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index if not exists status_email_outbox_unsent on public.status_email_outbox (id) where sent_at is null;
alter table public.status_email_outbox enable row level security;
revoke all on public.status_email_outbox from anon, authenticated;
grant all on public.status_email_outbox to service_role;

create or replace function public.set_application_status(p_candidate_id text, p_status text, p_notify boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_status not in ('In Review','Hired','Rejected') then raise exception 'invalid status'; end if;
  select * into c from public.candidates where candidate_id = p_candidate_id;
  if not found then raise exception 'not found'; end if;
  if c.application_status = p_status then return false; end if;
  update public.candidates set application_status = p_status where candidate_id = p_candidate_id;
  if p_notify and coalesce(c.email,'') <> '' then
    insert into public.status_email_outbox (candidate_id, to_email, full_name, position_name, status)
    values (c.candidate_id, c.email, c.full_name, c.applied_position, p_status);
  end if;
  return true;
end $$;
revoke all on function public.set_application_status(text,text,boolean) from public, anon;
grant execute on function public.set_application_status(text,text,boolean) to authenticated;

create or replace function public.pipeline_health()
returns table(stuck int, oldest_minutes int) language sql stable security invoker set search_path = public as $$
  with p as (
    select greatest(received_at, last_attempt_at, rescan_requested_at) as t
    from public.candidates where processing_status = 'pending'
  )
  select count(*) filter (where t < now() - interval '15 minutes')::int,
         coalesce(max(extract(epoch from now() - t) / 60) filter (where t < now() - interval '15 minutes'), 0)::int
  from p;
$$;
grant execute on function public.pipeline_health() to authenticated;

-- guard + rescan RPC (ตรงกับที่ใช้งานจริงในฐานข้อมูล)
create or replace function public.guard_candidate_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() or current_user not in ('authenticated', 'anon') then return new; end if;
  if (to_jsonb(new) - 'application_status' - 'is_read' - 'read_at' - 'starred' - 'hr_note' - 'hr_note_at' - 'hr_note_by')
     is distinct from
     (to_jsonb(old) - 'application_status' - 'is_read' - 'read_at' - 'starred' - 'hr_note' - 'hr_note_at' - 'hr_note_by') then
    raise exception 'HR แก้ได้เฉพาะสถานะการสมัคร อ่านแล้ว ติดดาว และโน้ต';
  end if;
  if new.hr_note is distinct from old.hr_note then
    new.hr_note_by := lower(coalesce(auth.jwt() ->> 'email', ''));
    new.hr_note_at := now();
  end if;
  return new;
end $$;

create or replace function public.request_rescan(p_candidate_id text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.candidates set processing_status = 'pending', processing_error = null,
         last_attempt_at = null, error_notified_at = null, rescan_requested_at = now()
   where candidate_id = p_candidate_id;
  if not found then raise exception 'ไม่พบผู้สมัคร'; end if;
end $$;

create or replace function public.request_rescan_many(p_ids text[]) returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 200 then raise exception 'สแกนซ้ำได้ครั้งละไม่เกิน 200 คน'; end if;
  update public.candidates set processing_status = 'pending', processing_error = null,
         last_attempt_at = null, error_notified_at = null, rescan_requested_at = now()
   where candidate_id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;
