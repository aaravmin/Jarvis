-- Outreach status for contacts: where you are in actually reaching out to this person. Distinct from
-- follow_up_status (to_reach_out/waiting/done) which predates this and is used by the research flow.
-- This is the user-facing toggle (manual) that our code can also auto-populate from ingested email.
-- The LLM never sets this directly; auto-population is deterministic (matches a contact's email
-- channel against ingested inbound email sources).
alter table public.contacts
  add column if not exists outreach_status text not null default 'not_emailed'
  check (outreach_status in ('not_emailed','emailed','spoke','follow_up'));

create index if not exists contacts_outreach_status_idx
  on public.contacts(outreach_status);
