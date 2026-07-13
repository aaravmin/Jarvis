-- 0021_notion_sources.sql — T3: let Notion pages be stored as sources for the read-only Notion
-- connector. Notion is read-only (hard rule #1: Supabase is the system of record, Notion is never
-- written to). NOT applied automatically — run this in the Supabase SQL editor.

alter table public.sources drop constraint if exists sources_source_type_check;
alter table public.sources add constraint sources_source_type_check
  check (source_type in ('email','meeting','calendar','manual','research','sheet','drive','notion'));
