alter table public.email_subscriptions
  drop constraint if exists email_subscriptions_frequency_check;

alter table public.email_subscriptions
  alter column frequency set default 'weekly';

alter table public.email_subscriptions
  add constraint email_subscriptions_frequency_check
  check (frequency in ('daily', 'weekly'));

update public.email_subscriptions
set frequency = 'weekly'
where frequency = 'daily';
