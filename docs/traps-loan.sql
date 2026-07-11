-- ============================================================
-- T.R.A.P.S. IS A LOAN — the risk is real. Run after traps-stake.
-- The stake can be LOST: an account that takes the gold and makes
-- no real move inside 30 days gets the WHOLE stake called back by
-- the nightly sweep. "A real move" = any ledger credit that is NOT
-- the stake itself (an earn, a gauntlet payout, a claim-run bonus,
-- an award) OR a live listing on Our Street.
-- No restarts: the ledger's unique key means a called stake can
-- never be re-dealt — one stake per lifetime, by construction.
-- Safe to re-run.
-- ============================================================

create or replace function public.stake_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  called int := 0;
  r record;
begin
  for r in
    select l.owner, sum(l.delta) as staked, min(l.at) as first_at
      from mtoken_ledger l
     where l.reason = 'traps_stake'
       and l.ref <> 'stake:called'
     group by l.owner
    having sum(l.delta) > 0
       and min(l.at) < now() - interval '30 days'
       -- no real move: nothing on the ledger beyond the stake itself…
       and not exists (select 1 from mtoken_ledger x
                        where x.owner = l.owner and x.reason <> 'traps_stake' and x.delta > 0)
       -- …and no live listing on Our Street
       and not exists (select 1 from providers p
                        where p.owner = l.owner and p.status = 'live')
       -- and the loan hasn't already been called
       and not exists (select 1 from mtoken_ledger c
                        where c.owner = l.owner and c.reason = 'traps_stake' and c.ref = 'stake:called')
  loop
    insert into mtoken_ledger (owner, delta, reason, ref)
    values (r.owner, -r.staked, 'traps_stake', 'stake:called')
    on conflict (owner, ref, reason) do nothing;
    called := called + 1;
  end loop;
  return jsonb_build_object('ok', true, 'called', called);
end $$;
revoke all on function public.stake_sweep() from public;
-- nobody calls this by hand except the desk; the clock calls it nightly

-- THE CLOCK: the loan officer knocks at 05:23 UTC every night
do $$
begin
  perform cron.unschedule('traps-loan-call');
exception when others then null;
end $$;
select cron.schedule('traps-loan-call', '23 5 * * *', $$select public.stake_sweep()$$);

-- self-check: expect 1 · 1
select count(*) as sweep_fn from pg_proc where proname = 'stake_sweep';
select count(*) as loan_clock from cron.job where jobname = 'traps-loan-call';
