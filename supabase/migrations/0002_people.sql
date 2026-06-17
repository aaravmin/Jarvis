-- 0002_people.sql — Phase 6 People/Outreach schema, pulled forward to support the auto-populate
-- (cohort research) feature. Tables exactly as documented in /docs/DATA_MODEL.md section
-- "People / outreach tables". Provenance/review columns specific to auto-populate are added in
-- 0003_research.sql so this migration stays faithful to the documented Phase-6 contract.

-- Your goals (the table behind the Goals tab).
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists goals_user_id_idx on public.goals(user_id);

-- People you track and follow up with.
create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  full_name        text not null,            -- the only required field
  company          text,
  role_title       text,
  background        text,                    -- factual bio; AI-enriched from the web
  relevance        text,                     -- WHY they matter to your goals
  the_ask          text,                     -- WHAT you need from them
  notes            text,                     -- AI writes caveats here when unsure
  follow_up_status text not null default 'to_reach_out'
                     check (follow_up_status in ('to_reach_out','waiting','done')),
  next_follow_up_at timestamptz,             -- resolved deterministically, never by the LLM
  field_sources    jsonb,                    -- per-field provenance: {"email":{"url":"…","confidence":0.6}}
  source_id        uuid references public.sources(id) on delete set null,
  created_by       text not null default 'user' check (created_by in ('user','jarvis')),
  created_at       timestamptz not null default now()
);
create index if not exists contacts_user_id_idx on public.contacts(user_id);

-- Flexible contact methods.
create table if not exists public.contact_channels (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind       text not null check (kind in ('email','linkedin','phone','x','website','other')),
  value      text not null,
  is_primary boolean not null default false
);
create index if not exists contact_channels_contact_id_idx on public.contact_channels(contact_id);

-- How you know them — the context Claude weaves into outreach.
create table if not exists public.connections (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  relationship_note text,
  introduced_by     uuid references public.contacts(id) on delete set null
);
create index if not exists connections_contact_id_idx on public.connections(contact_id);

-- Reusable email templates with placeholders.
create table if not exists public.email_templates (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name    text not null,
  subject text,
  body    text not null
);
create index if not exists email_templates_user_id_idx on public.email_templates(user_id);

-- Which goal(s) a contact advances, and why (AI-proposed, you approve).
create table if not exists public.contact_goals (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  goal_id    uuid not null references public.goals(id) on delete cascade,
  rationale  text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1))
);
create index if not exists contact_goals_contact_id_idx on public.contact_goals(contact_id);
create index if not exists contact_goals_goal_id_idx on public.contact_goals(goal_id);

-- Now that contacts exists, let items attach to a person (per DATA_MODEL migration order).
alter table public.items add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists items_contact_id_idx on public.items(contact_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.goals            enable row level security;
alter table public.contacts         enable row level security;
alter table public.contact_channels enable row level security;
alter table public.connections      enable row level security;
alter table public.email_templates  enable row level security;
alter table public.contact_goals    enable row level security;

-- Tables with a direct user_id: owner-only.
create policy goals_select_own on public.goals for select using (auth.uid() = user_id);
create policy goals_insert_own on public.goals for insert with check (auth.uid() = user_id);
create policy goals_update_own on public.goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy goals_delete_own on public.goals for delete using (auth.uid() = user_id);

create policy contacts_select_own on public.contacts for select using (auth.uid() = user_id);
create policy contacts_insert_own on public.contacts for insert with check (auth.uid() = user_id);
create policy contacts_update_own on public.contacts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy contacts_delete_own on public.contacts for delete using (auth.uid() = user_id);

create policy email_templates_select_own on public.email_templates for select using (auth.uid() = user_id);
create policy email_templates_insert_own on public.email_templates for insert with check (auth.uid() = user_id);
create policy email_templates_update_own on public.email_templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy email_templates_delete_own on public.email_templates for delete using (auth.uid() = user_id);

-- Child tables: scope via the parent contact's owner. The owner() helper inlines as a subquery.
create policy contact_channels_select_own on public.contact_channels for select
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()));
create policy contact_channels_insert_own on public.contact_channels for insert
  with check (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()));
create policy contact_channels_update_own on public.contact_channels for update
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()));
create policy contact_channels_delete_own on public.contact_channels for delete
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()));

-- connections also has two contact refs: contact_id AND the optional introduced_by. Both must be
-- the user's own contacts so a connection can't point into another tenant's contacts.
create policy connections_select_own on public.connections for select
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()));
create policy connections_insert_own on public.connections for insert
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
    and (introduced_by is null
         or exists (select 1 from public.contacts c2 where c2.id = introduced_by and c2.user_id = auth.uid()))
  );
create policy connections_update_own on public.connections for update
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()))
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
    and (introduced_by is null
         or exists (select 1 from public.contacts c2 where c2.id = introduced_by and c2.user_id = auth.uid()))
  );
create policy connections_delete_own on public.connections for delete
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()));

-- contact_goals has TWO parents: both the contact AND the goal must belong to the user, so a user
-- can't link their contact to someone else's goal_id. Insert/update verify both.
create policy contact_goals_select_own on public.contact_goals for select
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()));
create policy contact_goals_insert_own on public.contact_goals for insert
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );
create policy contact_goals_update_own on public.contact_goals for update
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()))
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );
create policy contact_goals_delete_own on public.contact_goals for delete
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid()));
