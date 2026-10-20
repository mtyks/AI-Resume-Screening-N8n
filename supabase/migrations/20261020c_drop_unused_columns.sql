-- ลบคอลัมน์ที่ไม่มีส่วนไหนใช้แล้ว (รันหลัง deploy เว็บเวอร์ชันใหม่เสร็จแล้วเท่านั้น
-- เพราะเว็บเวอร์ชันเก่ายังส่ง weight_experience / preferred_experience_type ตอนบันทึกตำแหน่ง)
alter table public.candidates        drop column if exists experience_years;          -- เดิมเก็บปีประสบการณ์ที่ AI อ่านได้ ตอนนี้ไม่มีใครเขียน/อ่าน
alter table public.match_results     drop column if exists score_basis;               -- ค่าคงที่เดียว ไม่มีความหมายแล้ว
alter table public.job_requirements  drop column if exists weight_experience;         -- ประสบการณ์ไม่นับคะแนนแล้ว
alter table public.job_requirements  drop column if exists preferred_experience_type; -- ไม่ได้ใช้ใน prompt หรือหน้าเว็บ
