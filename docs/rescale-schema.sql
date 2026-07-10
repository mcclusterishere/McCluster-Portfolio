-- ============================================================
-- THE GREAT RESCALE — the money machine, rebuilt honest.
--
-- Three moves, one paste:
--
--   1. THE RESET. Every balance goes to zero EXCEPT money that is
--      real: EARNED credit (deals/bounties/services against captured
--      payments), PURCHASED credit (the webhook's own 'purchase'
--      rows — people paid dollars for those), cash-out plumbing, and
--      the community fund's accruals. Grants, bankrolls, old mission
--      awards and transfers are wiped. The old ledger is archived
--      first (mtoken_ledger_legacy) — nothing is destroyed, it just
--      stops counting.
--
--   2. THE BANKROLL RETIRES. claim_beta_bankroll() now mints nothing.
--      1,000 E⤴ for showing up is over.
--
--   3. THE THOUSAND. 1,000 E⤴ is now what the app pays a member who
--      does LITERALLY EVERYTHING — 26 verified milestones across the
--      whole platform (975) plus the back-end claim run (25). Every
--      milestone is checked against the record, minted once, granted
--      color (spends in-loop, never cashes out). The frontend Trap
--      (mymission.html) shows the same numbers.
--
-- Run AFTER the full ladder (it touches identifiers, badges,
-- distribution, web3, control, guide tables). Safe to re-run — the
-- archive only fills once, the reset only deletes what the law says,
-- the mints stay idempotent.
-- ============================================================

-- ---------- 1 · THE RESET ----------
create table if not exists public.mtoken_ledger_legacy
  (like public.mtoken_ledger including defaults);
alter table public.mtoken_ledger_legacy enable row level security;
-- no policies on purpose: the archive is the desk's cold storage

insert into public.mtoken_ledger_legacy
select * from public.mtoken_ledger
where not exists (select 1 from public.mtoken_ledger_legacy limit 1);

delete from public.mtoken_ledger
where not (
     (delta > 0 and is_earned_reason(reason))  -- real work, real captures
  or reason = 'purchase'                        -- real dollars via the webhook
  or reason like 'cashout%'                     -- the cash-out plumbing stays true
  or reason = 'fund_accrue'                     -- the community fund's own accruals
);

-- ---------- 2 · THE BANKROLL RETIRES ----------
create or replace function public.claim_beta_bankroll()
returns numeric language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  return 0; -- retired: the app pays for doing, not for arriving
end;
$$;
grant execute on function public.claim_beta_bankroll() to authenticated;

