-- ล้างของที่เลิกใช้แล้ว (รันใน Supabase SQL Editor ครั้งเดียว ลบแล้วกู้คืนไม่ได้)
drop function if exists public.unread_alert_check();
drop function if exists public.unread_alert_ack(text, int);
drop table    if exists public.unread_alert_state;
drop index    if exists public.idx_match_results_candidate;
delete from public.system_logs;  -- log ทดสอบเก่า (ผู้สมัครจริงยังไม่มี)
