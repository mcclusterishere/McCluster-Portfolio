-- ============================================================
-- THE GAUNTLET ARMOR — one broken detector can never again kill
-- the whole Trap.
--
-- The bug: claim_gauntlet() evaluated all 26 checks in ONE
-- statement, so a single missing table (a paste that never ran)
-- threw the whole function and NOTHING tracked — real work like
-- a Wire post went unpaid. Now every detector is sealed in its
-- own guard: a broken one reads false, the other 25 keep paying.
-- The mint is sealed too — a ledger hiccup can't hide a ✓.
--
-- Ends with gauntlet_audit('mccluster'): one row per mission
-- showing detected true/false, and 'DETECTOR BROKEN: …' naming
-- any table that's missing so you know exactly which paste to
-- run. Safe to re-run.
-- ============================================================
create or replace function public.claim_gauntlet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me record; u uuid := auth.uid();
  total numeric := 0; done jsonb := '[]'::jsonb; ok boolean;
  ks text[] := '{}'; amts numeric[] := '{}'; oks boolean[] := '{}'; i int;
begin
  if u is null then raise exception 'sign in first'; end if;
  select slug, ticker into me from providers where owner = u limit 1;

  ok := false; begin select exists(select 1 from events where uid = u and name = 'welcome_done') into ok; exception when others then ok := false; end;
  ks := ks || 'walk_in'::text; amts := amts || 20.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from providers where owner = u and coalesce(headline, '') <> '') into ok; exception when others then ok := false; end;
  ks := ks || 'card_live'::text; amts := amts || 20.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from agreements where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'signed'::text; amts := amts || 15.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from push_subs where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'push_on'::text; amts := amts || 10.0; oks := oks || ok;
  ok := false; begin select (select count(distinct date(at)) from events where uid = u) >= 5 into ok; exception when others then ok := false; end;
  ks := ks || 'explorer'::text; amts := amts || 35.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from providers where owner = u and coalesce(ticker, '') <> '') into ok; exception when others then ok := false; end;
  ks := ks || 'ticker_claimed'::text; amts := amts || 25.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from member_identifiers where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'first_id'::text; amts := amts || 40.0; oks := oks || ok;
  ok := false; begin select (select count(distinct kind) from member_identifiers where owner = u) >= 3 into ok; exception when others then ok := false; end;
  ks := ks || 'id_stack'::text; amts := amts || 45.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from member_badges where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'badge_applied'::text; amts := amts || 40.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from posts where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'first_post'::text; amts := amts || 25.0; oks := oks || ok;
  ok := false; begin select (select count(*) from posts where owner = u) >= 3 into ok; exception when others then ok := false; end;
  ks := ks || 'on_the_wire'::text; amts := amts || 30.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from rack where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'first_track'::text; amts := amts || 45.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from providers where owner = u and status = 'live') into ok; exception when others then ok := false; end;
  ks := ks || 'listing_live'::text; amts := amts || 50.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from deals where from_owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'first_deal'::text; amts := amts || 40.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from deals d where (d.from_owner = u or d.to_slug in (select slug from providers where owner = u)) and d.status in ('signed', 'paid', 'completed')) into ok; exception when others then ok := false; end;
  ks := ks || 'deal_signed'::text; amts := amts || 60.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from member_connections where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'distro_connected'::text; amts := amts || 50.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from earnings_reports where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'earnings_filed'::text; amts := amts || 60.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from providers where owner = u and coalesce(stripe_acct, '') <> '') into ok; exception when others then ok := false; end;
  ks := ks || 'payouts_armed'::text; amts := amts || 45.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from civic_profiles where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'civic_card'::text; amts := amts || 30.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from proposal_votes where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'first_vote'::text; amts := amts || 40.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from proposals where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'proposal_filed'::text; amts := amts || 40.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from providers g where g.owner is not null and g.referred_by is not null and upper(g.referred_by) in (nullif(upper(coalesce(me.ticker, '')), ''), nullif(upper(coalesce(me.slug, '')), ''))) into ok; exception when others then ok := false; end;
  ks := ks || 'first_plug'::text; amts := amts || 50.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from guide_chats where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'guide_talk'::text; amts := amts || 40.0; oks := oks || ok;
  ok := false; begin select (select count(*) from web3_progress where owner = u) >= 3 into ok; exception when others then ok := false; end;
  ks := ks || 'scholar_3'::text; amts := amts || 50.0; oks := oks || ok;
  ok := false; begin select (select count(*) from web3_progress where owner = u) >= 6 into ok; exception when others then ok := false; end;
  ks := ks || 'scholar_6'::text; amts := amts || 40.0; oks := oks || ok;
  ok := false; begin select exists(select 1 from gas_grants where owner = u) into ok; exception when others then ok := false; end;
  ks := ks || 'gas_wallet'::text; amts := amts || 30.0; oks := oks || ok;

  for i in 1..array_length(ks, 1) loop
    if oks[i] then
      done := done || to_jsonb(ks[i]);
      begin
        insert into mtoken_ledger (owner, delta, reason, ref)
        values (u, amts[i], 'gauntlet award', 'gauntlet:' || ks[i])
        on conflict (owner, ref, reason) do nothing;
        if found then total := total + amts[i]; end if;
      exception when others then null; end;
    end if;
  end loop;
  return jsonb_build_object('done', done, 'minted', total,
    'paid_total', coalesce((select sum(delta) from mtoken_ledger
                            where owner = u and reason = 'gauntlet award'), 0));
