-- 006: brief-to-creator matching. Scores every creator against a brief (0-100) with a breakdown, and caches the
-- one-sentence "why this match" reasons. Weights and formulas are documented in docs/matching.md.
-- Re-runnable.

drop function if exists public.brief_matches(uuid, int, uuid);
drop function if exists public.match_creators_for_brief(uuid, int, uuid);
drop function if exists public.match_creators_for_brief(uuid, int);

-- ───────────────────────── Scoring ─────────────────────────
--
--   Tools        25  share of required tools the creator uses (full marks if none are required),
--                    minus 10 for each excluded tool that appears in more than half of their portfolio items
--   Format       20  share of the brief's deliverables for which the creator has a portfolio piece with the same
--                    content type AND aspect ratio
--   Style        25  cosine similarity between the brief's embedding and the creator's closest portfolio piece,
--                    scaled so 0.72 -> 0 and 0.88 -> full marks (brief and portfolio texts are both documents, and
--                    document-to-document similarity for this model sits in a narrow band around 0.75-0.85)
--   Budget       15  full if the creator's price range overlaps the brief's budget; otherwise scaled down by how far
--                    outside it is (2x over budget -> 0; cheaper than the budget loses half as fast)
--   Commercial   10  full if the creator is commercial-ready, or if the brief is for organic social only
--   Verification  5  verified tool 2, verified workflow 1.5, verified past work 1.5
--
-- When something needed for a part is missing (brief not embedded yet, no budget, no price) that part gets half
-- marks rather than zero, so an incomplete brief does not sink everyone.

