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

create or replace function mint_on_completion() returns trigger as $$
declare
  fee numeric := coalesce((new.terms ->> 'fee')::numeric, 0);
  provider_owner uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and fee > 0 then
    select owner into provider_owner from providers where slug = new.to_slug limit 1;
    if provider_owner is not null then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (provider_owner, round(fee * 0.05, 2), 'deal completed — the work pays twice', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
    if new.from_owner is not null then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (new.from_owner, round(fee * 0.01, 2), 'deal completed — thank you for moving money here', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists mint_on_completion_t on deals;
create trigger mint_on_completion_t after update on deals
  for each row execute function mint_on_completion();
