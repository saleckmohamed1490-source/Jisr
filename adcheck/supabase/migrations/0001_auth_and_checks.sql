-- AdCheck — stage 2: profiles, check history, image storage.
-- Run in the Supabase SQL editor (or `supabase db push`) in numeric order.

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, created automatically on sign-up.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);
-- No insert/update/delete policies: only the server (service role) writes.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Checks: every analysis and its report.
-- ---------------------------------------------------------------------------
create table if not exists public.checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_path text not null,
  ad_text text not null,
  product_description text not null,
  locale text not null check (locale in ('ar', 'fr', 'en')),
  verdict text not null check (verdict in ('compliant', 'medium_risk', 'non_compliant')),
  risk_score int not null,
  report jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists checks_user_created_idx on public.checks (user_id, created_at desc);

alter table public.checks enable row level security;

drop policy if exists "checks: read own" on public.checks;
create policy "checks: read own" on public.checks
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: private bucket. Users upload into a folder named after their id:
--   ad-images/<user_id>/<uuid>.<ext>
-- The bucket itself enforces the 5MB limit and the allowed image types.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-images', 'ad-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ad-images: upload own folder" on storage.objects;
create policy "ad-images: upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ad-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ad-images: read own folder" on storage.objects;
create policy "ad-images: read own folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ad-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
