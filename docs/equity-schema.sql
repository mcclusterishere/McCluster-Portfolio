-- ============================================================
-- THE EQUITY POOL — and the wall that makes it honest.
--
-- Two things ship together here because they share one pipe:
--
-- 1) THE FIX. Until now a completed deal minted redeemable credit
--    from a fee a PARTICIPANT typed into the deal. Anyone could
--    complete a fake deal against themselves and mint real,
--    cash-outable dollars. This closes it: earned credit mints ONLY
--    against money Stripe actually captured (recorded by the webhook
--    on the service role, which no browser can forge), and never
--    against a self-dealt buyer==provider leg.
--
-- 2) THE POOL. A mandatory 1% draw on every real transaction accrues
--    as EQUITY POINTS to the profile that ran the transaction (the
--    provider). Customers accrue nothing unless that provider flips
--    the share toggle on their own dashboard. Equity points are
--    NON-CASHABLE by construction — their reason never matches the
--    earned test, so they can never enter the cash-out rail. A
--    member's stake is their points ÷ the whole pool.
--
-- Paste whole into Supabase → SQL editor → Run. Safe to re-run.
-- Requires: the webhook redeploy that records deal_payments.
-- ============================================================

-- ---------- the only proof of real money (service role writes it) ----------
create table if not exists public.deal_payments (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  deal_id uuid not null,
  gross   numeric(12,2) not null check (gross >= 0),   -- what the buyer actually paid, dollars
  ref     text unique                                  -- stripe session id: one record per capture
);
alter table public.deal_payments enable row level security;
-- RLS on with NO policy = locked to the service role and security-definer
-- functions only. The webhook writes it; the mint and the draw read it.

-- ---------- the mint, rewritten: real money is the ONLY mint ----------
create or replace function public.mint_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  paid numeric;
  provider_owner uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    -- the captured total for this deal — zero if the card rail never ran
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
    -- the buyer's 1% back — never when the buyer IS the provider (no self-deal print)
    if new.from_owner is not null and new.from_owner is distinct from provider_owner then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (new.from_owner, round(paid * 0.01, 2), 'deal completed — thank you for moving money here', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
-- trigger already exists from mtoken-schema; re-bind to be safe
drop trigger if exists mint_on_completion_t on public.deals;
create trigger mint_on_completion_t after update on public.deals
  for each row execute function public.mint_on_completion();

-- ---------- the profile type + the provider's share toggle ----------
-- HARDENED (audit #7): default 'customer' — you're a customer until you
-- provide. The desk (or Connect onboarding) promotes to 'provider'.
alter table public.providers add column if not exists account_type text default 'customer';
alter table public.providers add column if not exists equity_share boolean default false;
-- a customer can't restyle themselves a provider to farm equity: the desk sets type
revoke update (account_type) on public.providers from authenticated, anon;
-- equity_share stays the provider's own switch on their dashboard

-- ---------- the equity ledger (non-cashable by design) ----------
create table if not exists public.equity_ledger (
  id     uuid primary key default gen_random_uuid(),
  at     timestamptz default now(),
  owner  uuid not null,
  points numeric(14,2) not null,          -- 1 point = $1 drawn into the pool for them
  reason text default '',
  ref    text default '',
  unique (owner, ref, reason)             -- one draw per capture per person
);
create index if not exists equity_owner_idx on public.equity_ledger (owner);
alter table public.equity_ledger enable row level security;
drop policy if exists "members read their own equity" on public.equity_ledger;
create policy "members read their own equity"
  on public.equity_ledger for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- no insert policy: only the draw below writes it

-- ---------- the 1% draw: fires on every recorded real transaction ----------
create or replace function public.equity_draw() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  provider_owner uuid; buyer uuid; share_on boolean; draw numeric; d_to text;
begin
  draw := round(new.gross * 0.01, 2);
  if draw <= 0 then return new; end if;
  select to_slug, from_owner into d_to, buyer from deals where id = new.deal_id;
  select owner, coalesce(equity_share, false) into provider_owner, share_on
    from providers where slug = d_to limit 1;
  -- the profile that ran the transaction always accrues the equity
  if provider_owner is not null then
    insert into equity_ledger (owner, points, reason, ref)
    values (provider_owner, draw, 'transaction draw', new.ref)
    on conflict (owner, ref, reason) do nothing;
  end if;
  -- the customer accrues only if this provider opened the share on their desk
  if share_on and buyer is not null and buyer is distinct from provider_owner then
    insert into equity_ledger (owner, points, reason, ref)
    values (buyer, draw, 'transaction draw (shared)', new.ref)
    on conflict (owner, ref, reason) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists equity_draw_t on public.deal_payments;
create trigger equity_draw_t after insert on public.deal_payments
  for each row execute function public.equity_draw();

-- ---------- what a member owns, and how big the pool is ----------
create or replace function public.my_equity()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare mine numeric; pool numeric;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(sum(points), 0) into mine from equity_ledger where owner = auth.uid();
  select coalesce(sum(points), 0) into pool from equity_ledger;
  return jsonb_build_object(
    'points', mine,
    'pool', pool,
    'stake_pct', case when pool > 0 then round(mine / pool * 100, 4) else 0 end
  );
end;
$$;
grant execute on function public.my_equity() to authenticated;

create or replace function public.equity_pool()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pool numeric; holders int;
begin
  select coalesce(sum(points), 0), count(distinct owner) into pool, holders from equity_ledger;
  return jsonb_build_object('pool', pool, 'holders', holders);
end;
$$;
grant execute on function public.equity_pool() to anon, authenticated;

-- self-checks: expect 2 tables, 4 functions
select count(*) as equity_tables from information_schema.tables
 where table_name in ('deal_payments', 'equity_ledger');
select count(*) as equity_fns from pg_proc
 where proname in ('mint_on_completion', 'equity_draw', 'my_equity', 'equity_pool');
