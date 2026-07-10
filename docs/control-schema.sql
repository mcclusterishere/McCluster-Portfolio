-- THE CONTROL ROUTE — the members steer the ship.
-- The second way equity rises. The MONEY route is the service-provider
-- angle (deals, the rack, the plug). The CONTROL route is governance:
-- members propose changes to the app, vote them up or down, and the
-- desk builds what the floor decides. Both routes raise equity; a
-- member can run one, the other, or both.
--
-- proposals   anyone with an account files an idea (three kinds:
--             'app' = how the platform is built, 'city' = a local
--             civic position/action, 'policy' = a stance on real law).
-- votes       one member, one vote per proposal (up or down). The
--             tally is public; who voted is not.
-- Standing (weight) is EARNED, but the vote itself is one-per-head —
-- weight only orders the queue, it never overrides a head count.

create table if not exists public.proposals (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  owner    uuid not null default auth.uid(),
  slug     text default '',                 -- the proposer's ticker, for the byline
  kind     text not null default 'app' check (kind in ('app', 'city', 'policy')),
  title    text not null check (char_length(title) between 4 and 120),
  body     text default '' check (char_length(body) <= 2000),
  status   text not null default 'open' check (status in ('open', 'building', 'shipped', 'parked', 'closed')),
  note     text default ''                  -- the desk's word back
);
alter table public.proposals enable row level security;

drop policy if exists "proposals are public" on public.proposals;
create policy "proposals are public" on public.proposals for select using (true);

drop policy if exists "members file proposals" on public.proposals;
create policy "members file proposals" on public.proposals for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "proposers edit their own open proposals" on public.proposals;
create policy "proposers edit their own open proposals" on public.proposals for update
  using (owner = auth.uid() and status = 'open');

drop policy if exists "the desk rules proposals" on public.proposals;
create policy "the desk rules proposals" on public.proposals for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

create table if not exists public.proposal_votes (
  proposal uuid not null references public.proposals on delete cascade,
  owner    uuid not null default auth.uid(),
  dir      int not null check (dir in (-1, 1)),
  at       timestamptz default now(),
  primary key (proposal, owner)             -- one member, one vote
);
alter table public.proposal_votes enable row level security;

drop policy if exists "vote tallies are public" on public.proposal_votes;
create policy "vote tallies are public" on public.proposal_votes for select using (true);

drop policy if exists "members cast their own vote" on public.proposal_votes;
create policy "members cast their own vote" on public.proposal_votes for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "members change their own vote" on public.proposal_votes;
create policy "members change their own vote" on public.proposal_votes for update
  using (owner = auth.uid());

drop policy if exists "members pull their own vote" on public.proposal_votes;
create policy "members pull their own vote" on public.proposal_votes for delete
  using (owner = auth.uid());

-- the board: every proposal with its tally and the caller's own vote,
-- newest-hottest first. One call feeds the whole Control room.
create or replace function public.proposal_board()
returns table (
  id uuid, at timestamptz, kind text, title text, body text, status text, note text,
  proposer text, ups bigint, downs bigint, my_vote int
) language sql stable security definer set search_path = public as $$
  select p.id, p.at, p.kind, p.title, p.body, p.status, p.note,
    coalesce(pr.name, p.slug, 'a member') as proposer,
    coalesce((select count(*) from proposal_votes v where v.proposal = p.id and v.dir = 1), 0) as ups,
    coalesce((select count(*) from proposal_votes v where v.proposal = p.id and v.dir = -1), 0) as downs,
    coalesce((select v.dir from proposal_votes v where v.proposal = p.id and v.owner = auth.uid()), 0) as my_vote
  from proposals p
  left join providers pr on pr.owner = p.owner
  order by (p.status = 'open') desc, p.at desc
  limit 200;
$$;
grant execute on function public.proposal_board() to anon, authenticated;

-- cast (or change, or pull) a vote in one motion
create or replace function public.cast_vote(prop uuid, direction int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if direction = 0 then
    delete from proposal_votes where proposal = prop and owner = auth.uid();
  else
    insert into proposal_votes (proposal, owner, dir) values (prop, auth.uid(), sign(direction))
    on conflict (proposal, owner) do update set dir = sign(direction), at = now();
  end if;
end;
$$;
grant execute on function public.cast_vote(uuid, int) to authenticated;

-- self-checks: expect 1 · 1 · 1
select count(*) as proposals_ready from information_schema.tables where table_name = 'proposals';
select count(*) as votes_ready from information_schema.tables where table_name = 'proposal_votes';
select count(*) as board_ready from pg_proc where proname = 'proposal_board';
