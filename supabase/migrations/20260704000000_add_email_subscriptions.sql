create table if not exists public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  pending_jurisdiction_slugs text[] default '{}'::text[],
  confirmation_token_hash text,
  unsubscribe_token text not null unique,
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  jurisdiction_slug text not null,
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly')),
  last_digest_sent_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (subscriber_id, jurisdiction_slug, frequency)
);

create table if not exists public.email_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid references public.email_subscribers(id) on delete set null,
  jurisdiction_slugs text[] default '{}'::text[],
  card_ids uuid[] default '{}'::uuid[],
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists email_subscribers_status_idx on public.email_subscribers(status);
create index if not exists email_subscribers_confirmation_token_hash_idx
  on public.email_subscribers(confirmation_token_hash)
  where confirmation_token_hash is not null;
create index if not exists email_subscriptions_subscriber_id_idx
  on public.email_subscriptions(subscriber_id);
create index if not exists email_subscriptions_jurisdiction_frequency_idx
  on public.email_subscriptions(jurisdiction_slug, frequency);
create index if not exists email_digest_deliveries_subscriber_id_idx
  on public.email_digest_deliveries(subscriber_id);

drop trigger if exists set_email_subscribers_updated_at on public.email_subscribers;
create trigger set_email_subscribers_updated_at
before update on public.email_subscribers
for each row execute function public.set_updated_at();

drop trigger if exists set_email_subscriptions_updated_at on public.email_subscriptions;
create trigger set_email_subscriptions_updated_at
before update on public.email_subscriptions
for each row execute function public.set_updated_at();

alter table public.email_subscribers enable row level security;
alter table public.email_subscriptions enable row level security;
alter table public.email_digest_deliveries enable row level security;