create or replace function public.match_creators_for_brief(
  brief_id uuid,
  lim int default 20,
  only_creator uuid default null
)
returns table (
  creator_id uuid,
  score int,
  tools_fit numeric,
  format_fit numeric,
  style_fit numeric,
  budget_fit numeric,
  commercial_fit numeric,
  verification_fit numeric,
  best_item_id uuid,
  details jsonb
)
language sql stable as $$
  with b as (
    select br.*, coalesce(r.usage_platforms, '{}'::text[]) as usage_platforms
    from public.briefs br
    left join public.brief_rights r on r.brief_id = br.id
    where br.id = match_creators_for_brief.brief_id
  ),
  d as (
    select bd.content_type, bd.aspect_ratio
    from public.brief_deliverables bd
    where bd.brief_id = match_creators_for_brief.brief_id and bd.content_type is not null and bd.aspect_ratio is not null
  ),
  parts as (
    select
      cs.id as creator_id, cs.name, cs.tools, cs.price_min, cs.price_max, cs.commercial_ready,
      cs.verified_tool_labels, cs.has_verified_workflow, cs.has_verified_past_work, cs.item_count,
      b.required_tools, b.excluded_tools, b.budget_min, b.budget_max, b.usage_platforms,
      b.embedding is not null as brief_embedded,
      -- tools
      array(select t from unnest(b.required_tools) with ordinality u(t, o) where t = any(cs.tools) order by o) as tools_matched,
      array(select t from unnest(b.required_tools) with ordinality u(t, o) where not (t = any(cs.tools)) order by o) as tools_missing,
      array(
        select t from unnest(b.excluded_tools) with ordinality u(t, o)
        where cs.item_count > 0
          and (select count(*) from public.portfolio_items i where i.creator_id = cs.id and t = any(i.tools)) * 2 > cs.item_count
        order by o
      ) as excluded_relied_on,
      -- format
      (select count(*) from d) as deliverable_count,
      (select count(*) from d
        where exists (select 1 from public.portfolio_items i
                      where i.creator_id = cs.id and i.content_type = d.content_type and i.aspect_ratio = d.aspect_ratio)) as deliverables_covered,
      -- style: the creator's closest piece to the brief
      best.id as best_item_id, best.similarity
    from public.creator_search cs
    cross join b
    left join lateral (
      select i.id, 1 - (i.embedding <=> b.embedding) as similarity
      from public.portfolio_items i
      where i.creator_id = cs.id and i.embedding is not null and b.embedding is not null
      order by i.embedding <=> b.embedding
      limit 1
    ) best on true
    where match_creators_for_brief.only_creator is null or cs.id = match_creators_for_brief.only_creator
  ),
  scored as (
    select p.*,
      greatest(0, least(25,
        25 * (case when cardinality(p.required_tools) = 0 then 1
                   else cardinality(p.tools_matched)::numeric / cardinality(p.required_tools) end)
        - 10 * cardinality(p.excluded_relied_on)))::numeric as tools_fit,
      (20 * (case when p.deliverable_count = 0 then 0.5 else p.deliverables_covered::numeric / p.deliverable_count end))::numeric as format_fit,
      (25 * (case when not p.brief_embedded then 0.5
                  when p.similarity is null then 0
                  else greatest(0, least(1, (p.similarity - 0.72) / 0.16)) end))::numeric as style_fit,
      (15 * (case
        when p.budget_max is null or p.price_min is null then 0.5
        when p.price_min > p.budget_max then greatest(0, 1 - (p.price_min - p.budget_max)::numeric / p.budget_max)
        when p.budget_min is not null and coalesce(p.price_max, p.price_min) < p.budget_min
          then greatest(0, 1 - 0.5 * (p.budget_min - coalesce(p.price_max, p.price_min))::numeric / p.budget_min)
        else 1 end))::numeric as budget_fit,
      (10 * (case when p.commercial_ready then 1
                  when cardinality(p.usage_platforms) > 0 and p.usage_platforms <@ array['Organic social'] then 1
                  else 0 end))::numeric as commercial_fit,
      ((case when cardinality(p.verified_tool_labels) > 0 then 2 else 0 end)
        + (case when p.has_verified_workflow then 1.5 else 0 end)
        + (case when p.has_verified_past_work then 1.5 else 0 end))::numeric as verification_fit
    from parts p
  ),
  totals as (
    select s.*, greatest(0, least(100, round(s.tools_fit + s.format_fit + s.style_fit + s.budget_fit + s.commercial_fit + s.verification_fit)))::int as score
    from scored s
  )
  select
    t.creator_id, t.score,
    round(t.tools_fit, 1), round(t.format_fit, 1), round(t.style_fit, 1), round(t.budget_fit, 1), round(t.commercial_fit, 1), round(t.verification_fit, 1),
    -- with no brief embedding there is no "closest" piece; fall back to the newest piece that fits a deliverable
    coalesce(t.best_item_id, (
      select i.id from public.portfolio_items i
      where i.creator_id = t.creator_id
      order by (exists (select 1 from d where d.content_type = i.content_type and d.aspect_ratio = i.aspect_ratio)) desc, i.created_at desc, i.id
      limit 1)),
    jsonb_build_object(
      'tools_matched', to_jsonb(t.tools_matched),
      'tools_missing', to_jsonb(t.tools_missing),
      'excluded_relied_on', to_jsonb(t.excluded_relied_on),
      'deliverables_covered', t.deliverables_covered,
      'deliverable_count', t.deliverable_count,
      'similarity', round(t.similarity::numeric, 4),
      'brief_embedded', t.brief_embedded,
      'within_budget', (t.budget_fit = 15),
      'price_min', t.price_min, 'price_max', t.price_max)
  from totals t
  order by t.score desc, t.similarity desc nulls last, t.name, t.creator_id
  limit greatest(coalesce(match_creators_for_brief.lim, 20), 0)
$$;

-- ───────────────────────── Cached "why this match" sentences ─────────────────────────

create table if not exists public.match_cache (
  brief_id uuid not null references public.briefs on delete cascade,
  creator_id uuid not null references public.creators on delete cascade,
  reason text not null,
  source text not null default 'ai' check (source in ('ai', 'rules')),
  created_at timestamptz not null default now(),
  primary key (brief_id, creator_id)
);

alter table public.match_cache enable row level security;

