-- 0020_email_batches.sql, named groups of outreach drafts. When Otto drafts a round of emails it can
-- save them as a named batch (which contacts it drafted to); when the user says they sent the batch, we
-- flip those contacts to "emailed". Per-user, RLS-scoped. Members are stored as a contact_ids array.

create table if not exists public.email_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  status      text not null default 'drafted' check (status in ('drafted', 'sent')),
  contact_ids uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists email_batches_user_idx on public.email_batches(user_id, created_at desc);

alter table public.email_batches enable row level security;
create policy email_batches_select_own on public.email_batches for select using (auth.uid() = user_id);
create policy email_batches_insert_own on public.email_batches for insert with check (auth.uid() = user_id);
create policy email_batches_update_own on public.email_batches for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy email_batches_delete_own on public.email_batches for delete using (auth.uid() = user_id);
