-- 0010_goal_links_rls_fix.sql — close a cross-tenant gap: goal_links insert/update must verify the
-- GOAL belongs to the user too (dual-parent, matching contact_goals in 0002). Previously the policy
-- only checked auth.uid() = user_id, letting a user reference another user's goal_id.
drop policy if exists goal_links_insert_own on public.goal_links;
drop policy if exists goal_links_update_own on public.goal_links;

create policy goal_links_insert_own on public.goal_links for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );
create policy goal_links_update_own on public.goal_links for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );
