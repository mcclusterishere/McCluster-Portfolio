-- ============================================================
-- THE SCORE ENGINE + THE ONE CARD — the glue that makes the
-- whole machine agree with itself.
--
-- Two things every surface has been reaching for separately:
--
--   street_score()  ONE number (0–1000) computed ONLY from spines
--                   the hardening made unforgeable: real captured
--                   money, verified identifiers, deduped plays,
--                   head-counted votes, webhook-recorded deals.
--                   Six pillars, log-curved, confidence-capped.
--
--   my_card()       ONE call that answers "who am I here?" across
--                   every table — listing, ticker, supporter handle,
--                   balances (all colors), equity stake, vault fed,
--                   identifier power, academy progress, gas grant,
--                   score. The client stops making six round trips.
--
-- Plus score_snapshots (the daily tape momentum + charts ride on),
-- ticker_price (score → $5.00–$100.00 standing index, momentum
-- swings ±25%), snapshot_all() for the desk/cron, and a guarded
-- pg_cron schedule so the tape writes itself nightly.
--
-- EVERY pillar is wrapped so missing schemas count zero instead of
-- erroring: this file runs correctly no matter which other pastes
-- have landed. Run it LAST, after hardening-schema. Safe to re-run.
--
-- The honest label: this is a REPUTATION index and a standing
-- price, not a credit score in the FCRA sense and not a security.
-- Never wire it to lending/housing/employment decisions.
-- ============================================================

-- ---------- the tape: one row per member per day ----------
create table if not exists public.score_snapshots (
  owner  uuid not null,
  at     date not null default current_date,
  score  int not null,
  ticker numeric(8,2) not null,
  parts  jsonb default '{}'::jsonb,
  primary key (owner, at)
);
alter table public.score_snapshots enable row level security;
drop policy if exists "snapshots are public" on public.score_snapshots;
create policy "snapshots are public"
  on public.score_snapshots for select using (true);
-- no insert policy: only snapshot_all() below writes the tape

-- ---------- the curve: log-normalized 0–100 ----------
create or replace function public.n_log(x numeric, c numeric)
returns numeric language sql immutable as $$
  select least(100, greatest(0,
    case when coalesce(x,0) <= 0 or coalesce(c,0) <= 0 then 0
         else 100 * ln(1 + x) / ln(1 + c) end));
$$;

