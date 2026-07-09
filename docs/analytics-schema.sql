-- FIRST-PARTY ANALYTICS — the platform's own eyes.
-- Every MCC_TRACK event already goes to Google; from this paste on it
-- ALSO lands in your own database, and Mission Control reads it live.
-- Google keeps its copy behind Google's login — this copy is yours.
-- Write-only for the world (nobody can read anyone's exhaust back);
-- only the admin's sign-in can SELECT.

create table if not exists public.events (
  id    uuid primary key default gen_random_uuid(),
  at    timestamptz default now(),
  name  text not null,
  path  text default '',
  props jsonb default '{}'::jsonb,
  uid   uuid
);
create index if not exists events_at_idx on public.events (at desc);
create index if not exists events_name_idx on public.events (name, at desc);

alter table public.events enable row level security;

drop policy if exists "anyone writes the exhaust" on public.events;
create policy "anyone writes the exhaust"
  on public.events for insert
  to anon, authenticated
  with check (true);

drop policy if exists "only the admin reads it" on public.events;
create policy "only the admin reads it"
  on public.events for select
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- self-check: expect 1
select count(*) as analytics_ready from information_schema.tables
 where table_name = 'events' and table_schema = 'public';
