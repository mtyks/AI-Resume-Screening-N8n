-- สคีมาส่วนที่เพิ่มสำหรับสิทธิ์ HR/Admin, ช่วงเปิดรับสมัคร และสแกนซ้ำ
-- (ตารางหลัก candidates, job_requirements, match_results, system_logs, system_config, authorized_users มีอยู่ก่อนแล้ว)

alter table public.job_requirements
  add column if not exists open_at timestamptz,
  add column if not exists close_at timestamptz,
  add column if not exists description text;
alter table public.candidates
  add column if not exists last_attempt_at timestamptz,
  add column if not exists error_notified_at timestamptz;

create or replace function public.app_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.authorized_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_role() in ('HR','Admin')
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'Admin'
$$;
revoke all on function public.app_role(), public.is_staff(), public.is_admin() from public, anon;
grant execute on function public.app_role(), public.is_staff(), public.is_admin() to authenticated;

create or replace function public.open_positions()
returns table (job_id text, position_name text, description text, min_experience_years numeric,
               must_have_skills jsonb, preferred_skills jsonb, required_tools jsonb, close_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select job_id, position_name, description, min_experience_years,
         must_have_skills, preferred_skills, required_tools, close_at
  from public.job_requirements
  where is_active
    and (open_at is null or open_at <= now())
    and (close_at is null or close_at >= now())
  order by position_name
$$;
grant execute on function public.open_positions() to anon, authenticated;

create or replace function public.request_rescan(p_candidate_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.candidates
     set processing_status = 'pending', processing_error = null,
         last_attempt_at = null, error_notified_at = null
   where candidate_id = p_candidate_id and processing_status in ('pending','failed');
  if not found then raise exception 'สแกนซ้ำได้เฉพาะผู้สมัครที่สถานะ pending หรือ failed'; end if;
end $$;
revoke all on function public.request_rescan(text) from public, anon;
grant execute on function public.request_rescan(text) to authenticated;

-- HR แก้ได้เฉพาะ application_status ส่วน Admin แก้ได้ทุกช่อง (service role จาก n8n ไม่ถูกจำกัด)
create or replace function public.guard_candidate_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if (to_jsonb(new) - 'application_status') is distinct from (to_jsonb(old) - 'application_status') then
    raise exception 'HR แก้ได้เฉพาะสถานะการสมัคร';
  end if;
  return new;
end $$;
create or replace trigger trg_guard_candidate_update before update on public.candidates
  for each row execute function public.guard_candidate_update();

create policy "staff read candidates" on public.candidates for select to authenticated using (public.is_staff());
create policy "staff update candidates" on public.candidates for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff read jobs" on public.job_requirements for select to authenticated using (public.is_staff());
create policy "staff insert jobs" on public.job_requirements for insert to authenticated with check (public.is_staff());
create policy "staff update jobs" on public.job_requirements for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin delete jobs" on public.job_requirements for delete to authenticated using (public.is_admin());
create policy "staff read match" on public.match_results for select to authenticated using (public.is_staff());
create policy "admin read logs" on public.system_logs for select to authenticated using (public.is_admin());
create policy "admin read config" on public.system_config for select to authenticated using (public.is_admin());
create policy "admin update config" on public.system_config for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read own or admin users" on public.authorized_users for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) or public.is_admin());
create policy "admin insert users" on public.authorized_users for insert to authenticated with check (public.is_admin());
create policy "admin update users" on public.authorized_users for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete users" on public.authorized_users for delete to authenticated using (public.is_admin());

-- เจ้าหน้าที่เปิดไฟล์ Resume ใน bucket ส่วนตัวได้
create policy "staff read resumes" on storage.objects for select to authenticated using (bucket_id = 'resumes' and public.is_staff());

-- Admin คนแรก (แก้เป็นอีเมลของคุณ)
-- insert into public.authorized_users (email, role) values ('you@example.com', 'Admin') on conflict (email) do nothing;
