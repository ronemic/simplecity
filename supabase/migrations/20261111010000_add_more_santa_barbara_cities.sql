insert into public.jurisdictions (slug, name, region_slug)
values
  ('carpinteria', 'Carpinteria', 'santa-barbara'),
  ('guadalupe', 'Guadalupe', 'santa-barbara'),
  ('solvang', 'Solvang', 'santa-barbara')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();
