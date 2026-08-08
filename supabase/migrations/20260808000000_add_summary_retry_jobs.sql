create table if not exists public.summary_retry_jobs (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_slug text not null,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  source_hash text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jurisdiction_slug, meeting_id, source_hash)
);

create index if not exists summary_retry_jobs_due_idx
on public.summary_retry_jobs(jurisdiction_slug, next_attempt_at);

drop trigger if exists set_summary_retry_jobs_updated_at on public.summary_retry_jobs;
create trigger set_summary_retry_jobs_updated_at
before update on public.summary_retry_jobs
for each row execute function public.set_updated_at();

alter table public.summary_retry_jobs enable row level security;
grant all on public.summary_retry_jobs to service_role;
