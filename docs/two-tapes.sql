-- ============================================================
-- THE TWO TAPES — the person and the property are different
-- stocks. Run after one-engine.sql.
--
-- Until now one number carried both: a member's listing showed
-- its OWNER's points, so two listings under one account printed
-- identical prices (mccluster and Shiloh both $11.32 — same
-- owner). This paste splits them:
--
--   THE PERSON  (score_snapshots, one per member)
--     interactions + identity + world + sales book + TRUST
--     — who you are and how you move. Shown on your profile.
--   THE LISTING (listing_snapshots, one per property)
--     its plays + money paid to IT — what the property earns.
--     This is the price on the floor.
--
-- Listing tapes start printing today — honest from line one.
-- Safe to re-run; ends by writing both tapes.
-- ============================================================

-- ---------- the property's own tape ----------
create table if not exists public.listing_snapshots (
  slug  text not null,
  at    date not null default current_date,
  price numeric not null default 0,
  parts jsonb not null default '{}'::jsonb,
  primary key (slug, at)
);
alter table public.listing_snapshots enable row level security;
drop policy if exists "the tape is public" on public.listing_snapshots;
create policy "the tape is public" on public.listing_snapshots for select using (true);
-- no insert policy: only snapshot_all() writes the tape

-- ---------- what the PROPERTY earns ----------
create or replace function public.listing_points(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare played numeric := 0; money numeric := 0; total numeric;
begin
  if p_slug is null then return null; end if;
  begin
    select coalesce(sum(tp.plays), 0) into played from track_plays tp
     where tp.slug = lower(regexp_replace(p_slug, '[^a-zA-Z0-9]', '', 'g'));
  exception when others then played := 0; end;
  begin
    select coalesce(sum(dp.gross), 0) * 100 into money
      from deal_payments dp
      join deals d on d.id = dp.deal_id
     where d.to_slug = p_slug;
  exception when others then money := 0; end;
  total := round(played + money, 2);
  return jsonb_build_object('points', total, 'parts', jsonb_build_object(
    'plays', round(played), 'money', round(money)));
end;
$$;
grant execute on function public.listing_points(text) to authenticated;

-- ---------- the PERSON: money and plays move out, trust stays ----------
create or replace function public.game_points(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  evt numeric := 0; ident numeric := 0; world numeric := 0;
  sales numeric := 0; trust numeric := 0; total numeric;
begin
  if p_owner is null then return null; end if;
  begin
    select coalesce(sum(least(c.n, coalesce(w.cap_day, 40)) * coalesce(w.pts, 0.5)), 0)
      into evt
      from (select e.name, date(e.at) as d, count(*) as n
              from events e where e.uid = p_owner group by 1, 2) c
      left join game_weights w on w.name = c.name;
  exception when others then evt := 0; end;
  begin
    select coalesce(sum(case when verified then 250 else 100 end), 0) into ident
      from member_identifiers where owner = p_owner;
  exception when others then ident := 0; end;
  begin
    select coalesce(10 * n_log(sum(v.value), 1000000), 0) into world
      from (select distinct on (source, kind) value
              from external_signals where owner = p_owner
             order by source, kind, at desc) v;
  exception when others then world := 0; end;
  world := least(world, 1000);
  begin
    select coalesce(sum(gross), 0) * 10 into sales from earnings_reports where owner = p_owner;
  exception when others then sales := 0; end;
  sales := least(sales, 20000);
  begin
    trust := coalesce((street_score(p_owner) ->> 'score')::numeric, 0) * 2;
  exception when others then trust := 0; end;
  trust := least(trust, 2000);
  total := round(evt + ident + world + sales + trust, 2);
  return jsonb_build_object('points', total, 'parts', jsonb_build_object(
    'interactions', round(evt), 'identity', round(ident), 'world', round(world),
    'sales', round(sales), 'trust', round(trust)));
end;
$$;
grant execute on function public.game_points(uuid) to authenticated;

-- ---------- the nightly writer fills BOTH tapes ----------
create or replace function public.snapshot_all()
returns int language plpgsql security definer set search_path = public as $$
declare r record; s jsonb; g jsonb; l jsonb; n int := 0;
begin
  if not (coalesce(auth.jwt() ->> 'email', '') = 'matthew@mccluster.org'
          or auth.uid() is null) then
    raise exception 'the desk writes the tape';
  end if;
  -- the people
  for r in select distinct owner from providers where owner is not null loop
    s := street_score(r.owner);
    g := game_points(r.owner);
    insert into score_snapshots (owner, at, score, ticker, parts)
    values (r.owner, current_date, (s ->> 'score')::int,
            game_price((g ->> 'points')::numeric),
            (s -> 'pillars') || jsonb_build_object('points', (g ->> 'points')::numeric, 'game', g -> 'parts'))
    on conflict (owner, at) do update
      set score = excluded.score, ticker = excluded.ticker, parts = excluded.parts;
    n := n + 1;
  end loop;
  -- the properties
  for r in select slug from providers where owner is not null and status = 'live' loop
    l := listing_points(r.slug);
    insert into listing_snapshots (slug, at, price, parts)
    values (r.slug, current_date, game_price((l ->> 'points')::numeric),
            jsonb_build_object('points', (l ->> 'points')::numeric) || (l -> 'parts'))
    on conflict (slug, at) do update
      set price = excluded.price, parts = excluded.parts;
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.snapshot_all() to authenticated;

-- ---------- the floor reads the LISTING tape; the person rides along ----------
drop function if exists public.score_board(int);
create or replace function public.score_board(p_limit int default 100)
returns table (slug text, ticker text, name text, score int, price numeric,
               person_price numeric, at date, series jsonb, parts jsonb)
language sql stable security definer set search_path = public as $$
  select p.slug, p.ticker, p.name,
         s.score, l.price, s.ticker as person_price, l.at,
         (select coalesce(jsonb_agg(jsonb_build_object('d', h.at, 'v', h.price) order by h.at), '[]'::jsonb)
            from (select ls.at, ls.price from listing_snapshots ls
                   where ls.slug = p.slug order by ls.at desc limit 400) h) as series,
         l.parts
  from providers p
  join lateral (select price, at, parts from listing_snapshots ls
                 where ls.slug = p.slug order by at desc limit 1) l on true
  left join lateral (select score, ticker from score_snapshots ss
                      where ss.owner = p.owner order by at desc limit 1) s on true
  where p.owner is not null and p.status = 'live'
  order by l.price desc, s.score desc nulls last
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
grant execute on function public.score_board(int) to anon, authenticated;

-- ---------- my_score: both numbers, clearly named ----------
create or replace function public.my_score()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; g jsonb; prev int; lst jsonb;
begin
  if auth.uid() is null then return null; end if;
  s := street_score(auth.uid());
  g := game_points(auth.uid());
  select score into prev from score_snapshots
   where owner = auth.uid() and at <= current_date - 30
   order by at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', p.slug, 'ticker', upper(coalesce(p.ticker, '')), 'price', coalesce(l.price, 0))), '[]'::jsonb)
    into lst
    from providers p
    left join lateral (select price from listing_snapshots ls
                        where ls.slug = p.slug order by at desc limit 1) l on true
   where p.owner = auth.uid();
  return s || jsonb_build_object(
    'price', game_price((g ->> 'points')::numeric),
    'points', (g ->> 'points')::numeric,
    'game', g -> 'parts',
    'listings', lst,
    'prev_30d', prev);
end;
$$;
grant execute on function public.my_score() to authenticated;

-- both tapes print now
select snapshot_all() as lines_written;

-- self-check: every LISTING carries its own price; the person rides
-- in person_price — two owners' listings no longer twin
select slug, ticker, price as listing_price, person_price, score as street_credit
  from score_board(10);
