-- Repair regional databases where the jurisdictions lookup table exists without
-- row-level security, and expose only the fields used as public lookup data.

alter table public.jurisdictions enable row level security;

drop policy if exists "Jurisdictions are publicly readable"
on public.jurisdictions;

create policy "Jurisdictions are publicly readable"
on public.jurisdictions
for select
to anon, authenticated
using (true);

revoke all privileges on table public.jurisdictions
from anon, authenticated;

grant select (
  slug,
  name,
  region_slug
)
on table public.jurisdictions
to anon, authenticated;

grant all privileges on table public.jurisdictions
to service_role;