-- ---------- THE SCORE: six pillars, one number ----------
create or replace function public.street_score(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  capital numeric := 0; craft numeric := 0; reach numeric := 0;
  community numeric := 0; consistency numeric := 0; cosign numeric := 0;
  gross90 numeric := 0; gross_all numeric := 0; eq_pts numeric := 0;
  fams int := 0; vfams int := 0;
  followers int := 0; plays bigint := 0; reacts bigint := 0;
  refs int := 0; votes int := 0; postn int := 0; collabs int := 0;
  days30 int := 0; age_days int := 0;
  lessons int := 0; grant_sent boolean := false; signed boolean := false;
  confidence numeric; score int; raw numeric;
begin
  if p_owner is null then return null; end if;

  -- CAPITAL (0.30): real captured money for their desks + equity stake.
  -- deal_payments is webhook-written on the service role — unforgeable.
  begin
    select coalesce(sum(dp.gross) filter (where dp.at > now() - interval '90 days'), 0),
           coalesce(sum(dp.gross), 0)
      into gross90, gross_all
      from deal_payments dp
      join deals d on d.id = dp.deal_id
      join providers p on p.slug = d.to_slug
     where p.owner = p_owner;
  exception when undefined_table or undefined_column then null; end;
  begin
    select coalesce(sum(points), 0) into eq_pts from equity_ledger where owner = p_owner;
  exception when undefined_table then null; end;
  capital := 0.60 * n_log(gross90, 10000) + 0.25 * n_log(eq_pts, 5000) + 0.15 * n_log(gross_all, 50000);

  -- CRAFT (0.15): the identifier locker — families held, verified doubled.
  begin
    select count(distinct kind), count(distinct kind) filter (where verified)
      into fams, vfams
      from member_identifiers where owner = p_owner
       and kind in ('isrc_prefix','isrc','iswc','upc','ipi','isni',
                    'spotify_artist','youtube_channel','pro','publisher');
  exception when undefined_table then null; end;
  craft := least(100, fams * 10 + vfams * 10);

  -- REACH (0.15): followers + deduped plays + reactions their posts earned.
  begin
    select count(*) into followers from follows f
     where f.creator_slug in (select slug from providers where owner = p_owner);
  exception when undefined_table then null; end;
  begin
    select coalesce(sum(tp.plays), 0) into plays from track_plays tp
     where tp.slug in (select lower(regexp_replace(coalesce(slug,''),'[^a-zA-Z0-9]','','g'))
                         from providers where owner = p_owner);
  exception when undefined_table then null; end;
  begin
    select count(*) into reacts from post_reactions r
      join posts po on po.id = r.post_id where po.owner = p_owner;
  exception when undefined_table then null; end;
  reach := 0.50 * n_log(followers, 5000) + 0.30 * n_log(plays, 10000) + 0.20 * n_log(reacts, 500);

  -- COMMUNITY (0.15): plugs brought, votes cast, posts, locked collabs.
  begin
    select count(*) into refs from providers g
     where g.referred_by is not null and upper(g.referred_by) in (
       select upper(x) from (
         select ticker as x from providers where owner = p_owner and coalesce(ticker,'') <> ''
         union select slug from providers where owner = p_owner and coalesce(slug,'') <> '') t);
  exception when undefined_table or undefined_column then null; end;
  begin
    select count(*) into votes from proposal_votes where owner = p_owner;
  exception when undefined_table then null; end;
  begin
    select count(*) into postn from posts where owner = p_owner;
  exception when undefined_table then null; end;
  begin
    select count(*) into collabs from record_splits s
      join records r on r.id = s.record_id and r.status = 'locked'
     where s.party_owner = p_owner and s.accepted;
  exception when undefined_table then null; end;
  community := 0.30 * n_log(refs, 50) + 0.20 * n_log(votes, 50)
             + 0.20 * n_log(postn, 100) + 0.30 * n_log(collabs, 20);

  -- CONSISTENCY (0.10): shows up, keeps showing up.
  begin
    select count(distinct date(at)) into days30 from events
     where uid = p_owner and at > now() - interval '30 days';
  exception when undefined_table or undefined_column then null; end;
  begin
    select coalesce(extract(day from now() - min(created_at)), 0)::int
      into age_days from providers where owner = p_owner;
  exception when undefined_table then null; end;
  consistency := 0.60 * least(100, days30 * 100.0 / 30) + 0.40 * n_log(age_days, 730);

  -- COSIGN (0.15): third-party trust — verified families, the academy,
  -- a fulfilled gas grant, the Member Agreement on the record.
  begin
    select count(*) into lessons from web3_progress where owner = p_owner;
  exception when undefined_table then null; end;
  begin
    select exists(select 1 from gas_grants where owner = p_owner and status = 'sent') into grant_sent;
  exception when undefined_table then null; end;
  begin
    select exists(select 1 from agreements where owner = p_owner) into signed;
  exception when undefined_table then null; end;
  cosign := least(100, vfams * 15 + least(lessons, 6) * 5
                       + (case when grant_sent then 10 else 0 end)
                       + (case when signed then 10 else 0 end));

  -- the cold-start cap: a fresh account can't flash 900.
  confidence := least(1.0, 0.4 + (vfams
    + (case when gross_all > 0 then 3 else 0 end)
    + (case when lessons >= 6 then 1 else 0 end)
    + (case when signed then 1 else 0 end)) / 10.0);

  raw := 0.30 * capital + 0.15 * craft + 0.15 * reach
       + 0.15 * community + 0.10 * consistency + 0.15 * cosign;
  score := round(1000 * (raw / 100) * confidence);

  return jsonb_build_object(
    'score', score,
    'confidence', round(confidence, 2),
    'pillars', jsonb_build_object(
      'capital', round(capital), 'craft', round(craft), 'reach', round(reach),
      'community', round(community), 'consistency', round(consistency), 'cosign', round(cosign))
  );
end;
$$;
grant execute on function public.street_score(uuid) to authenticated;

-- ---------- score → standing price ($5.00–$100.00, momentum ±25%) ----------
create or replace function public.ticker_price(p_score int, p_prev int)
returns numeric language sql immutable as $$
  select round(
    (5 + (least(1000, greatest(0, coalesce(p_score, 0))) / 1000.0) * 95)
    * (1 + least(0.25, greatest(-0.25, (coalesce(p_score,0) - coalesce(p_prev, p_score, 0)) / 1000.0)))
  , 2);
$$;

-- my score, my price, my momentum — the caller's own, one call
create or replace function public.my_score()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; prev int; price numeric;
begin
  if auth.uid() is null then return null; end if;
  s := street_score(auth.uid());
  select score into prev from score_snapshots
   where owner = auth.uid() and at <= current_date - 30
   order by at desc limit 1;
  price := ticker_price((s ->> 'score')::int, prev);
  return s || jsonb_build_object('price', price, 'prev_30d', prev);
end;
$$;
grant execute on function public.my_score() to authenticated;

-- the public board: every listed desk's latest tape line (the floor reads this)
create or replace function public.score_board(p_limit int default 100)
returns table (slug text, ticker text, name text, score int, price numeric, at date)
language sql stable security definer set search_path = public as $$
  select p.slug, p.ticker, p.name, s.score, s.ticker as price, s.at
  from providers p
  join lateral (select score, ticker, at from score_snapshots ss
                 where ss.owner = p.owner order by at desc limit 1) s on true
  where p.owner is not null and p.status = 'live'
  order by s.score desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
grant execute on function public.score_board(int) to anon, authenticated;

-- ---------- the nightly tape: score every claimed desk ----------
create or replace function public.snapshot_all()
returns int language plpgsql security definer set search_path = public as $$
declare r record; s jsonb; prev int; n int := 0;
begin
  -- the desk or the cron writes the tape; nobody else
  if not (coalesce(auth.jwt() ->> 'email', '') = 'matthew@mccluster.org'
          or auth.uid() is null) then
    raise exception 'the desk writes the tape';
  end if;
  for r in select distinct owner from providers where owner is not null loop
    s := street_score(r.owner);
    select score into prev from score_snapshots
     where owner = r.owner and at <= current_date - 30 order by at desc limit 1;
    insert into score_snapshots (owner, at, score, ticker, parts)
    values (r.owner, current_date, (s ->> 'score')::int,
            ticker_price((s ->> 'score')::int, prev), s -> 'pillars')
    on conflict (owner, at) do update
      set score = excluded.score, ticker = excluded.ticker, parts = excluded.parts;
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.snapshot_all() to authenticated;

-- nightly at 09:07 UTC — guarded so this paste succeeds even if
-- pg_cron isn't enabled yet (enable it under Database → Extensions)
do $$ begin
  perform cron.schedule('mcc-score-tape', '7 9 * * *', 'select public.snapshot_all()');
exception when others then
  raise notice 'pg_cron not ready — enable the extension and re-run this block';
end $$;

-- ---------- THE ONE CARD: who am I here, in one call ----------
create or replace function public.my_card()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me jsonb := '{}'::jsonb; bal numeric := 0; earned numeric := 0; redeem numeric := 0;
  fed numeric := 0; eq jsonb; idp jsonb; w3 jsonb; handle text; sc jsonb;
begin
  if auth.uid() is null then return null; end if;
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
        'slug', slug, 'ticker', ticker, 'name', name, 'status', status,
        'roles', to_jsonb(roles), 'area', area) order by created_at), '[]'::jsonb)
      into me from providers where owner = auth.uid();
  exception when undefined_table or undefined_column then me := '[]'::jsonb; end;
  begin
    select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
    select coalesce(sum(delta), 0) into earned from mtoken_ledger
     where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
    select coalesce(sum(-delta), 0) into fed from mtoken_ledger
     where owner = auth.uid() and delta < 0 and reason in ('house_claim', 'platform_fee');
  exception when undefined_table or undefined_function then null; end;
  begin select my_redeemable() into redeem; exception when others then redeem := 0; end;
  begin select my_equity() into eq; exception when others then eq := null; end;
  begin select identifier_power() into idp; exception when others then idp := null; end;
  begin select my_web3() into w3; exception when others then w3 := null; end;
  begin select s.handle into handle from supporters s where s.owner = auth.uid();
  exception when undefined_table then null; end;
  begin select my_score() into sc; exception when others then sc := null; end;
  return jsonb_build_object(
    'uid', auth.uid(),
    'listings', me,
    'supporter_handle', handle,
    'balance', bal, 'earned', earned, 'redeemable', redeem,
    'vault_fed', fed,
    'equity', eq,
    'identifier_power', idp,
    'web3', w3,
    'score', sc
  );
end;
$$;
grant execute on function public.my_card() to authenticated;

-- self-checks: expect 1 table · 6 functions
select count(*) as tape_ready from information_schema.tables where table_name = 'score_snapshots';
select count(*) as engine_ready from pg_proc
 where proname in ('street_score','ticker_price','my_score','score_board','snapshot_all','my_card');
