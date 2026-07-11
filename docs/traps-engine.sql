-- ============================================================
-- T.R.A.P.S. ENGINE v2 — every mission on the board is REAL.
-- The audit found the wound: the desk shows 26 missions worth
-- 975 E⤴, but the old claim_gauntlet() only verified 10 keys
-- worth 5 E⤴ total — sixteen missions could never complete,
-- never save, never pay. This paste replaces the engine:
--   · all 26 keys verified against the REAL tables (never the
--     honor system) — a missing table just reads as not-yet-done
--   · pays the board's exact values: 975 E⤴ = 97,500 points
--   · tops up anyone the old engine shorted (monotonic: a
--     mission's pay only ever grows, never double-mints)
--   · gauntlet credit registered GOLD (the two-color law)
--   · game_points() v3: mission pay lands on the SCOREBOARD —
--     1 E⤴ = 100 points on the tape, live
-- Safe to re-run.
-- ============================================================

-- the two-color law learns the engine's reason strings
insert into public.credit_colors (reason, color) values
  ('gauntlet award', 'gold'),
  ('claim_run', 'gold')
on conflict (reason) do nothing;

-- the pay window: only the engine calls this (definer-context only —
-- no role holds EXECUTE, so it cannot be dialed from outside)
create or replace function public.gauntlet_pay(p_key text, p_amt numeric)
returns void language sql security definer set search_path = public as $$
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), p_amt, 'gauntlet award', 'gauntlet:' || p_key)
  on conflict (owner, ref, reason) do update
    set delta = greatest(mtoken_ledger.delta, excluded.delta);
$$;
revoke all on function public.gauntlet_pay(text, numeric) from public, anon, authenticated;

