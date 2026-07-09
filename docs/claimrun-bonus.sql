-- THE CLAIM RUN BONUS — the run pays out in M Tokens.
-- One-time, per account, 5.00 tokens ($5 of platform credit) when a
-- member reaches Operator rank on the claim run. Server-side mint
-- through the same ledger the deal trigger uses; the unique
-- (owner, ref, reason) key makes double-claiming impossible no
-- matter what a client sends.

create or replace function public.claim_run_bonus()
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  already int;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  select count(*) into already from mtoken_ledger
    where owner = auth.uid() and reason = 'claim_run';
  if already > 0 then
    return 0; -- the bonus only pays once
  end if;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), 5.00, 'claim_run', 'operator');
  return 5.00;
end;
$$;
grant execute on function public.claim_run_bonus() to authenticated;

-- self-check: expect 1
select count(*) as run_bonus from pg_proc where proname = 'claim_run_bonus';
