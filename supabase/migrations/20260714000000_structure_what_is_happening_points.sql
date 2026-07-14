-- Expand phase: keep the legacy text column operational while adding structured points.
-- This migration is safe before or after the compatible application deploy.

create or replace function public.summary_points_from_text(value text)
returns text[]
language plpgsql
immutable
as $$
declare
  raw_point text;
  normalized_point text;
  points text[] := '{}';
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;

  foreach raw_point in array regexp_split_to_array(replace(value, E'\r\n', E'\n'), E'\n+')
  loop
    normalized_point := regexp_replace(btrim(raw_point), '[[:space:]]+', ' ', 'g');
    if normalized_point <> '' then
      points := array_append(points, normalized_point);
    end if;
  end loop;

  if cardinality(points) between 1 and 3 then
    return points;
  end if;

  -- Unknown legacy formatting is preserved as one point instead of guessed apart.
  return array[regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g')];
end;
$$;

create or replace function public.normalize_summary_points(value text[])
returns text[]
language plpgsql
immutable
as $$
declare
  raw_point text;
  normalized_point text;
  points text[] := '{}';
begin
  if value is null then
    return null;
  end if;

  foreach raw_point in array value
  loop
    normalized_point := regexp_replace(btrim(coalesce(raw_point, '')), '[[:space:]]+', ' ', 'g');
    if normalized_point <> '' then
      points := array_append(points, normalized_point);
    end if;
  end loop;

  return case when cardinality(points) = 0 then null else points end;
end;
$$;

create or replace function public.sync_summary_card_points()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.what_is_happening_points is not null then
      new.what_is_happening_points = public.normalize_summary_points(new.what_is_happening_points);
      new.what_is_happening = array_to_string(new.what_is_happening_points, E'\n');
    else
      new.what_is_happening_points = public.summary_points_from_text(new.what_is_happening);
    end if;
  elsif new.what_is_happening_points is distinct from old.what_is_happening_points then
    new.what_is_happening_points = public.normalize_summary_points(new.what_is_happening_points);
    new.what_is_happening = array_to_string(new.what_is_happening_points, E'\n');
  elsif new.what_is_happening is distinct from old.what_is_happening then
    new.what_is_happening_points = public.summary_points_from_text(new.what_is_happening);
  end if;

  return new;
end;
$$;

alter table public.summary_cards
add column if not exists what_is_happening_points text[];

alter table public.summary_card_translations
add column if not exists what_is_happening_points text[];

update public.summary_cards
set what_is_happening_points = public.summary_points_from_text(what_is_happening)
where what_is_happening_points is null;

update public.summary_card_translations
set what_is_happening_points = public.summary_points_from_text(what_is_happening)
where what_is_happening_points is null;

alter table public.summary_cards
drop constraint if exists summary_cards_what_is_happening_point_count_check;
alter table public.summary_cards
add constraint summary_cards_what_is_happening_point_count_check
check (
  what_is_happening_points is null
  or cardinality(what_is_happening_points) between 1 and 3
);

alter table public.summary_card_translations
drop constraint if exists summary_card_translations_what_is_happening_point_count_check;
alter table public.summary_card_translations
add constraint summary_card_translations_what_is_happening_point_count_check
check (
  what_is_happening_points is null
  or cardinality(what_is_happening_points) between 1 and 3
);

drop trigger if exists sync_summary_card_points on public.summary_cards;
create trigger sync_summary_card_points
before insert or update of what_is_happening, what_is_happening_points on public.summary_cards
for each row execute function public.sync_summary_card_points();

drop trigger if exists sync_summary_card_translation_points on public.summary_card_translations;
create trigger sync_summary_card_translation_points
before insert or update of what_is_happening, what_is_happening_points on public.summary_card_translations
for each row execute function public.sync_summary_card_points();

create index if not exists summary_cards_what_is_happening_trgm_idx
on public.summary_cards using gin(what_is_happening gin_trgm_ops);
