-- Repair summary arrays that were accidentally serialized into the legacy text column.

create or replace function public.summary_points_from_text(value text)
returns text[]
language plpgsql
immutable
as $$
declare
  raw_point text;
  normalized_point text;
  points text[] := '{}';
  parsed_value jsonb;
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;

  -- Recover only valid JSON arrays containing strings. Invalid JSON, mixed arrays,
  -- and ordinary bracketed prose continue through the legacy newline parser.
  begin
    parsed_value := value::jsonb;
    if jsonb_typeof(parsed_value) = 'array'
      and not exists (
        select 1
        from jsonb_array_elements(parsed_value) as element
        where jsonb_typeof(element) <> 'string'
      )
    then
      foreach raw_point in array array(select jsonb_array_elements_text(parsed_value))
      loop
        normalized_point := regexp_replace(btrim(raw_point), '[[:space:]]+', ' ', 'g');
        if normalized_point <> '' then
          points := array_append(points, normalized_point);
        end if;
      end loop;

      if cardinality(points) between 1 and 3 then
        return points;
      end if;
    end if;
  exception when others then
    null;
  end;

  points := '{}';

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

  return array[regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g')];
end;
$$;

with repaired as (
  select id, public.summary_points_from_text(what_is_happening) as points
  from public.summary_cards
  where left(btrim(what_is_happening), 1) = '['
    and right(btrim(what_is_happening), 1) = ']'
)
update public.summary_cards as card
set what_is_happening_points = repaired.points,
    what_is_happening = array_to_string(repaired.points, E'\n')
from repaired
where card.id = repaired.id
  and repaired.points is not null;

with repaired as (
  select id, public.summary_points_from_text(what_is_happening) as points
  from public.summary_card_translations
  where left(btrim(what_is_happening), 1) = '['
    and right(btrim(what_is_happening), 1) = ']'
)
update public.summary_card_translations as translation
set what_is_happening_points = repaired.points,
    what_is_happening = array_to_string(repaired.points, E'\n')
from repaired
where translation.id = repaired.id
  and repaired.points is not null;
