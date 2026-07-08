-- ============================================================
-- The Collab Room + performance packets. Run AFTER
-- docs/network-schema.sql and docs/admin-schema.sql in the
-- Supabase SQL editor (safe to re-run; everything is guarded).
--
-- deals: propositions between artists/providers — proposal →
--   counter → locked → signed, with the full terms (splits,
--   fees, roles) carried as one JSON document and every
--   signature recorded with a timestamp.
-- performances: the PRO packet log — each row is one show,
--   ready to be reported to ASCAP OnStage / BMI Live.
-- providers gains: terms (the hard limits an artist will
--   accept) and review_note (the admin's reason on deny).
-- ============================================================

-- ---------- providers: hard limits + review reasons ----------
alter table providers add column if not exists terms jsonb default '{}'::jsonb;
alter table providers add column if not exists review_note text;

-- ---------- deals: the proposition engine ----------
create table if not exists deals (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'song-split'          -- song-split / feature / engineering / work-for-hire / space
              check (kind in ('song-split','feature','engineering','work-for-hire','space')),
  title       text not null,                              -- the song / job / room
  from_owner  uuid not null references auth.users on delete cascade,
  from_name   text,
  to_slug     text not null,                              -- the counterpart's provider slug
  to_name     text,
  terms       jsonb not null default '{}'::jsonb,         -- splits[], fee, notes, history[]
  status      text not null default 'proposed'
              check (status in ('proposed','countered','locked','signed','declined')),
  signatures  jsonb not null default '[]'::jsonb,         -- [{by:'from'|'to', name, email, at}]
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table deals enable row level security;

-- the two sides of a deal, and only the two sides, can see it
drop policy if exists "participants read their deals" on deals;
create policy "participants read their deals"
  on deals for select
  using (
    from_owner = auth.uid()
    or exists (select 1 from providers p where p.slug = deals.to_slug and p.owner = auth.uid())
  );

drop policy if exists "signed-in senders open deals" on deals;
create policy "signed-in senders open deals"
  on deals for insert
  with check (from_owner = auth.uid());

-- either side can work the deal until it's signed; after that it's stone
drop policy if exists "participants work their deals" on deals;
create policy "participants work their deals"
  on deals for update
  using (
    status <> 'signed'
    and (from_owner = auth.uid()
         or exists (select 1 from providers p where p.slug = deals.to_slug and p.owner = auth.uid()))
  );

drop trigger if exists deals_touch on deals;
create trigger deals_touch before update on deals
  for each row execute function touch_updated_at();

-- ---------- performances: the PRO reporting log ----------
create table if not exists performances (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users on delete cascade,
  song_title  text not null,
  writers     text,          -- names + IPI/CAE numbers, comma-separated
  venue       text,
  city        text,
  perf_date   text,
  setlist     text,
  audience    text,
  organizer   text,
  notes       text,
  created_at  timestamptz default now()
);
alter table performances enable row level security;

drop policy if exists "artists read their own shows" on performances;
create policy "artists read their own shows"
  on performances for select using (owner = auth.uid());
drop policy if exists "artists log their own shows" on performances;
create policy "artists log their own shows"
  on performances for insert with check (owner = auth.uid());

-- ---------- the admin sees and works everything ----------
drop policy if exists "admin reads all deals" on deals;
create policy "admin reads all deals"        on deals        for select using (is_mcc_admin());
drop policy if exists "admin works all deals" on deals;
create policy "admin works all deals"        on deals        for update using (is_mcc_admin());
drop policy if exists "admin reads all performances" on performances;
create policy "admin reads all performances" on performances for select using (is_mcc_admin());
