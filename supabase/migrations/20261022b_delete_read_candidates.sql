-- =====================================================================
-- ส่วนที่ "ลบข้อมูล" ของปุ่ม "ลบที่อ่านแล้ว" — ต้องรันเองใน Supabase SQL Editor หนึ่งครั้ง
-- (เครื่องมืออัตโนมัติของผมรันคำสั่งที่มีการลบข้อมูลไม่ได้)
-- รันหลัง 20261022_applicants_features.sql
-- =====================================================================

-- 5) ลบผู้สมัครที่อ่านแล้วของตำแหน่งหนึ่งถาวร
--    ข้ามคนที่ติดดาวและคนที่สถานะ "รับเข้าทำงาน" เสมอ คืนที่อยู่ไฟล์ Resume เพื่อให้เว็บลบไฟล์ใน Storage ต่อ
create or replace function public.delete_read_candidates(p_job_id text)
returns setof text
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_name text;
  v_ids text[];
begin
  if not public.is_staff() then
    raise exception 'ไม่มีสิทธิ์ลบข้อมูลผู้สมัคร';
  end if;
  select position_name into v_name from job_requirements where job_id = p_job_id;
  if v_name is null then
    raise exception 'ไม่พบตำแหน่งงาน';
  end if;
  select coalesce(array_agg(c.candidate_id), '{}') into v_ids from candidates c
   where c.applied_position = v_name and c.is_read and not c.starred and c.application_status <> 'Hired';
  delete from system_logs  where candidate_id = any (v_ids);
  delete from match_results where candidate_id = any (v_ids);
  return query with d as (delete from candidates where candidate_id = any (v_ids) returning resume_file_url) select d.resume_file_url from d;
end $$;
revoke all on function public.delete_read_candidates(text) from public, anon;
grant execute on function public.delete_read_candidates(text) to authenticated;

-- 6) HR/Admin ลบไฟล์ Resume ใน Storage ได้ (ใช้คู่กับ delete_read_candidates)
create policy "staff delete resumes" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and public.is_staff());