end;
$$;
grant execute on function public.claim_gauntlet() to authenticated;

-- THE TRACKER AUDIT: run the 26 detectors for any member, from the desk
create or replace function public.gauntlet_audit(p_slug text)
returns table (mission text, detected boolean, note text)
language plpgsql security definer set search_path = public as $$
declare u uuid; me record; ok boolean;
begin
  if not (current_user = 'postgres'
          or coalesce(auth.jwt() ->> 'email', '') = 'matthew@mccluster.org') then
    raise exception 'the desk holds the audit';
  end if;
  select owner into u from providers where slug = p_slug limit 1;
  select slug, ticker into me from providers where slug = p_slug limit 1;
  if u is null then raise exception 'no claimed desk with that slug'; end if;

  begin
    select exists(select 1 from events where uid = u and name = 'welcome_done') into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'walk_in'; detected := ok; return next;
  begin
    select exists(select 1 from providers where owner = u and coalesce(headline, '') <> '') into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'card_live'; detected := ok; return next;
  begin
    select exists(select 1 from agreements where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'signed'; detected := ok; return next;
  begin
    select exists(select 1 from push_subs where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'push_on'; detected := ok; return next;
  begin
    select (select count(distinct date(at)) from events where uid = u) >= 5 into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'explorer'; detected := ok; return next;
  begin
    select exists(select 1 from providers where owner = u and coalesce(ticker, '') <> '') into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'ticker_claimed'; detected := ok; return next;
  begin
    select exists(select 1 from member_identifiers where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'first_id'; detected := ok; return next;
  begin
    select (select count(distinct kind) from member_identifiers where owner = u) >= 3 into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'id_stack'; detected := ok; return next;
  begin
    select exists(select 1 from member_badges where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'badge_applied'; detected := ok; return next;
  begin
    select exists(select 1 from posts where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'first_post'; detected := ok; return next;
  begin
    select (select count(*) from posts where owner = u) >= 3 into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'on_the_wire'; detected := ok; return next;
  begin
    select exists(select 1 from rack where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'first_track'; detected := ok; return next;
  begin
    select exists(select 1 from providers where owner = u and status = 'live') into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'listing_live'; detected := ok; return next;
  begin
    select exists(select 1 from deals where from_owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'first_deal'; detected := ok; return next;
  begin
    select exists(select 1 from deals d where (d.from_owner = u or d.to_slug in (select slug from providers where owner = u)) and d.status in ('signed', 'paid', 'completed')) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'deal_signed'; detected := ok; return next;
  begin
    select exists(select 1 from member_connections where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'distro_connected'; detected := ok; return next;
  begin
    select exists(select 1 from earnings_reports where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'earnings_filed'; detected := ok; return next;
  begin
    select exists(select 1 from providers where owner = u and coalesce(stripe_acct, '') <> '') into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'payouts_armed'; detected := ok; return next;
  begin
    select exists(select 1 from civic_profiles where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'civic_card'; detected := ok; return next;
  begin
    select exists(select 1 from proposal_votes where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'first_vote'; detected := ok; return next;
  begin
    select exists(select 1 from proposals where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'proposal_filed'; detected := ok; return next;
  begin
    select exists(select 1 from providers g where g.owner is not null and g.referred_by is not null and upper(g.referred_by) in (nullif(upper(coalesce(me.ticker, '')), ''), nullif(upper(coalesce(me.slug, '')), ''))) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'first_plug'; detected := ok; return next;
  begin
    select exists(select 1 from guide_chats where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'guide_talk'; detected := ok; return next;
  begin
    select (select count(*) from web3_progress where owner = u) >= 3 into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'scholar_3'; detected := ok; return next;
  begin
    select (select count(*) from web3_progress where owner = u) >= 6 into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'scholar_6'; detected := ok; return next;
  begin
    select exists(select 1 from gas_grants where owner = u) into ok; note := '';
  exception when others then ok := false; note := 'DETECTOR BROKEN: ' || sqlerrm; end;
  mission := 'gas_wallet'; detected := ok; return next;
end;
$$;

-- self-check + the audit on the desk itself: expect 26 rows,
-- any 'DETECTOR BROKEN' note names the paste that never landed
select count(*) as armor_ready from pg_proc where proname in ('claim_gauntlet','gauntlet_audit');
select * from gauntlet_audit('mccluster');
