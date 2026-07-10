-- THE BRAIN — the platform studies itself and pitches the desk.
-- Two minds, one docket:
--   brain_observe()  the ALGORITHM: pure SQL rules that read the live
--                    tables nightly and file pitches when the numbers
--                    say something (funnel leaks, stalled members,
--                    dying listings, credit velocity). No key, no
--                    cost, runs forever on the night shift.
--   the-brain fn     the AI: on demand from Mission Control, reads
--                    the whole platform state and writes deeper
--                    strategy pitches with evidence.
-- Every pitch lands here with a status; the DESK decides. Nothing
-- ships itself — the brain proposes, the owner disposes.

create table if not exists public.brain_pitches (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  source   text not null default 'algorithm' check (source in ('algorithm', 'ai', 'gemini')),
  kind     text default 'growth',
  title    text not null,
  pitch    text not null,
  evidence text default '',
  impact   text default '',
  effort   text default '',
  status   text not null default 'new' check (status in ('new', 'approved', 'parked', 'dismissed')),
  unique (title, status)      -- the same open pitch never files twice
);
alter table public.brain_pitches enable row level security;

drop policy if exists "the desk reads the brain" on public.brain_pitches;
create policy "the desk reads the brain"
  on public.brain_pitches for select
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "the desk rules the brain" on public.brain_pitches;
create policy "the desk rules the brain"
  on public.brain_pitches for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- inserts come from the worker and the AI function (service role only)

-- the algorithm: rules over live tables; each firing is idempotent
-- because (title, status='new') collides on the unique key
create or replace function public.brain_observe()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; v_members int; v_listed int; v_walked int; v_stalled int;
        v_pending int; v_deals_open int; v_deals_done int; v_cards int;
begin
  select count(*) into v_members from providers where owner is not null;
  select count(*) into v_listed from providers where owner is not null and status = 'live';
  select count(distinct uid) into v_walked from events where name = 'welcome_done' and uid is not null;
  select count(*) into v_stalled from providers p
   where p.owner is not null and p.created_at < now() - interval '7 days'
     and not exists (select 1 from events e where e.uid = p.owner and e.at > now() - interval '7 days');
  select count(*) into v_pending from providers where status = 'pending' and created_at < now() - interval '3 days';
  select count(*) into v_deals_open from deals where status in ('proposed','countered','locked','signed');
  select count(*) into v_deals_done from deals where status = 'completed';
  select count(*) into v_cards from civic_profiles;

  if v_members >= 5 and v_walked * 2 < v_members then
    insert into brain_pitches (source, kind, title, pitch, evidence, impact, effort)
    values ('algorithm', 'funnel', 'The walk-in is leaking',
      'Under half of the members ever finish the walk-in, so most never hear the economy explained. Pitch: push a notification nudge to unfinished members and put a bounty (1 E⤴) on finishing the walk.',
      v_walked || ' of ' || v_members || ' members completed welcome_done', 'more members who understand the credit = more deals', 'small')
    on conflict (title, status) do nothing;
    if found then n := n + 1; end if;
  end if;

  if v_stalled >= 3 then
    insert into brain_pitches (source, kind, title, pitch, evidence, impact, effort)
    values ('algorithm', 'retention', 'Ghosts are forming',
      v_stalled || ' member(s) have not moved in 7+ days. Pitch: a win-back push ("your ticker moved while you were gone") and a Grind streak amnesty for returners.',
      v_stalled || ' accounts silent 7+ days', 'revives the daily-active base the whole staged market rides on', 'small')
    on conflict (title, status) do nothing;
    if found then n := n + 1; end if;
  end if;

  if v_pending > 0 then
    insert into brain_pitches (source, kind, title, pitch, evidence, impact, effort)
    values ('algorithm', 'ops', 'Listings are waiting on the desk',
      v_pending || ' listing(s) have sat pending 3+ days. Pitch: approve or deny them today — a pending listing is a member who cannot yet be found or paid.',
      v_pending || ' pending listings older than 3 days', 'every approval is a new door on the floor', 'minutes')
    on conflict (title, status) do nothing;
    if found then n := n + 1; end if;
  end if;

  if v_deals_open >= 3 and v_deals_done = 0 then
    insert into brain_pitches (source, kind, title, pitch, evidence, impact, effort)
    values ('algorithm', 'economy', 'Deals open, none closing',
      v_deals_open || ' deals are open with zero completions. Pitch: work one deal end-to-end with a member by hand this week — the first completed deal mints the first earned credit and proves the whole economy.',
      v_deals_open || ' open · ' || v_deals_done || ' completed', 'the first real mint is the story every other member needs to see', 'a day')
    on conflict (title, status) do nothing;
    if found then n := n + 1; end if;
  end if;

  if v_members >= 10 and v_cards * 4 < v_members then
    insert into brain_pitches (source, kind, title, pitch, evidence, impact, effort)
    values ('algorithm', 'civic', 'The floor has not met the movement',
      'Most members have no civic card. Pitch: a push campaign routing the floor to the Civic HQ, and a fund bounty for the first verified voter-registration drive.',
      v_cards || ' civic cards across ' || v_members || ' members', 'turns the audience into the activation engine Equity Uprise exists for', 'small')
    on conflict (title, status) do nothing;
    if found then n := n + 1; end if;
  end if;

  return n;
end;
$$;
revoke execute on function public.brain_observe() from public, anon, authenticated;

-- the algorithm joins the night shift (idempotent schedule)
select cron.schedule('mcc-brain-nightly', '17 4 * * *', 'select public.brain_observe()');
-- and thinks once right now
select public.brain_observe();

-- self-checks: expect 1 · 1
select count(*) as brain_ready from information_schema.tables where table_name = 'brain_pitches';
select count(*) as brain_scheduled from cron.job where jobname = 'mcc-brain-nightly';
