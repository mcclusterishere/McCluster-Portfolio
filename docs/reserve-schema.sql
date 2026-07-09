-- THE EQUITY RESERVE — two colors of credit, one sacred peg.
-- 1 E⤴ = $1, forever. Nothing mints unbacked: purchases mint against
-- dollars in, deal mints against the platform's collected spread.
-- EARNED credit (work: deal completions, bounties, service pay) can
-- cash out — that's the platform paying for work. PURCHASED and
-- GIFTED credit spends in-loop only, never redeems (that line is the
-- money-transmission wall; it moves only with counsel's memo).

-- ---------- the earned test, in one place ----------
create or replace function public.is_earned_reason(r text)
returns boolean language sql immutable as $$
  select r like 'deal completed%' or r like 'bounty%' or r like 'service%';
$$;

-- ---------- what YOU could cash out right now ----------
create or replace function public.my_redeemable()
returns numeric language plpgsql security definer set search_path = public as $$
declare
  bal numeric; earned numeric; held numeric; refunded numeric;
begin
  if auth.uid() is null then return 0; end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  select coalesce(sum(-delta), 0) into held from mtoken_ledger
   where owner = auth.uid() and reason = 'cashout_hold';
  select coalesce(sum(delta), 0) into refunded from mtoken_ledger
   where owner = auth.uid() and reason = 'cashout_refund';
  return greatest(0, least(bal, earned - (held - refunded)));
end;
$$;
grant execute on function public.my_redeemable() to authenticated;

-- ---------- the cash-out queue ----------
create table if not exists public.cashout_requests (
  id     uuid primary key default gen_random_uuid(),
  at     timestamptz default now(),
  owner  uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'requested' check (status in ('requested','paid','denied')),
  note   text default ''
);
alter table public.cashout_requests enable row level security;

drop policy if exists "owners see their own cashouts" on public.cashout_requests;
create policy "owners see their own cashouts"
  on public.cashout_requests for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "the admin works the cashouts" on public.cashout_requests;
create policy "the admin works the cashouts"
  on public.cashout_requests for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- inserts only through the function: the hold and the request are one motion

create or replace function public.request_cashout(amt numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  can numeric; rid uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  amt := round(coalesce(amt, 0), 2);
  if amt < 5 then raise exception 'cash-outs start at 5.00'; end if;
  select public.my_redeemable() into can;
  if can < amt then raise exception 'redeemable is % — only EARNED credit cashes out', can; end if;
  rid := gen_random_uuid();
  insert into cashout_requests (id, owner, amount) values (rid, auth.uid(), amt);
  insert into mtoken_ledger (owner, delta, reason, ref) values (auth.uid(), -amt, 'cashout_hold', rid::text);
  return rid;
end;
$$;
grant execute on function public.request_cashout(numeric) to authenticated;

-- a denied request gives the hold back, automatically and exactly once
create or replace function public.cashout_deny_refund()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'denied' and old.status = 'requested' then
    insert into mtoken_ledger (owner, delta, reason, ref)
    values (new.owner, new.amount, 'cashout_refund', new.id::text)
    on conflict (owner, ref, reason) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists cashout_deny_refund_t on public.cashout_requests;
create trigger cashout_deny_refund_t after update on public.cashout_requests
  for each row execute function public.cashout_deny_refund();

-- ---------- the public reserve dashboard (aggregates only, no names) ----------
create table if not exists public.reserve_attest (
  id uuid primary key default gen_random_uuid(),
  at timestamptz default now(),
  dollars numeric(14,2) not null,
  note text default ''
);
alter table public.reserve_attest enable row level security;
drop policy if exists "the world reads the attestation" on public.reserve_attest;
create policy "the world reads the attestation"
  on public.reserve_attest for select using (true);
drop policy if exists "the admin attests" on public.reserve_attest;
create policy "the admin attests"
  on public.reserve_attest for insert
  with check (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

create or replace function public.reserve_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  outstanding numeric; earned numeric; purchased numeric; granted numeric;
  redeemed numeric; pending numeric; attest record;
begin
  select coalesce(sum(delta), 0) into outstanding from mtoken_ledger;
  select coalesce(sum(delta), 0) into earned from mtoken_ledger where delta > 0 and is_earned_reason(reason);
  select coalesce(sum(delta), 0) into purchased from mtoken_ledger where delta > 0 and reason = 'purchase';
  select coalesce(sum(delta), 0) into granted from mtoken_ledger
   where delta > 0 and not is_earned_reason(reason) and reason not in ('purchase', 'transfer_in');
  select coalesce(sum(amount), 0) into redeemed from cashout_requests where status = 'paid';
  select coalesce(sum(amount), 0) into pending from cashout_requests where status = 'requested';
  select * into attest from reserve_attest order by at desc limit 1;
  return jsonb_build_object(
    'outstanding', outstanding,
    'earned_minted', earned,
    'purchased_minted', purchased,
    'granted_minted', granted,
    'redeemed_paid', redeemed,
    'pending_cashouts', pending,
    'reserve_dollars', coalesce(attest.dollars, 0),
    'attested_at', attest.at
  );
end;
$$;
grant execute on function public.reserve_stats() to anon, authenticated;

-- self-checks: expect 1 · 1 · 1
select count(*) as queue_ready from information_schema.tables where table_name = 'cashout_requests';
select count(*) as redeemable_ready from pg_proc where proname = 'my_redeemable';
select count(*) as stats_ready from pg_proc where proname = 'reserve_stats';
