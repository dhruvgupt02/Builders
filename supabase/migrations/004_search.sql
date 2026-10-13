-- 004: creator search — the creator_search view, keyword search, facet counts, closest matches and semantic search.
-- Re-runnable: it only (re)creates a view, a type and functions.
--
-- Filter rules used everywhere below:
--   * AND across filter groups (skills, tools, specializations, content types, aspect ratios, cities, budget, toggles, text)
--   * OR inside a group: the creator needs ANY selected value
--   * except tools when match_all_tools is true: the creator needs ALL selected tools
--   * budget: creators.price_min <= budget_max
--   * text q: every word must appear (case-insensitive) in the creator's name, headline, bio, city, specializations,
--     skills, tools, or in the titles, descriptions and style tags of their portfolio items

drop function if exists public.search_creators(text, text[], text[], text[], text[], text[], text[], int, boolean, boolean, boolean, text, int, int);
drop function if exists public.search_facets(jsonb, jsonb);
drop function if exists public.search_closest(jsonb, int);
drop function if exists public.search_semantic(vector, jsonb, int, int);
drop function if exists public.match_creators(vector, int);
drop view if exists public.creator_search cascade;
drop type if exists public.search_filters cascade;

-- ───────────────────────── View: one row per creator ─────────────────────────

create view public.creator_search with (security_invoker = true) as
select
  c.id, c.profile_id, c.name, c.headline, c.bio, c.city, c.avatar_url,
  c.specializations, c.skills, c.tools, c.languages, c.price_min, c.price_max, c.availability, c.is_sample, c.created_at,
  coalesce(p.content_types, '{}'::text[])        as content_types,
  coalesce(p.aspect_ratios, '{}'::text[])        as aspect_ratios,
  coalesce(p.item_count, 0)::int                 as item_count,
  coalesce(v.verified_tool_labels, '{}'::text[]) as verified_tool_labels,
  coalesce(v.has_verified_workflow, false)       as has_verified_workflow,
  coalesce(v.has_verified_past_work, false)      as has_verified_past_work,
  coalesce(v.verification_count, 0)::int         as verification_count,
  coalesce(p.commercial_ready, false)            as commercial_ready,
  -- lower-cased titles, descriptions and style tags of all portfolio items, for text search
  coalesce(p.portfolio_text, '')                 as portfolio_text
from public.creators c
left join lateral (
  select
    array_agg(distinct i.content_type) filter (where i.content_type is not null) as content_types,
    array_agg(distinct i.aspect_ratio) filter (where i.aspect_ratio is not null) as aspect_ratios,
    count(*) as item_count,
    bool_or(i.commercial_use_status in ('licensed', 'client_delivered')) as commercial_ready,
    lower(string_agg(concat_ws(' ', i.title, i.description, array_to_string(i.style_tags, ' ')), ' ')) as portfolio_text
  from public.portfolio_items i
  where i.creator_id = c.id
) p on true
left join lateral (
  select
    array_agg(distinct x.label) filter (where x.type = 'tool' and x.status = 'verified' and x.label is not null) as verified_tool_labels,
    bool_or(x.type = 'workflow' and x.status = 'verified')  as has_verified_workflow,
    bool_or(x.type = 'past_work' and x.status = 'verified') as has_verified_past_work,
    count(*) filter (where x.status = 'verified') as verification_count
  from public.verifications x
  where x.creator_id = c.id
) v on true;

comment on view public.creator_search is 'One row per creator with portfolio and verification aggregates. The embedding column is left out on purpose.';
grant select on public.creator_search to anon, authenticated;

-- ───────────────────────── Filters as one value ─────────────────────────

create type public.search_filters as (
  q text,
  skills text[],
  tools text[],
  specializations text[],
  content_types text[],
  aspect_ratios text[],
  cities text[],
  budget_max int,
  commercial_ready boolean,
  verified_only boolean,
  match_all_tools boolean
);

