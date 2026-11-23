-- AdCheck — stage 5: subscriptions (provider-agnostic) and webhook idempotency.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,                       -- 'lemonsqueezy', later e.g. 'usdt'
  provider_subscription_id text not null,
  provider_customer_id text,
  status text not null,                         -- active, cancelled, expired, past_due, ...
  current_period_end timestamptz,
  manage_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, updated_at desc);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Every processed webhook event, so retries are never applied twice.
create table if not exists public.billing_events (
  id text primary key,                          -- '<provider>:<event id or payload hash>'
  provider text not null,
  event_type text not null,
  user_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security; -- no policies: server only

-- ---------------------------------------------------------------------------
-- Start a new paid period: switch to Pro and RESET the monthly credits
-- (unused credits do not roll over). Calling it twice for the same period is
-- harmless because it sets values instead of adding them.
-- ---------------------------------------------------------------------------
create or replace function public.grant_paid_period(
  p_user uuid, p_check_credits int, p_image_credits int, p_renew_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
    set plan = 'pro',
        check_credits = p_check_credits,
        image_credits = p_image_credits,
        credits_renew_at = p_renew_at
    where id = p_user;
end;
$$;

-- Subscription ended: back to Free. Remaining check credits are kept,
-- image credits are removed (image generation is Pro-only).
create or replace function public.downgrade_to_free(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
    set plan = 'free', image_credits = 0, credits_renew_at = null
    where id = p_user;
end;
$$;

revoke all on function public.grant_paid_period(uuid, int, int, timestamptz) from public, anon, authenticated;
revoke all on function public.downgrade_to_free(uuid) from public, anon, authenticated;
grant execute on function public.grant_paid_period(uuid, int, int, timestamptz) to service_role;
grant execute on function public.downgrade_to_free(uuid) to service_role;
