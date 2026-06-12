alter table public.meetings
  add column if not exists time_text text,
  add column if not exists location text;

create index if not exists documents_jurisdiction_slug_idx on public.documents(jurisdiction_slug);