-- Nulls become "no filter": empty arrays, false toggles, no text.
create or replace function public.search_norm(f public.search_filters)
returns public.search_filters language plpgsql immutable as $$
begin
  f.q := nullif(btrim(coalesce(f.q, '')), '');
  f.skills := coalesce(f.skills, '{}');
  f.tools := coalesce(f.tools, '{}');
  f.specializations := coalesce(f.specializations, '{}');
  f.content_types := coalesce(f.content_types, '{}');
  f.aspect_ratios := coalesce(f.aspect_ratios, '{}');
  f.cities := coalesce(f.cities, '{}');
  if f.budget_max is not null and f.budget_max <= 0 then f.budget_max := null; end if;
  f.commercial_ready := coalesce(f.commercial_ready, false);
  f.verified_only := coalesce(f.verified_only, false);
  f.match_all_tools := coalesce(f.match_all_tools, false);
  return f;
end $$;

create or replace function public.search_filters_from_json(j jsonb)
returns public.search_filters language sql immutable as $$
  select public.search_norm(jsonb_populate_record(null::public.search_filters, coalesce(j, '{}'::jsonb)))
$$;

-- The filters with one more option switched on (used for facet counts).
create or replace function public.search_with(f public.search_filters, grp text, val text)
returns public.search_filters language plpgsql immutable as $$
begin
  case grp
    when 'skills' then if not (val = any(f.skills)) then f.skills := f.skills || val; end if;
    when 'tools' then if not (val = any(f.tools)) then f.tools := f.tools || val; end if;
    when 'specializations' then if not (val = any(f.specializations)) then f.specializations := f.specializations || val; end if;
    when 'content_types' then if not (val = any(f.content_types)) then f.content_types := f.content_types || val; end if;
    when 'aspect_ratios' then if not (val = any(f.aspect_ratios)) then f.aspect_ratios := f.aspect_ratios || val; end if;
    when 'cities' then if not (val = any(f.cities)) then f.cities := f.cities || val; end if;
    when 'commercial_ready' then f.commercial_ready := true;
    when 'verified_only' then f.verified_only := true;
    else raise exception 'unknown filter group %', grp;
  end case;
  return f;
end $$;

-- ───────────────────────── Matching ─────────────────────────

-- Does this creator pass every filter group? (Text is scored separately by creator_text_score.)
create or replace function public.creator_matches(cs public.creator_search, f public.search_filters)
returns boolean language sql immutable as $$
  select
        (cardinality(f.skills) = 0 or cs.skills && f.skills)
    and (cardinality(f.tools) = 0 or case when f.match_all_tools then cs.tools @> f.tools else cs.tools && f.tools end)
    and (cardinality(f.specializations) = 0 or cs.specializations && f.specializations)
    and (cardinality(f.content_types) = 0 or cs.content_types && f.content_types)
    and (cardinality(f.aspect_ratios) = 0 or cs.aspect_ratios && f.aspect_ratios)
    and (cardinality(f.cities) = 0 or cs.city = any(f.cities))
    and (f.budget_max is null or (cs.price_min is not null and cs.price_min <= f.budget_max))
    and (not f.commercial_ready or cs.commercial_ready)
    and (not f.verified_only or cs.verification_count > 0)
$$;

-- Text relevance. -1 = at least one word of q is nowhere on this creator (no match); 0 = no query;
-- otherwise the sum over words of: name 5, specializations/skills/tools 4, headline 3, city 3, bio 2, portfolio text 1.
create or replace function public.creator_text_score(cs public.creator_search, q text)
returns int language plpgsql immutable as $$
declare
  tok text;
  total int := 0;
  s int;
  taxonomy text;
begin
  if q is null or btrim(q) = '' then return 0; end if;
  taxonomy := lower(array_to_string(cs.specializations || cs.skills || cs.tools, ' '));
  foreach tok in array (regexp_split_to_array(lower(btrim(q)), '\s+'))[1:8] loop
    s := 0;
    if position(tok in lower(coalesce(cs.name, ''))) > 0 then s := s + 5; end if;
    if position(tok in taxonomy) > 0 then s := s + 4; end if;
    if position(tok in lower(coalesce(cs.headline, ''))) > 0 then s := s + 3; end if;
    if position(tok in lower(coalesce(cs.city, ''))) > 0 then s := s + 3; end if;
    if position(tok in lower(coalesce(cs.bio, ''))) > 0 then s := s + 2; end if;
    if position(tok in cs.portfolio_text) > 0 then s := s + 1; end if;
    if s = 0 then return -1; end if;
    total := total + s;
  end loop;
  return total;
