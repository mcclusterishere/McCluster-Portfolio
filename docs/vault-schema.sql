-- ============================================================
-- THE VAULT — the reserve that only ever fills.
--
-- When a member SPENDS earned credit inside the loop (claims a house
-- offer, pays a platform fee), that credit doesn't evaporate — it
-- flows into The Vault: a single reserve account with NO debit path
-- anywhere in this schema or the app. It only accrues. It is the
-- platform's permanent backing reserve, attested publicly, forever
-- untouched.
--
-- WHY NO WITHDRAWAL EXISTS: this is deliberate, not unfinished. A
-- reserve you can draw down is a reserve you can misuse; a reserve
-- with no code path out is one nobody — not even the desk — can
-- raid. If a backed digital asset is ever issued against this Vault,
-- this ledger is its audit trail. Until counsel clears that, there
-- is no token and no wallet debit — only the honest reserve and a
-- read-only view of what each member holds against it.
--
-- Paste whole into Supabase → SQL editor → Run. Safe to re-run.
-- Requires: mtoken-schema (mtoken_ledger), reserve-schema
-- (is_earned_reason), house-schema (house_claim reason).
-- ============================================================

-- the Vault's own sentinel owner in the shared ledger
-- (00…f2 = "the vault" — sibling of the fund's 00…f1). Nothing signs
-- in as it; nothing debits it. These functions only ever add.
create or replace function public.vault_uid() returns uuid
  language sql immutable as $$ select '00000000-0000-0000-0000-0000000000f2'::uuid $$;

-- ---------- the intake: spent EARNED credit lands in the Vault ----------
-- Fires whenever a debit is written to the ledger that represents an
-- in-loop spend of earned credit (a house claim, a platform fee).
-- The Vault accrues the absolute value; unique(owner,ref,reason)
-- keeps it idempotent no matter how often the row is touched.
create or replace function public.vault_intake() returns trigger
language plpgsql security definer set search_path = public as $$
declare amt numeric;
begin
  -- only debits (spends), and only the reasons that are real in-loop spends
  if new.delta < 0 and new.reason in ('house_claim', 'platform_fee') then
    amt := round(-new.delta, 2);
    if amt > 0 then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (public.vault_uid(), amt, 'vault_reserve', new.reason || ':' || coalesce(new.ref, new.id::text))
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vault_intake_t on public.mtoken_ledger;
create trigger vault_intake_t after insert on public.mtoken_ledger
  for each row execute function public.vault_intake();

-- ---------- the public books: watch the reserve grow (aggregates) ----------
-- Anyone can read the Vault's size and how many spends built it. There
-- is no function anywhere that subtracts from it — by design.
create or replace function public.vault_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare reserve numeric; fills int; attested numeric; attest_at timestamptz;
begin
  select coalesce(sum(delta), 0), count(*) into reserve, fills
    from mtoken_ledger where owner = public.vault_uid() and reason = 'vault_reserve';
  -- reuse the reserve-schema attestation if present (dollars actually held)
  begin
    select dollars, at into attested, attest_at from reserve_attest order by at desc limit 1;
  exception when undefined_table then attested := null; end;
  return jsonb_build_object(
    'reserve', reserve,           -- E⤴ locked in the Vault, forever
    'fills', fills,               -- how many in-loop spends built it
    'backed_dollars', coalesce(attested, 0),
    'attested_at', attest_at,
    'withdrawable', 0             -- always zero: there is no debit path
  );
end;
$$;
grant execute on function public.vault_stats() to anon, authenticated;

-- ---------- the member wallet: what YOU hold, read-only ----------
-- One call feeds the wallet card: your spendable balance, your earned
-- (cash-out-eligible) credit, your equity points, your stake in the
-- Vault-backed pool, and your lifetime contribution to the reserve.
create or replace function public.my_wallet() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  bal numeric; earned numeric; contributed numeric;
  points numeric; pool numeric; reserve numeric;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  -- what this member has personally poured into the Vault (their spends)
  select coalesce(sum(-delta), 0) into contributed from mtoken_ledger
   where owner = auth.uid() and delta < 0 and reason in ('house_claim', 'platform_fee');
  -- equity stake (equity-schema), guarded in case it isn't installed
  begin
    select coalesce(sum(points), 0) into points from equity_ledger where owner = auth.uid();
    select coalesce(sum(points), 0) into pool from equity_ledger;
  exception when undefined_table then points := 0; pool := 0; end;
  select coalesce(sum(delta), 0) into reserve
   from mtoken_ledger where owner = public.vault_uid() and reason = 'vault_reserve';
  return jsonb_build_object(
    'balance', bal,
    'earned', earned,
    'contributed_to_vault', contributed,
    'equity_points', points,
    'equity_stake_pct', case when pool > 0 then round(points / pool * 100, 4) else 0 end,
    'vault_reserve', reserve
  );
end;
$$;
grant execute on function public.my_wallet() to authenticated;

-- ---------- backfill: sweep any spends that already happened ----------
-- Run once safely — idempotent. Pulls historic house_claim/platform_fee
-- debits into the Vault so the reserve reflects all past in-loop spends.
insert into mtoken_ledger (owner, delta, reason, ref)
select public.vault_uid(), round(-delta, 2), 'vault_reserve', reason || ':' || coalesce(ref, id::text)
  from mtoken_ledger
 where delta < 0 and reason in ('house_claim', 'platform_fee')
on conflict (owner, ref, reason) do nothing;

-- self-checks: expect 1 · 1 · 1 · (reserve total)
select count(*) as vault_uid_fn   from pg_proc where proname = 'vault_uid';
select count(*) as vault_stats_fn from pg_proc where proname = 'vault_stats';
select count(*) as wallet_fn      from pg_proc where proname = 'my_wallet';
select public.vault_stats() as vault_now;
