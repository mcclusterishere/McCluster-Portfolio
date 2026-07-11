-- ============================================================
-- CREWS — the social engine that feeds the score.
-- A crew is a named unit with a boss, a roster, and a COLLECTIVE
-- score: the sum of every member's real game points off the tape.
-- One crew per member (your crew is your street identity, not a
-- subscription list). Rosters are public; joining rings the
-- boss's bell. Run after inbox.sql. Safe to re-run.
-- ============================================================

create table if not exists public.crews (
  id    uuid primary key default gen_random_uuid(),
  slug  text unique not null,
  name  text not null check (char_length(name) between 3 and 24),
  motto text default '' check (char_length(motto) <= 80),
  color text default '#c99d45' check (color ~ '^#[0-9a-fA-F]{6}$'),
  boss  uuid not null default auth.uid(),
  at    timestamptz default now()
);
alter table public.crews enable row level security;
drop policy if exists "crews are public" on public.crews;
create policy "crews are public" on public.crews for select using (true);
-- creation happens through create_crew() only — no direct insert policy

create table if not exists public.crew_members (
  crew  uuid not null references public.crews on delete cascade,
  owner uuid not null default auth.uid(),
  role  text not null default 'member' check (role in ('boss', 'member')),
  at    timestamptz default now(),
  primary key (crew, owner)
);
create unique index if not exists one_crew_per_member on public.crew_members (owner);
alter table public.crew_members enable row level security;
drop policy if exists "rosters are public" on public.crew_members;
create policy "rosters are public" on public.crew_members for select using (true);
drop policy if exists "walk out any time" on public.crew_members;
create policy "walk out any time" on public.crew_members for delete using (owner = auth.uid());
-- joining happens through join_crew() only — the bell rides it

create or replace function public.create_crew(p_name text, p_motto text default '', p_color text default '#c99d45')
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid; cslug text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'why', 'sign in first'); end if;
  if exists (select 1 from crew_members where owner = auth.uid()) then
    return jsonb_build_object('ok', false, 'why', 'you already ride with a crew — leave it first');
  end if;
  cslug := lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  cslug := trim(both '-' from cslug);
  if char_length(cslug) < 3 then return jsonb_build_object('ok', false, 'why', 'give it a real name'); end if;
  if exists (select 1 from crews where slug = cslug) then
    return jsonb_build_object('ok', false, 'why', 'that name is taken');
  end if;
  insert into crews (slug, name, motto, color, boss)
  values (cslug, p_name, left(coalesce(p_motto, ''), 80), coalesce(nullif(p_color, ''), '#c99d45'), auth.uid())
  returning id into cid;
  insert into crew_members (crew, owner, role) values (cid, auth.uid(), 'boss');
  return jsonb_build_object('ok', true, 'slug', cslug);
end $$;
grant execute on function public.create_crew(text, text, text) to authenticated;

create or replace function public.join_crew(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; me text := 'A new member';
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'why', 'sign in first'); end if;
  if exists (select 1 from crew_members where owner = auth.uid()) then
    return jsonb_build_object('ok', false, 'why', 'you already ride with a crew — leave it first');
  end if;
  select id, name, boss into c from crews where slug = p_slug limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'why', 'no crew by that name'); end if;
  insert into crew_members (crew, owner) values (c.id, auth.uid());
  begin
    select coalesce(nullif(name, ''), 'A new member') into me from providers where owner = auth.uid() limit 1;
  exception when others then null; end;
  perform notify(c.boss, 'crew', 'Your crew grew',
    coalesce(me, 'A new member') || ' just joined ' || c.name || '.', 'crews.html');
  return jsonb_build_object('ok', true, 'name', c.name);
end $$;
grant execute on function public.join_crew(text) to authenticated;

create or replace function public.leave_crew()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select cm.crew, cm.role, c.name, c.id as cid into c
    from crew_members cm join crews c on c.id = cm.crew
   where cm.owner = auth.uid() limit 1;
  if c.crew is null then return jsonb_build_object('ok', false, 'why', 'no crew to leave'); end if;
  delete from crew_members where owner = auth.uid();
  -- a boss walking out hands the oldest member the keys; an empty crew folds
  if c.role = 'boss' then
    update crews set boss = m.owner from
      (select owner from crew_members where crew = c.cid order by at asc limit 1) m
     where crews.id = c.cid;
    update crew_members set role = 'boss'
     where crew = c.cid and owner = (select boss from crews where id = c.cid);
    delete from crews where id = c.cid
      and not exists (select 1 from crew_members where crew = c.cid);
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.leave_crew() to authenticated;

-- the crew board: every crew ranked by its COLLECTIVE real points
create or replace function public.crew_board(p_limit int default 50)
returns table (slug text, name text, motto text, color text, members bigint, points numeric)
language sql stable security definer set search_path = public as $$
  select c.slug, c.name, c.motto, c.color,
         count(m.owner) as members,
         coalesce(sum(pts.p), 0) as points
    from crews c
    left join crew_members m on m.crew = c.id
    left join lateral (
      select (ss.parts ->> 'points')::numeric as p
        from score_snapshots ss where ss.owner = m.owner
       order by ss.at desc limit 1
    ) pts on true
   group by c.id
   order by points desc, members desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
grant execute on function public.crew_board(int) to anon, authenticated;

-- my crew: the card + the roster, names on the record
create or replace function public.my_crew()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when cm.crew is null then null else jsonb_build_object(
    'slug', c.slug, 'name', c.name, 'motto', c.motto, 'color', c.color,
    'role', cm.role,
    'roster', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', coalesce(p.name, 'Member'), 'slug', p.slug,
        'ticker', upper(coalesce(p.ticker, '')), 'role', m2.role) order by m2.at), '[]'::jsonb)
      from crew_members m2
      left join lateral (select name, slug, ticker from providers where owner = m2.owner limit 1) p on true
      where m2.crew = cm.crew))
  end
  from (select crew, role from crew_members where owner = auth.uid() limit 1) cm
  left join crews c on c.id = cm.crew;
$$;
grant execute on function public.my_crew() to authenticated;

-- self-check: expect 2 tables · 5 functions
select count(*) as crew_tbls from information_schema.tables
 where table_name in ('crews', 'crew_members');
select count(*) as crew_fns from pg_proc
 where proname in ('create_crew', 'join_crew', 'leave_crew', 'crew_board', 'my_crew');
