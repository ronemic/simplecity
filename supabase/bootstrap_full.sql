-- Complete SimpleCity schema bootstrap for a brand-new Supabase project.
-- Generated from every migration in chronological order.
-- Run this entire file once in the Supabase SQL Editor.
--
-- This creates schema objects, RLS policies, grants, triggers, indexes,
-- translation/subscription tables, and jurisdiction lookup rows.
-- It does not copy row data from another Supabase project; use pg_dump for that.

begin;

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260608130700_initial_schema.sql
-- -----------------------------------------------------------------------------

create extension if not exists pgcrypto;

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  title text not null,
  meeting_type text,
  date_text text,
  meeting_datetime timestamptz,
  section text,
  status text,
  source_type text,
  source_url text,
  row_text text,
  has_html_agenda boolean default false,
  has_pdf boolean default false,
  llm_input_text text,
  public_comments_input_text text,
  extraction_notes jsonb default '[]'::jsonb,
  raw jsonb,
  scraped_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  type text,
  label text,
  source_url text not null,
  local_path text,
  storage_path text,
  bytes bigint,
  download_error text,
  extracted_text text,
  extraction_character_count integer,
  is_scanned boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.summary_cards (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  agenda_item text,
  what_is_happening text,
  why_it_matters text,
  who_it_affects text[] default '{}',
  category_tags text[] default '{}',
  status text,
  comment_window_opens text,
  comment_window_closes text,
  how_to_act_attend text,
  how_to_act_email text,
  how_to_act_submit_comment text,
  source_url text,
  confidence text,
  is_published boolean default true,
  is_featured boolean default false,
  admin_notes text,
  raw_llm_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  summary_card_id uuid not null unique references public.summary_cards(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  jurisdiction_name text,
  jurisdiction_slug text,
  platform text,
  kind text not null check (kind in ('approved', 'rejected', 'continued', 'amended', 'other')),
  headline text not null,
  summary text not null,
  decided_at timestamptz,
  vote text,
  next_step text,
  source_url text not null,
  source_hash text not null,
  source_text text not null,
  matched_item_key text not null,
  match_method text not null check (match_method in ('source_url', 'agenda_number', 'title')),
  match_score double precision not null check (match_score >= 0 and match_score <= 1),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  type text default 'info',
  starts_at timestamptz,
  ends_at timestamptz,
  is_published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.scraper_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text,
  meetings_found integer default 0,
  documents_downloaded integer default 0,
  cards_generated integer default 0,
  error text,
  logs jsonb default '[]'::jsonb
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text,
  action text,
  entity_type text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz default now()
);

create index if not exists meetings_meeting_datetime_idx on public.meetings(meeting_datetime);
create index if not exists meetings_status_idx on public.meetings(status);
create index if not exists summary_cards_meeting_id_idx on public.summary_cards(meeting_id);
create index if not exists summary_cards_category_tags_idx on public.summary_cards using gin(category_tags);
create index if not exists summary_cards_is_published_idx on public.summary_cards(is_published);
create index if not exists decision_outcomes_meeting_id_idx on public.decision_outcomes(meeting_id);
create index if not exists decision_outcomes_jurisdiction_slug_idx on public.decision_outcomes(jurisdiction_slug);
create index if not exists decision_outcomes_updated_at_idx on public.decision_outcomes(updated_at desc);
create unique index if not exists decision_outcomes_meeting_item_idx on public.decision_outcomes(meeting_id, matched_item_key);
create index if not exists announcements_is_published_idx on public.announcements(is_published);
create unique index if not exists documents_source_url_idx on public.documents(source_url);
create unique index if not exists summary_cards_regeneration_idx on public.summary_cards(meeting_id, agenda_item, source_url);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_meetings_updated_at on public.meetings;
create trigger set_meetings_updated_at
before update on public.meetings
for each row execute function public.set_updated_at();

drop trigger if exists set_summary_cards_updated_at on public.summary_cards;
create trigger set_summary_cards_updated_at
before update on public.summary_cards
for each row execute function public.set_updated_at();

drop trigger if exists set_decision_outcomes_updated_at on public.decision_outcomes;
create trigger set_decision_outcomes_updated_at
before update on public.decision_outcomes
for each row execute function public.set_updated_at();

drop trigger if exists set_announcements_updated_at on public.announcements;
create trigger set_announcements_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.admins enable row level security;
alter table public.meetings enable row level security;
alter table public.documents enable row level security;
alter table public.summary_cards enable row level security;
alter table public.decision_outcomes enable row level security;
alter table public.announcements enable row level security;
alter table public.scraper_runs enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists "Admins can read admins" on public.admins;
create policy "Admins can read admins"
on public.admins for select
to authenticated
using (public.is_admin());

drop policy if exists "Public can read meetings" on public.meetings;
create policy "Public can read meetings"
on public.meetings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can write meetings" on public.meetings;
create policy "Admins can write meetings"
on public.meetings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read document metadata" on public.documents;
create policy "Public can read document metadata"
on public.documents for select
to anon, authenticated
using (true);

drop policy if exists "Admins can write documents" on public.documents;
create policy "Admins can write documents"
on public.documents for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read published cards" on public.summary_cards;
create policy "Public can read published cards"
on public.summary_cards for select
to anon, authenticated
using (is_published = true or public.is_admin());

drop policy if exists "Admins can write cards" on public.summary_cards;
create policy "Admins can write cards"
on public.summary_cards for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read outcomes for published cards" on public.decision_outcomes;
create policy "Public can read outcomes for published cards"
on public.decision_outcomes for select
to anon, authenticated
using (
  exists (
    select 1 from public.summary_cards card
    where card.id = decision_outcomes.summary_card_id
      and (card.is_published = true or public.is_admin())
  )
);

drop policy if exists "Admins can write decision outcomes" on public.decision_outcomes;
create policy "Admins can write decision outcomes"
on public.decision_outcomes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.decision_outcomes to anon, authenticated;
grant all on public.decision_outcomes to service_role;

drop policy if exists "Public can read published announcements" on public.announcements;
create policy "Public can read published announcements"
on public.announcements for select
to anon, authenticated
using (
  is_published = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

drop policy if exists "Admins can write announcements" on public.announcements;
create policy "Admins can write announcements"
on public.announcements for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read scraper runs" on public.scraper_runs;
create policy "Admins can read scraper runs"
on public.scraper_runs for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can write scraper runs" on public.scraper_runs;
create policy "Admins can write scraper runs"
on public.scraper_runs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read audit log" on public.admin_audit_log;
create policy "Admins can read audit log"
on public.admin_audit_log for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can write audit log" on public.admin_audit_log;
create policy "Admins can write audit log"
on public.admin_audit_log for insert
to authenticated
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260609000000_grant_app_table_privileges.sql
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260609010000_public_query_indexes.sql
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260609232000_meeting_summary_hashes.sql
-- -----------------------------------------------------------------------------

alter table public.meetings
  add column if not exists source_hash text,
  add column if not exists summarized_source_hash text,
  add column if not exists cards_generated_at timestamptz;

create index if not exists meetings_source_hash_idx on public.meetings(source_hash);
create index if not exists meetings_summarized_source_hash_idx on public.meetings(summarized_source_hash);

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260610000000_add_jurisdiction_support.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260612000000_add_iqm2_optional_meeting_fields.sql
-- -----------------------------------------------------------------------------

alter table public.meetings
  add column if not exists time_text text,
  add column if not exists location text;

create index if not exists documents_jurisdiction_slug_idx on public.documents(jurisdiction_slug);

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260627000000_add_translation_tables.sql
-- -----------------------------------------------------------------------------

create table if not exists public.meeting_translations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  locale text not null,
  title text,
  meeting_type text,
  source_fingerprint text not null,
  translation_status text not null default 'machine',
  raw_llm_json jsonb,
  translated_at timestamptz default now(),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (meeting_id, locale)
);

create table if not exists public.summary_card_translations (
  id uuid primary key default gen_random_uuid(),
  summary_card_id uuid not null references public.summary_cards(id) on delete cascade,
  locale text not null,
  agenda_item text,
  what_is_happening text,
  why_it_matters text,
  who_it_affects text[] default '{}',
  status text,
  comment_window_opens text,
  comment_window_closes text,
  how_to_act_attend text,
  how_to_act_email text,
  how_to_act_submit_comment text,
  source_fingerprint text not null,
  translation_status text not null default 'machine',
  raw_llm_json jsonb,
  translated_at timestamptz default now(),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (summary_card_id, locale)
);

create index if not exists meeting_translations_locale_idx
on public.meeting_translations(locale);

create index if not exists meeting_translations_status_idx
on public.meeting_translations(translation_status);

create index if not exists summary_card_translations_locale_idx
on public.summary_card_translations(locale);

create index if not exists summary_card_translations_status_idx
on public.summary_card_translations(translation_status);

drop trigger if exists set_meeting_translations_updated_at on public.meeting_translations;
create trigger set_meeting_translations_updated_at
before update on public.meeting_translations
for each row execute function public.set_updated_at();

drop trigger if exists set_summary_card_translations_updated_at on public.summary_card_translations;
create trigger set_summary_card_translations_updated_at
before update on public.summary_card_translations
for each row execute function public.set_updated_at();

alter table public.meeting_translations enable row level security;
alter table public.summary_card_translations enable row level security;

drop policy if exists "Public can read meeting translations" on public.meeting_translations;
create policy "Public can read meeting translations"
on public.meeting_translations for select
to anon, authenticated
using (true);

drop policy if exists "Admins can write meeting translations" on public.meeting_translations;
create policy "Admins can write meeting translations"
on public.meeting_translations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read published card translations" on public.summary_card_translations;
create policy "Public can read published card translations"
on public.summary_card_translations for select
to anon, authenticated
using (
  exists (
    select 1
    from public.summary_cards card
    where card.id = summary_card_id
      and (card.is_published = true or public.is_admin())
  )
);

drop policy if exists "Admins can write card translations" on public.summary_card_translations;
create policy "Admins can write card translations"
on public.summary_card_translations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select
on public.meeting_translations,
   public.summary_card_translations
to anon, authenticated;

grant insert, update, delete
on public.meeting_translations,
   public.summary_card_translations
to authenticated;

grant all privileges
on public.meeting_translations,
   public.summary_card_translations
to service_role;

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260704000000_add_email_subscriptions.sql
-- -----------------------------------------------------------------------------

create table if not exists public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  pending_jurisdiction_slugs text[] default '{}'::text[],
  confirmation_token_hash text,
  unsubscribe_token text not null unique,
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  jurisdiction_slug text not null,
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly')),
  last_digest_sent_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (subscriber_id, jurisdiction_slug, frequency)
);

