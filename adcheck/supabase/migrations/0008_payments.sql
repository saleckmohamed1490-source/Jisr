-- AdCheck v2 — stage 4: crypto payments (NOWPayments), provider-agnostic.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  -- Human-readable, sequential invoice number for receipts.
  invoice_number bigint generated always as identity unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Our unique reference sent to the provider (links the payment to user/plan/months).
  order_id text not null unique,
  provider text not null,
  provider_invoice_id text,
  provider_payment_id text unique,
  plan text not null check (plan in ('starter', 'pro', 'agency')),
  months int not null check (months in (1, 3, 12)),
  price_usd numeric(10, 2) not null check (price_usd >= 0),
  pay_currency text,
  pay_amount numeric(36, 18),
  actually_paid numeric(36, 18),
  pay_address text,
  payin_hash text,
  invoice_url text,
  -- 'pending' (invoice created, nothing received yet) or a provider status:
  -- waiting, confirming, confirmed, sending, partially_paid, finished, failed, refunded, expired
  status text not null default 'pending',
  activated_at timestamptz,
  period_end timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_created_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);

alter table public.payments enable row level security;
drop policy if exists "payments: read own" on public.payments;
create policy "payments: read own" on public.payments
  for select using (auth.uid() = user_id);

-- Raw log of every webhook received (audit / debugging). Server only.
create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.payments (id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  status text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;

-- ---------------------------------------------------------------------------
-- activate_payment: the ONLY way a payment turns into subscription time.
-- Idempotent: a payment row is activated at most once (activated_at), and a
-- provider payment_id can belong to one row only (unique). Runs in one
-- transaction together with extend_subscription().
-- Returns the new subscription end, or NULL if it was already activated.
-- ---------------------------------------------------------------------------
create or replace function public.activate_payment(
  p_payment uuid, p_checks int, p_images int, p_appeals int
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  pay payments%rowtype;
  new_end timestamptz;
begin
  update payments set activated_at = now(), updated_at = now()
    where id = p_payment and activated_at is null
    returning * into pay;
  if not found then
    return null;
  end if;

  new_end := extend_subscription(pay.user_id, pay.plan, pay.months, pay.provider, p_checks, p_images, p_appeals);
  update payments set period_end = new_end where id = p_payment;
  return new_end;
end;
$$;

revoke all on function public.activate_payment(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.activate_payment(uuid, int, int, int) to service_role;
