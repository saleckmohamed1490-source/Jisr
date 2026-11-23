-- AdCheck v2 — stage 7: appeal letters for rejected ads.
create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  check_id uuid references public.checks (id) on delete set null,
  rejection_reason text not null,
  ad_text text,
  product_description text,
  changes_made text,
  letter_language text not null check (letter_language in ('ar', 'fr', 'en')),
  ui_locale text not null,
  result jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists appeals_user_created_idx on public.appeals (user_id, created_at desc);
alter table public.appeals enable row level security;
drop policy if exists "appeals: read own" on public.appeals;
create policy "appeals: read own" on public.appeals for select using (auth.uid() = user_id);
