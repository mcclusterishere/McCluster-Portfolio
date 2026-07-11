-- ============================================================
-- THE TWO-COLOR LAW, ENFORCED — gold spends HOUSE-ward only.
-- GOLD (granted/promotional credit: the stake, gauntlet payouts,
-- claim-run bonuses, fund awards) is redeemable ONLY with the
-- house — ads, offers, platform services. Members and vendors
-- never receive gold: any E⤴ that lands on a member from a payment
-- is GREEN (earned) by definition, because the payer could only
-- reach them with green.
--   my_colors()          → your wallet split: gold / green / total
--   eup_pay(slug, amt)   → THE ONLY DOOR for member-to-member E⤴:
--       · paying the HOUSE (mccluster / equity-uprise): gold burns
--         first, green covers the rest
--       · paying any MEMBER: green only — not enough green, no pay
-- Safe to re-run.
-- ============================================================

-- the color registry: which ledger reasons mint GOLD; everything
-- else on the ledger is green. Add rows here as new grants appear.
create table if not exists public.credit_colors (
  reason text primary key,
  color  text not null check (color in ('gold', 'green'))
);
insert into public.credit_colors (reason, color) values
  ('traps_stake', 'gold'),
  ('gauntlet',    'gold'),
  ('claim_run',   'gold'),
  ('fund_grant',  'gold'),
  ('gold_spend',  'gold')
on conflict (reason) do nothing;

create or replace function public.my_colors()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'gold',  coalesce((select sum(l.delta) from mtoken_ledger l
                        join credit_colors c on c.reason = l.reason and c.color = 'gold'
                       where l.owner = auth.uid()), 0),
    'green', coalesce((select sum(l.delta) from mtoken_ledger l
                       where l.owner = auth.uid()
                         and not exists (select 1 from credit_colors c
                                          where c.reason = l.reason and c.color = 'gold')), 0),
    'total', coalesce((select sum(delta) from mtoken_ledger where owner = auth.uid()), 0));
$$;
revoke all on function public.my_colors() from public;
grant execute on function public.my_colors() to authenticated;

create or replace function public.eup_pay(p_to_slug text, p_amt numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  payee uuid;
  house boolean;
  gold numeric;
  green numeric;
  burn numeric := 0;
  tag text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'why', 'signed out'); end if;
  if p_amt is null or p_amt <= 0 or p_amt > 100000 then
    return jsonb_build_object('ok', false, 'why', 'a real amount');
  end if;
  select owner into payee from providers where slug = p_to_slug limit 1;
  if payee is null then return jsonb_build_object('ok', false, 'why', 'no such desk'); end if;
  if payee = auth.uid() then return jsonb_build_object('ok', false, 'why', 'not to yourself'); end if;
  house := p_to_slug in ('mccluster', 'equity-uprise');

  select coalesce(sum(l.delta) filter (where c.color = 'gold'), 0),
         coalesce(sum(l.delta) filter (where c.color is null), 0)
    into gold, green
    from mtoken_ledger l
    left join credit_colors c on c.reason = l.reason
   where l.owner = auth.uid();

  if house then
    -- the house takes any color: gold burns first
    if gold + green < p_amt then return jsonb_build_object('ok', false, 'why', 'not enough E⤴'); end if;
    burn := least(gold, p_amt);
  else
    -- THE WALL: members are paid in green only — gold never leaves the house's orbit
    if green < p_amt then
      return jsonb_build_object('ok', false, 'why',
        'gold spends with the house only — you hold ' || green || ' green; earn more to pay members');
    end if;
  end if;

  tag := 'pay:' || auth.uid() || ':' || extract(epoch from clock_timestamp())::bigint;
  if burn > 0 then
    insert into mtoken_ledger (owner, delta, reason, ref)
    values (auth.uid(), -burn, 'gold_spend', tag || ':g');
  end if;
  if p_amt - burn > 0 then
    insert into mtoken_ledger (owner, delta, reason, ref)
    values (auth.uid(), -(p_amt - burn), 'eup_pay', tag);
  end if;
  -- what lands on the payee is GREEN by definition: it was paid for value
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (payee, p_amt, 'earned_eup', tag);

  return jsonb_build_object('ok', true, 'paid', p_amt,
    'gold_burned', burn, 'to', p_to_slug, 'note', coalesce(p_note, ''));
end $$;
revoke all on function public.eup_pay(text, numeric, text) from public;
grant execute on function public.eup_pay(text, numeric, text) to authenticated;

-- self-check: expect 3 · 5
select count(*) as color_fns from pg_proc where proname in ('my_colors', 'eup_pay', 'stake_mark');
select count(*) as gold_reasons from credit_colors where color = 'gold';
