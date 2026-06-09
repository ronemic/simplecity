grant usage on schema public to anon, authenticated, service_role;

grant select
on public.meetings,
   public.documents,
   public.summary_cards,
   public.announcements
to anon, authenticated;

grant select
on public.admins,
   public.scraper_runs,
   public.admin_audit_log
to authenticated;

grant insert, update, delete
on public.meetings,
   public.documents,
   public.summary_cards,
   public.announcements,
   public.scraper_runs,
   public.admin_audit_log
to authenticated;

grant all privileges
on public.admins,
   public.meetings,
   public.documents,
   public.summary_cards,
   public.announcements,
   public.scraper_runs,
   public.admin_audit_log
to service_role;

grant usage, select
on all sequences in schema public
to authenticated, service_role;
