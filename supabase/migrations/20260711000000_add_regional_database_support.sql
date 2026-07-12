create table if not exists public.jurisdictions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  region_slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_audit_log
  add column if not exists jurisdiction_slug text;

insert into public.jurisdictions (slug, name, region_slug)
values
  ('san-francisco', 'San Francisco', 'san-francisco'),
  ('san-mateo-county', 'San Mateo County', 'north-san-mateo'),
  ('san-mateo-city', 'San Mateo', 'north-san-mateo'),
  ('foster-city', 'Foster City', 'north-san-mateo'),
  ('menlo-park', 'Menlo Park', 'south-san-mateo'),
  ('santa-clara-county', 'Santa Clara County', 'santa-clara'),
  ('mountain-view', 'Mountain View', 'santa-clara')
on conflict (slug) do update
set name = excluded.name,
    region_slug = excluded.region_slug,
    updated_at = now();

alter table public.meetings add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.documents add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.summary_cards add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.announcements add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.scraper_runs add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
alter table public.admin_audit_log add column if not exists jurisdiction_id uuid references public.jurisdictions(id);

update public.meetings m
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where m.jurisdiction_slug = jurisdiction.slug and m.jurisdiction_id is null;

update public.documents d
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where d.jurisdiction_slug = jurisdiction.slug and d.jurisdiction_id is null;

update public.summary_cards c
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where c.jurisdiction_slug = jurisdiction.slug and c.jurisdiction_id is null;

update public.announcements a
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where a.jurisdiction_slug = jurisdiction.slug and a.jurisdiction_id is null;

update public.scraper_runs s
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where s.jurisdiction_slug = jurisdiction.slug and s.jurisdiction_id is null;

update public.admin_audit_log l
set jurisdiction_id = jurisdiction.id
from public.jurisdictions jurisdiction
where l.jurisdiction_slug = jurisdiction.slug and l.jurisdiction_id is null;

create or replace function public.sync_jurisdiction_id()
returns trigger
language plpgsql
as $$
begin
  if new.jurisdiction_slug is null then
    new.jurisdiction_id := null;
    return new;
  end if;

  select id into new.jurisdiction_id
  from public.jurisdictions
  where slug = new.jurisdiction_slug;

  if new.jurisdiction_id is null then
    raise exception 'Unknown jurisdiction slug: %', new.jurisdiction_slug;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'meetings',
    'documents',
    'summary_cards',
    'announcements',
    'scraper_runs',
    'admin_audit_log'
  ]
  loop
    execute format('drop trigger if exists sync_jurisdiction_id on public.%I', table_name);
    execute format(
      'create trigger sync_jurisdiction_id before insert or update on public.%I for each row execute function public.sync_jurisdiction_id()',
      table_name
    );
  end loop;
end;
$$;

alter table public.meetings drop constraint if exists meetings_external_id_key;
drop index if exists public.documents_source_url_idx;

create unique index if not exists meetings_jurisdiction_external_id_idx
  on public.meetings(jurisdiction_slug, external_id);
create unique index if not exists documents_jurisdiction_source_url_idx
  on public.documents(jurisdiction_slug, source_url);

create index if not exists meetings_jurisdiction_id_idx on public.meetings(jurisdiction_id);
create index if not exists documents_jurisdiction_id_idx on public.documents(jurisdiction_id);
create index if not exists summary_cards_jurisdiction_id_idx on public.summary_cards(jurisdiction_id);
create index if not exists scraper_runs_jurisdiction_id_idx on public.scraper_runs(jurisdiction_id);

grant select on public.jurisdictions to anon, authenticated;
grant all on public.jurisdictions to service_role;
