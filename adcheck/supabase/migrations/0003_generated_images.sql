-- AdCheck — stage 4: AI-generated compliant images.
-- Files live in the same private bucket: ad-images/<user_id>/generated/<uuid>.<ext>

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  check_id uuid not null references public.checks (id) on delete cascade,
  image_path text not null,
  prompt text not null,
  provider text not null,
  created_at timestamptz not null default now()
);

create index if not exists generated_images_check_idx on public.generated_images (check_id, created_at desc);

alter table public.generated_images enable row level security;

drop policy if exists "generated_images: read own" on public.generated_images;
create policy "generated_images: read own" on public.generated_images
  for select using (auth.uid() = user_id);
