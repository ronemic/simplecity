-- Stable source identity prevents regenerated LLM wording from creating a new
-- card for an agenda item that already exists.

alter table public.summary_cards
add column if not exists source_item_id text;

create unique index if not exists summary_cards_source_item_idx
on public.summary_cards(meeting_id, source_item_id)
where source_item_id is not null;

alter table public.decision_outcomes
drop constraint if exists decision_outcomes_match_method_check;

alter table public.decision_outcomes
add constraint decision_outcomes_match_method_check
check (match_method in ('source_item_id', 'source_url', 'agenda_number', 'title'));
