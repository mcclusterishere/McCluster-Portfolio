-- ============================================================
-- RECORDS + THE RELATIONSHIP TABLE — works the house owns, split
-- between the Chasers who made them, locked when everyone accepts.
-- This is the spine every collaboration rides: one record, many
-- parties, one relationship table (record_splits) joining them.
-- Plus mint_profile — the backend for the Mint button.
-- Run AFTER admin-schema.sql (needs is_mcc_admin()). Safe to re-run.
-- ============================================================

-- ---------- the Mint button's backend: create an unclaimed profile ----------
create or replace function public.mint_profile(
  p_name text, p_ticker text, p_slug text default '', p_headline text default '',
  p_blurb text default '', p_area text default '', p_roles jsonb default '["Music"]'::jsonb,
  p_photo text default null, p_links jsonb default '{}'::jsonb
) returns text language plpgsql security definer set search_path = public as $$
declare new_slug text;
begin
  if not is_mcc_admin() then raise exception 'the desk mints profiles'; end if;
  new_slug := lower(regexp_replace(coalesce(nullif(p_slug, ''), p_name), '[^a-z0-9]+', '-', 'g'));
  new_slug := trim(both '-' from new_slug);
  insert into providers (name, ticker, slug, headline, blurb, area, roles, photo, status, terms)
  values (p_name, upper(nullif(p_ticker, '')), new_slug, p_headline, p_blurb, p_area,
          coalesce(p_roles, '["Music"]'::jsonb), p_photo, 'live',
          jsonb_build_object('links', coalesce(p_links, '{}'::jsonb),
                             'notes', 'Minted unclaimed — the person claims it to take it over.'))
  on conflict (slug) do update
    set name = excluded.name, headline = excluded.headline, blurb = excluded.blurb,
        area = excluded.area, roles = excluded.roles, photo = excluded.photo;
  return new_slug;
end;
$$;
grant execute on function public.mint_profile(text,text,text,text,text,text,jsonb,text,jsonb) to authenticated;

-- ---------- records: works the house owns / stewards ----------
create table if not exists public.records (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz default now(),
  slug       text unique not null,
  title      text not null,
  kind       text not null default 'song',
  free       boolean not null default true,          -- loss-leader: out for free
  house_owns boolean not null default true,          -- released under Equity Uprise
  streams    integer not null default 0,
  status     text not null default 'proposed' check (status in ('proposed','locked','pulled')),
  created_by uuid default auth.uid()
);
alter table public.records enable row level security;
drop policy if exists "records are public" on public.records;
create policy "records are public" on public.records for select using (true);
drop policy if exists "the desk works records" on public.records;
create policy "the desk works records" on public.records for all
  using (is_mcc_admin()) with check (is_mcc_admin());

-- ---------- record_splits: THE RELATIONSHIP TABLE ----------
-- one row per party per record: who, what share, did they accept.
create table if not exists public.record_splits (
  id          uuid primary key default gen_random_uuid(),
  record_id   uuid not null references public.records(id) on delete cascade,
  party_slug  text not null,                         -- the Chaser's listing slug
  party_owner uuid,                                  -- filled when they've claimed + accepted
  pct         numeric(5,2) not null check (pct >= 0 and pct <= 100),
  accepted    boolean not null default false,
  at          timestamptz default now(),
  unique (record_id, party_slug)
);
alter table public.record_splits enable row level security;
drop policy if exists "splits are public" on public.record_splits;
create policy "splits are public" on public.record_splits for select using (true);
-- writes only through the functions below

-- ---------- propose a split: create the record + the parties (pending) ----------
-- p_parties = jsonb array of {slug, pct}. The desk proposes; parties accept.
create or replace function public.propose_split(
  p_title text, p_slug text, p_parties jsonb, p_free boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare rec_id uuid; party jsonb; tot numeric := 0; o uuid;
begin
  if not is_mcc_admin() then raise exception 'the desk proposes records'; end if;
  for party in select * from jsonb_array_elements(p_parties) loop
    tot := tot + coalesce((party->>'pct')::numeric, 0);
  end loop;
  if round(tot) <> 100 then raise exception 'splits must total 100, got %', tot; end if;

  insert into records (slug, title, free, house_owns, status)
  values (lower(p_slug), p_title, coalesce(p_free, true), true, 'proposed')
  returning id into rec_id;

  for party in select * from jsonb_array_elements(p_parties) loop
    select owner into o from providers where slug = party->>'slug' limit 1;
    insert into record_splits (record_id, party_slug, party_owner, pct)
    values (rec_id, party->>'slug', o, (party->>'pct')::numeric);
  end loop;
  return rec_id;
end;
$$;
grant execute on function public.propose_split(text, text, jsonb, boolean) to authenticated;

-- ---------- accept your leg — when all accept, the record LOCKS ----------
create or replace function public.accept_split(p_record_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare rec_id uuid; open_count int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select id into rec_id from records where slug = lower(p_record_slug);
  if rec_id is null then raise exception 'no such record'; end if;
  update record_splits s set accepted = true, party_owner = auth.uid()
   where s.record_id = rec_id
     and s.party_slug in (select slug from providers where owner = auth.uid());
  select count(*) into open_count from record_splits where record_id = rec_id and not accepted;
  if open_count = 0 then
    update records set status = 'locked' where id = rec_id;
    return 'locked';
  end if;
  return 'accepted — waiting on ' || open_count || ' more';
end;
$$;
grant execute on function public.accept_split(text) to authenticated;

-- ---------- the board: a record with its parties (profile + desk read) ----------
create or replace function public.record_board(p_record_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  select jsonb_build_object(
    'record', to_jsonb(r),
    'splits', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', s.party_slug, 'pct', s.pct, 'accepted', s.accepted) order by s.pct desc)
      from record_splits s where s.record_id = r.id), '[]'::jsonb)
  ) into out from records r where r.slug = lower(p_record_slug);
  return out;
end;
$$;
grant execute on function public.record_board(text) to anon, authenticated;

-- ---------- count a stream (called when the record plays) ----------
create or replace function public.stream_record(p_record_slug text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update records set streams = streams + 1 where slug = lower(p_record_slug) returning streams into n;
  return coalesce(n, 0);
end;
$$;
grant execute on function public.stream_record(text) to anon, authenticated;

-- ============================================================
-- FIRST USE CASE — "Upset" (Hitman Benji × Rahndrx × Raheem), free
-- under Equity Uprise, three-way even split. Run this once after
-- the functions above to file the proposal; each party accepts by
-- claiming their profile and calling accept_split('upset').
-- ============================================================
select public.propose_split(
  'Upset',
  'upset',
  '[{"slug":"hitman-benji","pct":34},{"slug":"rahndrx","pct":33},{"slug":"raheem","pct":33}]'::jsonb,
  true
);

-- self-checks: expect 2 tables, 6 functions, 1 record
select count(*) as records_tables from information_schema.tables where table_name in ('records', 'record_splits');
select count(*) as records_fns from pg_proc
 where proname in ('mint_profile', 'propose_split', 'accept_split', 'record_board', 'stream_record');
select slug, title, status, free from public.records where slug = 'upset';
