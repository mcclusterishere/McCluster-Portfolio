-- ============================================================
-- THE ONE ENGINE — run after long-tape.sql.
--
-- The inspection found two strong engines running in parallel:
--   street_score()  reputation 0–1000: capital, craft, reach,
--                   community, consistency, cosign × confidence
--   game_points()   the price: interactions, plays, money,
--                   identity, world, sales (100 pts = $1)
-- They read the same real tables but never supported each other.
--
-- THE LOOP this paste closes:
--   activity  → reputation   (posts, votes, deals, showing up
--                             already feed the six pillars)
--   reputation → price       (NEW: the TRUST term — every point
--                             of street credit pays 2 game pts,
--                             up to 2,000 pts = $20 of price)
--   price → activity          (the floor shows the number, the
--                             Trap pays the moves — the machine
--                             motivates the record that started it)
-- One algorithm, six + one components, every piece supporting
-- the others. Safe to re-run; ends by refreshing the tape.
-- ============================================================
create or replace function public.game_points(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  evt numeric := 0; played numeric := 0; money numeric := 0;
  ident numeric := 0; world numeric := 0; sales numeric := 0;
  trust numeric := 0; total numeric;
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
    select coalesce(sum(tp.plays), 0) into played from track_plays tp
     where tp.slug in (select lower(regexp_replace(coalesce(slug,''),'[^a-zA-Z0-9]','','g'))
                         from providers where owner = p_owner);
  exception when others then played := 0; end;
  begin
    select coalesce(sum(dp.gross), 0) * 100 into money
      from deal_payments dp
      join deals d on d.id = dp.deal_id
      join providers p on p.slug = d.to_slug
     where p.owner = p_owner;
  exception when others then money := 0; end;
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
  -- THE TRUST TERM: street credit pays the price directly — the
  -- behavioral/reputation engine and the market engine are one
  begin
    trust := coalesce((street_score(p_owner) ->> 'score')::numeric, 0) * 2;
  exception when others then trust := 0; end;
  trust := least(trust, 2000);
  total := round(evt + played + money + ident + world + sales + trust, 2);
  return jsonb_build_object('points', total, 'parts', jsonb_build_object(
    'interactions', round(evt), 'plays', round(played), 'money', round(money),
    'identity', round(ident), 'world', round(world), 'sales', round(sales),
    'trust', round(trust)));
end;
$$;
grant execute on function public.game_points(uuid) to authenticated;

-- the tape refreshes under the one engine
select snapshot_all() as refreshed_lines;

-- self-check: every desk's parts now carries 'trust' — reputation in the price
select slug, ticker, score as street_credit, price, parts -> 'trust' as trust_pts
  from score_board(10);
