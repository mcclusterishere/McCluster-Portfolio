-- THE MEMBER AGREEMENT — every signature on the record.
-- Joining the Association IS signing: the door requires the box, and
-- the signature (account, version, time, where) files here the moment
-- the account opens. Members read their own; only the admin reads all.

create table if not exists public.agreements (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  owner   uuid not null,
  version text not null default 'v1-2026-07',
  context text default '',
  unique (owner, version)          -- one signature per member per version
);
alter table public.agreements enable row level security;

drop policy if exists "members sign for themselves" on public.agreements;
create policy "members sign for themselves"
  on public.agreements for insert
  to authenticated
  with check (owner = auth.uid());

drop policy if exists "members read their own signature" on public.agreements;
create policy "members read their own signature"
  on public.agreements for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- self-check: expect 1
select count(*) as agreement_ready from information_schema.tables
 where table_name = 'agreements' and table_schema = 'public';
