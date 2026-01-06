create extension if not exists pgcrypto;

create table if not exists public.lawyer_onboarding (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  full_name text not null,
  phone text not null,
  state text not null,
  injury_case_types text[] not null
);

alter table public.lawyer_onboarding
  add column if not exists phone text not null default '';

create index if not exists lawyer_onboarding_created_at_idx on public.lawyer_onboarding (created_at desc);
create index if not exists lawyer_onboarding_email_idx on public.lawyer_onboarding (email);

alter table public.lawyer_onboarding enable row level security;

drop policy if exists "lawyer_onboarding_public_insert" on public.lawyer_onboarding;
create policy "lawyer_onboarding_public_insert"
  on public.lawyer_onboarding
  for insert
  to anon, authenticated
  with check (true);
