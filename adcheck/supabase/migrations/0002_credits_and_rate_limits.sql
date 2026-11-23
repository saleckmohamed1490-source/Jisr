-- AdCheck — stage 3: plans, credits and per-user rate limiting.
--
-- Credits are ONLY changed by the functions below, which are callable by the
-- service role only (i.e. from our server code). Users can read their own
-- profile but can never write to it.

alter table public.profiles
  add column if not exists plan text not null default 'free',
  add column if not exists check_credits int not null default 3,
  add column if not exists image_credits int not null default 0,
  add column if not exists credits_renew_at timestamptz;

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'pro'));
alter table public.profiles drop constraint if exists profiles_check_credits_nonneg;
alter table public.profiles add constraint profiles_check_credits_nonneg check (check_credits >= 0);
alter table public.profiles drop constraint if exists profiles_image_credits_nonneg;
alter table public.profiles add constraint profiles_image_credits_nonneg check (image_credits >= 0);

-- ---------------------------------------------------------------------------
-- consume_credit: atomically take one credit. Returns the remaining balance,
-- or NULL when the user has none left (nothing is deducted in that case).
-- ---------------------------------------------------------------------------
create or replace function public.consume_credit(p_user uuid, p_kind text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
begin
  if p_kind = 'check' then
    update profiles set check_credits = check_credits - 1
      where id = p_user and check_credits > 0
      returning check_credits into remaining;
  elsif p_kind = 'image' then
    update profiles set image_credits = image_credits - 1
      where id = p_user and image_credits > 0
      returning image_credits into remaining;
  else
    raise exception 'unknown credit kind: %', p_kind;
  end if;
  return remaining; -- NULL when no row was updated
end;
$$;

-- refund_credit: give one credit back after a failed AI call.
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
  else
    raise exception 'unknown credit kind: %', p_kind;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting: sliding window stored in Postgres, so it works across all
-- serverless instances without an extra service.
-- ---------------------------------------------------------------------------
create table if not exists public.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_lookup_idx on public.rate_events (user_id, action, created_at desc);
alter table public.rate_events enable row level security; -- no policies: server only

-- Returns true and records the hit when under the limit, false otherwise.
create or replace function public.hit_rate_limit(
  p_user uuid, p_action text, p_limit int, p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hits int;
begin
  -- Serialize concurrent requests from the same user/action.
  perform pg_advisory_xact_lock(hashtext(p_user::text || ':' || p_action));

  select count(*) into hits from rate_events
    where user_id = p_user and action = p_action
      and created_at > now() - make_interval(secs => p_window_seconds);

  if hits >= p_limit then
    return false;
  end if;

  insert into rate_events (user_id, action) values (p_user, p_action);

  -- Opportunistic cleanup of old rows for this user.
  delete from rate_events
    where user_id = p_user and created_at < now() - interval '1 day';

  return true;
end;
$$;

-- Only the service role may call these functions.
revoke all on function public.consume_credit(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_credit(uuid, text) from public, anon, authenticated;
revoke all on function public.hit_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.consume_credit(uuid, text) to service_role;
grant execute on function public.refund_credit(uuid, text) to service_role;
grant execute on function public.hit_rate_limit(uuid, text, int, int) to service_role;
