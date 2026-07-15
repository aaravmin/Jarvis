-- 0018_style_examples.sql, the learn-from-edits store. When the user edits something Otto generated
-- (an outreach email, an application field, a task) and keeps the edit, we record the before/after pair
-- here. Future generations of the same kind read recent pairs back so Otto matches the user's revealed
-- voice and preferences. Append-only learning data, per-user, RLS-scoped.

create table if not exists public.style_examples (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,              -- e.g. 'outreach_email'
  context     text,                       -- short note on what this was (who/what)
  ai_text     text not null,              -- what Otto produced
  final_text  text not null,              -- what the user kept after editing
  created_at  timestamptz not null default now()
);
create index if not exists style_examples_user_kind_idx on public.style_examples(user_id, kind, created_at desc);

alter table public.style_examples enable row level security;
create policy style_examples_select_own on public.style_examples for select using (auth.uid() = user_id);
create policy style_examples_insert_own on public.style_examples for insert with check (auth.uid() = user_id);
create policy style_examples_delete_own on public.style_examples for delete using (auth.uid() = user_id);
