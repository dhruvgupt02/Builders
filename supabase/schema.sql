-- BRIVIO database schema. Run once in the Supabase SQL editor.
-- Safe to re-run on an empty project; tables use "if not exists" and policies are dropped first.

create extension if not exists vector;

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'brand' check (role in ('creator', 'brand')),
  name text,
  email text,
  city text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles on delete set null, -- null for seed creators
  name text not null,
  headline text,
  bio text,
  city text,
  avatar_url text,
  specializations text[] not null default '{}',
  skills text[] not null default '{}',
  tools text[] not null default '{}',
  languages text[] not null default '{}',
  price_min int, -- INR
  price_max int, -- INR
  availability text,
  is_sample boolean not null default true,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators on delete cascade,
  title text not null,
  description text,
  media_type text not null default 'image' check (media_type in ('video', 'image')),
  media_url text,
  thumbnail_url text,
  content_type text,
  aspect_ratio text,
  duration_sec int,
  resolution text,
  style_tags text[] not null default '{}',
  tools text[] not null default '{}',
  client_name text,
  commercial_use_status text check (commercial_use_status in ('personal', 'licensed', 'client_delivered')),
  embedding vector(768),
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  portfolio_item_id uuid not null references public.portfolio_items on delete cascade,
  step_order int not null,
  tool text,
  action text,
  note text,
  step_media_url text
);

create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators on delete cascade,
  portfolio_item_id uuid references public.portfolio_items on delete set null,
  type text not null check (type in ('tool', 'workflow', 'past_work')),
  label text,
  evidence_url text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_by text check (verified_by in ('ai', 'manual')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles on delete cascade,
  company_name text not null,
  category text,
  website text,
  created_at timestamptz not null default now()
);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands on delete cascade,
  title text not null,
  goal text,
  raw_idea text,
  content_type text,
  style_tags text[] not null default '{}',
  mood text,
  reference_links text[] not null default '{}',
  aspect_ratios text[] not null default '{}',
  duration_sec int,
  deliverables_count int,
  budget_min int,
  budget_max int,
  deadline date,
  revision_rounds int,
  required_tools text[] not null default '{}',
  status text not null default 'open',
  embedding vector(768),
  created_at timestamptz not null default now()
);

create table if not exists public.brief_rights (
  brief_id uuid primary key references public.briefs on delete cascade,
  usage_platforms text[] not null default '{}',
  territory text,
  rights_duration text,
  exclusivity boolean not null default false,
  ai_likeness_allowed boolean not null default false,
  ai_voice_allowed boolean not null default false,
  requires_tool_commercial_licence boolean not null default true,
  credit_required boolean not null default false
);

create table if not exists public.shortlists (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs on delete cascade,
  creator_id uuid not null references public.creators on delete cascade,
  match_score int,
  breakdown jsonb,
  reason text,
  status text not null default 'shortlisted',
  created_at timestamptz not null default now(),
  unique (brief_id, creator_id)
);

-- ───────────────────────── Indexes ─────────────────────────

create index if not exists creators_tools_gin on public.creators using gin (tools);
create index if not exists creators_skills_gin on public.creators using gin (skills);
create index if not exists creators_specializations_gin on public.creators using gin (specializations);
create index if not exists portfolio_items_tools_gin on public.portfolio_items using gin (tools);
create index if not exists portfolio_items_style_tags_gin on public.portfolio_items using gin (style_tags);
create index if not exists portfolio_items_creator_idx on public.portfolio_items (creator_id);
create index if not exists workflow_steps_item_idx on public.workflow_steps (portfolio_item_id);
create index if not exists verifications_creator_idx on public.verifications (creator_id);
create index if not exists briefs_brand_idx on public.briefs (brand_id);
create index if not exists creators_profile_idx on public.creators (profile_id);
create index if not exists brands_profile_idx on public.brands (profile_id);

-- ───────────────────────── Row Level Security ─────────────────────────

alter table public.profiles enable row level security;
alter table public.creators enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.verifications enable row level security;
alter table public.brands enable row level security;
alter table public.briefs enable row level security;
alter table public.brief_rights enable row level security;
alter table public.shortlists enable row level security;

-- profiles: own row only
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- creators: public read, owner write
drop policy if exists "creators_select_all" on public.creators;
create policy "creators_select_all" on public.creators for select using (true);
drop policy if exists "creators_insert_own" on public.creators;
create policy "creators_insert_own" on public.creators for insert with check (profile_id = auth.uid());
drop policy if exists "creators_update_own" on public.creators;
create policy "creators_update_own" on public.creators for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- portfolio_items: public read, owning creator write
drop policy if exists "portfolio_select_all" on public.portfolio_items;
create policy "portfolio_select_all" on public.portfolio_items for select using (true);
drop policy if exists "portfolio_insert_own" on public.portfolio_items;
create policy "portfolio_insert_own" on public.portfolio_items for insert with check (
  exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid())
);
drop policy if exists "portfolio_update_own" on public.portfolio_items;
create policy "portfolio_update_own" on public.portfolio_items for update
  using (exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid()))
  with check (exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid()));

