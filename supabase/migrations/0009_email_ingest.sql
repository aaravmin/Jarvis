-- 0009_email_ingest.sql — columns + dedup for Gmail/Calendar ingestion into `sources`.
-- Emails/events are stored as sources (provenance anchor). These columns let the Email tab group by
-- sender/org, and the unique index makes re-syncing idempotent (no duplicate rows per external id).
alter table public.sources add column if not exists from_name    text;
alter table public.sources add column if not exists from_email   text;
alter table public.sources add column if not exists group_label  text;  -- "Brown University", a person, …

create index if not exists sources_group_idx on public.sources(user_id, group_label);

-- One row per (user, type, external id) so a re-sync upserts instead of duplicating.
create unique index if not exists sources_external_uniq
  on public.sources(user_id, source_type, external_id) where external_id is not null;
