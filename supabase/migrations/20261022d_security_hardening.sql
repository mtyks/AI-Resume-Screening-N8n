-- =====================================================================
-- ปรับปรุงความปลอดภัย (ใช้กับฐานข้อมูลจริงไปแล้ว เก็บไว้เป็นบันทึก/ติดตั้งซ้ำได้)
-- =====================================================================

-- 1) ตัวป้องกันการแก้ผู้สมัคร: HR แก้ได้เฉพาะ สถานะ/อ่านแล้ว/ติดดาว/โน้ต (Admin แก้ได้ทุกช่อง)
--    และกันการปลอมชื่อผู้แก้โน้ต (อีเมลและเวลาถูกกำหนดจาก JWT ไม่ใช่ค่าที่ส่งมา)
create or replace function public.guard_candidate_update()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
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
end $function$;

-- 2) ตัดสิทธิ์ตารางที่ไม่ได้ใช้ (ชั้นป้องกันที่สองนอกเหนือ RLS)
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all on public.unread_alert_state from authenticated;
revoke execute on function public.list_position_applicants(text, text, text, text, boolean, boolean, text, int, int) from public, anon;
revoke execute on function public.position_stats() from public, anon;
alter default privileges in schema public revoke all on tables from anon;

-- 3) ที่เก็บไฟล์ Resume: จำกัดเฉพาะ PDF ไม่เกิน 5 MB (ตรงกับที่ Edge Function และ n8n ตรวจ)
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['application/pdf'] where id = 'resumes';
