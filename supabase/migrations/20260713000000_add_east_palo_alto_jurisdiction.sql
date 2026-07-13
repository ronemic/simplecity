insert into public.jurisdictions (slug, name, region_slug)
values ('east-palo-alto', 'East Palo Alto', 'south-san-mateo')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();
