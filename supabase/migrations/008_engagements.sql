-- 008: engagements — the path from shortlisting a creator to approving their delivery.
-- Re-runnable.
--
-- Status flow (who may move it):
--   shortlisted --brand--> invited --creator--> accepted --creator--> in_progress --creator--> delivered
--   invited --creator--> declined
--   delivered --brand--> approved | revision_requested --creator--> delivered ...
--   anything not finished --brand--> cancelled

create table if not exists public.engagements (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs on delete cascade,
  creator_id uuid not null references public.creators on delete cascade,
  status text not null default 'shortlisted' check (status in
    ('shortlisted', 'invited', 'accepted', 'declined', 'in_progress', 'delivered', 'revision_requested', 'approved', 'cancelled')),
  agreed_price int check (agreed_price is null or agreed_price >= 0),
  match_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, creator_id)
);
create index if not exists engagements_creator_idx on public.engagements (creator_id);

create table if not exists public.engagement_messages (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements on delete cascade,
  sender_id uuid references public.profiles on delete set null,
  sender_role text not null check (sender_role in ('brand', 'creator', 'system')),
  kind text not null default 'message' check (kind in ('message', 'status', 'invite', 'revision')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists engagement_messages_engagement_idx on public.engagement_messages (engagement_id, created_at);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements on delete cascade,
  deliverable_id uuid references public.brief_deliverables on delete set null,
  version int not null check (version >= 1),
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  notes text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'revision_requested')),
  review_comment text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (engagement_id, deliverable_id, version)
);
create index if not exists submissions_engagement_idx on public.submissions (engagement_id);

drop trigger if exists engagements_touch_updated_at on public.engagements;
create trigger engagements_touch_updated_at before update on public.engagements
  for each row execute function public.touch_updated_at();

-- ───────────────────────── Who is who ─────────────────────────
-- Security-definer helpers, so policies on one table can ask about another without the two tables' policies
-- calling each other in a loop.

create or replace function public.is_brief_owner(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.briefs br join public.brands bn on bn.id = br.brand_id
                 where br.id = b and bn.profile_id = auth.uid())
$$;

create or replace function public.is_creator_self(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.creators cr where cr.id = c and cr.profile_id = auth.uid())
$$;