end $$;

-- The selected values this creator has, in a stable order (tools, skills, specializations, content types, ratios, city).
create or replace function public.creator_matched(cs public.creator_search, f public.search_filters)
returns text[] language sql immutable as $$
  select
       array(select t from unnest(f.tools) with ordinality u(t, o) where t = any(cs.tools) order by o)
    || array(select t from unnest(f.skills) with ordinality u(t, o) where t = any(cs.skills) order by o)
    || array(select t from unnest(f.specializations) with ordinality u(t, o) where t = any(cs.specializations) order by o)
    || array(select t from unnest(f.content_types) with ordinality u(t, o) where t = any(cs.content_types) order by o)
    || array(select t from unnest(f.aspect_ratios) with ordinality u(t, o) where t = any(cs.aspect_ratios) order by o)
    || case when cs.city = any(f.cities) then array[cs.city] else '{}'::text[] end
$$;

-- How many filter groups are switched on (text counts as one).
create or replace function public.search_active_count(f public.search_filters)
returns int language sql immutable as $$
  select (f.q is not null)::int + (cardinality(f.skills) > 0)::int + (cardinality(f.tools) > 0)::int
       + (cardinality(f.specializations) > 0)::int + (cardinality(f.content_types) > 0)::int
       + (cardinality(f.aspect_ratios) > 0)::int + (cardinality(f.cities) > 0)::int
       + (f.budget_max is not null)::int + f.commercial_ready::int + f.verified_only::int
$$;

-- The filter groups this creator fails, as [{group, values}]. Empty array = full match.
-- "values" is what would have satisfied the group (for match-all tools: just the tools the creator lacks).
create or replace function public.creator_missing(cs public.creator_search, f public.search_filters)
returns jsonb language plpgsql immutable as $$
declare
  missed jsonb := '[]'::jsonb;
  lacking text[];
begin
  if f.q is not null and public.creator_text_score(cs, f.q) < 0 then
    missed := missed || jsonb_build_object('group', 'q', 'values', jsonb_build_array(f.q));
  end if;
  if cardinality(f.tools) > 0 then
    if f.match_all_tools then
      lacking := array(select t from unnest(f.tools) with ordinality u(t, o) where not (t = any(cs.tools)) order by o);
      if cardinality(lacking) > 0 then
        missed := missed || jsonb_build_object('group', 'tools', 'values', to_jsonb(lacking), 'all', true);
      end if;
    elsif not (cs.tools && f.tools) then
      missed := missed || jsonb_build_object('group', 'tools', 'values', to_jsonb(f.tools));
    end if;
  end if;
  if cardinality(f.skills) > 0 and not (cs.skills && f.skills) then
    missed := missed || jsonb_build_object('group', 'skills', 'values', to_jsonb(f.skills));
  end if;
  if cardinality(f.specializations) > 0 and not (cs.specializations && f.specializations) then
    missed := missed || jsonb_build_object('group', 'specializations', 'values', to_jsonb(f.specializations));
  end if;
  if cardinality(f.content_types) > 0 and not (cs.content_types && f.content_types) then
    missed := missed || jsonb_build_object('group', 'content_types', 'values', to_jsonb(f.content_types));
  end if;
  if cardinality(f.aspect_ratios) > 0 and not (cs.aspect_ratios && f.aspect_ratios) then
    missed := missed || jsonb_build_object('group', 'aspect_ratios', 'values', to_jsonb(f.aspect_ratios));
  end if;
  if cardinality(f.cities) > 0 and not coalesce(cs.city = any(f.cities), false) then
    missed := missed || jsonb_build_object('group', 'cities', 'values', to_jsonb(f.cities));
  end if;
  if f.budget_max is not null and not coalesce(cs.price_min <= f.budget_max, false) then
    missed := missed || jsonb_build_object('group', 'budget', 'values', jsonb_build_array(cs.price_min));
  end if;
  if f.commercial_ready and not cs.commercial_ready then
    missed := missed || jsonb_build_object('group', 'commercial_ready', 'values', '[]'::jsonb);
  end if;
  if f.verified_only and not (cs.verification_count > 0) then
    missed := missed || jsonb_build_object('group', 'verified_only', 'values', '[]'::jsonb);
  end if;
  return missed;