create table if not exists public.email_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid references public.email_subscribers(id) on delete set null,
  jurisdiction_slugs text[] default '{}'::text[],
  card_ids uuid[] default '{}'::uuid[],
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists email_subscribers_status_idx on public.email_subscribers(status);
create index if not exists email_subscribers_confirmation_token_hash_idx
  on public.email_subscribers(confirmation_token_hash)
  where confirmation_token_hash is not null;
create index if not exists email_subscriptions_subscriber_id_idx
  on public.email_subscriptions(subscriber_id);
create index if not exists email_subscriptions_jurisdiction_frequency_idx
  on public.email_subscriptions(jurisdiction_slug, frequency);
create index if not exists email_digest_deliveries_subscriber_id_idx
  on public.email_digest_deliveries(subscriber_id);

drop trigger if exists set_email_subscribers_updated_at on public.email_subscribers;
create trigger set_email_subscribers_updated_at
before update on public.email_subscribers
for each row execute function public.set_updated_at();

drop trigger if exists set_email_subscriptions_updated_at on public.email_subscriptions;
create trigger set_email_subscriptions_updated_at
before update on public.email_subscriptions
for each row execute function public.set_updated_at();

alter table public.email_subscribers enable row level security;
alter table public.email_subscriptions enable row level security;
alter table public.email_digest_deliveries enable row level security;

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260704010000_make_email_digests_weekly.sql
-- -----------------------------------------------------------------------------

