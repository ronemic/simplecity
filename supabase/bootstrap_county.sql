-- Structure-only bootstrap for a new Supabase project.
-- Run this entire file in the Supabase SQL Editor before importing CSV data.
-- This script creates database objects only; it does not copy or modify row data.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  jurisdiction_name text,
  jurisdiction_slug text,
  platform text,
  title text not null,
  meeting_type text,
  date_text text,
  time_text text,
  location text,
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
  source_hash text,
  summarized_source_hash text,
  cards_generated_at timestamptz,
  extraction_notes jsonb default '[]'::jsonb,
  raw jsonb,
  scraped_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  jurisdiction_name text,
  jurisdiction_slug text,
  platform text,
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
  jurisdiction_name text,
  jurisdiction_slug text,
  platform text,
  agenda_item text,
  what_is_happening text,
  what_is_happening_points text[] check (
    what_is_happening_points is null
    or cardinality(what_is_happening_points) between 1 and 3
  ),
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
  jurisdiction_slug text,
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
  jurisdiction_slug text,
  platform text,
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
create index if not exists meetings_source_hash_idx on public.meetings(source_hash);
create index if not exists meetings_summarized_source_hash_idx on public.meetings(summarized_source_hash);
create index if not exists meetings_jurisdiction_slug_idx on public.meetings(jurisdiction_slug);
create index if not exists meetings_platform_idx on public.meetings(platform);
create index if not exists meetings_status_datetime_idx
on public.meetings(status, meeting_datetime desc);
create index if not exists meetings_title_trgm_idx
on public.meetings using gin(title gin_trgm_ops);
create index if not exists meetings_meeting_type_trgm_idx
on public.meetings using gin(meeting_type gin_trgm_ops);
create index if not exists meetings_date_text_trgm_idx
on public.meetings using gin(date_text gin_trgm_ops);

create index if not exists summary_cards_meeting_id_idx on public.summary_cards(meeting_id);
create index if not exists summary_cards_jurisdiction_slug_idx on public.summary_cards(jurisdiction_slug);
create index if not exists summary_cards_category_tags_idx on public.summary_cards using gin(category_tags);
create index if not exists summary_cards_what_is_happening_trgm_idx
on public.summary_cards using gin(what_is_happening gin_trgm_ops);
create index if not exists summary_cards_is_published_idx on public.summary_cards(is_published);
create index if not exists decision_outcomes_meeting_id_idx on public.decision_outcomes(meeting_id);
create index if not exists decision_outcomes_jurisdiction_slug_idx on public.decision_outcomes(jurisdiction_slug);
create index if not exists decision_outcomes_updated_at_idx on public.decision_outcomes(updated_at desc);
create unique index if not exists decision_outcomes_meeting_item_idx on public.decision_outcomes(meeting_id, matched_item_key);
create index if not exists summary_cards_published_featured_created_idx
on public.summary_cards(is_published, is_featured desc, created_at desc);
create index if not exists summary_cards_published_created_idx
on public.summary_cards(is_published, created_at desc);
create unique index if not exists summary_cards_regeneration_idx
on public.summary_cards(meeting_id, agenda_item, source_url);

create index if not exists documents_meeting_id_idx on public.documents(meeting_id);
create index if not exists documents_jurisdiction_slug_idx on public.documents(jurisdiction_slug);
create unique index if not exists documents_source_url_idx on public.documents(source_url);

create index if not exists announcements_is_published_idx on public.announcements(is_published);
create index if not exists announcements_published_created_idx on public.announcements(is_published, created_at desc);

create index if not exists scraper_runs_jurisdiction_slug_idx on public.scraper_runs(jurisdiction_slug);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  if value is null or btrim(value) = '' then return null; end if;

  -- Recover string arrays accidentally serialized into this legacy text column.
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
        if normalized_point <> '' then points := array_append(points, normalized_point); end if;
      end loop;
      if cardinality(points) between 1 and 3 then return points; end if;
    end if;
  exception when others then
    null;
  end;

  points := '{}';
  foreach raw_point in array regexp_split_to_array(replace(value, E'\r\n', E'\n'), E'\n+')
  loop
    normalized_point := regexp_replace(btrim(raw_point), '[[:space:]]+', ' ', 'g');
    if normalized_point <> '' then points := array_append(points, normalized_point); end if;
  end loop;
  if cardinality(points) between 1 and 3 then return points; end if;
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
  if value is null then return null; end if;
  foreach raw_point in array value
  loop
    normalized_point := regexp_replace(btrim(coalesce(raw_point, '')), '[[:space:]]+', ' ', 'g');
    if normalized_point <> '' then points := array_append(points, normalized_point); end if;
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

drop trigger if exists sync_summary_card_points on public.summary_cards;
create trigger sync_summary_card_points
before insert or update of what_is_happening, what_is_happening_points on public.summary_cards
for each row execute function public.sync_summary_card_points();

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
