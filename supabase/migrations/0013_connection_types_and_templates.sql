-- 0013_connection_types_and_templates.sql
-- The "smart template" system: when you email a contact you have a personal connection to (e.g. "a
-- parent's friend"), Otto adapts a base template to weave that connection in, then saves a REUSABLE,
-- GENERALIZED template tied to the *type* of connection — never the personal specifics.
--
-- HARD PRIVACY RULE (per the user's explicit instruction): connection_types and the generated
-- email_templates store only the generalized TYPE of relationship (e.g. "introduced via a parent's
-- professional network"), NEVER the concrete personal detail ("my dad worked with you at Acme").
-- The personal detail is used in-memory to write the one concrete email and is never persisted.

-- Generalized, reusable connection types (user-scoped). One row per kind of relationship.
create table if not exists public.connection_types (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,                 -- short name, e.g. "Parent's professional contact"
  description text,                           -- generalized description of the relationship TYPE
  guidance    text,                           -- how to reference this kind of connection in an email
  times_used  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists connection_types_user_id_idx on public.connection_types(user_id);
-- Find-or-create by case-insensitive label so we don't pile up near-duplicate types.
create unique index if not exists connection_types_user_label_idx
  on public.connection_types (user_id, lower(label));

-- Extend the existing email_templates table (created in 0002) with the connection-aware fields.
alter table public.email_templates
  add column if not exists connection_type_id uuid references public.connection_types(id) on delete set null,
  add column if not exists placeholders text[] not null default '{}',
  add column if not exists source text not null default 'user'
    check (source in ('user','jarvis','drive')),
  add column if not exists drive_file_id text,
  add column if not exists times_used integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create index if not exists email_templates_connection_type_idx
  on public.email_templates(connection_type_id);

-- RLS: owner-only, mirroring every other user-scoped table.
alter table public.connection_types enable row level security;
create policy connection_types_select_own on public.connection_types for select using (auth.uid() = user_id);
create policy connection_types_insert_own on public.connection_types for insert with check (auth.uid() = user_id);
create policy connection_types_update_own on public.connection_types for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy connection_types_delete_own on public.connection_types for delete using (auth.uid() = user_id);