alter table public.email_subscriptions
  drop constraint if exists email_subscriptions_frequency_check;

alter table public.email_subscriptions
  alter column frequency set default 'weekly';

alter table public.email_subscriptions
  add constraint email_subscriptions_frequency_check
  check (frequency in ('daily', 'weekly'));

update public.email_subscriptions
set frequency = 'weekly'
where frequency = 'daily';

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260711000000_add_regional_database_support.sql
-- -----------------------------------------------------------------------------

create table if not exists public.jurisdictions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  region_slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_audit_log
  add column if not exists jurisdiction_slug text;

insert into public.jurisdictions (slug, name, region_slug)
values
  ('san-francisco', 'San Francisco', 'san-francisco'),
  ('san-mateo-county', 'San Mateo County', 'north-san-mateo'),
  ('san-mateo-city', 'San Mateo', 'north-san-mateo'),
  ('foster-city', 'Foster City', 'north-san-mateo'),
  ('menlo-park', 'Menlo Park', 'south-san-mateo'),
  ('santa-clara-county', 'Santa Clara County', 'santa-clara'),
  ('mountain-view', 'Mountain View', 'santa-clara')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();

alter table public.meetings add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.documents add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.summary_cards add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.announcements add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.scraper_runs add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.admin_audit_log add column if not exists jurisdiction_id uuid references public.jurisdictions(id);

