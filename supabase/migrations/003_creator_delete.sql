-- 003: creators can delete their own portfolio items, workflow steps and pending verification requests.
-- schema.sql only granted insert/update, so "Delete" in the creator dashboard and removing workflow
-- steps in the portfolio editor need these policies.

drop policy if exists "portfolio_delete_own" on public.portfolio_items;
create policy "portfolio_delete_own" on public.portfolio_items for delete
  using (exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid()));

drop policy if exists "steps_delete_own" on public.workflow_steps;
create policy "steps_delete_own" on public.workflow_steps for delete
  using (exists (select 1 from public.portfolio_items p join public.creators c on c.id = p.creator_id
                 where p.id = portfolio_item_id and c.profile_id = auth.uid()));

-- Only requests that are still pending can be withdrawn; verified/rejected records stay.
drop policy if exists "verifications_delete_own_pending" on public.verifications;
create policy "verifications_delete_own_pending" on public.verifications for delete
  using (status = 'pending'
         and exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid()));
