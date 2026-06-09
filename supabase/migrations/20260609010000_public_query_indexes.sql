create extension if not exists pg_trgm;

create index if not exists meetings_status_datetime_idx
on public.meetings(status, meeting_datetime desc);

create index if not exists meetings_title_trgm_idx
on public.meetings using gin(title gin_trgm_ops);

create index if not exists meetings_meeting_type_trgm_idx
on public.meetings using gin(meeting_type gin_trgm_ops);

create index if not exists meetings_date_text_trgm_idx
on public.meetings using gin(date_text gin_trgm_ops);

create index if not exists summary_cards_published_featured_created_idx
on public.summary_cards(is_published, is_featured desc, created_at desc);

create index if not exists summary_cards_published_created_idx
on public.summary_cards(is_published, created_at desc);

create index if not exists announcements_published_created_idx
on public.announcements(is_published, created_at desc);
