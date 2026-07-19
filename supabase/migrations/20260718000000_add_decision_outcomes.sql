-- Verified agenda-item outcomes from official minutes or structured meeting results.

create table if not exists public.decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  summary_card_id uuid not null unique references public.summary_cards(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  jurisdiction_name text,
  jurisdiction_slug text,
  platform text,
  kind text not null check (kind in ('approved', 'rejected', 'continued', 'amended', 'other')),
  headline text not null,
  summary text not null,
  decided_at timestamptz,
  vote text,
  next_step text,
  source_url text not null,
  source_hash text not null,
  source_text text not null,
  matched_item_key text not null,
  match_method text not null check (match_method in ('source_url', 'agenda_number', 'title')),
  match_score double precision not null check (match_score >= 0 and match_score <= 1),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists decision_outcomes_meeting_id_idx
on public.decision_outcomes(meeting_id);

create index if not exists decision_outcomes_jurisdiction_slug_idx
on public.decision_outcomes(jurisdiction_slug);

create index if not exists decision_outcomes_updated_at_idx
on public.decision_outcomes(updated_at desc);

create unique index if not exists decision_outcomes_meeting_item_idx
on public.decision_outcomes(meeting_id, matched_item_key);

drop trigger if exists set_decision_outcomes_updated_at on public.decision_outcomes;
create trigger set_decision_outcomes_updated_at
before update on public.decision_outcomes
for each row execute function public.set_updated_at();

alter table public.decision_outcomes enable row level security;

drop policy if exists "Public can read outcomes for published cards" on public.decision_outcomes;
create policy "Public can read outcomes for published cards"
on public.decision_outcomes for select
to anon, authenticated
using (
  exists (
    select 1
    from public.summary_cards card
    where card.id = decision_outcomes.summary_card_id
      and (card.is_published = true or public.is_admin())
  )
);

drop policy if exists "Admins can write decision outcomes" on public.decision_outcomes;
create policy "Admins can write decision outcomes"
on public.decision_outcomes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.decision_outcomes to anon, authenticated;
grant all on public.decision_outcomes to service_role;