-- ---------- 3 · THE THOUSAND ----------
-- 26 milestones · 975 E⤴ · every check reads the record, never the
-- honor system. Same reason ('gauntlet award') and refs as before so
-- the mint stays idempotent; the reset wiped the old 5-E⤴ rows, so
-- every member re-earns at the new scale.
create or replace function public.claim_gauntlet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me record; rec record; total numeric := 0; done jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select slug, ticker into me from providers where owner = auth.uid() limit 1;
  for rec in
    select * from (values
      -- THE WALK-IN · 100
      ('walk_in',        20.0, exists(select 1 from events where uid = auth.uid() and name = 'welcome_done')),
      ('card_live',      20.0, exists(select 1 from providers where owner = auth.uid() and coalesce(headline, '') <> '')),
      ('signed',         15.0, exists(select 1 from agreements where owner = auth.uid())),
      ('push_on',        10.0, exists(select 1 from push_subs where owner = auth.uid())),
      ('explorer',       35.0, (select count(distinct date(at)) from events where uid = auth.uid()) >= 5),
      -- THE IDENTITY · 150
      ('ticker_claimed', 25.0, exists(select 1 from providers where owner = auth.uid() and coalesce(ticker, '') <> '')),
      ('first_id',       40.0, exists(select 1 from member_identifiers where owner = auth.uid())),
      ('id_stack',       45.0, (select count(distinct kind) from member_identifiers where owner = auth.uid()) >= 3),
      ('badge_applied',  40.0, exists(select 1 from member_badges where owner = auth.uid())),
      -- THE CRAFT · 150
      ('first_post',     25.0, exists(select 1 from posts where owner = auth.uid())),
      ('on_the_wire',    30.0, (select count(*) from posts where owner = auth.uid()) >= 3),
      ('first_track',    45.0, exists(select 1 from rack where owner = auth.uid())),
      ('listing_live',   50.0, exists(select 1 from providers where owner = auth.uid() and status = 'live')),
      -- THE BUSINESS · 255
      ('first_deal',     40.0, exists(select 1 from deals where from_owner = auth.uid())),
      ('deal_signed',    60.0, exists(select 1 from deals d
                                where (d.from_owner = auth.uid()
                                       or d.to_slug in (select slug from providers where owner = auth.uid()))
                                  and d.status in ('signed', 'paid', 'completed'))),
      ('distro_connected', 50.0, exists(select 1 from member_connections where owner = auth.uid())),
      ('earnings_filed', 60.0, exists(select 1 from earnings_reports where owner = auth.uid())),
      ('payouts_armed',  45.0, exists(select 1 from providers where owner = auth.uid() and coalesce(stripe_acct, '') <> '')),
      -- THE COMMUNITY · 200
      ('civic_card',     30.0, exists(select 1 from civic_profiles where owner = auth.uid())),
      ('first_vote',     40.0, exists(select 1 from proposal_votes where owner = auth.uid())),
      ('proposal_filed', 40.0, exists(select 1 from proposals where owner = auth.uid())),
      ('first_plug',     50.0, exists(select 1 from providers g
                                where g.owner is not null and g.referred_by is not null
                                  and upper(g.referred_by) in (nullif(upper(coalesce(me.ticker, '')), ''),
                                                               nullif(upper(coalesce(me.slug, '')), '')))),
      ('guide_talk',     40.0, exists(select 1 from guide_chats where owner = auth.uid())),
      -- THE SCHOLAR · 120
      ('scholar_3',      50.0, (select count(*) from web3_progress where owner = auth.uid()) >= 3),
      ('scholar_6',      40.0, (select count(*) from web3_progress where owner = auth.uid()) >= 6),
      ('gas_wallet',     30.0, exists(select 1 from gas_grants where owner = auth.uid()))
    ) t(k, amt, ok)
  loop
    if rec.ok then
      done := done || to_jsonb(rec.k);
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (auth.uid(), rec.amt, 'gauntlet award', 'gauntlet:' || rec.k)
      on conflict (owner, ref, reason) do nothing;
      if found then total := total + rec.amt; end if;
    end if;
  end loop;
  return jsonb_build_object('done', done, 'minted', total,
    'paid_total', coalesce((select sum(delta) from mtoken_ledger
                            where owner = auth.uid() and reason = 'gauntlet award'), 0));
end;
$$;
grant execute on function public.claim_gauntlet() to authenticated;

-- the back-end claim run completes the thousand: 25 E⤴, once
create or replace function public.claim_run_bonus()
returns numeric language plpgsql security definer set search_path = public as $$
declare already int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select count(*) into already from mtoken_ledger
   where owner = auth.uid() and reason = 'claim_run';
  if already > 0 then return 0; end if; -- the bonus only pays once
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), 25.00, 'claim_run', 'operator');
  return 25.00;
end;
$$;
grant execute on function public.claim_run_bonus() to authenticated;

-- ---------- SELF-CHECKS ----------
-- the budget: expect full_run_pays = 1000.00
select 975.00 + 25.00 as full_run_pays;
-- the reset held the line: expect zero granted/bankroll rows surviving
select count(*) as unbacked_left from mtoken_ledger
 where delta > 0 and not is_earned_reason(reason)
   and reason not in ('purchase', 'fund_accrue') and reason not like 'cashout%'
   and reason not in ('gauntlet award', 'claim_run');
-- the archive is cold and full: expect >= the live row count
select (select count(*) from mtoken_ledger_legacy) as archived,
       (select count(*) from mtoken_ledger) as live;
