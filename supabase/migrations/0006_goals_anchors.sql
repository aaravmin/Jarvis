-- 0006_goals_anchors.sql — Goals as ANCHORS.
-- Every entity (contact / opportunity / task / event / meeting / calendar / email) links to 1+ goals.
-- When an entity links to 2+ goals we record an INTERSECTION (an AI "combined ask" so you can serve
-- multiple goals in one interaction). Goals also connect to each other through shared entities.
-- Hard rules respected: RLS on every table; AI links land review_status='review' (L0); links carry a
-- rationale + confidence as lightweight provenance.

-- The universal anchor: a polymorphic entity↔goal link.
--   entity_type 'contact'     -> public.contacts
--   entity_type 'opportunity' -> public.opportunities
--   entity_type 'item'        -> public.items     (tasks, events, follow-ups)
--   entity_type 'source'      -> public.sources   (emails, meetings, calendar events)
create table if not exists public.goal_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  goal_id       uuid not null references public.goals(id) on delete cascade,
  entity_type   text not null check (entity_type in ('contact','opportunity','item','source')),
  entity_id     uuid not null,
  rationale     text,                    -- why this entity serves this goal
  confidence    numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  review_status text not null default 'accepted'
                  check (review_status in ('review','accepted','dismissed')),  -- AI links insert 'review'
  created_by    text not null default 'user' check (created_by in ('user','jarvis')),
  created_at    timestamptz not null default now(),
  unique (goal_id, entity_type, entity_id)
);
create index if not exists goal_links_user_id_idx on public.goal_links(user_id);
create index if not exists goal_links_goal_id_idx on public.goal_links(goal_id);
create index if not exists goal_links_entity_idx  on public.goal_links(entity_type, entity_id);
create index if not exists goal_links_review_idx  on public.goal_links(review_status);

-- A connection between two goals (canonical order goal_a < goal_b to dedup). Derived from shared
-- entities and enriched with an AI "how to intersect" rationale.
create table if not exists public.goal_connections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  goal_a       uuid not null references public.goals(id) on delete cascade,
  goal_b       uuid not null references public.goals(id) on delete cascade,
  rationale    text,                     -- how the two goals connect / how to intersect them
  shared_count integer not null default 0,
  created_by   text not null default 'jarvis' check (created_by in ('user','jarvis')),
  created_at   timestamptz not null default now(),
  check (goal_a < goal_b),
  unique (goal_a, goal_b)
);
create index if not exists goal_connections_user_id_idx on public.goal_connections(user_id);

-- An intersection: one entity that serves 2+ goals, plus the AI "combined ask" so the user can use it
-- for all of them at once without over-asking. One record per entity (refreshed when its links change).
create table if not exists public.goal_intersections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact','opportunity','item','source')),
  entity_id   uuid not null,
  goal_ids    uuid[] not null,           -- the goals this entity serves (>= 2)
  suggestion  text,                       -- AI combined-ask / how to utilize for all the goals
  created_by  text not null default 'jarvis' check (created_by in ('user','jarvis')),
  created_at  timestamptz not null default now(),
  unique (entity_type, entity_id)
);
create index if not exists goal_intersections_user_id_idx on public.goal_intersections(user_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security: owner-only on all three (each has a direct user_id).
-- ---------------------------------------------------------------------------
alter table public.goal_links         enable row level security;
alter table public.goal_connections   enable row level security;
alter table public.goal_intersections enable row level security;

create policy goal_links_select_own on public.goal_links for select using (auth.uid() = user_id);
create policy goal_links_insert_own on public.goal_links for insert with check (auth.uid() = user_id);
create policy goal_links_update_own on public.goal_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy goal_links_delete_own on public.goal_links for delete using (auth.uid() = user_id);

create policy goal_connections_select_own on public.goal_connections for select using (auth.uid() = user_id);
create policy goal_connections_insert_own on public.goal_connections for insert with check (auth.uid() = user_id);
create policy goal_connections_update_own on public.goal_connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy goal_connections_delete_own on public.goal_connections for delete using (auth.uid() = user_id);

create policy goal_intersections_select_own on public.goal_intersections for select using (auth.uid() = user_id);
create policy goal_intersections_insert_own on public.goal_intersections for insert with check (auth.uid() = user_id);
create policy goal_intersections_update_own on public.goal_intersections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy goal_intersections_delete_own on public.goal_intersections for delete using (auth.uid() = user_id);