create or replace function public.claim_gauntlet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me record;
  done jsonb := '[]'::jsonb;
  before_total numeric;
  after_total numeric;
  ok boolean;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select slug, ticker, status into me from providers where owner = auth.uid() limit 1;
  select coalesce(sum(delta), 0) into before_total
    from mtoken_ledger where owner = auth.uid() and reason = 'gauntlet award';

  -- ---- THE WALK-IN · 100 ----
  ok := false; begin select exists(select 1 from events where uid = auth.uid() and name = 'welcome_done') into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('walk_in'::text); perform public.gauntlet_pay('walk_in', 20); end if;

  ok := false; begin select exists(select 1 from providers where owner = auth.uid() and coalesce(headline, '') <> '') into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('card_live'::text); perform public.gauntlet_pay('card_live', 20); end if;

  ok := false; begin select exists(select 1 from agreements where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('signed'::text); perform public.gauntlet_pay('signed', 15); end if;

  ok := false; begin select exists(select 1 from push_subs where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('push_on'::text); perform public.gauntlet_pay('push_on', 10); end if;

  ok := false; begin select (select count(distinct date(at)) from events where uid = auth.uid()) >= 5 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('explorer'::text); perform public.gauntlet_pay('explorer', 35); end if;

  -- ---- THE IDENTITY · 150 ----
  ok := coalesce(me.ticker, '') <> '';
  if ok then done := done || to_jsonb('ticker_claimed'::text); perform public.gauntlet_pay('ticker_claimed', 25); end if;

  ok := false; begin select exists(select 1 from member_identifiers where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_id'::text); perform public.gauntlet_pay('first_id', 40); end if;

  ok := false; begin select (select count(distinct kind) from member_identifiers where owner = auth.uid()) >= 3 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('id_stack'::text); perform public.gauntlet_pay('id_stack', 45); end if;

  ok := false; begin select exists(select 1 from member_badges where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('badge_applied'::text); perform public.gauntlet_pay('badge_applied', 40); end if;

  -- ---- THE CRAFT · 150 ----
  ok := false; begin select exists(select 1 from posts where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_post'::text); perform public.gauntlet_pay('first_post', 25); end if;

  ok := false; begin select (select count(*) from posts where owner = auth.uid()) >= 3 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('on_the_wire'::text); perform public.gauntlet_pay('on_the_wire', 30); end if;

  ok := false; begin select exists(select 1 from rack where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_track'::text); perform public.gauntlet_pay('first_track', 45); end if;

  ok := coalesce(me.status, '') = 'live';
  if ok then done := done || to_jsonb('listing_live'::text); perform public.gauntlet_pay('listing_live', 50); end if;

  -- ---- THE BUSINESS · 255 ----
  ok := false; begin select exists(select 1 from deals where from_owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_deal'::text); perform public.gauntlet_pay('first_deal', 40); end if;

  ok := false; begin select exists(select 1 from deals where (from_owner = auth.uid() or to_slug = coalesce(me.slug, '___'))
    and status in ('signed', 'completed')) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('deal_signed'::text); perform public.gauntlet_pay('deal_signed', 60); end if;

  ok := false; begin select exists(select 1 from member_connections where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('distro_connected'::text); perform public.gauntlet_pay('distro_connected', 50); end if;

  ok := false; begin select exists(select 1 from earnings_reports where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('earnings_filed'::text); perform public.gauntlet_pay('earnings_filed', 60); end if;

  ok := false; begin select exists(select 1 from providers where owner = auth.uid() and coalesce(stripe_acct, '') <> '') into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('payouts_armed'::text); perform public.gauntlet_pay('payouts_armed', 45); end if;

  -- ---- THE COMMUNITY · 200 ----
  ok := false; begin select exists(select 1 from civic_profiles where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('civic_card'::text); perform public.gauntlet_pay('civic_card', 30); end if;

  ok := false; begin select exists(select 1 from proposal_votes where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_vote'::text); perform public.gauntlet_pay('first_vote', 40); end if;

  ok := false; begin select exists(select 1 from proposals where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('proposal_filed'::text); perform public.gauntlet_pay('proposal_filed', 40); end if;

  ok := false; begin select exists(select 1 from providers g
      where g.referred_by is not null
        and upper(g.referred_by) in (nullif(upper(coalesce(me.ticker, '')), ''),
                                     nullif(upper(coalesce(me.slug, '')), ''))) into ok;
  exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_plug'::text); perform public.gauntlet_pay('first_plug', 50); end if;

  ok := false; begin select exists(select 1 from guide_chats where owner = auth.uid() and role = 'user') into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('guide_talk'::text); perform public.gauntlet_pay('guide_talk', 40); end if;

  -- ---- THE SCHOLAR · 120 ----
  ok := false; begin select (select count(*) from web3_progress where owner = auth.uid()) >= 3 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('scholar_3'::text); perform public.gauntlet_pay('scholar_3', 50); end if;

  ok := false; begin select (select count(*) from web3_progress where owner = auth.uid()) >= 6 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('scholar_6'::text); perform public.gauntlet_pay('scholar_6', 40); end if;

  ok := false; begin select exists(select 1 from gas_grants where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('gas_wallet'::text); perform public.gauntlet_pay('gas_wallet', 30); end if;

  select coalesce(sum(delta), 0) into after_total
    from mtoken_ledger where owner = auth.uid() and reason = 'gauntlet award';

  return jsonb_build_object('done', done,
    'minted', after_total - before_total,
    'paid_total', after_total);
end;
$$;
grant execute on function public.claim_gauntlet() to authenticated;

-- ============================================================
-- THE SCOREBOARD LEARNS THE TRAP — game_points v3: mission pay
-- (and the claim-run bonus) rides onto the live tape at the
-- standing law, 1 E⤴ = 100 points. Everything else unchanged.
-- ============================================================
create or replace function public.game_points(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  evt numeric := 0; played numeric := 0; money numeric := 0;
  ident numeric := 0; world numeric := 0; trap numeric := 0; total numeric;
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

  -- THE TRAP PAYS ON THE BOARD: mission credit + the claim run —
  -- 1 E⤴ = 100 points, live on the tape (the stake is a LOAN and
  -- deliberately does not score)
  begin
    select coalesce(sum(delta), 0) * 100 into trap
      from mtoken_ledger
     where owner = p_owner and delta > 0
       and reason in ('gauntlet award', 'claim_run');
  exception when others then trap := 0; end;

  total := round(evt + played + money + ident + world + trap, 2);
  return jsonb_build_object('points', total, 'parts', jsonb_build_object(
    'interactions', round(evt), 'plays', round(played), 'money', round(money),
    'identity', round(ident), 'world', round(world), 'missions', round(trap)));
end;
$$;

-- self-check: expect 3 · 2
select count(*) as engine_fns from pg_proc where proname in ('claim_gauntlet', 'gauntlet_pay', 'game_points');
select count(*) as gold_engine_reasons from credit_colors where reason in ('gauntlet award', 'claim_run') and color = 'gold';