end $$;

-- What a result card needs: the creator row plus up to 3 portfolio thumbnails. Pieces that fit the selected
-- aspect ratios / content types come first, so the card shows why the creator matched.
create or replace function public.creator_card(cs public.creator_search, f public.search_filters)
returns jsonb language sql stable as $$
  select (to_jsonb(cs) - 'portfolio_text') || jsonb_build_object(
    'thumbs',
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'title', t.title, 'thumbnail_url', t.thumbnail_url,
               'aspect_ratio', t.aspect_ratio, 'content_type', t.content_type) order by t.rn)
      from (
        select i.*, row_number() over (
                 order by ((i.aspect_ratio = any(f.aspect_ratios))::int + (i.content_type = any(f.content_types))::int) desc nulls last,
                          i.created_at desc, i.id) as rn
        from public.portfolio_items i
        where i.creator_id = cs.id
      ) t
      where t.rn <= 3
    ), '[]'::jsonb))
$$;

-- ───────────────────────── Keyword search ─────────────────────────

-- Returns { total, rows }. total counts every match; rows is one page of cards, each with
-- "matched" (selected values the creator has) and "relevance" (text score).
-- sort: 'best' (most matched values, then text relevance), 'price_asc' (price_min), 'price_desc' (price_max),
--       'verified' (verification_count), 'newest' (created_at). Ties: verification_count, name, id.
create or replace function public.search_creators(
  q text default null,
  skills text[] default null,
  tools text[] default null,
  specializations text[] default null,
  content_types text[] default null,
  aspect_ratios text[] default null,
  cities text[] default null,
  budget_max int default null,
  commercial_ready boolean default false,
  verified_only boolean default false,
  match_all_tools boolean default false,
  sort text default 'best',
  lim int default 12,
  "off" int default 0
)
returns jsonb language sql stable as $$
  with args as (
    select public.search_norm(row(q, skills, tools, specializations, content_types, aspect_ratios, cities,
                                  budget_max, commercial_ready, verified_only, match_all_tools)::public.search_filters) as f,
           coalesce(sort, 'best') as s,
           least(greatest(coalesce(lim, 12), 0), 1000) as l,
           greatest(coalesce("off", 0), 0) as o
  ),
  hits as materialized (
    select cs, public.creator_text_score(cs, (a.f).q) as relevance, public.creator_matched(cs, a.f) as matched
    from public.creator_search cs cross join args a
    where public.creator_matches(cs, a.f)
  ),
  kept as (select * from hits where relevance >= 0),
  ranked as (
    select k.*, row_number() over (order by
      case when a.s = 'price_asc' then (k.cs).price_min end asc nulls last,
      case when a.s = 'price_desc' then (k.cs).price_max end desc nulls last,
      case when a.s = 'verified' then (k.cs).verification_count end desc nulls last,
      case when a.s = 'newest' then (k.cs).created_at end desc nulls last,
      case when a.s not in ('price_asc', 'price_desc', 'verified', 'newest') then cardinality(k.matched) end desc nulls last,
      case when a.s not in ('price_asc', 'price_desc', 'verified', 'newest') then k.relevance end desc nulls last,
      (k.cs).verification_count desc, (k.cs).name, (k.cs).id) as rn
    from kept k cross join args a
  )
  select jsonb_build_object(
    'total', (select count(*) from kept),
    'rows', coalesce((
      select jsonb_agg(public.creator_card(r.cs, a.f) || jsonb_build_object('matched', to_jsonb(r.matched), 'relevance', r.relevance) order by r.rn)
      from ranked r cross join args a
      where r.rn > a.o and r.rn <= a.o + a.l
    ), '[]'::jsonb))
$$;

-- ───────────────────────── Facet counts ─────────────────────────

