alter table public.meetings
  add column if not exists jurisdiction_name text,
  add column if not exists jurisdiction_slug text,
  add column if not exists platform text;

alter table public.documents
  add column if not exists jurisdiction_name text,
  add column if not exists jurisdiction_slug text,
  add column if not exists platform text;

alter table public.summary_cards
  add column if not exists jurisdiction_name text,
  add column if not exists jurisdiction_slug text,
  add column if not exists platform text;

alter table public.announcements
  add column if not exists jurisdiction_slug text;

alter table public.scraper_runs
  add column if not exists jurisdiction_slug text,
  add column if not exists platform text;

update public.meetings
set
  jurisdiction_name = coalesce(jurisdiction_name, 'Foster City'),
  jurisdiction_slug = coalesce(jurisdiction_slug, 'foster-city'),
  platform = coalesce(platform, 'primegov')
where jurisdiction_slug is null or jurisdiction_name is null or platform is null;

update public.documents d
set
  jurisdiction_name = coalesce(d.jurisdiction_name, m.jurisdiction_name, 'Foster City'),
  jurisdiction_slug = coalesce(d.jurisdiction_slug, m.jurisdiction_slug, 'foster-city'),
  platform = coalesce(d.platform, m.platform, 'primegov')
from public.meetings m
where d.meeting_id = m.id
  and (d.jurisdiction_slug is null or d.jurisdiction_name is null or d.platform is null);

update public.documents
set
  jurisdiction_name = coalesce(jurisdiction_name, 'Foster City'),
  jurisdiction_slug = coalesce(jurisdiction_slug, 'foster-city'),
  platform = coalesce(platform, 'primegov')
where meeting_id is null
  and (jurisdiction_slug is null or jurisdiction_name is null or platform is null);

update public.summary_cards c
set
  jurisdiction_name = coalesce(c.jurisdiction_name, m.jurisdiction_name, 'Foster City'),
  jurisdiction_slug = coalesce(c.jurisdiction_slug, m.jurisdiction_slug, 'foster-city'),
  platform = coalesce(c.platform, m.platform, 'primegov')
from public.meetings m
where c.meeting_id = m.id
  and (c.jurisdiction_slug is null or c.jurisdiction_name is null or c.platform is null);

update public.summary_cards
set
  jurisdiction_name = coalesce(jurisdiction_name, 'Foster City'),
  jurisdiction_slug = coalesce(jurisdiction_slug, 'foster-city'),
  platform = coalesce(platform, 'primegov')
where meeting_id is null
  and (jurisdiction_slug is null or jurisdiction_name is null or platform is null);

update public.scraper_runs
set
  jurisdiction_slug = coalesce(jurisdiction_slug, 'foster-city'),
  platform = coalesce(platform, 'primegov')
where jurisdiction_slug is null or platform is null;

create index if not exists meetings_jurisdiction_slug_idx on public.meetings(jurisdiction_slug);
create index if not exists meetings_platform_idx on public.meetings(platform);
create index if not exists documents_meeting_id_idx on public.documents(meeting_id);
create index if not exists summary_cards_jurisdiction_slug_idx on public.summary_cards(jurisdiction_slug);
create index if not exists scraper_runs_jurisdiction_slug_idx on public.scraper_runs(jurisdiction_slug);

