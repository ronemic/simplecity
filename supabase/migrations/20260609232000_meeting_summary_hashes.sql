alter table public.meetings
  add column if not exists source_hash text,
  add column if not exists summarized_source_hash text,
  add column if not exists cards_generated_at timestamptz;

create index if not exists meetings_source_hash_idx on public.meetings(source_hash);
create index if not exists meetings_summarized_source_hash_idx on public.meetings(summarized_source_hash);
