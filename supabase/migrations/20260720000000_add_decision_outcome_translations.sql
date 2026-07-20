-- Locale-specific public copy for verified decision outcomes.

create table if not exists public.decision_outcome_translations (
  id uuid primary key default gen_random_uuid(),
  decision_outcome_id uuid not null references public.decision_outcomes(id) on delete cascade,
  locale text not null,
  headline text not null,
  summary text not null,
  vote text,
  next_step text,
  source_fingerprint text not null,
  translation_status text not null default 'machine',
  raw_llm_json jsonb,
  translated_at timestamptz default now(),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (decision_outcome_id, locale)
);

create index if not exists decision_outcome_translations_locale_idx
on public.decision_outcome_translations(locale);

create index if not exists decision_outcome_translations_status_idx
on public.decision_outcome_translations(translation_status);

drop trigger if exists set_decision_outcome_translations_updated_at
on public.decision_outcome_translations;
create trigger set_decision_outcome_translations_updated_at
before update on public.decision_outcome_translations
for each row execute function public.set_updated_at();

alter table public.decision_outcome_translations enable row level security;

drop policy if exists "Public can read published outcome translations"
on public.decision_outcome_translations;
create policy "Public can read published outcome translations"
on public.decision_outcome_translations for select
to anon, authenticated
using (
  exists (
    select 1
    from public.decision_outcomes outcome
    join public.summary_cards card on card.id = outcome.summary_card_id
    where outcome.id = decision_outcome_id
      and (card.is_published = true or public.is_admin())
  )
);

drop policy if exists "Admins can write outcome translations"
on public.decision_outcome_translations;
create policy "Admins can write outcome translations"
on public.decision_outcome_translations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.decision_outcome_translations to anon, authenticated;
grant insert, update, delete on public.decision_outcome_translations to authenticated;
grant all privileges on public.decision_outcome_translations to service_role;
