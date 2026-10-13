-- 005: richer briefs — deliverables, creative and commercial-use detail, draft/open/closed status.
-- Re-runnable: every statement is "if not exists" / "drop ... if exists" / "create or replace".

-- ───────────────────────── briefs ─────────────────────────

alter table public.briefs
  add column if not exists brand_name text,
  add column if not exists product text,
  add column if not exists target_audience text,
  add column if not exists key_message text,
  add column if not exists mandatory_elements text,          -- e.g. logo, tagline
  add column if not exists avoid text,
  add column if not exists style_references text[] not null default '{}', -- URLs
  add column if not exists excluded_tools text[] not null default '{}',
  add column if not exists resolution text,
  add column if not exists completeness int not null default 0,           -- 0..100, computed by the app
  add column if not exists updated_at timestamptz not null default now();

-- Status: draft (only the owner sees it), open (on the board), closed.
update public.briefs set status = 'open' where status is null or status not in ('draft', 'open', 'closed');
alter table public.briefs alter column status set default 'draft';
alter table public.briefs alter column status set not null;
alter table public.briefs drop constraint if exists briefs_status_check;
alter table public.briefs add constraint briefs_status_check check (status in ('draft', 'open', 'closed'));
alter table public.briefs drop constraint if exists briefs_completeness_check;
alter table public.briefs add constraint briefs_completeness_check check (completeness between 0 and 100);

-- The brand's name is shown on the brief itself; the brands table stays private to its owner.
update public.briefs b set brand_name = br.company_name
from public.brands br
where br.id = b.brand_id and b.brand_name is null;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists briefs_touch_updated_at on public.briefs;
create trigger briefs_touch_updated_at before update on public.briefs
  for each row execute function public.touch_updated_at();

create index if not exists briefs_status_idx on public.briefs (status);

-- ───────────────────────── brief_rights ─────────────────────────

alter table public.brief_rights
  add column if not exists ip_ownership text,
  add column if not exists ai_disclosure_required boolean not null default false,
  add column if not exists real_people_likeness text,
  add column if not exists music_source text,
  add column if not exists notes text;

alter table public.brief_rights drop constraint if exists brief_rights_ip_ownership_check;
alter table public.brief_rights add constraint brief_rights_ip_ownership_check
  check (ip_ownership is null or ip_ownership in ('brand_owns', 'licensed_to_brand', 'creator_retains'));
alter table public.brief_rights drop constraint if exists brief_rights_real_people_likeness_check;
alter table public.brief_rights add constraint brief_rights_real_people_likeness_check
  check (real_people_likeness is null or real_people_likeness in ('none', 'licensed_talent', 'creator_self'));
alter table public.brief_rights drop constraint if exists brief_rights_music_source_check;
alter table public.brief_rights add constraint brief_rights_music_source_check
  check (music_source is null or music_source in ('licensed_library', 'ai_generated', 'brand_supplied', 'none'));

-- ───────────────────────── brief_deliverables ─────────────────────────

create table if not exists public.brief_deliverables (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs on delete cascade,
  position int not null default 1,
  content_type text,
  aspect_ratio text,
  duration_sec int,
  quantity int not null default 1 check (quantity between 1 and 100),
  notes text
);
create index if not exists brief_deliverables_brief_idx on public.brief_deliverables (brief_id, position);

-- ───────────────────────── Row Level Security ─────────────────────────
-- Same shape as before: the owning brand writes; logged-in users read. New: drafts are private to their owner.
-- brief_rights and brief_deliverables are readable whenever their brief is, because their read policies
-- look the brief up through this policy.

drop policy if exists "briefs_select_authenticated" on public.briefs;
drop policy if exists "briefs_select_visible" on public.briefs;
create policy "briefs_select_visible" on public.briefs for select to authenticated
  using (
    status <> 'draft'
    or exists (select 1 from public.brands b where b.id = brand_id and b.profile_id = auth.uid())
  );

drop policy if exists "briefs_delete_own" on public.briefs;
create policy "briefs_delete_own" on public.briefs for delete
  using (exists (select 1 from public.brands b where b.id = brand_id and b.profile_id = auth.uid()));

alter table public.brief_deliverables enable row level security;

drop policy if exists "brief_deliverables_select_visible" on public.brief_deliverables;
create policy "brief_deliverables_select_visible" on public.brief_deliverables for select to authenticated
  using (exists (select 1 from public.briefs br where br.id = brief_id));

drop policy if exists "brief_deliverables_insert_own" on public.brief_deliverables;
create policy "brief_deliverables_insert_own" on public.brief_deliverables for insert
  with check (exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
                      where br.id = brief_id and b.profile_id = auth.uid()));

drop policy if exists "brief_deliverables_update_own" on public.brief_deliverables;
create policy "brief_deliverables_update_own" on public.brief_deliverables for update
  using (exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
                 where br.id = brief_id and b.profile_id = auth.uid()))
  with check (exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
                      where br.id = brief_id and b.profile_id = auth.uid()));

drop policy if exists "brief_deliverables_delete_own" on public.brief_deliverables;
create policy "brief_deliverables_delete_own" on public.brief_deliverables for delete
  using (exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
                 where br.id = brief_id and b.profile_id = auth.uid()));

grant select, insert, update, delete on public.brief_deliverables to authenticated;
grant select on public.brief_deliverables to anon; -- RLS still returns nothing to logged-out visitors

notify pgrst, 'reload schema';
