-- 0017_site_credentials.sql, encrypted per-user logins for sites GOTT can auto-sign-into.
-- The password is AES-256-GCM encrypted in the APP before insert (key: CREDENTIALS_SECRET, server-only);
-- the database only ever stores ciphertext, never a plaintext password. RLS scopes every row to its
-- owner, so on a multi-user deployment one person can never read another's logins, and the browser/anon
-- key never touches this table (hard rule #6: secrets server-side only).

create table if not exists public.site_credentials (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  site         text not null,               -- host key, e.g. 'linkedin.com', 'x.com', 'github.com'
  label        text,                        -- optional display label
  username     text,                        -- the login id / email (not the secret)
  secret_enc   text not null,               -- AES-256-GCM blob: base64(iv).base64(tag).base64(ciphertext)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, site)                     -- one login per site per user
);
create index if not exists site_credentials_user_id_idx on public.site_credentials(user_id);

alter table public.site_credentials enable row level security;
create policy site_credentials_select_own on public.site_credentials for select using (auth.uid() = user_id);
create policy site_credentials_insert_own on public.site_credentials for insert with check (auth.uid() = user_id);
create policy site_credentials_update_own on public.site_credentials for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy site_credentials_delete_own on public.site_credentials for delete using (auth.uid() = user_id);
