insert into public.jurisdictions (slug, name, region_slug)
values ('santa-barbara-county', 'Santa Barbara County', 'santa-barbara')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();
