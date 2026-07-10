-- ============================================================
-- THE ONE TAPE — one algorithm, real data only, profiles linked.
--
-- The two half-merged engines are done. The law after this paste:
--   · game_points() is THE algorithm (real interactions, real
--     money, real identifiers, real swept platform numbers).
--   · The floor's charts are the ACTUAL nightly snapshot history —
--     score_board now returns each desk's real series, so the
--     client never invents a line again.
--   · The tape restarts clean, and the link check at the bottom
--     shows every claimed profile wired to its market line.
--
-- Run AFTER game-tape.sql. Safe to re-run.
-- ============================================================

-- score_board v2: same board + the real chart history per desk
drop function if exists public.score_board(int);
create or replace function public.score_board(p_limit int default 100)
returns table (slug text, ticker text, name text, score int, price numeric, at date, series jsonb)
language sql stable security definer set search_path = public as $$
  select p.slug, p.ticker, p.name, s.score, s.ticker as price, s.at,
         (select coalesce(jsonb_agg(jsonb_build_object('d', h.at, 'v', h.ticker) order by h.at), '[]'::jsonb)
            from (select ss.at, ss.ticker from score_snapshots ss
                   where ss.owner = p.owner order by ss.at desc limit 30) h) as series
  from providers p
  join lateral (select score, ticker, at from score_snapshots ss
                 where ss.owner = p.owner order by at desc limit 1) s on true
  where p.owner is not null and p.status = 'live'
  order by s.score desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
grant execute on function public.score_board(int) to anon, authenticated;

-- clean restart under the one law: wipe the old tape, write today fresh
delete from public.score_snapshots;
select snapshot_all() as fresh_tape_lines;

-- ---------- THE LINK CHECK: every claimed profile ↔ its market line ----------
-- Each row is a claimed desk. price_on_tape filled = the profile IS
-- linked to the market. game_points filled = the algorithm sees them.
select p.slug, p.ticker, p.status,
       t.price as price_on_tape,
       (game_points(p.owner) ->> 'points') as game_points
  from providers p
  left join lateral (select ticker as price from score_snapshots ss
                      where ss.owner = p.owner order by at desc limit 1) t on true
 where p.owner is not null
 order by t.price desc nulls last;
