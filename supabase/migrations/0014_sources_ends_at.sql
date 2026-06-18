-- 0014: structured calendar end time.
--
-- Calendar events stored their end time as an unstructured "until <ISO>" string buried in
-- sources.raw_text, so the UI and the assistant only ever saw the START (occurred_at). Worse, the
-- assistant read the raw UTC end ISO and reported its literal UTC hour — fabricating end times
-- (e.g. a 8–9 PM local event surfaced as "8 PM to 1 AM"). Store the end as a real timestamptz so
-- our code can format start+end with the SAME deterministic formatter (hard rule #2 / #7: the LLM
-- never computes or interprets dates — it is handed an already-formatted range).

alter table public.sources
  add column if not exists ends_at timestamptz;

-- Backfill existing calendar rows from the legacy "until <ISO> · <location>" raw_text prefix so the
-- end time appears immediately, without waiting for a re-sync (ingest dedupes by external_id and
-- would never re-insert these). The first whitespace-delimited token after "until " is the ISO.
update public.sources
set ends_at = nullif(substring(raw_text from '^until (\S+)'), '')::timestamptz
where source_type = 'calendar'
  and ends_at is null
  and raw_text like 'until %';
