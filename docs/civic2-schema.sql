-- CIVIC, MINTED — the fan/policy system grows teeth.
-- One civic identity, many dimensions:
--   modes      fan AND/OR policy — both wearable at once (jsonb)
--   country    the member's system — the HQ teaches THEIR politics
--   issues     the portfolio: what they actually work on
--   the LADDER Witness → Advocate → Organizer → Delegate, computed
--              from VERIFIED actions only (cards filed, votes cast,
--              proposals carried, registration, appointment)
--   positions  real seats: the desk appoints members to named civic
--              roles in their city; the title wears as a public badge.

alter table public.civic_profiles add column if not exists country text default 'US';
alter table public.civic_profiles add column if not exists issues jsonb default '[]'::jsonb;
alter table public.civic_profiles add column if not exists modes jsonb default '["fan"]'::jsonb;

-- ---------- the appointed seats ----------
create table if not exists public.civic_roles (
  id     uuid primary key default gen_random_uuid(),
  at     timestamptz default now(),
  owner  uuid not null,
  slug   text not null,                    -- for public painting on the page
  title  text not null check (char_length(title) between 4 and 80),
  area   text default '',
  note   text default '',
  active boolean not null default true
);
alter table public.civic_roles enable row level security;

drop policy if exists "seats are public record" on public.civic_roles;
create policy "seats are public record"
  on public.civic_roles for select using (active = true or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "the desk appoints and revokes" on public.civic_roles;
create policy "the desk appoints and revokes"
  on public.civic_roles for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- inserts only through the function below

create or replace function public.grant_civic_role(to_name text, role_title text, role_area text default '')
returns text language plpgsql security definer set search_path = public as $$
declare rcpt record;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'matthew@mccluster.org' then
    raise exception 'the desk appoints';
  end if;
  select owner, slug into rcpt from providers
   where owner is not null
     and (upper(coalesce(ticker, '')) = upper(to_name) or slug = lower(to_name))
   limit 1;
  if rcpt is null then raise exception 'no claimed account behind that name'; end if;
  insert into civic_roles (owner, slug, title, area)
  values (rcpt.owner, rcpt.slug, role_title, coalesce(role_area, ''));
  return role_title || ' → ' || rcpt.slug;
end;
$$;
grant execute on function public.grant_civic_role(text, text, text) to authenticated;

-- ---------- the ladder: rank is EARNED, computed, never typed ----------
create or replace function public.civic_rank()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_card boolean; v_reg boolean; v_votes int; v_props int; v_ups int;
  v_seat text; v_rank text; v_next text;
begin
  if auth.uid() is null then return null; end if;
  select true, (registered = 'yes') into v_card, v_reg
    from civic_profiles where owner = auth.uid();
  v_card := coalesce(v_card, false); v_reg := coalesce(v_reg, false);
  select count(*) into v_votes from proposal_votes where owner = auth.uid();
  select count(*) into v_props from proposals where owner = auth.uid();
  select coalesce(max((select count(*) from proposal_votes v
                        where v.proposal = p.id and v.dir = 1)), 0)
    into v_ups from proposals p where p.owner = auth.uid();
  select title into v_seat from civic_roles
   where owner = auth.uid() and active order by at desc limit 1;

  if v_seat is not null then
    v_rank := 'Delegate'; v_next := 'You hold a seat — carry it.';
  elsif v_reg and (v_props >= 3 or (v_props >= 1 and v_ups >= 5)) then
    v_rank := 'Organizer';
    v_next := 'Delegates are appointed by the desk — keep organizing and the seat finds you.';
  elsif v_votes >= 3 or v_props >= 1 then
    v_rank := 'Advocate';
    v_next := 'Organizer takes: registered to vote, plus 3 proposals carried — or one that 5 people voted up.';
  elsif v_card then
    v_rank := 'Witness';
    v_next := 'Advocate takes: vote on 3 proposals, or bring one of your own.';
  else
    v_rank := 'Visitor';
    v_next := 'It starts with the civic card — file yours.';
  end if;

  return jsonb_build_object(
    'rank', v_rank, 'next', v_next,
    'card', v_card, 'registered', v_reg,
    'votes', v_votes, 'proposals', v_props, 'best_ups', v_ups,
    'seat', v_seat
  );
end;
$$;
grant execute on function public.civic_rank() to authenticated;

-- the public pulse learns the new dimensions (replaces the v1 pulse)
create or replace function public.civic_pulse()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  select jsonb_build_object(
    'members',         (select count(*) from civic_profiles),
    'policy_accounts', (select count(*) from civic_profiles
                         where mode = 'policy' or modes @> '"policy"'::jsonb),
    'registered',      (select count(*) from civic_profiles where registered = 'yes'),
    'states',          (select count(distinct upper(state)) from civic_profiles where state <> ''),
    'countries',       (select count(distinct upper(coalesce(country, 'US'))) from civic_profiles),
    'seats',           (select count(*) from civic_roles where active),
    'proposals',       (select count(*) from proposals),
    'votes_cast',      (select count(*) from proposal_votes)
  ) into out;
  return out;
end;
$$;
grant execute on function public.civic_pulse() to anon, authenticated;

-- self-checks: expect 3 · 1
select count(*) as civic2_fns from pg_proc
 where proname in ('grant_civic_role', 'civic_rank', 'civic_pulse');
select count(*) as seats_ready from information_schema.tables where table_name = 'civic_roles';
