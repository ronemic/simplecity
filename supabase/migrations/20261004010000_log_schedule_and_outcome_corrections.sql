-- Followed decisions need to surface schedule changes and corrections to
-- official vote details, even when a meeting or outcome keeps the same status.

alter table public.card_events
drop constraint if exists card_events_kind_check;

alter table public.card_events
add constraint card_events_kind_check check (
  kind in (
    'posted',
    'status_changed',
    'outcome_recorded',
    'outcome_changed',
    'outcome_vote_changed',
    'outcome_date_changed',
    'meeting_cancelled',
    'meeting_reinstated',
    'meeting_rescheduled'
  )
);

-- Store a canonical UTC value when parsing succeeded. Otherwise retain the
-- source's date and time text without inventing a timezone for it.
create or replace function public.card_event_schedule_value(
  event_datetime timestamptz,
  event_date_text text,
  event_time_text text
)
returns text
language sql
stable
as $$
  select case
    when event_datetime is not null then
      to_char(event_datetime at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    else nullif(btrim(concat_ws(' ', event_date_text, event_time_text)), '')
  end;
$$;

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
  else
    if new.kind is distinct from old.kind then
      insert into public.card_events
        (summary_card_id, jurisdiction_slug, kind, previous_value, new_value)
      values
        (new.summary_card_id, new.jurisdiction_slug, 'outcome_changed', old.kind, new.kind);
    end if;

    -- Explanation rewording is common. A changed vote or decision date is a
    -- factual correction that a follower should see even if kind is unchanged.
    if nullif(btrim(new.vote), '') is distinct from nullif(btrim(old.vote), '') then
      insert into public.card_events
        (summary_card_id, jurisdiction_slug, kind, previous_value, new_value)
      values
        (new.summary_card_id, new.jurisdiction_slug, 'outcome_vote_changed',
         nullif(btrim(old.vote), ''), nullif(btrim(new.vote), ''));
    end if;

    if new.decided_at is distinct from old.decided_at then
      insert into public.card_events
        (summary_card_id, jurisdiction_slug, kind, previous_value, new_value)
      values
        (new.summary_card_id, new.jurisdiction_slug, 'outcome_date_changed',
         public.card_event_schedule_value(old.decided_at, null, null),
         public.card_event_schedule_value(new.decided_at, null, null));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists log_decision_outcome_event on public.decision_outcomes;
create trigger log_decision_outcome_event
after insert or update of kind, vote, decided_at on public.decision_outcomes
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
  if was_cancelled is distinct from is_cancelled then
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
  end if;

  -- Prefer parsed instants so scraper formatting changes do not look like
  -- reschedules. Compare source text only when an instant is unavailable.
  if not was_cancelled and not is_cancelled and (
    (old.meeting_datetime is not null and new.meeting_datetime is not null
      and old.meeting_datetime is distinct from new.meeting_datetime)
    or ((old.meeting_datetime is null or new.meeting_datetime is null)
      and nullif(btrim(concat_ws(' ', old.date_text, old.time_text)), '')
        is distinct from nullif(btrim(concat_ws(' ', new.date_text, new.time_text)), ''))
  ) then
    insert into public.card_events
      (summary_card_id, jurisdiction_slug, kind, previous_value, new_value)
    select
      card.id,
      card.jurisdiction_slug,
      'meeting_rescheduled',
      public.card_event_schedule_value(old.meeting_datetime, old.date_text, old.time_text),
      public.card_event_schedule_value(new.meeting_datetime, new.date_text, new.time_text)
    from public.summary_cards card
    where card.meeting_id = new.id;
  end if;

  return null;
end;
$$;

drop trigger if exists log_meeting_status_event on public.meetings;
create trigger log_meeting_status_event
after update of status, meeting_datetime, date_text, time_text on public.meetings
for each row execute function public.log_meeting_status_event();
