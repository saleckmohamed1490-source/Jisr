-- AdCheck v2 — stage 1: optional landing page URL on checks, 10MB images.

alter table public.checks add column if not exists landing_url text;

update storage.buckets set file_size_limit = 10485760 where id = 'ad-images';
