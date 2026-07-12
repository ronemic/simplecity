insert into public.jurisdictions (slug, name, region_slug)
values ('los-altos', 'Los Altos', 'santa-clara')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();
