-- ============================================================
-- THE GAME TAPE — the market IS the game.
--
-- The old standing price ($5–$100 off the reputation score) is
-- retired. The new law: every desk's price starts at $0.00 and
-- climbs with the record — every quiz answered, song played, run
-- delivered, post reacted to, dollar earned. 100 game points move
-- the price $1, the same 100-points-to-the-dollar law the Trap
-- already runs on.
--
--   game_weights   the public price list: what each interaction
--                  pays and its per-day cap (loops can't print).
--   game_points()  one member's whole interaction record, totaled.
--   game_price()   points → dollars on the tape (pts / 100).
--   my_score()     now returns points + game price on top of the
--                  six reputation pillars (score stays 0–1000).
--   snapshot_all() writes the GAME price to the nightly tape.
--
-- Anti-forgery: client events are capped hard per day; the heavy
-- points come from spines nobody can fake — webhook-captured
-- dollars, verified identifiers, deduped plays, swept platform
-- numbers. Run AFTER score-schema.sql (it reuses n_log and the
-- snapshots table). Safe to re-run. Ends by resetting the tape so
-- every desk restarts at its true record.
-- ============================================================

-- ---------- the price list: what every interaction pays ----------
create table if not exists public.game_weights (
  name    text primary key,
  pts     numeric not null default 0.5,
  cap_day int not null default 40
);
alter table public.game_weights enable row level security;
drop policy if exists "the price list is public" on public.game_weights;
create policy "the price list is public" on public.game_weights for select using (true);
-- no write policy: the desk tunes this from the SQL editor only

insert into public.game_weights (name, pts, cap_day) values
  -- study: quizzes and lessons are the heaviest everyday earn
  ('quiz_answer',        25,   24),
  ('marker_quiz',        25,   24),
  ('ow_marker',          25,    9),
  ('mcity_badge',        50,    4),
  ('web3_lesson',       100,    6),
  ('welcome_done',      200,    1),
  ('welcome_step',        2,   30),
  ('tour_done',         100,    1),
  ('verify_submit',      50,    5),
  -- sound: playing the records
  ('track_play',          5,   60),
  ('song_start',          2,   60),
  ('docket_song_play',    5,   30),
  -- the game: driving Our World
  ('ow_enter',            5,    3),
  ('ow_run_start',        1,   40),
  ('ow_run_done',        10,   40),
  ('ow_nav',              1,   30),
  -- community: talking, backing, moving on people
  ('wire_post',          10,   10),
  ('wire_react',          2,   40),
  ('foryou_tap',          1,   30),
  ('supporter_created', 100,    1),
  ('spaces_request',     50,    5),
  ('xc_business_filed', 150,    2),
  ('cta_click',           1,   20)
on conflict (name) do update set pts = excluded.pts, cap_day = excluded.cap_day;

-- ---------- the whole record, totaled ----------
create or replace function public.game_points(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  evt numeric := 0; played numeric := 0; money numeric := 0;
  ident numeric := 0; world numeric := 0; total numeric;
begin
  if p_owner is null then return null; end if;

  -- EVERY interaction: each tracked event pays its listed points,
  -- capped per name per day. Unlisted events earn the floor rate
  -- (half a point, 40 a day) — nothing a member does counts zero.
  begin
    select coalesce(sum(least(c.n, coalesce(w.cap_day, 40)) * coalesce(w.pts, 0.5)), 0)
      into evt
      from (select e.name, date(e.at) as d, count(*) as n
              from events e where e.uid = p_owner group by 1, 2) c
      left join game_weights w on w.name = c.name;
  exception when others then evt := 0; end;

  -- THE CROWD: real deduped plays of their tracks — 1 pt each
  begin
    select coalesce(sum(tp.plays), 0) into played from track_plays tp
     where tp.slug in (select lower(regexp_replace(coalesce(slug,''),'[^a-zA-Z0-9]','','g'))
                         from providers where owner = p_owner);
  exception when others then played := 0; end;

  -- REAL MONEY: webhook-captured dollars — $1 earned = 100 pts = $1 on the tape
  begin
    select coalesce(sum(dp.gross), 0) * 100 into money
      from deal_payments dp
      join deals d on d.id = dp.deal_id
      join providers p on p.slug = d.to_slug
     where p.owner = p_owner;
  exception when others then money := 0; end;

  -- IDENTITY: identifiers banked pay 100, verified pay 250
  begin
    select coalesce(sum(case when verified then 250 else 100 end), 0) into ident
      from member_identifiers where owner = p_owner;
  exception when others then ident := 0; end;

  -- THE WORLD OUTSIDE: swept Spotify/YouTube/Last.fm numbers,
  -- log-curved so a million followers is worth $10, not the moon
  begin
    select coalesce(10 * n_log(sum(v.value), 1000000), 0) into world
      from (select distinct on (source, kind) value
              from external_signals where owner = p_owner
             order by source, kind, at desc) v;
  exception when others then world := 0; end;
  world := least(world, 1000);

  total := round(evt + played + money + ident + world, 2);
  return jsonb_build_object('points', total, 'parts', jsonb_build_object(
    'interactions', round(evt), 'plays', round(played), 'money', round(money),
    'identity', round(ident), 'world', round(world)));
end;
$$;
grant execute on function public.game_points(uuid) to authenticated;

-- ---------- points → the price: starts at 0, 100 pts = $1 ----------
create or replace function public.game_price(p_points numeric)
returns numeric language sql immutable as $$
  select round(least(10000, greatest(0, coalesce(p_points, 0))) / 100.0, 2);
$$;
grant execute on function public.game_price(numeric) to anon, authenticated;

-- ---------- my score, my points, my price — one call ----------
create or replace function public.my_score()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; g jsonb; prev int;
begin
  if auth.uid() is null then return null; end if;
  s := street_score(auth.uid());
  g := game_points(auth.uid());
  select score into prev from score_snapshots
   where owner = auth.uid() and at <= current_date - 30
   order by at desc limit 1;
  return s || jsonb_build_object(
    'price', game_price((g ->> 'points')::numeric),
    'points', (g ->> 'points')::numeric,
    'game', g -> 'parts',
    'prev_30d', prev);
end;
$$;
grant execute on function public.my_score() to authenticated;

-- ---------- the nightly tape now writes the GAME price ----------
create or replace function public.snapshot_all()
returns int language plpgsql security definer set search_path = public as $$
declare r record; s jsonb; g jsonb; n int := 0;
begin
  -- the desk or the cron writes the tape; nobody else
  if not (coalesce(auth.jwt() ->> 'email', '') = 'matthew@mccluster.org'
          or auth.uid() is null) then
    raise exception 'the desk writes the tape';
  end if;
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
  return n;
end;
$$;
grant execute on function public.snapshot_all() to authenticated;

-- ---------- THE RESET: every desk restarts at its true record ----------
delete from public.score_snapshots;
select snapshot_all() as fresh_tape_lines;

-- self-checks: expect 2 functions · 23 price-list rows · fresh tape
select count(*) as game_fn from pg_proc where proname in ('game_points','game_price');
select count(*) as price_list from game_weights;
select (select count(*) from score_snapshots) as tape_lines;
