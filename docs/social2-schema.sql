-- ============================================================
-- THE WIRE, LOUDER — reactions + the whole floor's feed.
--
-- Two additions to the social layer (docs/social-schema.sql):
--   1) REACTIONS — anyone with an account taps ❤️ 🔥 📈 on a post.
--      One reaction per member per post per kind; tap again to take
--      it back. Counts are public.
--   2) THE WIRE — one public feed of every creator's posts across
--      the whole floor, newest first, each carrying the creator's
--      name/photo and its reaction counts. One call feeds the page.
--
-- Paste whole into Supabase → SQL editor → Run. Safe to re-run.
-- Requires: social-schema.sql (posts, supporters, comments).
-- ============================================================

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  owner   uuid not null default auth.uid(),
  kind    text not null check (kind in ('heart','fire','up')),
  at      timestamptz default now(),
  primary key (post_id, owner, kind)
);
alter table public.post_reactions enable row level security;
drop policy if exists "reaction counts are public" on public.post_reactions;
create policy "reaction counts are public"
  on public.post_reactions for select using (true);
drop policy if exists "members react" on public.post_reactions;
create policy "members react"
  on public.post_reactions for insert to authenticated
  with check (owner = auth.uid());
drop policy if exists "members take reactions back" on public.post_reactions;
create policy "members take reactions back"
  on public.post_reactions for delete
  using (owner = auth.uid());

-- toggle in one motion: react if you haven't, un-react if you have
create or replace function public.react(p_post uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
declare removed int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_kind not in ('heart','fire','up') then raise exception 'heart, fire, or up'; end if;
  delete from post_reactions where post_id = p_post and owner = auth.uid() and kind = p_kind;
  get diagnostics removed = row_count;
  if removed > 0 then return false; end if;   -- taken back
  insert into post_reactions (post_id, owner, kind) values (p_post, auth.uid(), p_kind);
  return true;                                 -- landed
end;
$$;
grant execute on function public.react(uuid, text) to authenticated;

-- THE WIRE: the whole floor's posts, newest first, with the byline and
-- the counts. Public — the feed IS the front porch of the network.
create or replace function public.wire_feed(p_limit int default 40)
returns table (
  id uuid, slug text, body text, created_at timestamptz,
  creator text, photo text,
  hearts bigint, fires bigint, ups bigint, comments bigint, my_reactions jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.slug, p.body, p.created_at,
    coalesce(pr.name, p.slug) as creator,
    pr.photo,
    (select count(*) from post_reactions r where r.post_id = p.id and r.kind = 'heart') as hearts,
    (select count(*) from post_reactions r where r.post_id = p.id and r.kind = 'fire')  as fires,
    (select count(*) from post_reactions r where r.post_id = p.id and r.kind = 'up')    as ups,
    (select count(*) from comments c where c.post_id = p.id) as comments,
    coalesce((select jsonb_agg(r.kind) from post_reactions r
       where r.post_id = p.id and r.owner = auth.uid()), '[]'::jsonb) as my_reactions
  from posts p
  left join providers pr on pr.slug = p.slug
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;
grant execute on function public.wire_feed(int) to anon, authenticated;

-- self-checks: expect 1 · 2
select count(*) as reactions_table from information_schema.tables where table_name = 'post_reactions';
select count(*) as wire_fns from pg_proc where proname in ('react', 'wire_feed');
