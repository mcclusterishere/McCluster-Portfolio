-- ============================================================
-- THE WEB3 WING — the treasury, the academy, and the gas grants.
--
-- The play: the platform's pool buys real, existing cryptocurrency
-- on a licensed exchange (the desk does this OFF-platform — the app
-- never custodies keys or moves coins). The app does three honest
-- things:
--   1) TREASURY — the desk attests what the treasury holds (asset,
--      quantity, note), publicly readable. Don't trust — verify.
--   2) ACADEMY — members learn Web3 in lessons; progress lives here.
--   3) GAS GRANTS — a member who FINISHES the academy saves their
--      own wallet address and requests one small gas grant. The desk
--      fulfils it manually from the exchange and stamps the tx hash.
--      One per member, education-gated, server-enforced.
--
-- What this deliberately is NOT: no token is issued, no custody is
-- taken, no swaps happen in-app. That keeps the platform out of
-- money-transmission and securities territory; the treasury buy is
-- an ordinary asset purchase by the org, and grants are small gifts.
--
-- Paste whole into Supabase → SQL editor → Run. Safe to re-run.
-- Requires: admin-schema (is_mcc_admin), identifiers-schema.
-- ============================================================

-- ---------- let the identifier locker hold wallet addresses ----------
alter table public.member_identifiers drop constraint if exists member_identifiers_kind_check;
alter table public.member_identifiers add constraint member_identifiers_kind_check check (kind in (
  'isrc_prefix','isrc','iswc','upc','ipi','isni','ipn','dpid',
  'spotify_artist','apple_artist','youtube_channel','soundcloud',
  'pro','publisher','label','ein','other',
  'wallet_evm','wallet_sol','wallet_btc'));

-- ---------- 1 · the treasury, attested in public ----------
create table if not exists public.treasury_holdings (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  asset    text not null,                      -- 'ETH', 'BTC', 'USDC' …
  quantity numeric(24,8) not null check (quantity >= 0),
  note     text default ''                     -- exchange, cost basis, why
);
alter table public.treasury_holdings enable row level security;
drop policy if exists "the world reads the treasury" on public.treasury_holdings;
create policy "the world reads the treasury"
  on public.treasury_holdings for select using (true);
drop policy if exists "the desk attests the treasury" on public.treasury_holdings;
create policy "the desk attests the treasury"
  on public.treasury_holdings for all
  using (is_mcc_admin()) with check (is_mcc_admin());

-- ---------- 2 · academy progress: one row per member per lesson ----------
create table if not exists public.web3_progress (
  owner  uuid not null,
  lesson text not null check (lesson in (
    'wallets','seed-safety','gas','layers','scams','treasury')),
  at     timestamptz default now(),
  primary key (owner, lesson)
);
alter table public.web3_progress enable row level security;
drop policy if exists "your progress is yours" on public.web3_progress;
create policy "your progress is yours"
  on public.web3_progress for select
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "you log your own lessons" on public.web3_progress;
create policy "you log your own lessons"
  on public.web3_progress for insert
  with check (owner = auth.uid());

-- ---------- 3 · the gas grants: finish the academy, get your first gas ----------
create table if not exists public.gas_grants (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  owner   uuid not null unique,                -- ONE grant per member, ever
  address text not null check (address ~ '^0x[a-fA-F0-9]{40}$'),
  status  text not null default 'requested' check (status in ('requested','sent','denied')),
  tx_hash text default ''                      -- the desk stamps the receipt
);
alter table public.gas_grants enable row level security;
drop policy if exists "you see your own grant" on public.gas_grants;
create policy "you see your own grant"
  on public.gas_grants for select
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "the desk works the grants" on public.gas_grants;
create policy "the desk works the grants"
  on public.gas_grants for update
  using (is_mcc_admin());
-- inserts ONLY through the function below: the education gate is server law

create or replace function public.request_gas_grant(p_address text)
returns text language plpgsql security definer set search_path = public as $$
declare done int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_address !~ '^0x[a-fA-F0-9]{40}$' then
    raise exception 'that is not an EVM address — 0x plus 40 hex characters';
  end if;
  select count(*) into done from web3_progress where owner = auth.uid();
  if done < 6 then
    raise exception 'finish the academy first — % of 6 lessons done', done;
  end if;
  insert into gas_grants (owner, address) values (auth.uid(), lower(p_address));
  -- save the address to the identifier locker too (idempotent)
  insert into member_identifiers (owner, kind, value, label)
  values (auth.uid(), 'wallet_evm', lower(p_address), 'gas grant wallet')
  on conflict (owner, kind, value) do nothing;
  return 'requested — the desk sends your first gas and stamps the receipt here';
exception when unique_violation then
  raise exception 'one gas grant per member — yours is already on the books';
end;
$$;
grant execute on function public.request_gas_grant(text) to authenticated;

-- my academy card: progress + grant state in one call
create or replace function public.my_web3()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lessons jsonb; g record;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(jsonb_agg(lesson), '[]'::jsonb) into lessons
    from web3_progress where owner = auth.uid();
  select status, tx_hash, address into g from gas_grants where owner = auth.uid();
  return jsonb_build_object(
    'lessons', lessons,
    'grant_status', coalesce(g.status, ''),
    'grant_tx', coalesce(g.tx_hash, ''),
    'grant_address', coalesce(g.address, '')
  );
end;
$$;
grant execute on function public.my_web3() to authenticated;

-- self-checks: expect 3 tables · 2 functions
select count(*) as web3_tables from information_schema.tables
 where table_name in ('treasury_holdings', 'web3_progress', 'gas_grants');
select count(*) as web3_fns from pg_proc
 where proname in ('request_gas_grant', 'my_web3');
