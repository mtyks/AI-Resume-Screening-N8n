-- ค้นหาผู้สมัครข้ามทุกตำแหน่ง: พิมพ์ชื่อ/อีเมล/เบอร์/รหัส แล้วได้ "ทุกใบสมัคร" ของคนนั้น (จัดกลุ่มตามอีเมล)
-- พร้อมตำแหน่ง คะแนนล่าสุดของตำแหน่งนั้น และผล (ผ่านเกณฑ์/ต่ำกว่าเกณฑ์/ไม่ผ่าน Gate ฯลฯ)
-- ทำงานแบบ invoker จึงอยู่ใต้ RLS เดิม (เห็นได้เฉพาะ HR/Admin) เพิ่มฟังก์ชันใหม่เท่านั้น ไม่แก้/ไม่ลบข้อมูล
create or replace function public.search_applicants(p_q text)
returns table(candidate_id text, full_name text, phone_number text, email text, applied_position text,
              self_reported_experience_range text, skills jsonb, resume_file_url text, received_at timestamptz,
              application_status text, processing_status text, processing_error text, is_read boolean, starred boolean,
              hr_note text, job_id text, match_threshold numeric, match_score numeric, gate_status text,
              kind text, evaluated_at timestamptz)
language sql stable set search_path = public as $$
  with q as (
    select replace(replace(replace(trim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') as t
  ), hit as (
    select distinct lower(c.email) as em
    from candidates c, q
    where char_length(q.t) >= 2
      and (c.full_name ilike '%' || q.t || '%' or c.email ilike '%' || q.t || '%'
           or c.phone_number ilike '%' || q.t || '%' or c.candidate_id ilike '%' || q.t || '%')
    limit 50
  )
  select c.candidate_id, c.full_name, c.phone_number, c.email, c.applied_position,
         c.self_reported_experience_range, c.skills, c.resume_file_url, c.received_at,
         c.application_status, c.processing_status, c.processing_error, c.is_read, c.starred, c.hr_note,
         j.job_id, j.match_threshold, m.match_score, m.gate_status,
         case
           when c.processing_status = 'failed' then 'failed'
           when c.processing_status = 'pending' or m.match_score is null then 'pending'
           when m.gate_status <> 'Pass' then 'gate'
           when j.match_threshold is not null and m.match_score >= j.match_threshold then 'pass'
           else 'below'
         end as kind,
         m.evaluated_at
  from candidates c
  join hit on lower(c.email) = hit.em
  left join job_requirements j on j.position_name = c.applied_position
  left join lateral (
    select mr.match_score, mr.gate_status, mr.evaluated_at from match_results mr
    where mr.candidate_id = c.candidate_id and mr.job_id = j.job_id
    order by mr.evaluated_at desc limit 1
  ) m on true
  order by lower(c.email), c.received_at desc
  limit 300;
$$;
revoke all on function public.search_applicants(text) from public, anon;
grant execute on function public.search_applicants(text) to authenticated;