-- For every filter option: how many creators the search would return if that option were switched on,
-- with everything else left as it is. (So for an option that is already on, it equals the current total.)
-- filters: the same fields as search_creators, as JSON. options: optional { group: [values] } listing the options
-- to count (the app passes its taxonomy); groups not listed use the values present in the data.
-- Returns { total, skills: {value: n}, tools: {...}, specializations, content_types, aspect_ratios, cities,
--           commercial_ready: n, verified_only: n }.
create or replace function public.search_facets(filters jsonb default '{}'::jsonb, options jsonb default null)
returns jsonb language sql stable as $$
  with args as (select public.search_filters_from_json(filters) as f),
  everyone as materialized (select cs from public.creator_search cs),
  -- the text query applies to every count
  base as materialized (
    select e.cs from everyone e cross join args a where public.creator_text_score(e.cs, (a.f).q) >= 0
  ),
  in_data as (
    select 'skills' as grp, unnest((e.cs).skills) as v from everyone e
    union select 'tools', unnest((e.cs).tools) from everyone e
    union select 'specializations', unnest((e.cs).specializations) from everyone e
    union select 'content_types', unnest((e.cs).content_types) from everyone e
    union select 'aspect_ratios', unnest((e.cs).aspect_ratios) from everyone e
    union select 'cities', (e.cs).city from everyone e where (e.cs).city is not null
  ),
  selected as (
    select 'skills' as grp, unnest((a.f).skills) as v from args a
    union select 'tools', unnest((a.f).tools) from args a
    union select 'specializations', unnest((a.f).specializations) from args a
    union select 'content_types', unnest((a.f).content_types) from args a
    union select 'aspect_ratios', unnest((a.f).aspect_ratios) from args a
    union select 'cities', unnest((a.f).cities) from args a
  ),
  opts as (
    select g.grp, x.v
    from (values ('skills'), ('tools'), ('specializations'), ('content_types'), ('aspect_ratios'), ('cities')) g(grp)
    cross join lateral (
      select jsonb_array_elements_text(case when jsonb_typeof(options -> g.grp) = 'array' then options -> g.grp else '[]'::jsonb end) as v
      union
      select d.v from in_data d where d.grp = g.grp and jsonb_typeof(options -> g.grp) is distinct from 'array'
      union
      select s.v from selected s where s.grp = g.grp
    ) x
  ),
  counted as (
    select o.grp, o.v,
           (select count(*) from base b where public.creator_matches(b.cs, public.search_with(a.f, o.grp, o.v))) as n
    from opts o cross join args a
  ),
  grouped as (select grp, jsonb_object_agg(v, n) as counts from counted group by grp)
  select jsonb_build_object(
           'total', (select count(*) from base b cross join args a where public.creator_matches(b.cs, a.f)),
           'commercial_ready', (select count(*) from base b cross join args a where public.creator_matches(b.cs, public.search_with(a.f, 'commercial_ready', ''))),
           'verified_only', (select count(*) from base b cross join args a where public.creator_matches(b.cs, public.search_with(a.f, 'verified_only', ''))),
           'skills', '{}'::jsonb, 'tools', '{}'::jsonb, 'specializations', '{}'::jsonb,
           'content_types', '{}'::jsonb, 'aspect_ratios', '{}'::jsonb, 'cities', '{}'::jsonb)
         || coalesce((select jsonb_object_agg(grp, counts) from grouped), '{}'::jsonb)
$$;

-- ───────────────────────── Closest matches (for empty results) ─────────────────────────

-- Creators who satisfy the most active filter groups without satisfying all of them, each with "missed"
-- (see creator_missing) and "satisfied" (number of groups they do pass). Needs at least 2 active groups
-- and at least one satisfied group, otherwise "closest" means nothing.
create or replace function public.search_closest(filters jsonb default '{}'::jsonb, lim int default 6)
returns jsonb language sql stable as $$
  with args as (select public.search_filters_from_json(filters) as f),
  scored as materialized (
    select cs, public.creator_missing(cs, a.f) as missed, public.search_active_count(a.f) as active
    from public.creator_search cs cross join args a
  ),
  near as (
    select s.*, row_number() over (order by jsonb_array_length(s.missed), (s.cs).verification_count desc, (s.cs).name, (s.cs).id) as rn
    from scored s
    where s.active >= 2 and jsonb_array_length(s.missed) between 1 and s.active - 1
  )
  select coalesce((
    select jsonb_agg(public.creator_card(n.cs, a.f) || jsonb_build_object(
             'missed', n.missed, 'satisfied', n.active - jsonb_array_length(n.missed),
             'matched', to_jsonb(public.creator_matched(n.cs, a.f))) order by n.rn)
    from near n cross join args a
    where n.rn <= least(greatest(coalesce(lim, 6), 0), 50)
  ), '[]'::jsonb)
