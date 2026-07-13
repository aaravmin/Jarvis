-- 0022_goal_hierarchy.sql — T4: sub-goals. A self-referencing parent_goal_id on public.goals so a
-- goal can nest one level of sub-goals under an overarching goal (the UI never nests deeper than
-- that). NOT applied automatically — run this in the Supabase SQL editor. Until then, lib/goals/load.ts
-- and POST /api/goals degrade gracefully (Postgres 42703, undefined column -> retry without it and
-- treat every goal as top-level), the same honest-degrade pattern the Notion connector uses for its
-- own not-yet-applied migration (0021_notion_sources.sql).

alter table public.goals add column if not exists parent_goal_id uuid references public.goals(id) on delete cascade;
create index if not exists goals_parent_goal_id_idx on public.goals(parent_goal_id);
