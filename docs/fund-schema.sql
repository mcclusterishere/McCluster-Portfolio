-- THE ONE PERCENT FUND — one percent for the new one percent.
-- 1% of every deal flows into a community pool, taken from the
-- platform's own fee (the paying side's price never changes). It is
-- NOT any one member's money — it's the house's community chest,
-- visible to all, awarded by the desk to loyal members, contest
-- winners, and the people carrying the culture. Granted credit is
-- non-redeemable by the two-color law: a reward, not a payout.

-- the fund's own account — a sentinel owner in the same ledger
-- (00…f1 = "the fund"). Nothing signs in as it; only these
-- functions move its credit.
create or replace function public.fund_uid() returns uuid
  language sql immutable as $$ select '00000000-0000-0000-0000-0000000000f1'::uuid $$;

-- 1% of every completed deal accrues to the fund, from the platform's cut.
-- Runs alongside the token mint; unique (owner, ref, reason) makes it
-- idempotent no matter how many times completion fires.
create or replace function public.fund_accrue_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fee numeric := coalesce((new.terms ->> 'fee')::numeric, 0);
  cut numeric;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and fee > 0 then
    cut := round(fee * 0.01, 2);          -- one percent of the deal
    if cut > 0 then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (public.fund_uid(), cut, 'fund_accrue', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists fund_accrue_t on deals;
create trigger fund_accrue_t after update on deals
  for each row execute function public.fund_accrue_on_completion();

-- the public books: anyone can watch the fund grow (aggregates only)
create or replace function public.fund_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare accrued numeric; granted numeric; grants int;
begin
  select coalesce(sum(delta), 0) into accrued from mtoken_ledger
   where owner = public.fund_uid() and reason = 'fund_accrue';
  select coalesce(sum(-delta), 0) into granted from mtoken_ledger
   where owner = public.fund_uid() and reason = 'fund_grant';
  select count(*) into grants from mtoken_ledger
   where owner = public.fund_uid() and reason = 'fund_grant';
  return jsonb_build_object(
    'accrued', accrued, 'granted', granted, 'balance', accrued - granted, 'awards', grants
  );
end;
$$;
grant execute on function public.fund_stats() to anon, authenticated;

-- the desk awards from the fund: debits the pool, mints granted (non-
-- redeemable) credit to a member by ticker. Admin only, one motion.
create or replace function public.grant_from_fund(to_slug text, amt numeric, why text default 'community award')
returns numeric language plpgsql security definer set search_path = public as $$
declare bal numeric; rcpt uuid; tid text;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'matthew@mccluster.org' then
    raise exception 'the desk awards the fund';
  end if;
  amt := round(coalesce(amt, 0), 2);
  if amt <= 0 then raise exception 'a positive award'; end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = public.fund_uid();
  if bal < amt then raise exception 'the fund holds % — not enough', bal; end if;
  select owner into rcpt from providers where slug = to_slug and owner is not null limit 1;
  if rcpt is null then raise exception 'no claimed account behind that name'; end if;
  tid := gen_random_uuid()::text;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (public.fund_uid(), -amt, 'fund_grant', to_slug || ' · ' || tid);
  -- 'fund_award' is a GRANTED reason: spends in the loop, never cashes out
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (rcpt, amt, 'fund_award: ' || left(why, 48), tid);
  return bal - amt;
end;
$$;
grant execute on function public.grant_from_fund(text, numeric, text) to authenticated;

-- self-checks: expect 1 · 1 · 1
select count(*) as fund_trigger from pg_proc where proname = 'fund_accrue_on_completion';
select count(*) as fund_stats_ready from pg_proc where proname = 'fund_stats';
select count(*) as fund_grant_ready from pg_proc where proname = 'grant_from_fund';
