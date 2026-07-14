-- 0024_thread_state.sql — thread reply-state on `sources` for the Today "Needs reply / Waiting on them" feed.
-- Deterministic reply tracking (hard rule #7): our code reads the real Gmail thread and records who sent
-- the newest message and when. The LLM never decides "did I reply?" — this is computed from thread data.
-- The app runs fully WITHOUT these columns (graceful 42703 degrade in lib/google/ingest.ts and
-- lib/priority/load.ts); applying this migration turns reply-state on.
alter table public.sources add column if not exists thread_id     text;
alter table public.sources add column if not exists last_msg_from text check (last_msg_from in ('me','them'));
alter table public.sources add column if not exists last_msg_at   timestamptz;

-- Look up a user's sources by thread when refreshing thread state and when building reply feed entries.
create index if not exists sources_thread_idx on public.sources(user_id, thread_id);
