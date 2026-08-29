-- Verified, source-grounded locations for decisions that refer to one exact place.
-- Internal evidence stays service-role only; public clients receive only display fields.

alter table public.summary_cards
  add column if not exists location_label text,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists location_precision text,
  add column if not exists location_confidence double precision,
  add column if not exists location_method text,
  add column if not exists location_status text,
  add column if not exists location_source_text text,
  add column if not exists location_updated_at timestamptz;

alter table public.summary_cards
  drop constraint if exists summary_cards_location_precision_check,
  add constraint summary_cards_location_precision_check
    check (location_precision is null or location_precision in ('street_address', 'intersection', 'place')),
  drop constraint if exists summary_cards_location_confidence_check,
  add constraint summary_cards_location_confidence_check
    check (location_confidence is null or (location_confidence >= 0 and location_confidence <= 1)),
  drop constraint if exists summary_cards_location_method_check,
  add constraint summary_cards_location_method_check
    check (location_method is null or location_method in ('geocoded', 'manual')),
  drop constraint if exists summary_cards_location_status_check,
  add constraint summary_cards_location_status_check
    check (location_status is null or location_status in ('verified', 'no_candidate', 'geocode_failed')),
  drop constraint if exists summary_cards_verified_location_check,
  add constraint summary_cards_verified_location_check
    check (
      location_status is distinct from 'verified'
      or (
        location_label is not null
        and location_latitude between -90 and 90
        and location_longitude between -180 and 180
        and location_precision is not null
        and location_confidence is not null
        and location_method is not null
        and location_source_text is not null
      )
    );

create index if not exists summary_cards_public_location_idx
on public.summary_cards(jurisdiction_slug, decision_sort_at desc)
where is_published = true and location_status = 'verified';

grant select (
  location_label,
  location_latitude,
  location_longitude,
  location_precision,
  location_confidence,
  location_method,
  location_status,
  location_updated_at
)
on table public.summary_cards
to anon, authenticated;
