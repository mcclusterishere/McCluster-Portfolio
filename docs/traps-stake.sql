-- ============================================================
-- T.R.A.P.S. — Take Risk And Prosper System: THE OPENING STAKE.
-- Every member starts with 50 E⤴ of granted-color credit, and the
-- walk-in answers top the account off — up to 250 E⤴ total from
-- onboarding (50 stake + 8 paid answers × 25). All of it rides the
-- SAME ledger the deals and the gauntlet use; the ledger's unique
-- key (owner, ref, reason) means nothing ever pays twice, on any
-- device, no matter how many times the walk is replayed.
-- GRANTED color: spends everywhere in the network, never cashes out.
-- Safe to re-run.
-- ============================================================

create or replace function public.stake_mark(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  amt numeric;
  bal numeric;
  hit int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'why', 'signed out');
  end if;
  -- the allowlist IS the budget: 50 + 8×25 = 250 E⤴ maximum, ever
  amt := case p_key
    when 'opening'   then 50    -- the stake: dealt on the first walk-in step
    when 'roles'     then 25    -- what do you do (all of it)
    when 'links'     then 25    -- the links — your followership feeds the tape
    when 'goals'     then 25    -- what you're here for
    when 'money'     then 25    -- how money moves, read
    when 'twocolor'  then 25    -- the two-color law, read
    when 'traps'     then 25    -- T.R.A.P.S. — the flip, read
    when 'billboard' then 25    -- the Billboard — ads, read
    when 'card'      then 25    -- E⤴ Card attached to the account
    else null end;
  if amt is null then
    return jsonb_build_object('ok', false, 'why', 'that answer does not pay');
  end if;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), amt, 'traps_stake', 'stake:' || p_key)
  on conflict (owner, ref, reason) do nothing;
  get diagnostics hit = row_count;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  return jsonb_build_object('ok', true, 'paid', case when hit > 0 then amt else 0 end, 'balance', bal);
end $$;
revoke all on function public.stake_mark(text) from public;
grant execute on function public.stake_mark(text) to authenticated;

-- self-check: expect 1
select count(*) as stake_fn from pg_proc where proname = 'stake_mark';
