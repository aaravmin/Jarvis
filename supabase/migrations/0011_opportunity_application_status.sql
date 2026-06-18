-- Application pipeline status for opportunities (separate from review_status, which gates the
-- Review queue). This tracks where the user is in actually pursuing the opportunity. The LLM never
-- sets this — it is user-driven (manual toggle) or set deterministically by our code.
alter table public.opportunities
  add column if not exists application_status text not null default 'not_applied'
  check (application_status in
    ('not_applied','waiting_to_open','applied','interviewing','accepted','rejected'));

create index if not exists opportunities_application_status_idx
  on public.opportunities(application_status);
