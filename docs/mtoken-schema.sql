-- ============================================================
-- M TOKEN — closed-loop platform credit, minted by real work.
-- 1 token = $1 of platform credit (fees, promotion, bookings).
-- NOT a floating asset, NOT tradeable off-platform, NO cash-out:
-- the Starbucks-stars structure, deliberately. When the Stripe
-- rails land, the ledger becomes dollar-backed; the shape holds.
--
-- MINTING is server-side only (the trigger below) — clients can
-- read their ledger, never write it. On a deal reaching
-- 'completed': the provider earns 5% of the fee in tokens, the
-- buyer earns 1% back. Real money is the only mint.
-- Paste into Supabase → SQL editor → Run. Safe to re-run.
-- ============================================================

create table if not exists mtoken_ledger (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  delta numeric(12,2) not null,
  reason text default '',
  ref text default '',                       -- deal id or event key
  created_at timestamptz default now(),
  unique (owner, ref, reason)                -- one mint per event per person
);

create index if not exists mtoken_owner_idx on mtoken_ledger (owner, created_at desc);

alter table mtoken_ledger enable row level security;

drop policy if exists "members read their own ledger" on mtoken_ledger;
create policy "members read their own ledger"
  on mtoken_ledger for select using (owner = auth.uid());
-- no insert/update/delete policies on purpose: only the trigger writes

-- HARDENED (audit #1): earned credit mints ONLY against money Stripe
-- actually captured (deal_payments, written by the webhook on the
-- service role — no browser can forge it), never against a fee a
-- participant typed, and never on a self-dealt buyer==provider leg.
-- This body is identical to docs/equity-schema.sql and
-- docs/hardening-schema.sql so no run-order can re-open the hole.
create or replace function mint_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  paid numeric;
  provider_owner uuid;
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

drop trigger if exists mint_on_completion_t on deals;
create trigger mint_on_completion_t after update on deals
  for each row execute function mint_on_completion();
