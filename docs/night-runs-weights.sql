-- ============================================================
-- NIGHT RUNS PAYS REAL — the game's events join the price list.
-- Run after game-tape.sql. A signed-in member's deliveries and
-- cleared shifts feed their game points, which move their ticker.
-- Capped per day like everything else on the list. Safe to re-run.
-- ============================================================
insert into public.game_weights (name, pts, cap_day) values
  ('nr_boot',     1,    3),
  ('nr_delivery', 5,   40),
  ('nr_shift',   15,   12),
  ('nr_knockout', 1,   60),
  ('nr_smoke',  0.5,   20),
  ('nr_out',      1,   10)
on conflict (name) do update set pts = excluded.pts, cap_day = excluded.cap_day;

-- self-check: expect 6
select count(*) as night_runs_paying from game_weights where name like 'nr_%';
