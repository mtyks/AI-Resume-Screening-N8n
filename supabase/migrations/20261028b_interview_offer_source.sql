-- ขั้นสัมภาษณ์/Offer + แหล่งที่มาของผู้สมัคร
-- 1) สถานะการสมัครเพิ่ม Interview และ Offer
alter table public.candidates drop constraint if exists candidates_application_status_check;
alter table public.candidates add constraint candidates_application_status_check
  check (application_status in ('In Review', 'Interview', 'Offer', 'Hired', 'Rejected'));

-- 2) แหล่งที่มา (ผู้สมัครเลือกเอง หรือมาจากลิงก์ ?src=)
alter table public.candidates add column if not exists source text;
alter table public.candidates drop constraint if exists candidates_source_len;
alter table public.candidates add constraint candidates_source_len check (source is null or char_length(source) <= 60);

-- 3) ฟังก์ชันเปลี่ยนสถานะรองรับสถานะใหม่
create or replace function public.set_application_status(p_candidate_id text, p_status text, p_notify boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_status not in ('In Review','Interview','Offer','Hired','Rejected') then raise exception 'invalid status'; end if;
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

-- 4) สรุป Dashboard (เพิ่ม funnel ขั้นสัมภาษณ์/Offer และสัดส่วนแหล่งที่มา)
create or replace function public.dashboard_summary(p_job text default null, p_days int default 30)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  d int := greatest(1, least(coalesce(p_days, 30), 365));
  t1 timestamptz := now();
  t0 timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  tp timestamptz := now() - make_interval(days => 2 * greatest(1, least(coalesce(p_days, 30), 365)));
  pos text;
  res jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_job is not null then select position_name into pos from public.job_requirements where job_id = p_job; end if;

  with
  c as (select cd.* from public.candidates cd where p_job is null or cd.applied_position = pos),
  cur as (select * from c where received_at >= t0),
  prv as (select * from c where received_at >= tp and received_at < t0),
  lt as (
    select distinct on (m.candidate_id, j.job_id)
      m.candidate_id, m.match_score::numeric as sc, m.gate_status, j.match_threshold as thr, c.received_at
    from public.match_results m
    join public.job_requirements j on j.job_id = m.job_id
    join c on c.candidate_id = m.candidate_id and c.applied_position = j.position_name
    order by m.candidate_id, j.job_id, m.evaluated_at desc
  ),
  ltc as (select * from lt where received_at >= t0),
  ltp as (select * from lt where received_at >= tp and received_at < t0),
  fe as (select m.candidate_id, min(m.evaluated_at) as fe from public.match_results m group by m.candidate_id),
  days as (select generate_series((t0 at time zone 'Asia/Bangkok')::date, (t1 at time zone 'Asia/Bangkok')::date, interval '1 day')::date as dd)
  select jsonb_build_object(
    'days', d,
    'active_openings', (select count(*) from public.job_requirements where is_active and (close_at is null or close_at > now())),
    'total', (select count(*) from cur),
    'prev_total', (select count(*) from prv),
    'avg_score', (select round(avg(sc), 1) from ltc),
    'prev_avg_score', (select round(avg(sc), 1) from ltp),
    'median_minutes', (select round((percentile_cont(0.5) within group (order by extract(epoch from (fe.fe - cur.received_at)) / 60))::numeric, 1)
                       from cur join fe on fe.candidate_id = cur.candidate_id where fe.fe >= cur.received_at),
    'funnel', jsonb_build_object(
      'applied', (select count(*) from cur),
      'scanned', (select count(*) from cur where processing_status = 'processed'),
      'passed', (select count(*) from ltc where gate_status = 'Pass' and sc >= thr),
      'interview', (select count(*) from cur where application_status in ('Interview', 'Offer', 'Hired')),
      'offer', (select count(*) from cur where application_status in ('Offer', 'Hired')),
      'hired', (select count(*) from cur where application_status = 'Hired'),
      'rejected', (select count(*) from cur where application_status = 'Rejected')),
    'inflow', (select coalesce(jsonb_agg(jsonb_build_object('d', dd, 'n', (select count(*) from cur where (cur.received_at at time zone 'Asia/Bangkok')::date = dd)) order by dd), '[]'::jsonb) from days),
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'n', n) order by n desc, nm), '[]'::jsonb)
               from (select min(trim(s)) as nm, count(distinct cur.candidate_id) as n from cur, jsonb_array_elements_text(case when jsonb_typeof(cur.skills) = 'array' then cur.skills else '[]'::jsonb end) s
                     where trim(s) <> '' group by lower(trim(s)) order by n desc limit 10) q),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'n', n) order by n desc, nm), '[]'::jsonb)
                from (select coalesce(nullif(trim(source), ''), 'ไม่ระบุ') as nm, count(*) as n from cur group by 1) q),
    'buckets', (select jsonb_agg((select count(*) from ltc where least(floor(sc / 10), 9) = g) order by g) from generate_series(0, 9) g)
  ) into res;
  return res;
end $$;
revoke all on function public.dashboard_summary(text, int) from public, anon;
grant execute on function public.dashboard_summary(text, int) to authenticated;
