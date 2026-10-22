-- =====================================================================
-- ฟีเจอร์หน้าผู้สมัครรายตำแหน่ง: อ่านแล้ว/ยังไม่อ่าน, ติดดาว (shortlist), โน้ต HR,
-- สถิติรายตำแหน่ง, รายการผู้สมัครแบบแบ่งหน้าจากเซิร์ฟเวอร์, ลบที่อ่านแล้ว, แจ้งเตือนผู้สมัครที่ยังไม่อ่าน
-- =====================================================================

-- 1) คอลัมน์ใหม่ของ candidates (workflow n8n ไม่ได้เขียนคอลัมน์เหล่านี้ จึงไม่กระทบการประมวลผล)
alter table public.candidates
  add column if not exists is_read     boolean     not null default false,
  add column if not exists read_at     timestamptz,
  add column if not exists starred     boolean     not null default false,
  add column if not exists hr_note     text,
  add column if not exists hr_note_at  timestamptz,
  add column if not exists hr_note_by  text;

comment on column public.candidates.is_read    is 'HR เปิดดูผู้สมัครคนนี้แล้วหรือยัง (false = ยังไม่อ่าน นับในการแจ้งเตือน)';
comment on column public.candidates.read_at    is 'เวลาที่ HR เปิดอ่านครั้งแรก';
comment on column public.candidates.starred    is 'ติดดาว/shortlist โดย HR (ผู้สมัครที่ติดดาวจะไม่ถูกลบโดยปุ่ม "ลบที่อ่านแล้ว")';
comment on column public.candidates.hr_note    is 'โน้ตของ HR ต่อผู้สมัคร';
comment on column public.candidates.hr_note_at is 'เวลาที่แก้โน้ตล่าสุด';
comment on column public.candidates.hr_note_by is 'อีเมลของ HR ที่แก้โน้ตล่าสุด';

-- 2) index ให้ค้นหา/แบ่งหน้าเร็วเมื่อผู้สมัครมาก
create index if not exists idx_candidates_position_received on public.candidates (applied_position, received_at desc);
create index if not exists idx_candidates_position_unread   on public.candidates (applied_position) where not is_read;
create index if not exists idx_match_results_cand_eval      on public.match_results (candidate_id, evaluated_at desc);

