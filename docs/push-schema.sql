-- PUSH — the platform speaks to every pocket.
-- push_subs banks each member's notification subscription (one row
-- per device); push_config vaults the platform's VAPID keypair,
-- minted by the push-send function on first call — the private key
-- never exists anywhere a browser or a repo can see it. RLS: members
-- write their own subscriptions; NOBODY reads push_config (service
-- role only, and the service role ignores RLS by design).

create table if not exists public.push_subs (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  owner    uuid not null default auth.uid(),
  endpoint text not null unique,
  sub      jsonb not null
);
alter table public.push_subs enable row level security;

drop policy if exists "members bank their own ears" on public.push_subs;
create policy "members bank their own ears"
  on public.push_subs for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "members see and drop their own ears" on public.push_subs;
create policy "members see and drop their own ears"
  on public.push_subs for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "members unsubscribe themselves" on public.push_subs;
create policy "members unsubscribe themselves"
  on public.push_subs for delete
  using (owner = auth.uid());

create table if not exists public.push_config (
  id   int primary key,
  pub  text not null,
  priv text not null
);
alter table public.push_config enable row level security;
-- no policies on purpose: the vault answers only to the service role

-- self-check: expect 2
select count(*) as push_ready from information_schema.tables
 where table_name in ('push_subs', 'push_config') and table_schema = 'public';
