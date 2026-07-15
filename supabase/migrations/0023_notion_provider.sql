-- 0023_notion_provider.sql — per-user Notion OAuth connections (hard rule #6: tokens server-side only).
-- Notion moves from a single deployment-wide NOTION_API_KEY to a per-user OAuth connection, so ANY
-- signed-in user can connect THEIR OWN Notion (each grant picks the pages Otto may read; read-only).
-- Reuses connected_accounts: for provider='notion', access_token holds the Notion OAuth token (Notion
-- tokens do not expire, so refresh_token/token_expires_at stay null), google_sub holds the Notion
-- bot_id, and email holds the workspace name (display only, per the column's existing comment).

alter table public.connected_accounts drop constraint if exists connected_accounts_provider_check;
alter table public.connected_accounts add constraint connected_accounts_provider_check
  check (provider in ('google','notion'));
