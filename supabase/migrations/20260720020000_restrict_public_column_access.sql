-- Restrict the public API to the columns rendered by SimpleCity.
-- Row-level security still controls which rows are visible. These grants prevent
-- direct anon/authenticated PostgREST requests from selecting internal source,
-- extraction, admin, and model payload columns.

-- Some regional databases were created before decision-card pagination was
-- introduced. Keep this migration self-contained and safe to rerun.
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

revoke select on table
  public.meetings,
  public.documents,
  public.summary_cards,
  public.announcements,
  public.meeting_translations,
  public.summary_card_translations,
  public.decision_outcomes,
  public.decision_outcome_translations
from anon, authenticated;

grant select (
  id,
  jurisdiction_name,
  jurisdiction_slug,
  platform,
  title,
  meeting_type,
  date_text,
  time_text,
  location,
  meeting_datetime,
  status,
  source_type,
  source_url,
  public_comments_input_text,
  scraped_at,
  created_at,
  updated_at
)
on table public.meetings
to anon, authenticated;

grant select (
  id,
  meeting_id,
  jurisdiction_name,
  jurisdiction_slug,
  platform,
  type,
  label,
  source_url
)
on table public.documents
to anon, authenticated;

grant select (
  id,
  meeting_id,
  jurisdiction_name,
  jurisdiction_slug,
  platform,
  agenda_item,
  what_is_happening,
  what_is_happening_points,
  why_it_matters,
  who_it_affects,
  category_tags,
  status,
  comment_window_opens,
  comment_window_closes,
  how_to_act_attend,
  how_to_act_email,
  how_to_act_submit_comment,
  source_url,
  confidence,
  is_published,
  is_featured,
  decision_sort_at,
  created_at,
  updated_at
)
on table public.summary_cards
to anon, authenticated;

grant select (
  id,
  title,
  body,
  type,
  jurisdiction_slug,
  starts_at,
  ends_at,
  is_published,
  created_at,
  updated_at
)
on table public.announcements
to anon, authenticated;

grant select (
  meeting_id,
  locale,
  title,
  meeting_type,
  source_fingerprint,
  translation_status
)
on table public.meeting_translations
to anon, authenticated;

grant select (
  summary_card_id,
  locale,
  agenda_item,
  what_is_happening,
  what_is_happening_points,
  why_it_matters,
  who_it_affects,
  status,
  comment_window_opens,
  comment_window_closes,
  how_to_act_attend,
  how_to_act_email,
  how_to_act_submit_comment,
  source_fingerprint,
  translation_status
)
on table public.summary_card_translations
to anon, authenticated;

grant select (
  id,
  summary_card_id,
  meeting_id,
  jurisdiction_name,
  jurisdiction_slug,
  platform,
  kind,
  headline,
  summary,
  decided_at,
  vote,
  next_step,
  source_url,
  created_at,
  updated_at
)
on table public.decision_outcomes
to anon, authenticated;

grant select (
  decision_outcome_id,
  locale,
  headline,
  summary,
  vote,
  next_step,
  source_fingerprint,
  translation_status
)
on table public.decision_outcome_translations
to anon, authenticated;
