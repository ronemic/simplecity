-- Anonymous interest signals for the Santa Barbara County pilot.
-- The application writes through the service role only. No browser identifier,
-- email address, or raw IP address is stored in this table.

create table if not exists public.decision_interests (
  id uuid primary key default gen_random_uuid(),
  summary_card_id uuid not null references public.summary_cards(id) on delete cascade,
  device_card_hash text not null check (device_card_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (summary_card_id, device_card_hash)
);

create index if not exists decision_interests_summary_card_id_idx
  on public.decision_interests(summary_card_id);

drop trigger if exists set_decision_interests_updated_at on public.decision_interests;
create trigger set_decision_interests_updated_at
before update on public.decision_interests
for each row execute function public.set_updated_at();

alter table public.decision_interests enable row level security;

revoke all privileges on table public.decision_interests from public, anon, authenticated;
grant all privileges on table public.decision_interests to service_role;

create or replace view public.santa_barbara_decision_interest_totals
with (security_invoker = true)
as
select
  cards.id as summary_card_id,
  cards.agenda_item,
  cards.meeting_id,
  count(interests.id)::bigint as interest_signals,
  max(interests.created_at) as latest_interest_at
from public.summary_cards as cards
join public.decision_interests as interests
  on interests.summary_card_id = cards.id
where cards.jurisdiction_slug = 'santa-barbara-county'
  and cards.is_published = true
group by cards.id, cards.agenda_item, cards.meeting_id;

revoke all privileges on table public.santa_barbara_decision_interest_totals
  from public, anon, authenticated;
grant select on table public.santa_barbara_decision_interest_totals to service_role;
