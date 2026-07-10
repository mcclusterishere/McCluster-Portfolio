-- THE CIVIC HQ — Equity Uprise's community system.
-- Two kinds of accounts share one floor: FAN accounts (here for the
-- music and the movement) and POLICY accounts (here to work — state,
-- federal, trade, local). The civic card is SELF-REPORTED and
-- PRIVATE BY DESIGN: party, registration, district, and voting
-- history are political data — only the member and the desk can ever
-- read a row; the public sees aggregates only, through one function
-- that returns counts and nothing else.

create table if not exists public.civic_profiles (
  owner      uuid primary key default auth.uid(),
  at         timestamptz default now(),
  updated_at timestamptz default now(),
  mode       text not null default 'fan' check (mode in ('fan', 'policy')),
  state      text default '',
  district   text default '',
  party      text default '',          -- self-reported, optional, never public
  registered text default '' check (registered in ('', 'yes', 'no', 'unsure')),
  last_voted text default '',          -- a year, or '' — self-reported
  focus      jsonb default '[]'::jsonb -- ["state","federal","trade","local"]
);
alter table public.civic_profiles enable row level security;

drop policy if exists "members write their own civic card" on public.civic_profiles;
create policy "members write their own civic card"
  on public.civic_profiles for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "members update their own civic card" on public.civic_profiles;
create policy "members update their own civic card"
  on public.civic_profiles for update
  using (owner = auth.uid());

drop policy if exists "civic cards are private" on public.civic_profiles;
create policy "civic cards are private"
  on public.civic_profiles for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- the public pulse: aggregates only — no names, no rows, no parties
create or replace function public.civic_pulse()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  select jsonb_build_object(
    'members',         (select count(*) from civic_profiles),
    'policy_accounts', (select count(*) from civic_profiles where mode = 'policy'),
    'registered',      (select count(*) from civic_profiles where registered = 'yes'),
    'states',          (select count(distinct upper(state)) from civic_profiles where state <> '')
  ) into out;
  return out;
end;
$$;
grant execute on function public.civic_pulse() to anon, authenticated;

-- self-check: expect 1 · 1
select count(*) as civic_ready from information_schema.tables where table_name = 'civic_profiles';
select count(*) as pulse_ready from pg_proc where proname = 'civic_pulse';
