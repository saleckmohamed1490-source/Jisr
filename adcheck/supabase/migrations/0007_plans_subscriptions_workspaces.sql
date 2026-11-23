-- AdCheck v2 — stage 3: Free / Starter / Pro / Agency, subscriptions, workspaces.
--
-- Quotas live in src/lib/plans.ts and are passed to these functions by the
-- server, so prices/quotas can change without a migration.

-- ---------------------------------------------------------------------------
-- Replace the v1 (Lemon Squeezy) billing tables.
-- ---------------------------------------------------------------------------
drop function if exists public.grant_paid_period(uuid, int, int, timestamptz);
drop function if exists public.downgrade_to_free(uuid);
drop table if exists public.billing_events;
drop table if exists public.subscriptions;

-- ---------------------------------------------------------------------------
-- Profiles: plan + credit balances.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_plan_check;
-- v1 had a single paid plan called 'pro' ($6): it maps to 'starter'.
update public.profiles set plan = 'starter' where plan = 'pro';
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('free', 'starter', 'pro', 'agency'));

-- NULL = unlimited.
alter table public.profiles add column if not exists appeal_credits int default 0;
alter table public.profiles drop constraint if exists profiles_appeal_credits_nonneg;
alter table public.profiles add constraint profiles_appeal_credits_nonneg
  check (appeal_credits is null or appeal_credits >= 0);

comment on column public.profiles.credits_renew_at is 'Next 30-day credit reset (paid plans only).';

-- ---------------------------------------------------------------------------
-- Subscriptions: one row per user, provider-agnostic.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan text not null check (plan in ('starter', 'pro', 'agency')),
  status text not null check (status in ('active', 'expired')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  provider text not null,                 -- 'nowpayments', 'manual', later 'lemonsqueezy'
  reminder_3d_sent_at timestamptz,
  reminder_1d_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- v1 subscribers keep access until their last paid period ends.
insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end, provider)
  select id, 'starter', 'active', now(), coalesce(credits_renew_at, now() + interval '30 days'), 'lemonsqueezy-legacy'
  from public.profiles where plan = 'starter'
  on conflict (user_id) do nothing;

create index subscriptions_active_end_idx on public.subscriptions (current_period_end) where status = 'active';

alter table public.subscriptions enable row level security;
create policy "subscriptions: read own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Workspaces (Agency: up to 5 client workspaces). Checks can belong to one.
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists workspaces_owner_idx on public.workspaces (owner_id, created_at);
alter table public.workspaces enable row level security;
drop policy if exists "workspaces: read own" on public.workspaces;
create policy "workspaces: read own" on public.workspaces
  for select using (auth.uid() = owner_id);

alter table public.checks add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;
create index if not exists checks_workspace_idx on public.checks (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Credits. consume_credit returns the remaining balance, 2147483647 when the
-- balance is unlimited (NULL), or NULL when there is nothing left.
-- ---------------------------------------------------------------------------
create or replace function public.consume_credit(p_user uuid, p_kind text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
  unlimited boolean;
begin
  if p_kind = 'check' then
    update profiles set check_credits = check_credits - 1
      where id = p_user and check_credits > 0 returning check_credits into remaining;
  elsif p_kind = 'image' then
    update profiles set image_credits = image_credits - 1
      where id = p_user and image_credits > 0 returning image_credits into remaining;
  elsif p_kind = 'appeal' then
    select appeal_credits is null into unlimited from profiles where id = p_user;
    if unlimited then
      return 2147483647;
    end if;
    update profiles set appeal_credits = appeal_credits - 1
      where id = p_user and appeal_credits > 0 returning appeal_credits into remaining;
  else
    raise exception 'unknown credit kind: %', p_kind;
  end if;
  return remaining;
end;
$$;

create or replace function public.refund_credit(p_user uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'check' then
    update profiles set check_credits = check_credits + 1 where id = p_user;
  elsif p_kind = 'image' then
    update profiles set image_credits = image_credits + 1 where id = p_user;
  elsif p_kind = 'appeal' then
    update profiles set appeal_credits = appeal_credits + 1 where id = p_user and appeal_credits is not null;
  else
    raise exception 'unknown credit kind: %', p_kind;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- extend_subscription: called once per confirmed payment (or by an admin).
--  * no active subscription  -> starts now, for p_months
--  * same plan, still active -> p_months are ADDED to the current end date
--  * other plan, still active -> switches plan now, keeps the remaining time
--                                and adds p_months; credits reset to the new plan
-- Credits are (re)set whenever a period starts or the plan changes; then they
-- renew every 30 days (see renew_due_credits).
-- ---------------------------------------------------------------------------
create or replace function public.extend_subscription(
  p_user uuid, p_plan text, p_months int, p_provider text,
  p_checks int, p_images int, p_appeals int
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  sub subscriptions%rowtype;
  new_end timestamptz;
  reset_credits boolean := true;
begin
  if p_months not in (1, 3, 12) then raise exception 'invalid months %', p_months; end if;

  select * into sub from subscriptions where user_id = p_user for update;

  if found and sub.status = 'active' and sub.current_period_end > now() then
    new_end := sub.current_period_end + make_interval(months => p_months);
    reset_credits := sub.plan <> p_plan;
    update subscriptions set
        plan = p_plan,
        current_period_end = new_end,
        current_period_start = case when reset_credits then now() else current_period_start end,
        provider = p_provider,
        reminder_3d_sent_at = null,
        reminder_1d_sent_at = null,
        updated_at = now()
      where id = sub.id;
  else
    new_end := now() + make_interval(months => p_months);
    insert into subscriptions (user_id, plan, status, current_period_start, current_period_end, provider)
      values (p_user, p_plan, 'active', now(), new_end, p_provider)
      on conflict (user_id) do update set
        plan = excluded.plan, status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        provider = excluded.provider,
        reminder_3d_sent_at = null, reminder_1d_sent_at = null, updated_at = now();
  end if;

  if reset_credits then
    update profiles set
        plan = p_plan,
        check_credits = p_checks,
        image_credits = p_images,
        appeal_credits = p_appeals,
        credits_renew_at = now() + interval '30 days'
      where id = p_user;
  end if;

  return new_end;
end;
$$;

revoke all on function public.consume_credit(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_credit(uuid, text) from public, anon, authenticated;
revoke all on function public.extend_subscription(uuid, text, int, text, int, int, int) from public, anon, authenticated;
grant execute on function public.consume_credit(uuid, text) to service_role;
grant execute on function public.refund_credit(uuid, text) to service_role;
grant execute on function public.extend_subscription(uuid, text, int, text, int, int, int) to service_role;
