drop index if exists public.summary_cards_regeneration_idx;

create unique index if not exists summary_cards_regeneration_idx
on public.summary_cards(meeting_id, agenda_item, source_url)
where source_item_id is null;
