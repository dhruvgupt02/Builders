-- 002: any logged-in user can read the rights of briefs they can read.
-- briefs are readable by every authenticated user, so brief_rights follows the same rule.
-- (The brand-owner select policy from schema.sql stays; policies are OR-ed together.)

drop policy if exists "brief_rights_select_authenticated" on public.brief_rights;
create policy "brief_rights_select_authenticated" on public.brief_rights
  for select to authenticated
  using (exists (select 1 from public.briefs br where br.id = brief_id));
