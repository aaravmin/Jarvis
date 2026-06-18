-- 0008_profile.sql — a lightweight user profile used to make auto-population RELEVANT to who the
-- user is (age / level / what they're after), alongside their goals. One row per user, RLS owner-only.
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  headline    text,   -- e.g. "18yo CS freshman at Brown, into tech"
  age         int check (age is null or (age >= 0 and age <= 120)),
  level       text,   -- e.g. "high school", "freshman", "sophomore", "undergrad", "new grad"
  looking_for text,   -- e.g. "summer internships, startups hiring interns, programs open to undergrads"
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select using (auth.uid() = user_id);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = user_id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy profiles_delete_own on public.profiles for delete using (auth.uid() = user_id);