-- 3) รายชื่อผู้สมัครของตำแหน่งหนึ่ง: กรอง/ค้นหา/เรียง/แบ่งหน้าที่ฝั่งฐานข้อมูล
--    security invoker → RLS (เฉพาะ HR/Admin) ยังบังคับใช้ตามปกติ
create or replace function public.list_position_applicants(
  p_job_id text,
  p_q text default null,            -- ค้นชื่อ / อีเมล / รหัสผู้สมัคร
  p_kind text default 'all',        -- all | pass | below | gate | pending | failed
  p_app_status text default null,   -- In Review | Hired | Rejected
  p_unread boolean default false,
  p_starred boolean default false,
  p_sort text default 'score',      -- score | recent | name | unread
  p_limit int default 25,
  p_offset int default 0
) returns table (
  candidate_id text, full_name text, phone_number text, email text, applied_position text,
  self_reported_experience_range text, skills jsonb, resume_file_url text, received_at timestamptz,
  application_status text, processing_status text, processing_error text,
  is_read boolean, starred boolean, hr_note text,
  match_score numeric, gate_status text, kind text, total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with j as (
    select position_name, match_threshold from job_requirements where job_id = p_job_id
  ), base as (
    select c.*, m.match_score as ms, m.gate_status as gs,
      case
        when c.processing_status = 'failed' then 'failed'
        when c.processing_status = 'pending' or m.candidate_id is null then 'pending'
        when m.gate_status <> 'Pass' then 'gate'
        when m.match_score >= j.match_threshold then 'pass'
        else 'below'
      end as kd
    from candidates c
    join j on c.applied_position = j.position_name
    left join lateral (
      select mr.candidate_id, mr.match_score, mr.gate_status from match_results mr
      where mr.candidate_id = c.candidate_id and mr.job_id = p_job_id
      order by mr.evaluated_at desc limit 1
    ) m on true
    where (coalesce(p_q, '') = '' or
           c.full_name ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' or
           c.email ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' or
           c.candidate_id ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and (coalesce(p_app_status, '') = '' or c.application_status = p_app_status)
      and (not p_unread or not c.is_read)
      and (not p_starred or c.starred)
  )
  select b.candidate_id, b.full_name, b.phone_number, b.email, b.applied_position,
         b.self_reported_experience_range, b.skills, b.resume_file_url, b.received_at,
         b.application_status, b.processing_status, b.processing_error,
         b.is_read, b.starred, b.hr_note, b.ms, b.gs, b.kd, count(*) over () as total_count
  from base b
  where p_kind = 'all' or b.kd = p_kind
  order by
    (case when p_sort = 'score' then b.ms end) desc nulls last,
    (case when p_sort = 'name' then b.full_name end) asc,
    (case when p_sort = 'unread' then b.is_read::int end) asc,
    b.received_at desc, b.candidate_id
  limit greatest(least(p_limit, 1000), 1) offset greatest(p_offset, 0);
$$;

-- 4) สถิติรายตำแหน่ง (หน้าภาพรวมและหน้าเลือกตำแหน่ง)
create or replace function public.position_stats()
returns table (
  job_id text, position_name text, is_active boolean, match_threshold numeric, close_at timestamptz,
  total bigint, unread bigint, starred bigint, pending bigint, failed bigint,
  passed bigint, below bigint, gate bigint, hired bigint, avg_score numeric, buckets int[]
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select j.job_id as jid, c.candidate_id, c.is_read, c.starred, c.application_status, m.match_score as ms,
      case
        when c.processing_status = 'failed' then 'failed'
        when c.processing_status = 'pending' or m.candidate_id is null then 'pending'
        when m.gate_status <> 'Pass' then 'gate'
        when m.match_score >= j.match_threshold then 'pass'
        else 'below'
      end as kd
    from job_requirements j
    join candidates c on c.applied_position = j.position_name
    left join lateral (
      select mr.candidate_id, mr.match_score, mr.gate_status from match_results mr
      where mr.candidate_id = c.candidate_id and mr.job_id = j.job_id
      order by mr.evaluated_at desc limit 1
    ) m on true
  )
  select j.job_id, j.position_name, j.is_active, j.match_threshold, j.close_at,
    count(b.candidate_id), count(*) filter (where not b.is_read), count(*) filter (where b.starred),
    count(*) filter (where b.kd = 'pending'), count(*) filter (where b.kd = 'failed'),
    count(*) filter (where b.kd = 'pass'), count(*) filter (where b.kd = 'below'), count(*) filter (where b.kd = 'gate'),
    count(*) filter (where b.application_status = 'Hired'),
    round(avg(b.ms) filter (where b.kd in ('pass', 'below', 'gate')), 1),
    array[
      count(*) filter (where b.ms >= 0  and b.ms < 10), count(*) filter (where b.ms >= 10 and b.ms < 20),
      count(*) filter (where b.ms >= 20 and b.ms < 30), count(*) filter (where b.ms >= 30 and b.ms < 40),
      count(*) filter (where b.ms >= 40 and b.ms < 50), count(*) filter (where b.ms >= 50 and b.ms < 60),
      count(*) filter (where b.ms >= 60 and b.ms < 70), count(*) filter (where b.ms >= 70 and b.ms < 80),
      count(*) filter (where b.ms >= 80 and b.ms < 90), count(*) filter (where b.ms >= 90)
    ]::int[]
  from job_requirements j
  left join base b on b.jid = j.job_id
  group by j.job_id, j.position_name, j.is_active, j.match_threshold, j.close_at
  order by j.position_name;
$$;

-- 7) แจ้งเตือนผู้สมัครที่ยังไม่อ่าน: แจ้งทุกครั้งที่ยอดข้ามขั้น 5, 10, 15, 20 …
--    unread_alert_state จำขั้นล่าสุดที่แจ้งไปแล้วต่อตำแหน่ง (เข้าถึงได้เฉพาะ service_role ที่ n8n ใช้)
create table if not exists public.unread_alert_state (
  job_id     text primary key,
  level      int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.unread_alert_state enable row level security;
comment on table public.unread_alert_state is 'ขั้นแจ้งเตือน "ยังไม่อ่าน" ล่าสุดที่ส่งอีเมลแล้วต่อตำแหน่ง (n8n workflow Unread-Alerts เป็นผู้ใช้เพียงรายเดียว)';

-- คืนเฉพาะตำแหน่งที่ยอดยังไม่อ่านข้ามขั้นใหม่ และรีเซ็ตขั้นลงเมื่อ HR อ่านจนยอดลดลง
create or replace function public.unread_alert_check()
returns table (job_id text, position_name text, unread int, level int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with cur as (
    select j.job_id as jid, j.position_name as pn,
           (count(c.candidate_id) filter (where not c.is_read))::int as un
    from job_requirements j
    left join candidates c on c.applied_position = j.position_name
    group by j.job_id, j.position_name
  ), lvl as (
    select jid, pn, un, (un / 5) * 5 as lv from cur
  ), reset as (
    update unread_alert_state s set level = l.lv, updated_at = now()
    from lvl l where s.job_id = l.jid and l.lv < s.level
    returning s.job_id
  )
  select l.jid, l.pn, l.un, l.lv
  from lvl l
  left join unread_alert_state s on s.job_id = l.jid
  where l.lv >= 5 and l.lv > coalesce(s.level, 0);
end $$;

create or replace function public.unread_alert_ack(p_job_id text, p_level int)
returns void language sql security definer set search_path = public as $$
  insert into unread_alert_state (job_id, level, updated_at) values (p_job_id, p_level, now())
  on conflict (job_id) do update set level = excluded.level, updated_at = now();
$$;
revoke all on function public.unread_alert_check() from public, anon, authenticated;
revoke all on function public.unread_alert_ack(text, int) from public, anon, authenticated;
grant execute on function public.unread_alert_check() to service_role;
grant execute on function public.unread_alert_ack(text, int) to service_role;