-- workflow_steps: public read, owning creator write (via portfolio item)
drop policy if exists "steps_select_all" on public.workflow_steps;
create policy "steps_select_all" on public.workflow_steps for select using (true);
drop policy if exists "steps_insert_own" on public.workflow_steps;
create policy "steps_insert_own" on public.workflow_steps for insert with check (
  exists (select 1 from public.portfolio_items p join public.creators c on c.id = p.creator_id
          where p.id = portfolio_item_id and c.profile_id = auth.uid())
);
drop policy if exists "steps_update_own" on public.workflow_steps;
create policy "steps_update_own" on public.workflow_steps for update
  using (exists (select 1 from public.portfolio_items p join public.creators c on c.id = p.creator_id
                 where p.id = portfolio_item_id and c.profile_id = auth.uid()))
  with check (exists (select 1 from public.portfolio_items p join public.creators c on c.id = p.creator_id
                      where p.id = portfolio_item_id and c.profile_id = auth.uid()));

-- verifications: public read, owning creator may submit requests.
-- Creators can only write status 'pending'; verifying is done server-side with the service role.
drop policy if exists "verifications_select_all" on public.verifications;
create policy "verifications_select_all" on public.verifications for select using (true);
drop policy if exists "verifications_insert_own" on public.verifications;
create policy "verifications_insert_own" on public.verifications for insert with check (
  status = 'pending'
  and exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid())
);
drop policy if exists "verifications_update_own" on public.verifications;
create policy "verifications_update_own" on public.verifications for update
  using (exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid()))
  with check (
    status = 'pending'
    and exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid())
  );

-- brands: owner only
drop policy if exists "brands_select_own" on public.brands;
create policy "brands_select_own" on public.brands for select using (profile_id = auth.uid());
drop policy if exists "brands_insert_own" on public.brands;
create policy "brands_insert_own" on public.brands for insert with check (profile_id = auth.uid());
drop policy if exists "brands_update_own" on public.brands;
create policy "brands_update_own" on public.brands for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- briefs: any logged-in user can read; owning brand writes
drop policy if exists "briefs_select_authenticated" on public.briefs;
create policy "briefs_select_authenticated" on public.briefs for select to authenticated using (true);
drop policy if exists "briefs_insert_own" on public.briefs;
create policy "briefs_insert_own" on public.briefs for insert with check (
  exists (select 1 from public.brands b where b.id = brand_id and b.profile_id = auth.uid())
);
drop policy if exists "briefs_update_own" on public.briefs;
create policy "briefs_update_own" on public.briefs for update
  using (exists (select 1 from public.brands b where b.id = brand_id and b.profile_id = auth.uid()))
  with check (exists (select 1 from public.brands b where b.id = brand_id and b.profile_id = auth.uid()));

-- brief_rights: owning brand only
drop policy if exists "brief_rights_select_own" on public.brief_rights;
create policy "brief_rights_select_own" on public.brief_rights for select using (
  exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
          where br.id = brief_id and b.profile_id = auth.uid())
);
drop policy if exists "brief_rights_insert_own" on public.brief_rights;
create policy "brief_rights_insert_own" on public.brief_rights for insert with check (
  exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
          where br.id = brief_id and b.profile_id = auth.uid())
);
drop policy if exists "brief_rights_update_own" on public.brief_rights;
create policy "brief_rights_update_own" on public.brief_rights for update
  using (exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
                 where br.id = brief_id and b.profile_id = auth.uid()))
  with check (exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
                      where br.id = brief_id and b.profile_id = auth.uid()));

-- shortlists: owning brand only
drop policy if exists "shortlists_select_own" on public.shortlists;
create policy "shortlists_select_own" on public.shortlists for select using (
  exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
          where br.id = brief_id and b.profile_id = auth.uid())
);
drop policy if exists "shortlists_insert_own" on public.shortlists;
create policy "shortlists_insert_own" on public.shortlists for insert with check (
  exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
          where br.id = brief_id and b.profile_id = auth.uid())
);
drop policy if exists "shortlists_update_own" on public.shortlists;
create policy "shortlists_update_own" on public.shortlists for update
  using (exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
                 where br.id = brief_id and b.profile_id = auth.uid()))
  with check (exists (select 1 from public.briefs br join public.brands b on b.id = br.brand_id
                      where br.id = brief_id and b.profile_id = auth.uid()));

-- ───────────────────────── New-user trigger ─────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, role, name, email)
  values (
    new.id,
    case when meta_role in ('creator', 'brand') then meta_role else 'brand' end,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
