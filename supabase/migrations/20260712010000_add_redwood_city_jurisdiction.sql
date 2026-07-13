insert into public.jurisdictions (slug, name, region_slug)
values ('redwood-city', 'Redwood City', 'south-san-mateo')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug;