-- Only the brand that owns the brief reads its cache. Rows are written by the server (service role).
drop policy if exists "match_cache_select_own" on public.match_cache;
create policy "match_cache_select_own" on public.match_cache for select to authenticated
  using (exists (select 1 from public.briefs br join public.brands bn on bn.id = br.brand_id
                 where br.id = brief_id and bn.profile_id = auth.uid()));
grant select on public.match_cache to authenticated;

-- A reason describes a brief as it was. When the brief (or its deliverables or rights) changes in a way that
-- affects matching, the cached reasons for it are dropped.
create or replace function public.clear_match_cache_for_brief()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if tg_table_name = 'briefs' then
    target := new.id;
  elsif tg_op = 'DELETE' then
    target := old.brief_id;
  else
    target := new.brief_id;
  end if;
  delete from public.match_cache where brief_id = target;
  return null;
end $$;

drop trigger if exists briefs_clear_match_cache on public.briefs;
create trigger briefs_clear_match_cache
  after update on public.briefs
  for each row
  when (row(old.title, old.goal, old.product, old.target_audience, old.key_message, old.content_type, old.style_tags, old.mood,
            old.required_tools, old.excluded_tools, old.budget_min, old.budget_max, old.aspect_ratios, old.deliverables_count)
        is distinct from
        row(new.title, new.goal, new.product, new.target_audience, new.key_message, new.content_type, new.style_tags, new.mood,
            new.required_tools, new.excluded_tools, new.budget_min, new.budget_max, new.aspect_ratios, new.deliverables_count))
  execute function public.clear_match_cache_for_brief();

drop trigger if exists brief_rights_clear_match_cache on public.brief_rights;
create trigger brief_rights_clear_match_cache
  after update on public.brief_rights
  for each row
  when (old.usage_platforms is distinct from new.usage_platforms)
  execute function public.clear_match_cache_for_brief();

-- ───────────────────────── Matches as cards (for the page) ─────────────────────────

-- { brief_embedded, rows: [ creator card + score, breakdown, details, best_item, reason ] }
create or replace function public.brief_matches(brief_id uuid, lim int default 50, only_creator uuid default null)
returns jsonb language sql stable as $$
  with f as (
    -- thumbnails on each card favour pieces in the brief's formats
    select public.search_norm(row(null, null, null, null,
             array(select distinct bd.content_type from public.brief_deliverables bd where bd.brief_id = brief_matches.brief_id and bd.content_type is not null),
             array(select distinct bd.aspect_ratio from public.brief_deliverables bd where bd.brief_id = brief_matches.brief_id and bd.aspect_ratio is not null),
             null, null, false, false, false)::public.search_filters) as f
  ),
  m as (
    select mm.*, row_number() over () as rn
    from public.match_creators_for_brief(brief_matches.brief_id, brief_matches.lim, brief_matches.only_creator) mm
  )
  select jsonb_build_object(
    'brief_embedded', (select br.embedding is not null from public.briefs br where br.id = brief_matches.brief_id),
    'rows', coalesce((
      select jsonb_agg(
        public.creator_card(cs, f.f) || jsonb_build_object(
          'score', m.score,
          'breakdown', jsonb_build_object(
            'tools', m.tools_fit, 'format', m.format_fit, 'style', m.style_fit,
            'budget', m.budget_fit, 'commercial', m.commercial_fit, 'verification', m.verification_fit),
          'details', m.details,
          'best_item', (select jsonb_build_object('id', i.id, 'title', i.title, 'thumbnail_url', i.thumbnail_url,
                                                  'aspect_ratio', i.aspect_ratio, 'content_type', i.content_type)
                        from public.portfolio_items i where i.id = m.best_item_id),
          'reason', (select mc.reason from public.match_cache mc where mc.brief_id = brief_matches.brief_id and mc.creator_id = m.creator_id))
        order by m.rn)
      from m
      join public.creator_search cs on cs.id = m.creator_id
      cross join f
    ), '[]'::jsonb))
$$;

grant execute on function public.match_creators_for_brief(uuid, int, uuid) to anon, authenticated;
grant execute on function public.brief_matches(uuid, int, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