-- 'brand' | 'creator' | null for the signed-in user on one engagement
create or replace function public.engagement_role(e uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.is_brief_owner(en.brief_id) then 'brand'
              when public.is_creator_self(en.creator_id) then 'creator' end
  from public.engagements en where en.id = e
$$;

-- Is the signed-in user a creator who has been invited to (or is working on) this brief?
create or replace function public.is_engaged_creator_on_brief(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.engagements en join public.creators cr on cr.id = en.creator_id
                 where en.brief_id = b and cr.profile_id = auth.uid() and en.status <> 'shortlisted')
$$;

-- ───────────────────────── Row Level Security ─────────────────────────
-- Only the brand that owns the brief and the creator concerned can see or change an engagement, its messages
-- and its submissions. A creator does not see an engagement while it is only a private shortlist entry.

alter table public.engagements enable row level security;
alter table public.engagement_messages enable row level security;
alter table public.submissions enable row level security;

drop policy if exists "engagements_select_parties" on public.engagements;
create policy "engagements_select_parties" on public.engagements for select to authenticated
  using (public.is_brief_owner(brief_id) or (status <> 'shortlisted' and public.is_creator_self(creator_id)));

drop policy if exists "engagements_insert_brand" on public.engagements;
create policy "engagements_insert_brand" on public.engagements for insert to authenticated
  with check (public.is_brief_owner(brief_id) and status in ('shortlisted', 'invited'));

drop policy if exists "engagements_update_parties" on public.engagements;
create policy "engagements_update_parties" on public.engagements for update to authenticated
  using (public.is_brief_owner(brief_id) or (status <> 'shortlisted' and public.is_creator_self(creator_id)))
  with check (public.is_brief_owner(brief_id) or public.is_creator_self(creator_id));

drop policy if exists "engagements_delete_brand" on public.engagements;
create policy "engagements_delete_brand" on public.engagements for delete to authenticated
  using (public.is_brief_owner(brief_id) and status in ('shortlisted', 'invited', 'declined', 'cancelled'));

drop policy if exists "engagement_messages_select_parties" on public.engagement_messages;
create policy "engagement_messages_select_parties" on public.engagement_messages for select to authenticated
  using (public.engagement_role(engagement_id) is not null);

drop policy if exists "engagement_messages_insert_parties" on public.engagement_messages;
create policy "engagement_messages_insert_parties" on public.engagement_messages for insert to authenticated
  with check (sender_id = auth.uid() and sender_role = public.engagement_role(engagement_id));

drop policy if exists "submissions_select_parties" on public.submissions;
create policy "submissions_select_parties" on public.submissions for select to authenticated
  using (public.engagement_role(engagement_id) is not null);

-- The creator uploads versions; the brand reviews them.
drop policy if exists "submissions_insert_creator" on public.submissions;
create policy "submissions_insert_creator" on public.submissions for insert to authenticated
  with check (public.engagement_role(engagement_id) = 'creator' and status = 'submitted' and review_comment is null);

drop policy if exists "submissions_update_brand" on public.submissions;
create policy "submissions_update_brand" on public.submissions for update to authenticated
  using (public.engagement_role(engagement_id) = 'brand')
  with check (public.engagement_role(engagement_id) = 'brand');

grant select, insert, update, delete on public.engagements to authenticated;
grant select, insert on public.engagement_messages to authenticated;
grant select, insert, update on public.submissions to authenticated;

-- ───────────────────────── Rules the policies cannot express ─────────────────────────

-- Each side may only make its own moves, and only the status and agreed price may change.
create or replace function public.engagement_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor text;
begin
  if auth.uid() is null then return new; end if; -- server-side (service role): trusted
  if new.brief_id <> old.brief_id or new.creator_id <> old.creator_id then
    raise exception 'An engagement cannot be moved to another brief or creator';
  end if;
  actor := case when public.is_brief_owner(old.brief_id) then 'brand' when public.is_creator_self(old.creator_id) then 'creator' end;
  if actor is null then raise exception 'Not a party to this engagement'; end if;

  if new.status is distinct from old.status then
    if not (
      (actor = 'brand' and (
           (old.status = 'shortlisted' and new.status = 'invited')
        or (old.status = 'delivered' and new.status in ('approved', 'revision_requested'))
        or (old.status not in ('approved', 'cancelled', 'declined') and new.status = 'cancelled')))
      or
      (actor = 'creator' and (
           (old.status = 'invited' and new.status in ('accepted', 'declined'))
        or (old.status = 'accepted' and new.status in ('in_progress', 'delivered'))
        or (old.status in ('in_progress', 'revision_requested') and new.status = 'delivered')))
    ) then
      raise exception 'A % cannot move an engagement from % to %', actor, old.status, new.status;
    end if;
  end if;
  if new.agreed_price is distinct from old.agreed_price and actor <> 'brand' then
    raise exception 'Only the brand sets the agreed price';
  end if;
  return new;
end $$;

drop trigger if exists engagements_guard on public.engagements;
create trigger engagements_guard before update on public.engagements
  for each row execute function public.engagement_guard();

-- Versions are numbered by the database (v1, v2, ...) per deliverable, and can only be added while work is under way.
create or replace function public.submission_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  state text;
begin
  select status into state from public.engagements where id = new.engagement_id;
  if auth.uid() is not null and state not in ('accepted', 'in_progress', 'revision_requested', 'delivered') then
    raise exception 'Work can only be submitted on an accepted engagement (this one is %)', state;
  end if;
  if new.deliverable_id is not null and not exists (
       select 1 from public.brief_deliverables bd join public.engagements en on en.brief_id = bd.brief_id
       where bd.id = new.deliverable_id and en.id = new.engagement_id) then
    raise exception 'That deliverable does not belong to this brief';
  end if;
  new.version := coalesce((select max(s.version) from public.submissions s
                           where s.engagement_id = new.engagement_id and s.deliverable_id is not distinct from new.deliverable_id), 0) + 1;
  return new;
end $$;

drop trigger if exists submissions_guard on public.submissions;
create trigger submissions_guard before insert on public.submissions
  for each row execute function public.submission_guard();

-- The brand may only change the review fields of a submission.
create or replace function public.submission_review_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (new.engagement_id <> old.engagement_id or new.deliverable_id is distinct from old.deliverable_id
      or new.version <> old.version or new.media_url <> old.media_url or new.notes is distinct from old.notes) then
    raise exception 'Only the review status and comment of a submission can be changed';
  end if;
  return new;
end $$;

drop trigger if exists submissions_review_guard on public.submissions;
create trigger submissions_review_guard before update on public.submissions
  for each row execute function public.submission_review_guard();

-- ───────────────────────── Invited creators can read the brief ─────────────────────────
-- A brand may invite creators to a brief that is still a draft or already closed.

drop policy if exists "briefs_select_visible" on public.briefs;
create policy "briefs_select_visible" on public.briefs for select to authenticated
  using (
    status <> 'draft'
    or exists (select 1 from public.brands b where b.id = brand_id and b.profile_id = auth.uid())
    or public.is_engaged_creator_on_brief(id)
  );

notify pgrst, 'reload schema';