$$;

-- ───────────────────────── Semantic search ─────────────────────────

-- Cosine similarity between a query embedding and each creator: the better of the creator's own embedding and
-- their best-matching portfolio item. Creators with no embeddings at all are left out.
create or replace function public.match_creators(query_embedding vector(768), lim int default 20)
returns table (creator_id uuid, similarity double precision, creator_similarity double precision,
               best_item_id uuid, best_item_similarity double precision)
language sql stable as $$
  select c.id,
         greatest(1 - (c.embedding <=> query_embedding), bi.sim) as similarity,
         1 - (c.embedding <=> query_embedding) as creator_similarity,
         bi.id as best_item_id,
         bi.sim as best_item_similarity
  from public.creators c
  left join lateral (
    select i.id, 1 - (i.embedding <=> query_embedding) as sim
    from public.portfolio_items i
    where i.creator_id = c.id and i.embedding is not null
    order by i.embedding <=> query_embedding
    limit 1
  ) bi on true
  where c.embedding is not null or bi.id is not null
  order by greatest(1 - (c.embedding <=> query_embedding), bi.sim) desc, c.id
  limit greatest(coalesce(lim, 20), 0)
$$;

-- Semantic results as cards, honouring the same filters as keyword search (the text q is ignored here).
-- Returns { total, rows }; each row adds similarity (0..1) and best_item (the closest portfolio piece).
create or replace function public.search_semantic(
  query_embedding vector(768),
  filters jsonb default '{}'::jsonb,
  lim int default 12,
  "off" int default 0
)
returns jsonb language sql stable as $$
  with args as (
    select public.search_filters_from_json(coalesce(filters, '{}'::jsonb) - 'q') as f,
           least(greatest(coalesce(lim, 12), 0), 100) as l,
           greatest(coalesce("off", 0), 0) as o
  ),
  hits as materialized (
    select cs, m.similarity, m.creator_similarity, m.best_item_id, m.best_item_similarity,
           row_number() over (order by m.similarity desc, cs.name, cs.id) as rn
    from public.match_creators(query_embedding, 100000) m
    join public.creator_search cs on cs.id = m.creator_id
    cross join args a
    where public.creator_matches(cs, a.f)
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'rows', coalesce((
      select jsonb_agg(
               public.creator_card(h.cs, a.f) || jsonb_build_object(
                 'similarity', h.similarity,
                 'creator_similarity', h.creator_similarity,
                 'matched', to_jsonb(public.creator_matched(h.cs, a.f)),
                 'best_item', (select jsonb_build_object('id', i.id, 'title', i.title, 'thumbnail_url', i.thumbnail_url,
                                                         'aspect_ratio', i.aspect_ratio, 'content_type', i.content_type,
                                                         'similarity', h.best_item_similarity)
                               from public.portfolio_items i where i.id = h.best_item_id))
               order by h.rn)
      from hits h cross join args a
      where h.rn > a.o and h.rn <= a.o + a.l
    ), '[]'::jsonb))
$$;

-- ───────────────────────── Permissions: search works logged out ─────────────────────────

grant execute on function public.search_creators(text, text[], text[], text[], text[], text[], text[], int, boolean, boolean, boolean, text, int, int) to anon, authenticated;
grant execute on function public.search_facets(jsonb, jsonb) to anon, authenticated;
grant execute on function public.search_closest(jsonb, int) to anon, authenticated;
grant execute on function public.match_creators(vector, int) to anon, authenticated;
grant execute on function public.search_semantic(vector, jsonb, int, int) to anon, authenticated;

-- Tell the API layer about the new view and functions straight away.
notify pgrst, 'reload schema';
