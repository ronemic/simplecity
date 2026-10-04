-- A per-card history of real civic changes, shown as a timeline and used to
-- flag followed cards that changed since a reader last looked.
--
-- Rows are written only by triggers, so the scraper and summarizer need no
-- changes. Summary rewording is deliberately NOT an event: cards are
-- re-summarized routinely, and logging new wording would flag every followed
-- card as "updated" with nothing new to report.

create table if not exists public.card_events (
  id uuid primary key default gen_random_uuid(),
  summary_card_id uuid not null references public.summary_cards(id) on delete cascade,
  jurisdiction_slug text,
  kind text not null check (
    kind in (
      'posted',
      'status_changed',
      'outcome_recorded',
      'outcome_changed',
      'meeting_cancelled',
      'meeting_reinstated'
    )
  ),
  previous_value text,
  new_value text,
  -- When the change happened, for display (an outcome's decision date).
  occurred_at timestamptz not null default now(),
  -- When SimpleCity recorded it, for "new since your last visit".
  created_at timestamptz not null default now()
);

create index if not exists card_events_summary_card_idx
on public.card_events(summary_card_id, occurred_at);

-- The summarizer reclassifies pending items between these labels from run to
-- run; only movement into or out of a settled state is worth reporting.
create or replace function public.card_status_is_pending(value text)
returns boolean
language sql
immutable
as $$
  select value is null
    or value in ('Upcoming vote', 'Routine approval', 'Under discussion', 'Information only');
$$;

create or replace function public.log_summary_card_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.card_events
      (summary_card_id, jurisdiction_slug, kind, new_value, occurred_at)
    values
      (new.id, new.jurisdiction_slug, 'posted', new.status, coalesce(new.created_at, now()));
  elsif new.status is distinct from old.status
    and not (public.card_status_is_pending(old.status) and public.card_status_is_pending(new.status)) then
    insert into public.card_events
      (summary_card_id, jurisdiction_slug, kind, previous_value, new_value)
    values
      (new.id, new.jurisdiction_slug, 'status_changed', old.status, new.status);
  end if;
  return null;
end;
$$;

drop trigger if exists log_summary_card_event on public.summary_cards;
create trigger log_summary_card_event
after insert or update of status on public.summary_cards
for each row execute function public.log_summary_card_event();

create or replace function public.log_decision_outcome_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.card_events
      (summary_card_id, jurisdiction_slug, kind, new_value, occurred_at)
    values
      (new.summary_card_id, new.jurisdiction_slug, 'outcome_recorded', new.kind, coalesce(new.decided_at, now()));
  elsif new.kind is distinct from old.kind then
    insert into public.card_events
      (summary_card_id, jurisdiction_slug, kind, previous_value, new_value, occurred_at)
    values
      (new.summary_card_id, new.jurisdiction_slug, 'outcome_changed', old.kind, new.kind, now());
  end if;
  return null;
end;
$$;

drop trigger if exists log_decision_outcome_event on public.decision_outcomes;
create trigger log_decision_outcome_event
after insert or update of kind on public.decision_outcomes
for each row execute function public.log_decision_outcome_event();

create or replace function public.log_meeting_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_cancelled boolean := coalesce(old.status in ('Cancelled', 'Canceled'), false);
  is_cancelled boolean := coalesce(new.status in ('Cancelled', 'Canceled'), false);
begin
  -- Upcoming -> Past happens to every meeting and is not news.
  if was_cancelled = is_cancelled then
    return null;
  end if;

  insert into public.card_events
    (summary_card_id, jurisdiction_slug, kind, previous_value, new_value)
  select
    card.id,
    card.jurisdiction_slug,
    case when is_cancelled then 'meeting_cancelled' else 'meeting_reinstated' end,
    old.status,
    new.status
  from public.summary_cards card
  where card.meeting_id = new.id;

  return null;
end;
$$;

drop trigger if exists log_meeting_status_event on public.meetings;
create trigger log_meeting_status_event
after update of status on public.meetings
for each row execute function public.log_meeting_status_event();

-- Seed history for existing cards so their timelines are not empty. Timestamps
-- are the original ones, so nothing seeded reads as new to a follower.
insert into public.card_events
  (summary_card_id, jurisdiction_slug, kind, new_value, occurred_at, created_at)
select
  card.id,
  card.jurisdiction_slug,
  'posted',
  card.status,
  coalesce(card.created_at, now()),
  coalesce(card.created_at, now())
from public.summary_cards card
where not exists (
  select 1 from public.card_events event
  where event.summary_card_id = card.id and event.kind = 'posted'
);

insert into public.card_events
  (summary_card_id, jurisdiction_slug, kind, new_value, occurred_at, created_at)
select
  outcome.summary_card_id,
  outcome.jurisdiction_slug,
  'outcome_recorded',
  outcome.kind,
  coalesce(outcome.decided_at, outcome.created_at, now()),
  coalesce(outcome.created_at, now())
from public.decision_outcomes outcome
where not exists (
  select 1 from public.card_events event
  where event.summary_card_id = outcome.summary_card_id and event.kind = 'outcome_recorded'
);

alter table public.card_events enable row level security;

drop policy if exists "Public can read events for published cards" on public.card_events;
create policy "Public can read events for published cards"
on public.card_events for select
to anon, authenticated
using (
  exists (
    select 1
    from public.summary_cards card
    where card.id = card_events.summary_card_id
      and (card.is_published = true or public.is_admin())
  )
);

revoke all privileges on table public.card_events from public, anon, authenticated;
grant select (
  id,
  summary_card_id,
  jurisdiction_slug,
  kind,
  previous_value,
  new_value,
  occurred_at,
  created_at
)
on table public.card_events
to anon, authenticated;
grant all privileges on table public.card_events to service_role;
