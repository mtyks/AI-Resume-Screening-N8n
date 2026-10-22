-- สรุปจำนวนผู้สมัครรายตำแหน่ง (ทั้งหมด / 7 วันล่าสุด / ยังไม่อ่าน) ใช้โดย n8n workflow
-- Resume-Screening-Weekly-Summary ส่งอีเมลถึง HR/Admin ทุกวันจันทร์ 09:00 (เวลาไทย)
-- ใช้แทนระบบแจ้งเตือนตามขั้น (unread_alert_check / unread_alert_ack / unread_alert_state ไม่ได้ใช้แล้ว)
create or replace function public.weekly_applicant_summary()
returns table (position_name text, total bigint, new_7d bigint, unread bigint)
language sql stable security definer set search_path = public as $$
  select j.position_name,
         count(c.candidate_id),
         count(*) filter (where c.received_at >= now() - interval '7 days'),
         count(*) filter (where not c.is_read)
  from job_requirements j
  left join candidates c on c.applied_position = j.position_name
  group by j.position_name
  having count(c.candidate_id) > 0
  order by count(c.candidate_id) desc, j.position_name;
$$;
revoke all on function public.weekly_applicant_summary() from public, anon, authenticated;
grant execute on function public.weekly_applicant_summary() to service_role;
