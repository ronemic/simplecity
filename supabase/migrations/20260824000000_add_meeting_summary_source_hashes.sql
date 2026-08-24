alter table public.meetings
  add column if not exists summary_source_hash text,
  add column if not exists summarized_summary_source_hash text;

create index if not exists meetings_summary_source_hash_idx
  on public.meetings(summary_source_hash);
create index if not exists meetings_summarized_summary_source_hash_idx
  on public.meetings(summarized_summary_source_hash);

comment on column public.meetings.summary_source_hash is
  'Outcome-insensitive hash of the current official agenda inputs used for decision-card summaries.';
comment on column public.meetings.summarized_summary_source_hash is
  'Last outcome-insensitive agenda-input hash completed by the summary-card pipeline.';
