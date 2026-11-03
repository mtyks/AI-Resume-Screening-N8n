-- แก้เล็ก ๆ จากการตรวจระบบ (ถูกรันในฐานข้อมูลจริงแล้ว)
create index if not exists status_email_outbox_candidate_idx on public.status_email_outbox (candidate_id);
create or replace function public.audit_actor() returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(auth.jwt() ->> 'email', ''), 'ระบบอัตโนมัติ')
$$;
