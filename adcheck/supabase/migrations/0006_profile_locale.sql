-- AdCheck v2 — stage 2: remember each user's language (used for e-mails).
alter table public.profiles add column if not exists locale text not null default 'en';
