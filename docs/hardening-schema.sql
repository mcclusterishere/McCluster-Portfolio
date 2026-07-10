-- ============================================================
-- THE HARDENING — the demolition report, sealed.
--
-- One paste that closes every hole the adversarial audit found.
-- Run it LAST, after every other schema. It is the authoritative
-- last word: it re-asserts the safe version of every function the
-- audit flagged, so it no longer matters what order the older files
-- ran in, or whether an old file gets re-pasted later. Idempotent.
--
-- Findings closed here:
--   #1  duelling mint_on_completion() — the cash-out hole re-arming
--   #2  house offers claimable with granted (Sybil bankroll) credit
--   #3  either party could flip a deal's identity / fake 'paid'
--   #4  bump_play / stream_record: anon, unbounded, poisonable
--   #5  the 1% fund accrued on fake completions (no payment proof)
--   #7  account_type defaulted everyone to 'provider'
--   #8  run-order fragility (this file makes it moot)
-- ============================================================

-- ------------------------------------------------------------
-- #1 + #5  MONEY MINTS ONLY AGAINST MONEY STRIPE ACTUALLY TOOK
-- The one safe mint, re-asserted so no older/unsafe copy can win.
-- Earned credit (cash-outable) prints only from deal_payments —
-- the row the webhook writes on the service role, unforgeable by
-- any browser — and never on a self-dealt buyer==provider leg.
-- ------------------------------------------------------------
create or replace function public.mint_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare paid numeric; provider_owner uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select coalesce(sum(gross), 0) into paid from deal_payments where deal_id = new.id;
    if paid <= 0 then
      return new;  -- money moved outside the app, or not at all: nothing redeemable mints
    end if;
    select owner into provider_owner from providers where slug = new.to_slug limit 1;
    if provider_owner is not null then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (provider_owner, round(paid * 0.05, 2), 'deal completed — the work pays twice', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
    if new.from_owner is not null and new.from_owner is distinct from provider_owner then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (new.from_owner, round(paid * 0.01, 2), 'deal completed — thank you for moving money here', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists mint_on_completion_t on public.deals;
create trigger mint_on_completion_t after update on public.deals
  for each row execute function public.mint_on_completion();

-- the community fund's 1% now draws off the REAL captured total too,
-- never a fee a participant typed into a deal they completed themselves.
create or replace function public.fund_accrue_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare paid numeric; cut numeric;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select coalesce(sum(gross), 0) into paid from deal_payments where deal_id = new.id;
    cut := round(paid * 0.01, 2);
    if cut > 0 then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (public.fund_uid(), cut, 'fund_accrue', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists fund_accrue_t on public.deals;
create trigger fund_accrue_t after update on public.deals
  for each row execute function public.fund_accrue_on_completion();

-- ------------------------------------------------------------
-- #3  A DEAL'S IDENTITY IS STONE; 'paid' IS THE WEBHOOK'S WORD
-- Participants keep working their deal, but they can't rewrite who
-- sent it, and they can't hand-stamp it 'paid' — that word only
-- lands when a real capture exists in deal_payments. The webhook
-- (service role) and the desk pass through untouched.
-- ------------------------------------------------------------
create or replace function public.deals_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' or is_mcc_admin() then
    return new;
  end if;
  if new.from_owner is distinct from old.from_owner then
    raise exception 'the sender on a deal is fixed';
  end if;
  if new.status = 'paid' and old.status is distinct from 'paid'
     and not exists (select 1 from deal_payments where deal_id = new.id) then
    raise exception 'a deal turns paid when the card clears, not by hand';
  end if;
  return new;
end;
$$;
drop trigger if exists deals_guard_t on public.deals;
create trigger deals_guard_t before update on public.deals
  for each row execute function public.deals_guard();

-- ------------------------------------------------------------
-- #2  THE HOUSE SHELF IS EARNED-ONLY
-- The capture engine, made real: you can't buy a real service off
-- the shelf with granted color (the beta bankroll, gauntlet awards,
-- credit someone transferred you). You must have EARNED the price
-- through your own deals / bounties / service pay. Sybil-funnelling
-- a dozen free accounts' bankrolls into one buys you nothing here.
-- ------------------------------------------------------------
create or replace function public.claim_house_offer(offer uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare o record; bal numeric; earned numeric; taken int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into o from house_offers where id = offer and active = true;
  if o is null then raise exception 'that offer is off the shelf'; end if;
  select count(*) into taken from house_claims where offer_id = offer and status <> 'denied';
  if o.stock is not null and taken >= o.stock then
    raise exception 'all claimed — watch the shelf for the next one';
  end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  if earned < o.price then
    raise exception 'the shelf is earned-only — you have % of % E⤴ earned through real work (the beta bankroll and gifted credit don''t count here)',
      earned, o.price;
  end if;
  if bal < o.price then
    raise exception 'you hold % — % short', bal, (o.price - bal);
  end if;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), -o.price, 'house_claim', offer::text);
  insert into house_claims (offer_id, owner, paid)
  values (offer, auth.uid(), o.price);
  return bal - o.price;
end;
$$;
grant execute on function public.claim_house_offer(uuid) to authenticated;

-- the desk card reads the right number: total balance AND earned,
-- so the button matches what the server will actually allow.
create or replace function public.house_wallet()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare bal numeric; earned numeric;
begin
  if auth.uid() is null then return jsonb_build_object('balance', 0, 'earned', 0); end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  return jsonb_build_object('balance', bal, 'earned', earned);
end;
$$;
grant execute on function public.house_wallet() to authenticated;

-- ------------------------------------------------------------
-- #4  THE HEAT CAN'T BE PRINTED
-- One pulse per track, per device fingerprint, per hour. A curl
-- loop that used to drive a track to a million now counts once an
-- hour per fingerprint. The score reads these at low, capped weight
-- anyway — this stops them poisoning the chart in the meantime.
-- ------------------------------------------------------------
create table if not exists public.play_pulses (
  slug text not null,
  fp   text not null,
  hr   timestamptz not null,
  primary key (slug, fp, hr)
);
alter table public.play_pulses enable row level security;
-- no policy on purpose: only the security-definer counters below write it

create or replace function public.bump_play(p_slug text, p_fp text default '')
returns void language plpgsql security definer set search_path = public as $$
declare s text; f text; ins int;
begin
  s := lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9]', '', 'g'));
  if s = '' then return; end if;
  f := left(coalesce(nullif(p_fp, ''), 'anon'), 64);
  insert into play_pulses (slug, fp, hr)
  values (s, f, date_trunc('hour', now())) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return; end if;       -- this fingerprint already counted this hour
  insert into track_plays (slug, plays) values (s, 1)
  on conflict (slug) do update set plays = track_plays.plays + 1, updated_at = now();
end;
$$;
grant execute on function public.bump_play(text, text) to anon, authenticated;

create or replace function public.stream_record(p_record_slug text, p_fp text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare s text; f text; ins int; n integer;
begin
  s := lower(coalesce(p_record_slug, ''));
  if s = '' then return 0; end if;
  f := left(coalesce(nullif(p_fp, ''), 'anon'), 64);
  insert into play_pulses (slug, fp, hr)
  values ('rec:' || s, f, date_trunc('hour', now())) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins > 0 then
    update records set streams = streams + 1 where slug = s;
  end if;
  select streams into n from records where slug = s;
  return coalesce(n, 0);
end;
$$;
grant execute on function public.stream_record(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- #7  YOU ARE A CUSTOMER UNTIL YOU PROVIDE
-- New listings default to 'customer'. The desk promotes a member to
-- 'provider' (or Connect onboarding does). Equity still accrues to
-- whoever actually took real money — this is the label, set honestly.
-- ------------------------------------------------------------
alter table public.providers alter column account_type set default 'customer';

-- ============================================================
-- SELF-CHECKS — expect every count = 1
-- ============================================================
select
  (select count(*) from pg_proc where proname = 'mint_on_completion')        as mint_fn,
  (select count(*) from pg_proc where proname = 'fund_accrue_on_completion')  as fund_fn,
  (select count(*) from pg_proc where proname = 'deals_guard')                as guard_fn,
  (select count(*) from pg_proc where proname = 'claim_house_offer')          as house_fn,
  (select count(*) from pg_proc where proname = 'house_wallet')               as wallet_fn,
  (select count(*) from pg_proc where proname = 'bump_play')                  as heat_fn,
  (select count(*) from pg_proc where proname = 'stream_record')              as stream_fn,
  (select count(*) from information_schema.tables where table_name = 'play_pulses') as pulses_tbl;
