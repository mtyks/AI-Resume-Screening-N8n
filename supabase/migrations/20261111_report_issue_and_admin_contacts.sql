create or replace function public.report_issue(p_candidate_id text, p_message text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if coalesce(length(trim(p_message)), 0) = 0 then raise exception 'empty message'; end if;
  if (select count(*) from audit_log where actor = audit_actor() and action = 'issue_report' and at > now() - interval '1 hour') >= 10 then
    raise exception 'too many reports';
  end if;
  insert into audit_log (actor, action, target, detail)
  values (audit_actor(), 'issue_report', left(p_candidate_id, 100), jsonb_build_object('message', left(p_message, 1000)));
end $$;
revoke all on function public.report_issue(text, text) from public, anon;
grant execute on function public.report_issue(text, text) to authenticated;

create or replace function public.admin_contacts()
returns text[] language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  return coalesce((select array_agg(email order by email) from authorized_users where role = 'Admin'), '{}');
end $$;
revoke all on function public.admin_contacts() from public, anon;
grant execute on function public.admin_contacts() to authenticated;
