insert into public.jurisdictions (slug, name, region_slug)
values
  ('santa-maria', 'Santa Maria', 'santa-barbara'),
  ('santa-barbara-city', 'Santa Barbara', 'santa-barbara'),
  ('lompoc', 'Lompoc', 'santa-barbara'),
  ('goleta', 'Goleta', 'santa-barbara')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();
