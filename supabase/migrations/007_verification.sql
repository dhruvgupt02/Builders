-- 007: verification signals — AI-checked evidence, and client confirmation links for past work.
-- Re-runnable.

-- Who or what verified something: an AI check of the evidence, a BRIVIO reviewer, or the client themselves.
alter table public.verifications drop constraint if exists verifications_verified_by_check;
alter table public.verifications add constraint verifications_verified_by_check
  check (verified_by is null or verified_by in ('ai', 'manual', 'client'));
alter table public.verifications
  add column if not exists confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add column if not exists checked_at timestamptz;

-- ───────────────────────── Client confirmation links ─────────────────────────
-- A creator generates a link for a piece made for a client. The client opens it, sees the piece and confirms they
-- commissioned it. Each link works once and expires after 14 days.

create table if not exists public.client_confirmations (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  creator_id uuid not null references public.creators on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items on delete cascade,
  client_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  confirmed_name text,
  confirmed_company text
);
create index if not exists client_confirmations_creator_idx on public.client_confirmations (creator_id);

alter table public.client_confirmations enable row level security;

-- Only the creator who made a link can see or create it. Nobody edits one directly: confirming goes through
-- confirm_client_work below.
drop policy if exists "client_confirmations_select_own" on public.client_confirmations;
create policy "client_confirmations_select_own" on public.client_confirmations for select to authenticated
  using (exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid()));

drop policy if exists "client_confirmations_insert_own" on public.client_confirmations;
create policy "client_confirmations_insert_own" on public.client_confirmations for insert to authenticated
  with check (
    used_at is null and confirmed_name is null and confirmed_company is null
    and expires_at <= now() + interval '14 days 1 minute'
    and exists (select 1 from public.creators c
                join public.portfolio_items i on i.creator_id = c.id
                where c.id = creator_id and i.id = portfolio_item_id and c.profile_id = auth.uid())
  );

drop policy if exists "client_confirmations_delete_own_unused" on public.client_confirmations;
create policy "client_confirmations_delete_own_unused" on public.client_confirmations for delete to authenticated
  using (used_at is null and exists (select 1 from public.creators c where c.id = creator_id and c.profile_id = auth.uid()));

grant select, insert, delete on public.client_confirmations to authenticated;

-- What the client sees when they open the link. Works logged out; the token is the only credential.
-- status: 'valid' | 'used' | 'expired' | 'not_found'
create or replace function public.get_client_confirmation(token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'status', case when cc.used_at is not null then 'used' when cc.expires_at <= now() then 'expired' else 'valid' end,
      'client_name', cc.client_name,
      'expires_at', cc.expires_at,
      'confirmed_name', cc.confirmed_name,
      'confirmed_company', cc.confirmed_company,
      'used_at', cc.used_at,
      'creator', jsonb_build_object('id', c.id, 'name', c.name, 'avatar_url', c.avatar_url, 'city', c.city),
      'item', jsonb_build_object('id', i.id, 'title', i.title, 'description', i.description, 'thumbnail_url', i.thumbnail_url,
                                 'media_url', i.media_url, 'media_type', i.media_type, 'aspect_ratio', i.aspect_ratio, 'content_type', i.content_type))
    from public.client_confirmations cc
    join public.creators c on c.id = cc.creator_id
    join public.portfolio_items i on i.id = cc.portfolio_item_id
    where cc.token = get_client_confirmation.token
  ), jsonb_build_object('status', 'not_found'))
$$;

-- The client confirms. Marks the link used and records a verified past_work verification, in one statement so a
-- link can never be used twice even if two requests arrive together.
create or replace function public.confirm_client_work(token text, name text, company text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cc public.client_confirmations;
  who text := btrim(coalesce(name, ''));
  org text := btrim(coalesce(company, ''));
begin
  if length(who) < 2 or length(org) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Enter your name and company.');
  end if;

  update public.client_confirmations x
     set used_at = now(), confirmed_name = left(who, 120), confirmed_company = left(org, 120)
   where x.token = confirm_client_work.token and x.used_at is null and x.expires_at > now()
  returning * into cc;

  if not found then
    return jsonb_build_object('ok', false, 'error',
      case when exists (select 1 from public.client_confirmations y where y.token = confirm_client_work.token and y.used_at is not null)
             then 'This link has already been used.'
           when exists (select 1 from public.client_confirmations y where y.token = confirm_client_work.token)
             then 'This link has expired. Ask the creator for a new one.'
           else 'This link is not valid.' end);
  end if;

  insert into public.verifications (creator_id, portfolio_item_id, type, label, status, verified_by, reason, confidence, checked_at)
  values (cc.creator_id, cc.portfolio_item_id, 'past_work', left(org, 120), 'verified', 'client',
          'Confirmed by ' || left(who, 120) || ' of ' || left(org, 120) || ' through a one-time confirmation link.', 1, now());

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.get_client_confirmation(text) to anon, authenticated;
grant execute on function public.confirm_client_work(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
