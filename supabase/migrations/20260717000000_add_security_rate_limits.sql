create table if not exists public.security_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.security_rate_limits enable row level security;

revoke all on table public.security_rate_limits from anon, authenticated;
grant all on table public.security_rate_limits to service_role;

create or replace function public.consume_security_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_time timestamptz := clock_timestamp();
  current_row public.security_rate_limits%rowtype;
  retry_after integer := 0;
begin
  if p_key_hash is null or length(p_key_hash) < 16 then
    raise exception 'A valid rate-limit key is required.';
  end if;
  if p_limit < 1 or p_window_seconds < 1 or p_block_seconds < 1 then
    raise exception 'Rate-limit values must be positive.';
  end if;

  insert into public.security_rate_limits (key_hash, request_count)
  values (p_key_hash, 0)
  on conflict (key_hash) do nothing;

  select * into current_row
  from public.security_rate_limits
  where key_hash = p_key_hash
  for update;

  if current_row.blocked_until is not null and current_row.blocked_until > current_time then
    retry_after := greatest(1, ceil(extract(epoch from (current_row.blocked_until - current_time)))::integer);
    return query select false, retry_after;
    return;
  end if;

  if current_row.window_started_at + make_interval(secs => p_window_seconds) <= current_time then
    update public.security_rate_limits
    set window_started_at = current_time,
        request_count = 1,
        blocked_until = null,
        updated_at = current_time
    where key_hash = p_key_hash;
    return query select true, 0;
    return;
  end if;

  if current_row.request_count >= p_limit then
    update public.security_rate_limits
    set blocked_until = current_time + make_interval(secs => p_block_seconds),
        updated_at = current_time
    where key_hash = p_key_hash;
    return query select false, p_block_seconds;
    return;
  end if;

  update public.security_rate_limits
  set request_count = request_count + 1,
      blocked_until = null,
      updated_at = current_time
  where key_hash = p_key_hash;

  return query select true, 0;
end;
$$;

create or replace function public.reset_security_rate_limit(p_key_hash text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.security_rate_limits where key_hash = p_key_hash;
$$;

revoke all on function public.consume_security_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.reset_security_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.reset_security_rate_limit(text) to service_role;

create index if not exists security_rate_limits_updated_at_idx
  on public.security_rate_limits(updated_at);

