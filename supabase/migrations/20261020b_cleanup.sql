-- ล้างของที่ไม่ได้ใช้ + ปรับประสิทธิภาพ (ใช้แล้วบนโปรเจกต์จริง)
create index if not exists idx_match_results_job on public.match_results (job_id);      -- FK -> job_requirements
create index if not exists idx_system_logs_candidate on public.system_logs (candidate_id); -- FK -> candidates
alter policy "read own or admin users" on public.authorized_users
  using (lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), '')) or public.is_admin());
alter function public.set_retention_until() set search_path = '';
alter policy "anon can read AI_PROVIDER" on public.system_config to authenticated;

-- ===== ส่วนที่ต้องรันเอง (คำสั่งลบ) — ไม่มีส่วนไหนของระบบใช้แล้ว =====
-- select cron.unschedule(jobid) from cron.job where command like '%cleanup_duplicate_candidates%';
-- drop function if exists public.cleanup_duplicate_candidates();
-- drop policy if exists "anon can read AI_PROVIDER" on public.system_config;
-- delete from public.system_config where config_key in ('MAX_RETRY','NGROK_URL');
