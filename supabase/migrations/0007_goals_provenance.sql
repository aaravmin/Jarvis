-- 0007_goals_provenance.sql — L0 + provenance for AI-generated goals, and back-fill existing
-- contact↔goal links into the universal goal_links anchor so current data shows up immediately.

-- AI-generated goals (from freeform context) must be suggest-only (L0) and carry provenance.
alter table public.goals add column if not exists created_by text not null default 'user'
  check (created_by in ('user','jarvis'));
alter table public.goals add column if not exists review_status text not null default 'accepted'
  check (review_status in ('review','accepted','dismissed'));   -- AI goals insert 'review'
alter table public.goals add column if not exists source_id uuid references public.sources(id) on delete set null;
alter table public.goals add column if not exists source_quote text;
alter table public.goals add column if not exists confidence numeric
  check (confidence is null or (confidence >= 0 and confidence <= 1));
create index if not exists goals_review_status_idx on public.goals(review_status);

-- Back-fill: every existing contact↔goal link becomes a goal_links row (the universal anchor), as a
-- user-accepted link (provenance-exempt). Idempotent.
insert into public.goal_links (user_id, goal_id, entity_type, entity_id, rationale, confidence, review_status, created_by)
select g.user_id, cg.goal_id, 'contact', cg.contact_id, cg.rationale, cg.confidence, 'accepted', 'user'
from public.contact_goals cg
join public.goals g on g.id = cg.goal_id
on conflict (goal_id, entity_type, entity_id) do nothing;