update public.meetings m
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where m.jurisdiction_slug = jurisdiction.slug and m.jurisdiction_id is null;

update public.documents d
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where d.jurisdiction_slug = jurisdiction.slug and d.jurisdiction_id is null;

update public.summary_cards c
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where c.jurisdiction_slug = jurisdiction.slug and c.jurisdiction_id is null;

update public.announcements a
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where a.jurisdiction_slug = jurisdiction.slug and a.jurisdiction_id is null;

update public.scraper_runs s
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where s.jurisdiction_slug = jurisdiction.slug and s.jurisdiction_id is null;

update public.admin_audit_log l
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where l.jurisdiction_slug = jurisdiction.slug and l.jurisdiction_id is null;

create or replace function public.sync_jurisdiction_id()
returns trigger
language plpgsql
as $$
begin
  if new.jurisdiction_slug is null then
    new.jurisdiction_id := null;
    return new;
  end if;

  select id into new.jurisdiction_id
  from public.jurisdictions
  where slug = new.jurisdiction_slug;

  if new.jurisdiction_id is null then
    raise exception 'Unknown jurisdiction slug: %', new.jurisdiction_slug;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'meetings',
    'documents',
    'summary_cards',
    'announcements',
    'scraper_runs',
    'admin_audit_log'
  ]
  loop
    execute format('drop trigger if exists sync_jurisdiction_id on public.%I', table_name);
    execute format(
      'create trigger sync_jurisdiction_id before insert or update on public.%I for each row execute function public.sync_jurisdiction_id()',
      table_name
    );
  end loop;
end;
$$;

alter table public.meetings drop constraint if exists meetings_external_id_key;
drop index if exists public.documents_source_url_idx;

create unique index if not exists meetings_jurisdiction_external_id_idx
  on public.meetings(jurisdiction_slug, external_id);
create unique index if not exists documents_jurisdiction_source_url_idx
  on public.documents(jurisdiction_slug, source_url);

create index if not exists meetings_jurisdiction_id_idx on public.meetings(jurisdiction_id);
create index if not exists documents_jurisdiction_id_idx on public.documents(jurisdiction_id);
create index if not exists summary_cards_jurisdiction_id_idx on public.summary_cards(jurisdiction_id);
create index if not exists scraper_runs_jurisdiction_id_idx on public.scraper_runs(jurisdiction_id);

grant select on public.jurisdictions to anon, authenticated;
grant all on public.jurisdictions to service_role;

alter table public.jurisdictions enable row level security;

do $$
begin
  create policy "Jurisdictions are publicly readable"
    on public.jurisdictions
    for select
    to anon, authenticated
    using (true);
exception
  when duplicate_object then null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260712000000_add_los_altos_jurisdiction.sql
-- -----------------------------------------------------------------------------

insert into public.jurisdictions (slug, name, region_slug)
values ('los-altos', 'Los Altos', 'santa-clara')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260712010000_add_redwood_city_jurisdiction.sql
-- -----------------------------------------------------------------------------

insert into public.jurisdictions (slug, name, region_slug)
values ('redwood-city', 'Redwood City', 'south-san-mateo')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug;

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260713000000_add_east_palo_alto_jurisdiction.sql
-- -----------------------------------------------------------------------------

