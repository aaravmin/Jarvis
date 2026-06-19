-- 0016_application_outreach.sql — the Application & Outreach Agent's data layer.
--
-- This phase gives Jarvis a "brain" (Grok) + "hands/eyes" (Playwright) that can prepare job/grant
-- applications and outreach emails. The data tables here are its MEMORY:
--   • documents       — the user's resumes / grant materials (files in Supabase Storage + extracted
--                        text so the model can read them cheaply). What the agent fills forms FROM.
--   • contacts.current_work — what a person is actively working on, to tailor outreach (Axis B).
--   • application_runs — one autonomous application attempt at a URL, with the resolved field plan.
--   • outreach_runs    — one email-outreach drafting attempt for a contact (investor/peer/… branch).
--
-- Hard rules enforced here:
--   #2  Dates are NEVER computed by the model (no date columns the model fills; resolution stays in code).
--   #3  Every field the agent fills carries provenance: application_runs.field_plan stores, per field,
--       the source + verbatim source_quote + confidence. The agent only fills from grounded material.
--   #5  L0 suggest-only: the agent NEVER submits a form or sends an email. Applications land
--       status='needs_review' for the user to review and click Submit; emails are Gmail DRAFTS only.
--   #6  RLS owner-only on every table; Storage objects are scoped to the user's own folder.

-- ---------------------------------------------------------------------------
-- documents — the user's application materials (resumes, grant narratives, bios, writing samples).
-- The binary lives in the private 'documents' Storage bucket; we keep metadata + extracted_text here
-- so Grok can read the content without re-parsing the file on every run.
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,                       -- display name (usually the original filename)
  doc_type       text not null default 'resume'
                   check (doc_type in ('resume','grant_material','bio','writing_sample','other')),
  storage_path   text not null,                       -- path in the 'documents' bucket: {user_id}/{uuid}.ext
  mime_type      text,
  file_size      integer,
  extracted_text text,                                -- plain-text contents the model reads to fill forms
  is_default     boolean not null default false,      -- the primary doc of its type when none is specified
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists documents_user_id_idx  on public.documents(user_id);
create index if not exists documents_doc_type_idx on public.documents(user_id, doc_type);
-- At most one default per (user, doc_type) — e.g. one default resume.
create unique index if not exists documents_one_default_idx
  on public.documents(user_id, doc_type) where is_default;

-- ---------------------------------------------------------------------------
-- contacts.current_work — Axis B: what the person is actively working on right now (distinct from the
-- static role_title). Used to tailor outreach. Auto-enriched values record provenance in field_sources.
-- ---------------------------------------------------------------------------
alter table public.contacts
  add column if not exists current_work text,
  add column if not exists current_work_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- application_runs — one autonomous application attempt at a URL (mirrors opportunity_runs' lifecycle).
-- The agent researches the form, then fills only fields it can GROUND in the user's materials; the
-- result is a field_plan the user reviews before clicking Submit (submit-only-on-click, hard rule #5).
-- ---------------------------------------------------------------------------
create table if not exists public.application_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,  -- if launched from a card
  target_url     text not null,                       -- the application page the agent works on
  kind           text not null default 'job' check (kind in ('job','grant','other')),
  title          text,                                -- snapshot of the role/program (for display)
  organization   text,
  resume_id      uuid references public.documents(id) on delete set null,      -- which resume was used
  status         text not null default 'running'
                   check (status in ('running','needs_review','submitted','error')),
  -- The resolved form fields, each with provenance. Shape (validated in code):
  --   [{ "label","value","source":"resume|profile|document|opportunity|inferred|user",
  --      "source_quote","confidence":0..1,"required":bool,"filled":bool }]
  field_plan     jsonb not null default '[]'::jsonb,
  unfilled_count integer not null default 0,          -- required fields the agent could NOT ground (needs the user)
  summary        text,                                 -- human-readable account of what was prepared
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists application_runs_user_id_idx        on public.application_runs(user_id);
create index if not exists application_runs_status_idx         on public.application_runs(status);
create index if not exists application_runs_opportunity_id_idx on public.application_runs(opportunity_id);
-- At most one in-flight run per (user, target_url): blocks a racing duplicate, like opportunity_runs.
create unique index if not exists application_runs_one_inflight_idx
  on public.application_runs(user_id, target_url) where status = 'running';

-- ---------------------------------------------------------------------------
-- outreach_runs — one email-outreach drafting attempt for a contact. The audience branch shapes tone
-- (an investor cold email reads nothing like a peer's). Output is a Gmail DRAFT only (never sent).
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  contact_id     uuid references public.contacts(id) on delete set null,
  audience       text not null default 'peer'
                   check (audience in ('investor','recruiter','professor','peer','founder','other')),
  goal           text,                                 -- what the user wants from the outreach (the ask)
  template_id    uuid references public.email_templates(id) on delete set null,
  draft_subject  text,
  draft_body     text,
  gmail_draft_id text,                                 -- set once saved to Gmail (drafts only)
  status         text not null default 'running'
                   check (status in ('running','drafted','saved','error')),
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists outreach_runs_user_id_idx    on public.outreach_runs(user_id);
create index if not exists outreach_runs_contact_id_idx on public.outreach_runs(contact_id);
create index if not exists outreach_runs_status_idx     on public.outreach_runs(status);

-- ---------------------------------------------------------------------------
-- Row-Level Security: owner-only, one policy per command (mirrors every other table).
-- ---------------------------------------------------------------------------
alter table public.documents        enable row level security;
alter table public.application_runs enable row level security;
alter table public.outreach_runs    enable row level security;

create policy documents_select_own on public.documents for select using (auth.uid() = user_id);
create policy documents_insert_own on public.documents for insert with check (auth.uid() = user_id);
create policy documents_update_own on public.documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy documents_delete_own on public.documents for delete using (auth.uid() = user_id);

create policy application_runs_select_own on public.application_runs for select using (auth.uid() = user_id);
create policy application_runs_insert_own on public.application_runs for insert with check (auth.uid() = user_id);
create policy application_runs_update_own on public.application_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy application_runs_delete_own on public.application_runs for delete using (auth.uid() = user_id);

create policy outreach_runs_select_own on public.outreach_runs for select using (auth.uid() = user_id);
create policy outreach_runs_insert_own on public.outreach_runs for insert with check (auth.uid() = user_id);
create policy outreach_runs_update_own on public.outreach_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy outreach_runs_delete_own on public.outreach_runs for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Supabase Storage: a private 'documents' bucket. Objects are scoped so a user can only touch files
-- under their own {user_id}/ folder (the first path segment must equal their uid). Guarded so the
-- migration is safe to re-run (storage.objects is a shared table that already has RLS enabled).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_objects_select_own') then
    create policy documents_objects_select_own on storage.objects for select
      using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_objects_insert_own') then
    create policy documents_objects_insert_own on storage.objects for insert
      with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_objects_update_own') then
    create policy documents_objects_update_own on storage.objects for update
      using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_objects_delete_own') then
    create policy documents_objects_delete_own on storage.objects for delete
      using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
