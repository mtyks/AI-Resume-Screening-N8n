-- เปลี่ยนตัวเลข "เวลาสแกนเสร็จ (มัธยฐาน)" ให้เป็นเวลาที่ AI สแกนใช้จริงของรอบล่าสุด
-- (เวลาประเมินเสร็จ - เวลาเริ่มพยายามสแกนล่าสุด) ไม่รวมเวลารอคิวหรือรอ n8n เปิดเครื่อง
-- แก้เฉพาะนิพจน์ median_minutes ของฟังก์ชัน dashboard_summary (ไม่ลบข้อมูล รันซ้ำได้)
do $mig$
declare
  d text := pg_get_functiondef('public.dashboard_summary(text,integer)'::regprocedure);
  old text := $o$'median_minutes', (select round((percentile_cont(0.5) within group (order by extract(epoch from (fe.fe - cur.received_at)) / 60))::numeric, 1)
                       from cur join fe on fe.candidate_id = cur.candidate_id where fe.fe >= cur.received_at),$o$;
  new text := $n$'median_minutes', (select round((percentile_cont(0.5) within group (order by extract(epoch from (lm.lm - cur.last_attempt_at)) / 60))::numeric, 2)
                       from cur join (select m.candidate_id, max(m.evaluated_at) as lm from public.match_results m group by m.candidate_id) lm on lm.candidate_id = cur.candidate_id
                       where cur.last_attempt_at is not null and lm.lm >= cur.last_attempt_at),$n$;
begin
  if position(old in d) = 0 then
    if position('lm.lm - cur.last_attempt_at' in d) > 0 then return; end if; -- ใช้แล้ว
    raise exception 'ไม่พบนิพจน์เดิมใน dashboard_summary';
  end if;
  execute replace(d, old, new);
end
$mig$;
