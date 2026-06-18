-- 0015: mark all-day calendar events.
--
-- Google returns all-day events as date-only strings (start.date "2026-06-18", end.date "2026-06-19"
-- exclusive) with NO time. Forcing those through new Date().toISOString() lands them at UTC midnight,
-- which a negative-offset zone (America/New_York) then renders as the PREVIOUS day at a fabricated
-- clock time ("Jun 17, 8:00 PM"). We now store all-day events anchored at local noon (skew-proof) and
-- flag them here so the UI/assistant render a plain DATE with no time (hard rule #7 — never tell the
-- user a wrong date). Existing rows default false and self-heal on the next calendar sync (ingest now
-- refreshes seen events).

alter table public.sources
  add column if not exists is_all_day boolean not null default false;
