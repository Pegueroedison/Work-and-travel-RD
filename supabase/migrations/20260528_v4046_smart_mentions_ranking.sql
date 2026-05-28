-- V4046 - Búsqueda inteligente de menciones con respaldo correcto
-- Ejecutar en Supabase SQL Editor.
-- Corrige la versión anterior para que:
-- - @ vacío muestre amigos/interacciones reales.
-- - Si la RPC no encuentra nada, el frontend cae a la lógica local.
-- - Con 2+ letras la búsqueda sigue limitada.

create or replace function public.search_mention_candidates_v4046(
  search_text text default '',
  result_limit integer default 10
)
returns table (
  id uuid,
  username text,
  full_name text,
  photo_url text,
  role text,
  score integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  q text := lower(regexp_replace(coalesce(search_text, ''), '[^a-z0-9_]', '', 'g'));
  actor_role text := 'user';
  v_limit integer := least(greatest(coalesce(result_limit, 10), 1), 30);
  can_search_broad boolean := false;
begin
  if actor_id is null then
    return;
  end if;

  select lower(coalesce(up.role::text, 'user'))
  into actor_role
  from public.user_profiles up
  where up.id = actor_id;

  can_search_broad := actor_role in ('owner', 'superadmin', 'admin');

  return query
  with raw_candidates as (
    -- 1) Amigos aceptados
    select
      case when f.requester_id = actor_id then f.receiver_id else f.requester_id end as candidate_id,
      100::integer as candidate_score,
      'friend'::text as candidate_reason
    from public.user_friendships f
    where f.status = 'accepted'
      and (f.requester_id = actor_id or f.receiver_id = actor_id)

    union all

    -- 2) Personas que comentaron publicaciones mías
    select c.author_id, 82::integer, 'commented_your_post'::text
    from public.forum_posts p
    join public.forum_comments c on c.post_id = p.id
    where p.author_id = actor_id
      and c.author_id <> actor_id
      and coalesce(c.status, 'approved') = 'approved'

    union all

    -- 3) Personas a quienes respondí
    select parent.author_id, 76::integer, 'you_replied'::text
    from public.forum_comments mine
    join public.forum_comments parent on parent.id = mine.parent_comment_id
    where mine.author_id = actor_id
      and parent.author_id <> actor_id
      and coalesce(mine.status, 'approved') = 'approved'
      and coalesce(parent.status, 'approved') = 'approved'

    union all

    -- 4) Personas con interacción en los mismos hilos
    select other.author_id, 64::integer, 'interaction'::text
    from public.forum_comments mine
    join public.forum_comments other on other.post_id = mine.post_id
    where mine.author_id = actor_id
      and other.author_id <> actor_id
      and coalesce(mine.status, 'approved') = 'approved'
      and coalesce(other.status, 'approved') = 'approved'

    union all

    -- 5) Personas que me mencionaron
    select n.actor_id, 58::integer, 'mentioned_you'::text
    from public.notifications n
    where n.user_id = actor_id
      and n.actor_id is not null
      and n.actor_id <> actor_id
      and n.type = 'forum_mention'

    union all

    -- 6) Personas que yo mencioné
    select n.user_id, 52::integer, 'you_mentioned'::text
    from public.notifications n
    where n.actor_id = actor_id
      and n.user_id <> actor_id
      and n.type = 'forum_mention'

    union all

    -- 7) Búsqueda directa limitada: normal solo desde 2 letras; admin puede buscar amplio.
    select
      pp.id,
      case when can_search_broad then 38 else 22 end::integer,
      case when can_search_broad then 'admin_search' else 'search' end::text
    from public.public_profiles pp
    where pp.id <> actor_id
      and pp.username is not null
      and (can_search_broad or length(q) >= 2)
      and (
        q = ''
        or lower(pp.username) like q || '%'
        or lower(coalesce(pp.full_name, '')) like '%' || q || '%'
      )
  ),
  filtered_candidates as (
    select
      pp.id,
      pp.username::text,
      pp.full_name::text,
      pp.photo_url::text,
      pp.role::text,
      rc.candidate_score,
      rc.candidate_reason
    from raw_candidates rc
    join public.public_profiles pp on pp.id = rc.candidate_id
    where pp.id <> actor_id
      and pp.username is not null
      and (
        q = ''
        or lower(pp.username) like q || '%'
        or lower(coalesce(pp.full_name, '')) like '%' || q || '%'
      )
  ),
  ranked as (
    select distinct on (fc.id)
      fc.id,
      fc.username,
      fc.full_name,
      fc.photo_url,
      fc.role,
      fc.candidate_score,
      fc.candidate_reason
    from filtered_candidates fc
    order by fc.id, fc.candidate_score desc
  )
  select
    r.id,
    r.username,
    r.full_name,
    r.photo_url,
    r.role,
    r.candidate_score as score,
    r.candidate_reason as reason
  from ranked r
  order by r.candidate_score desc, lower(r.username) asc
  limit v_limit;
end;
$$;

grant execute on function public.search_mention_candidates_v4046(text, integer) to authenticated;
