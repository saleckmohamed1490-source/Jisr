-- AdCheck v2 — stage 5: daily maintenance (called by /api/cron/daily).

-- Expire every subscription whose period is over and move the user to Free.
-- Paid credits are removed (Free users only get the one-time sign-up checks).
-- Returns who was downgraded, so the server can e-mail them.
create or replace function public.expire_due_subscriptions()
returns table (user_id uuid, plan text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with expired as (
    update subscriptions s set status = 'expired', updated_at = now()
      where s.status = 'active' and s.current_period_end <= now()
      returning s.user_id, s.plan
  ), downgraded as (
    update profiles p set plan = 'free', check_credits = 0, image_credits = 0,
        appeal_credits = 0, credits_renew_at = null
      from expired e where p.id = e.user_id
      returning p.id
  )
  select e.user_id, e.plan from expired e;
end;
$$;

-- Reset one user's monthly credits if their 30-day cycle is due.
-- Idempotent: the WHERE clause only matches when the reset date has passed,
-- and the next date is moved forward past now().
create or replace function public.renew_credits_if_due(
  p_user uuid, p_checks int, p_images int, p_appeals int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set
      check_credits = p_checks,
      image_credits = p_images,
      appeal_credits = p_appeals,
      credits_renew_at = credits_renew_at
        + interval '30 days' * (floor(extract(epoch from (now() - credits_renew_at)) / 2592000) + 1)
    where id = p_user and plan <> 'free' and credits_renew_at is not null and credits_renew_at <= now();
  return found;
end;
$$;

revoke all on function public.expire_due_subscriptions() from public, anon, authenticated;
revoke all on function public.renew_credits_if_due(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.expire_due_subscriptions() to service_role;
grant execute on function public.renew_credits_if_due(uuid, int, int, int) to service_role;
