-- ============================================================
-- THE LONG TAPE + THE OPEN BOOKS — run after one-tape.sql.
--
-- 1) score_board v3: up to 400 real snapshots per desk (a year+
--    of history for the new timebar) AND the points breakdown
--    (parts), so any surface can show exactly WHY a price is
--    what it is. Transparency is the product.
-- 2) THE SALES BOOK counts: game_points gains a 'sales' term —
--    declared gross from earnings_reports at 10 pts per unit.
--    Webhook-captured money stays 100/unit; declared money is
--    real but self-reported, so it weighs a tenth and caps at
--    20,000 pts ($200 of price). Honest, visible, labeled.
-- Safe to re-run. Ends by refreshing today's tape.
-- ============================================================

create or replace function public.game_points(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  evt numeric := 0; played numeric := 0; money numeric := 0;
  ident numeric := 0; world numeric := 0; sales numeric := 0; total numeric;
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
  -- THE SALES BOOK: every report a member files joins the price
  begin
    select coalesce(sum(gross), 0) * 10 into sales from earnings_reports where owner = p_owner;
  exception when others then sales := 0; end;
  sales := least(sales, 20000);
  total := round(evt + played + money + ident + world + sales, 2);
  return jsonb_build_object('points', total, 'parts', jsonb_build_object(
    'interactions', round(evt), 'plays', round(played), 'money', round(money),
    'identity', round(ident), 'world', round(world), 'sales', round(sales)));
end;
$$;
grant execute on function public.game_points(uuid) to authenticated;

-- score_board v3: the long series + the open breakdown
drop function if exists public.score_board(int);
create or replace function public.score_board(p_limit int default 100)
returns table (slug text, ticker text, name text, score int, price numeric, at date, series jsonb, parts jsonb)
language sql stable security definer set search_path = public as $$
  select p.slug, p.ticker, p.name, s.score, s.ticker as price, s.at,
         (select coalesce(jsonb_agg(jsonb_build_object('d', h.at, 'v', h.ticker) order by h.at), '[]'::jsonb)
            from (select ss.at, ss.ticker from score_snapshots ss
                   where ss.owner = p.owner order by ss.at desc limit 400) h) as series,
         s.parts
  from providers p
  join lateral (select score, ticker, at, parts from score_snapshots ss
                 where ss.owner = p.owner order by at desc limit 1) s on true
  where p.owner is not null and p.status = 'live'
  order by s.score desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
grant execute on function public.score_board(int) to anon, authenticated;

-- today's tape refreshes so the sales term lands immediately
select snapshot_all() as refreshed_lines;

-- self-check: expect a parts object naming all six components
select slug, price, parts from score_board(3);
