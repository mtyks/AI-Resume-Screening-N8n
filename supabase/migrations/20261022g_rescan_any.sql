-- สแกนซ้ำได้ทุกสถานะ (รวมที่ประมวลผลเสร็จแล้ว เช่นหลังปรับน้ำหนักคะแนน)
-- n8n ตัวกวาดงานจะหยิบรายการ pending ไปประมวลผลใหม่ ที่ละไม่เกิน 5 คนทุก 5 นาที
-- สถานะการพิจารณา ติดดาว อ่านแล้ว และโน้ตของ HR ไม่ถูกแตะ (n8n เขียนเฉพาะข้อมูลผู้สมัคร ทักษะ และสถานะประมวลผล)
create or replace function public.request_rescan(p_candidate_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.candidates
     set processing_status = 'pending', processing_error = null,
         last_attempt_at = null, error_notified_at = null
   where candidate_id = p_candidate_id;
  if not found then raise exception 'ไม่พบผู้สมัคร'; end if;
end $$;

create or replace function public.request_rescan_many(p_ids text[])
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 200 then raise exception 'สแกนซ้ำได้ครั้งละไม่เกิน 200 คน'; end if;
  update public.candidates
     set processing_status = 'pending', processing_error = null,
         last_attempt_at = null, error_notified_at = null
   where candidate_id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.request_rescan_many(text[]) from public, anon;
grant execute on function public.request_rescan_many(text[]) to authenticated;
