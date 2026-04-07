-- Toki schema + RLS policies
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  bio text default '',
  avatar_url text default '',
  created_at timestamptz default now()
);

alter table public.profiles add column if not exists avatar_url text default '';

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  asker_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) >= 4),
  body text not null check (char_length(body) >= 12),
  created_at timestamptz default now()
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  giver_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) >= 8),
  created_at timestamptz default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid unique not null references public.answers(id) on delete cascade,
  asker_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score between 1 and 10),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.ratings enable row level security;

drop policy if exists "profiles_read" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_read" on public.profiles for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "questions_read" on public.questions;
drop policy if exists "questions_insert_own" on public.questions;
drop policy if exists "questions_update_own" on public.questions;
drop policy if exists "questions_delete_own" on public.questions;

create policy "questions_read" on public.questions for select to authenticated using (true);
create policy "questions_insert_own" on public.questions for insert to authenticated with check ((select auth.uid()) = asker_id);
create policy "questions_update_own" on public.questions for update to authenticated using ((select auth.uid()) = asker_id) with check ((select auth.uid()) = asker_id);
create policy "questions_delete_own" on public.questions for delete to authenticated using ((select auth.uid()) = asker_id);

drop policy if exists "answers_read" on public.answers;
drop policy if exists "answers_insert_own" on public.answers;
drop policy if exists "answers_update_own" on public.answers;
drop policy if exists "answers_delete_own" on public.answers;

create policy "answers_read" on public.answers for select to authenticated using (true);
create policy "answers_insert_own" on public.answers for insert to authenticated with check ((select auth.uid()) = giver_id);
create policy "answers_update_own" on public.answers for update to authenticated using ((select auth.uid()) = giver_id) with check ((select auth.uid()) = giver_id);
create policy "answers_delete_own" on public.answers for delete to authenticated using ((select auth.uid()) = giver_id);

drop policy if exists "ratings_read" on public.ratings;
drop policy if exists "ratings_insert_own_question" on public.ratings;

create policy "ratings_read" on public.ratings for select to authenticated using (true);
create policy "ratings_insert_own_question" on public.ratings for insert to authenticated
with check (
  (select auth.uid()) = asker_id
  and exists (
    select 1
    from public.answers a
    join public.questions q on q.id = a.question_id
    where a.id = ratings.answer_id
      and q.asker_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "avatars_read" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;

create policy "avatars_read"
on storage.objects for select
to authenticated
using (bucket_id = 'avatars');

create policy "avatars_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = ((select auth.uid())::text)
);

create policy "avatars_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = ((select auth.uid())::text)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = ((select auth.uid())::text)
);

create policy "avatars_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = ((select auth.uid())::text)
);
