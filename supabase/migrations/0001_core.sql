-- 0001_core.sql — P0-T4: the provenance core (sources + items)
-- System of record: Supabase Postgres. Every derived item carries a trail home (source_id +
-- source_quote + confidence). RLS scopes every row to its owning user.

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- The original artifacts we ingested.
create table if not exists public.sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('email','meeting','calendar','manual','research')),
  external_id text,                 -- gmail message id, transcript id, gcal event id
  permalink   text,                 -- deep link back to the original
  title       text,                 -- e.g. email subject / meeting name
  occurred_at timestamptz,          -- when the email/meeting happened
  raw_text    text,                 -- transcript or email body (for re-extraction)
  created_at  timestamptz not null default now()
);

create index if not exists sources_user_id_idx on public.sources(user_id);

-- Everything Otto derives, with a trail home.
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_type    text not null check (item_type in ('task','event','follow_up','app_status','outreach')),
  title        text not null,
  due_at       timestamptz,         -- RESOLVED deterministically (chrono-node), never by the LLM
  status       text not null default 'review' check (status in ('review','accepted','done','dismissed')),
  confidence   numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_id    uuid references public.sources(id) on delete set null,  -- WHERE it came from
  source_quote text,                -- the EXACT line that justified it
  reasoning    text,                -- one sentence: why Otto created this
  created_by   text not null default 'jarvis' check (created_by in ('jarvis','user')),
  created_at   timestamptz not null default now()
);
-- NOTE: items.contact_id is added in 0002_people.sql, after the contacts table exists.

create index if not exists items_user_status_idx on public.items(user_id, status);
create index if not exists items_source_id_idx   on public.items(source_id);

-- Row-Level Security: owner-only, one policy per command.
alter table public.sources enable row level security;
alter table public.items   enable row level security;

create policy sources_select_own on public.sources for select using (auth.uid() = user_id);
create policy sources_insert_own on public.sources for insert with check (auth.uid() = user_id);
create policy sources_update_own on public.sources for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sources_delete_own on public.sources for delete using (auth.uid() = user_id);

create policy items_select_own on public.items for select using (auth.uid() = user_id);
create policy items_insert_own on public.items for insert with check (auth.uid() = user_id);
create policy items_update_own on public.items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy items_delete_own on public.items for delete using (auth.uid() = user_id);
