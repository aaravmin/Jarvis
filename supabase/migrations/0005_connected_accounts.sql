-- 0005_connected_accounts.sql — Google connector token storage (hard rule #6: tokens server-side only).
-- Holds the OAuth tokens for a connected Google account, user-scoped via RLS. The browser never sees
-- these — they're read only in server routes/agents. (Encryption-at-rest is a hardening follow-up;
-- RLS + server-only access + the anon key never touching this table is the v1 baseline.)

create table if not exists public.connected_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  provider         text not null default 'google' check (provider in ('google')),
  google_sub       text,                       -- Google account id (the id_token `sub` claim)
  email            text,                       -- the connected Google email (display only)
  access_token     text,                       -- short-lived; refreshed as needed
  refresh_token    text,                       -- long-lived; used to mint new access tokens
  token_expires_at timestamptz,                -- when access_token expires
  scopes           text[],                     -- scopes actually granted
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, provider)                   -- one Google account per user (v1)
);
create index if not exists connected_accounts_user_id_idx on public.connected_accounts(user_id);

alter table public.connected_accounts enable row level security;
create policy connected_accounts_select_own on public.connected_accounts for select using (auth.uid() = user_id);
create policy connected_accounts_insert_own on public.connected_accounts for insert with check (auth.uid() = user_id);
create policy connected_accounts_update_own on public.connected_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy connected_accounts_delete_own on public.connected_accounts for delete using (auth.uid() = user_id);

-- Allow sheet/drive imports to carry honest provenance source types.
alter table public.sources drop constraint if exists sources_source_type_check;
alter table public.sources add constraint sources_source_type_check
  check (source_type in ('email','meeting','calendar','manual','research','sheet','drive'));
