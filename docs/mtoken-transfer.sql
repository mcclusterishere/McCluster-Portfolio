-- M TOKEN TRANSFERS — trading, inside the loop.
-- Tokens move person-to-person by ticker: sender must cover it,
-- recipient must be a claimed account, both legs land in one
-- transaction through the same ledger the mint uses. Clients still
-- can't write the ledger directly — this function is the only pen.

create or replace function public.transfer_tokens(to_slug text, amt numeric, note text default '')
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  bal numeric;
  rcpt uuid;
  tid text;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  amt := round(coalesce(amt, 0), 2);
  if amt <= 0 then
    raise exception 'a positive amount';
  end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  if bal < amt then
    raise exception 'balance is % — not enough', bal;
  end if;
  select owner into rcpt from providers where slug = to_slug and owner is not null limit 1;
  if rcpt is null then
    raise exception 'no claimed account behind that name';
  end if;
  if rcpt = auth.uid() then
    raise exception 'that is your own ticker';
  end if;
  tid := gen_random_uuid()::text;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), -amt, 'transfer_out', to_slug || ' · ' || tid || (case when note <> '' then ' · ' || left(note, 60) else '' end));
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (rcpt, amt, 'transfer_in', tid);
  return bal - amt;
end;
$$;
grant execute on function public.transfer_tokens(text, numeric, text) to authenticated;

-- THE BETA BANKROLL — the fake rail's faucet.
-- During beta every signed-in account can claim 1,000 ᴹ once. That is
-- what lets the promo run: real people sending each other thousands on
-- the record with zero real dollars moving. One claim per account,
-- enforced server-side; shut the faucet later by revoking execute.
create or replace function public.claim_beta_bankroll()
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  already int;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  select count(*) into already from mtoken_ledger
   where owner = auth.uid() and reason = 'beta_bankroll';
  if already > 0 then
    return 0;
  end if;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), 1000.00, 'beta_bankroll', 'beta');
  return 1000.00;
end;
$$;
grant execute on function public.claim_beta_bankroll() to authenticated;

-- self-check: expect 2
select count(*) as rails_ready from pg_proc
 where proname in ('transfer_tokens', 'claim_beta_bankroll');