insert into public.jurisdictions (slug, name, region_slug)
values ('east-palo-alto', 'East Palo Alto', 'south-san-mateo')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260714000000_structure_what_is_happening_points.sql
-- -----------------------------------------------------------------------------

-- Expand phase: keep the legacy text column operational while adding structured points.
-- This migration is safe before or after the compatible application deploy.

create or replace function public.summary_points_from_text(value text)
returns text[]
language plpgsql
immutable
as $$
declare
  raw_point text;
  normalized_point text;
  points text[] := '{}';
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;

  foreach raw_point in array regexp_split_to_array(replace(value, E'\r\n', E'\n'), E'\n+')
  loop
    normalized_point := regexp_replace(btrim(raw_point), '[[:space:]]+', ' ', 'g');
    if normalized_point <> '' then
      points := array_append(points, normalized_point);
    end if;
  end loop;

  if cardinality(points) between 1 and 3 then
    return points;
  end if;

  -- Unknown legacy formatting is preserved as one point instead of guessed apart.
  return array[regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g')];
end;
$$;

create or replace function public.normalize_summary_points(value text[])
returns text[]
language plpgsql
immutable
as $$
declare
  raw_point text;
  normalized_point text;
  points text[] := '{}';
begin
  if value is null then
    return null;
  end if;

  foreach raw_point in array value
  loop
    normalized_point := regexp_replace(btrim(coalesce(raw_point, '')), '[[:space:]]+', ' ', 'g');
    if normalized_point <> '' then
      points := array_append(points, normalized_point);
    end if;
  end loop;

  return case when cardinality(points) = 0 then null else points end;
end;
$$;

create or replace function public.sync_summary_card_points()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.what_is_happening_points is not null then
      new.what_is_happening_points = public.normalize_summary_points(new.what_is_happening_points);
      new.what_is_happening = array_to_string(new.what_is_happening_points, E'\n');
    else
      new.what_is_happening_points = public.summary_points_from_text(new.what_is_happening);
    end if;
  elsif new.what_is_happening_points is distinct from old.what_is_happening_points then
    new.what_is_happening_points = public.normalize_summary_points(new.what_is_happening_points);
    new.what_is_happening = array_to_string(new.what_is_happening_points, E'\n');
  elsif new.what_is_happening is distinct from old.what_is_happening then
    new.what_is_happening_points = public.summary_points_from_text(new.what_is_happening);
  end if;

  return new;
end;
$$;

alter table public.summary_cards
add column if not exists what_is_happening_points text[];

alter table public.summary_card_translations
add column if not exists what_is_happening_points text[];

update public.summary_cards
set what_is_happening_points = public.summary_points_from_text(what_is_happening)
where what_is_happening_points is null;

update public.summary_card_translations
set what_is_happening_points = public.summary_points_from_text(what_is_happening)
where what_is_happening_points is null;

alter table public.summary_cards
drop constraint if exists summary_cards_what_is_happening_point_count_check;
alter table public.summary_cards
add constraint summary_cards_what_is_happening_point_count_check
check (
  what_is_happening_points is null
  or cardinality(what_is_happening_points) between 1 and 3
);

alter table public.summary_card_translations
drop constraint if exists summary_card_translations_what_is_happening_point_count_check;
alter table public.summary_card_translations
add constraint summary_card_translations_what_is_happening_point_count_check
check (
  what_is_happening_points is null
  or cardinality(what_is_happening_points) between 1 and 3
);

drop trigger if exists sync_summary_card_points on public.summary_cards;
create trigger sync_summary_card_points
before insert or update of what_is_happening, what_is_happening_points on public.summary_cards
for each row execute function public.sync_summary_card_points();

drop trigger if exists sync_summary_card_translation_points on public.summary_card_translations;
create trigger sync_summary_card_translation_points
before insert or update of what_is_happening, what_is_happening_points on public.summary_card_translations
for each row execute function public.sync_summary_card_points();

create index if not exists summary_cards_what_is_happening_trgm_idx
on public.summary_cards using gin(what_is_happening gin_trgm_ops);


-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260716000000_repair_serialized_summary_points.sql
-- -----------------------------------------------------------------------------

-- Repair summary arrays that were accidentally serialized into the legacy text column.

create or replace function public.summary_points_from_text(value text)
returns text[]
language plpgsql
immutable
as $$
declare
  raw_point text;
  normalized_point text;
  points text[] := '{}';
  parsed_value jsonb;
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;

  -- Recover only valid JSON arrays containing strings. Invalid JSON, mixed arrays,
  -- and ordinary bracketed prose continue through the legacy newline parser.
  begin
    parsed_value := value::jsonb;
    if jsonb_typeof(parsed_value) = 'array'
      and not exists (
        select 1
        from jsonb_array_elements(parsed_value) as element
        where jsonb_typeof(element) <> 'string'
      )
    then
      foreach raw_point in array array(select jsonb_array_elements_text(parsed_value))
      loop
        normalized_point := regexp_replace(btrim(raw_point), '[[:space:]]+', ' ', 'g');
        if normalized_point <> '' then
          points := array_append(points, normalized_point);
        end if;
      end loop;

      if cardinality(points) between 1 and 3 then
        return points;
      end if;
    end if;
  exception when others then
    null;
  end;

  points := '{}';

  foreach raw_point in array regexp_split_to_array(replace(value, E'\r\n', E'\n'), E'\n+')
  loop
    normalized_point := regexp_replace(btrim(raw_point), '[[:space:]]+', ' ', 'g');
    if normalized_point <> '' then
      points := array_append(points, normalized_point);
    end if;
  end loop;

  if cardinality(points) between 1 and 3 then
    return points;
  end if;

  return array[regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g')];
end;
$$;

with repaired as (
  select id, public.summary_points_from_text(what_is_happening) as points
  from public.summary_cards
  where left(btrim(what_is_happening), 1) = '['
    and right(btrim(what_is_happening), 1) = ']'
)
update public.summary_cards as card
set what_is_happening_points = repaired.points,
    what_is_happening = array_to_string(repaired.points, E'\n')
from repaired
where card.id = repaired.id
  and repaired.points is not null;

with repaired as (
  select id, public.summary_points_from_text(what_is_happening) as points
  from public.summary_card_translations
  where left(btrim(what_is_happening), 1) = '['
    and right(btrim(what_is_happening), 1) = ']'
)
update public.summary_card_translations as translation
set what_is_happening_points = repaired.points,
    what_is_happening = array_to_string(repaired.points, E'\n')
from repaired
where translation.id = repaired.id
  and repaired.points is not null;


-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260716010000_add_decision_sort_key.sql
-- -----------------------------------------------------------------------------

-- Keep decision-card pagination in the same order before and after search filtering.

alter table public.summary_cards
add column if not exists decision_sort_at timestamptz;

update public.summary_cards as card
set decision_sort_at = coalesce(meeting.meeting_datetime, card.updated_at, card.created_at, now())
from public.meetings as meeting
where card.meeting_id = meeting.id
  and card.decision_sort_at is null;

update public.summary_cards
set decision_sort_at = coalesce(updated_at, created_at, now())
where decision_sort_at is null;

alter table public.summary_cards
alter column decision_sort_at set default now();

create or replace function public.sync_summary_card_decision_sort_at()
returns trigger
language plpgsql
as $$
declare
  meeting_sort_at timestamptz;
begin
  if new.meeting_id is not null then
    select meeting_datetime
    into meeting_sort_at
    from public.meetings
    where id = new.meeting_id;
  end if;

  new.decision_sort_at := coalesce(meeting_sort_at, new.updated_at, new.created_at, now());
  return new;
end;
$$;

drop trigger if exists sync_summary_card_decision_sort_at on public.summary_cards;
create trigger sync_summary_card_decision_sort_at
before insert or update on public.summary_cards
for each row execute function public.sync_summary_card_decision_sort_at();

create or replace function public.sync_meeting_decision_sort_at()
returns trigger
language plpgsql
as $$
begin
  if new.meeting_datetime is distinct from old.meeting_datetime then
    update public.summary_cards
    set decision_sort_at = coalesce(new.meeting_datetime, updated_at, created_at, now())
    where meeting_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_meeting_decision_sort_at on public.meetings;
create trigger sync_meeting_decision_sort_at
after update of meeting_datetime on public.meetings
for each row execute function public.sync_meeting_decision_sort_at();

create index if not exists summary_cards_decision_page_idx
on public.summary_cards(
  jurisdiction_slug,
  is_published,
  is_featured desc,
  decision_sort_at desc,
  created_at desc,
  id desc
);

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260717000000_add_security_rate_limits.sql
-- -----------------------------------------------------------------------------

create table if not exists public.security_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.security_rate_limits enable row level security;

revoke all on table public.security_rate_limits from anon, authenticated;
grant all on table public.security_rate_limits to service_role;

create or replace function public.consume_security_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_time timestamptz := clock_timestamp();
  current_row public.security_rate_limits%rowtype;
  retry_after integer := 0;
begin
  if p_key_hash is null or length(p_key_hash) < 16 then
    raise exception 'A valid rate-limit key is required.';
  end if;
  if p_limit < 1 or p_window_seconds < 1 or p_block_seconds < 1 then
    raise exception 'Rate-limit values must be positive.';
  end if;

  insert into public.security_rate_limits (key_hash, request_count)
  values (p_key_hash, 0)
  on conflict (key_hash) do nothing;

  select * into current_row
  from public.security_rate_limits
  where key_hash = p_key_hash
  for update;

  if current_row.blocked_until is not null and current_row.blocked_until > current_time then
    retry_after := greatest(1, ceil(extract(epoch from (current_row.blocked_until - current_time)))::integer);
    return query select false, retry_after;
    return;
  end if;

  if current_row.window_started_at + make_interval(secs => p_window_seconds) <= current_time then
    update public.security_rate_limits
    set window_started_at = current_time,
        request_count = 1,
        blocked_until = null,
        updated_at = current_time
    where key_hash = p_key_hash;
    return query select true, 0;
    return;
  end if;

  if current_row.request_count >= p_limit then
    update public.security_rate_limits
    set blocked_until = current_time + make_interval(secs => p_block_seconds),
        updated_at = current_time
    where key_hash = p_key_hash;
    return query select false, p_block_seconds;
    return;
  end if;

  update public.security_rate_limits
  set request_count = request_count + 1,
      blocked_until = null,
      updated_at = current_time
  where key_hash = p_key_hash;

  return query select true, 0;
end;
$$;

create or replace function public.reset_security_rate_limit(p_key_hash text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.security_rate_limits where key_hash = p_key_hash;
$$;

revoke all on function public.consume_security_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.reset_security_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.reset_security_rate_limit(text) to service_role;

create index if not exists security_rate_limits_updated_at_idx
  on public.security_rate_limits(updated_at);

-- -----------------------------------------------------------------------------
-- Source: supabase/migrations/20260720000000_add_decision_outcome_translations.sql
-- -----------------------------------------------------------------------------

create table if not exists public.decision_outcome_translations (
  id uuid primary key default gen_random_uuid(),
  decision_outcome_id uuid not null references public.decision_outcomes(id) on delete cascade,
  locale text not null,
  headline text not null,
  summary text not null,
  vote text,
  next_step text,
  source_fingerprint text not null,
  translation_status text not null default 'machine',
  raw_llm_json jsonb,
  translated_at timestamptz default now(),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (decision_outcome_id, locale)
);

create index if not exists decision_outcome_translations_locale_idx
on public.decision_outcome_translations(locale);

create index if not exists decision_outcome_translations_status_idx
on public.decision_outcome_translations(translation_status);

drop trigger if exists set_decision_outcome_translations_updated_at
on public.decision_outcome_translations;
create trigger set_decision_outcome_translations_updated_at
before update on public.decision_outcome_translations
for each row execute function public.set_updated_at();

alter table public.decision_outcome_translations enable row level security;

drop policy if exists "Public can read published outcome translations"
on public.decision_outcome_translations;
create policy "Public can read published outcome translations"
on public.decision_outcome_translations for select
to anon, authenticated
using (
  exists (
    select 1
    from public.decision_outcomes outcome
    join public.summary_cards card on card.id = outcome.summary_card_id
    where outcome.id = decision_outcome_id
      and (card.is_published = true or public.is_admin())
  )
);

drop policy if exists "Admins can write outcome translations"
on public.decision_outcome_translations;
create policy "Admins can write outcome translations"
on public.decision_outcome_translations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.decision_outcome_translations to anon, authenticated;
grant insert, update, delete on public.decision_outcome_translations to authenticated;
grant all privileges on public.decision_outcome_translations to service_role;


commit;
