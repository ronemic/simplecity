create table if not exists public.meeting_translations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  locale text not null,
  title text,
  meeting_type text,
  source_fingerprint text not null,
  translation_status text not null default 'machine',
  raw_llm_json jsonb,
  translated_at timestamptz default now(),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (meeting_id, locale)
);

create table if not exists public.summary_card_translations (
  id uuid primary key default gen_random_uuid(),
  summary_card_id uuid not null references public.summary_cards(id) on delete cascade,
  locale text not null,
  agenda_item text,
  what_is_happening text,
  why_it_matters text,
  who_it_affects text[] default '{}',
  status text,
  comment_window_opens text,
  comment_window_closes text,
  how_to_act_attend text,
  how_to_act_email text,
  how_to_act_submit_comment text,
  source_fingerprint text not null,
  translation_status text not null default 'machine',
  raw_llm_json jsonb,
  translated_at timestamptz default now(),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (summary_card_id, locale)
);

create index if not exists meeting_translations_locale_idx
on public.meeting_translations(locale);

create index if not exists meeting_translations_status_idx
on public.meeting_translations(translation_status);

create index if not exists summary_card_translations_locale_idx
on public.summary_card_translations(locale);

create index if not exists summary_card_translations_status_idx
on public.summary_card_translations(translation_status);

drop trigger if exists set_meeting_translations_updated_at on public.meeting_translations;
create trigger set_meeting_translations_updated_at
before update on public.meeting_translations
for each row execute function public.set_updated_at();

drop trigger if exists set_summary_card_translations_updated_at on public.summary_card_translations;
create trigger set_summary_card_translations_updated_at
before update on public.summary_card_translations
for each row execute function public.set_updated_at();

alter table public.meeting_translations enable row level security;
alter table public.summary_card_translations enable row level security;

drop policy if exists "Public can read meeting translations" on public.meeting_translations;
create policy "Public can read meeting translations"
on public.meeting_translations for select
to anon, authenticated
using (true);

drop policy if exists "Admins can write meeting translations" on public.meeting_translations;
create policy "Admins can write meeting translations"
on public.meeting_translations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read published card translations" on public.summary_card_translations;
create policy "Public can read published card translations"
on public.summary_card_translations for select
to anon, authenticated
using (
  exists (
    select 1
    from public.summary_cards card
    where card.id = summary_card_id
      and (card.is_published = true or public.is_admin())
  )
);

drop policy if exists "Admins can write card translations" on public.summary_card_translations;
create policy "Admins can write card translations"
on public.summary_card_translations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select
on public.meeting_translations,
   public.summary_card_translations
to anon, authenticated;

grant insert, update, delete
on public.meeting_translations,
   public.summary_card_translations
to authenticated;

grant all privileges
on public.meeting_translations,
   public.summary_card_translations
to service_role;
