-- THE HOUSE — service bounties paid for in E-Up credit.
-- The capture engine: the house puts real services on the shelf (a music
-- video shoot, a mix, a studio day), priced in credit that must be EARNED,
-- so claiming one requires working the platform — run the claim run,
-- complete deals, get people to SEND you credit. Every path to the prize
-- is a path deeper into the app. One claim per person per offer,
-- enforced by the same ledger law as every mint.

create table if not exists public.house_offers (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title      text not null,
  blurb      text default '',
  kind       text default 'service',
  price      numeric(12,2) not null check (price > 0),
  stock      int,                              -- null = unlimited
  area       text default '',
  active     boolean not null default true
);
alter table public.house_offers enable row level security;

drop policy if exists "the shelf is public" on public.house_offers;
create policy "the shelf is public"
  on public.house_offers for select using (active = true);

drop policy if exists "the admin stocks the shelf" on public.house_offers;
create policy "the admin stocks the shelf"
  on public.house_offers for all
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org')
  with check (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

create table if not exists public.house_claims (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  offer_id uuid references public.house_offers on delete set null,
  owner    uuid not null,
  paid     numeric(12,2) not null,
  status   text not null default 'claimed' check (status in ('claimed','booked','done','denied')),
  unique (offer_id, owner)                     -- one claim per person per offer
);
alter table public.house_claims enable row level security;

drop policy if exists "claimants see their own" on public.house_claims;
create policy "claimants see their own"
  on public.house_claims for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "the admin works the claims" on public.house_claims;
create policy "the admin works the claims"
  on public.house_claims for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- inserts happen ONLY through the function below

create or replace function public.claim_house_offer(offer uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  o record;
  bal numeric;
  taken int;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  select * into o from house_offers where id = offer and active = true;
  if o is null then
    raise exception 'that offer is off the shelf';
  end if;
  select count(*) into taken from house_claims where offer_id = offer and status <> 'denied';
  if o.stock is not null and taken >= o.stock then
    raise exception 'all claimed — watch the shelf for the next one';
  end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  if bal < o.price then
    raise exception 'you are % short — stack it: the claim run, deals, or credit sent your way', (o.price - bal);
  end if;
  -- the pay-the-house leg: unique(owner, ref, reason) makes double-claims impossible
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), -o.price, 'house_claim', offer::text);
  insert into house_claims (offer_id, owner, paid)
  values (offer, auth.uid(), o.price);
  return bal - o.price;
end;
$$;
grant execute on function public.claim_house_offer(uuid) to authenticated;

-- THE CAMPAIGN SEED: the free music video shoot, Atlanta.
-- Priced at 1,500 ᴹ on purpose: the 1,000 bankroll alone can't touch it —
-- the winner has to EARN or BE SENT the last 500. Stock of 1: a race.
insert into public.house_offers (title, blurb, price, stock, area, kind)
select 'Music Video Shoot — On The House',
       'A full music video shoot with the McCluster camera team: concept, shoot day, edit, delivered. One artist takes it. Stack 1,500 and pay the house — every one earned on the record or staked by your people.',
       1500.00, 1, 'Atlanta', 'service'
where not exists (select 1 from public.house_offers where title = 'Music Video Shoot — On The House');

-- self-check: expect 1 · 1
select count(*) as house_ready from pg_proc where proname = 'claim_house_offer';
select count(*) as shelf_stocked from public.house_offers where active = true;
