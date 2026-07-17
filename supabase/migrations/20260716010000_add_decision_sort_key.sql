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
