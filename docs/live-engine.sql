-- ============================================================================
-- LIVE-ENGINE.SQL — the whole engine, ONE paste.
-- Auto-generated from docs/PASTE-ORDER.md (the 50-step core ladder) plus the
-- 6 preflight-checked extras. Idempotent — safe to re-run the whole thing.
-- Paste this ENTIRE file into the Supabase SQL Editor and Run. If it stops,
-- the error names the '-- [NN] file.sql' section header just above the
-- failing line, so you always know exactly where you are.
-- ============================================================================


-- ============================================================================
-- [01] platform-schema.sql
-- ============================================================================
-- ============================================================
-- McCluster Platform schema — paste once into Supabase SQL editor.
-- Spotify DNA: catalogue, plays, likes, playlists, resume.
-- Netflix DNA: films/experiences in the same catalogue, continue row.
-- LabelGrid DNA: releases, tracks with ISRCs, rights splits,
--   entitlements — the label back office for McCluster Corp
--   (ISRC prefix QT6KV, EIN 39-4466255).
-- Every table ships with Row Level Security. The anon key can only
-- do what these policies say. No secrets live in the frontend.
-- ============================================================

-- ---------- people ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  handle text unique,
  display_name text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "own profile read" on profiles for select using (auth.uid() = id);
create policy "own profile write" on profiles for update using (auth.uid() = id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = id);

-- ---------- the catalogue (mirrors data/platform.json) ----------
create table catalogue (
  id text primary key,                -- "antisocial", "heal-the-3-deep-end"
  kind text not null,                 -- song | film | experience | record
  title text not null,
  subtitle text,
  page text,                          -- site page for the item
  audio text,                         -- media path when playable
  poster text,
  access text not null default 'public',  -- public | unlisted | gated:<tier|sku>
  release_id text,
  sort int default 0,
  meta jsonb default '{}'::jsonb
);
alter table catalogue enable row level security;
create policy "catalogue is public" on catalogue for select using (true);

-- ---------- the label layer ----------
create table releases (
  id text primary key,                -- "heal-the-3"
  title text not null,
  kind text not null default 'single',    -- single | ep | album | video
  upc text,
  release_date date,
  status text not null default 'draft',   -- draft | scheduled | released
  meta jsonb default '{}'::jsonb
);
alter table releases enable row level security;
create policy "releases are public" on releases for select using (true);

create table tracks (
  id text primary key,                -- catalogue id of the song
  release_id text references releases,
  isrc text unique,                   -- QT6KV-yy-nnnnn
  duration_s int,
  lyrics_timed text,                  -- path to timed lyric json
  meta jsonb default '{}'::jsonb
);
alter table tracks enable row level security;
create policy "tracks are public" on tracks for select using (true);

-- who owns what, per track — the splits ledger
create table rights_splits (
  id bigint generated always as identity primary key,
  track_id text references tracks not null,
  party text not null,                -- "Matthew McCluster", "Zakir …"
  role text not null,                 -- writer | producer | performer | publisher | master
  pct numeric(5,2) not null check (pct > 0 and pct <= 100),
  note text
);
alter table rights_splits enable row level security;
-- splits are business records: no public read; service role only.

-- ---------- listener state (the Spotify feel) ----------
create table plays (
  user_id uuid references auth.users on delete cascade,
  item_id text references catalogue,
  position_s numeric(8,2) default 0,  -- resume point
  play_count int default 1,
  updated_at timestamptz default now(),
  primary key (user_id, item_id)
);
alter table plays enable row level security;
create policy "own plays" on plays for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table likes (
  user_id uuid references auth.users on delete cascade,
  item_id text references catalogue,
  created_at timestamptz default now(),
  primary key (user_id, item_id)
);
alter table likes enable row level security;
create policy "own likes" on likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  title text not null,
  is_public boolean default false,
  created_at timestamptz default now()
);
alter table playlists enable row level security;
create policy "own playlists" on playlists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public playlists readable" on playlists for select using (is_public);

create table playlist_items (
  playlist_id uuid references playlists on delete cascade,
  item_id text references catalogue,
  sort int default 0,
  primary key (playlist_id, item_id)
);
alter table playlist_items enable row level security;
create policy "own playlist items" on playlist_items for all
  using (exists (select 1 from playlists p where p.id = playlist_id and p.user_id = auth.uid()))
  with check (exists (select 1 from playlists p where p.id = playlist_id and p.user_id = auth.uid()));

-- ---------- the feed (the comeback loop) ----------
create table feed_posts (
  id bigint generated always as identity primary key,
  posted_at timestamptz default now(),
  tag text,                           -- drop | update | bars | docket
  title text not null,
  body text,
  link text,
  poster text,
  published boolean default true
);
alter table feed_posts enable row level security;
create policy "published feed is public" on feed_posts for select using (published);

-- ---------- entitlements (paid unlocks; Square stays the register) ----------
create table entitlements (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade,
  sku text not null,                  -- "subscriber", "heal-the-3-early", "idguide"
  source text,                        -- square receipt / promo note
  granted_at timestamptz default now(),
  expires_at timestamptz
);
alter table entitlements enable row level security;
create policy "own entitlements read" on entitlements for select using (auth.uid() = user_id);
-- grants are written by the service role (owner tooling), never by clients.


-- ============================================================================
-- [02] network-schema.sql
-- ============================================================================
-- ============================================================
-- The M Network backend: providers, booking requests, SMS list.
-- Run AFTER docs/platform-schema.sql in the Supabase SQL editor.
-- RLS is the wall — the anon key can only do what these policies
-- allow: read live listings, file a booking request, opt in to
-- texts. Owners manage their own listing and their own inbox.
-- ============================================================

-- ---------- providers: the talent & vendor directory ----------
create table if not exists providers (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users on delete set null,
  slug        text unique,
  name        text not null,
  headline    text,
  blurb       text,
  area        text,
  roles       text[] default '{}',            -- Photo / Video / Web / Studios / Stages
  badge_color text default '#e5383b',
  href        text,                           -- portfolio link
  book        text,                           -- booking link (or blank: requests flow)
  status      text not null default 'pending' -- pending -> live -> paused
              check (status in ('pending','live','paused')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table providers enable row level security;

drop policy if exists "live listings are public" on providers;
create policy "live listings are public"
  on providers for select
  using (status = 'live' or owner = auth.uid());

drop policy if exists "signed-in talent creates their own listing" on providers;
create policy "signed-in talent creates their own listing"
  on providers for insert
  with check (owner = auth.uid());

drop policy if exists "owners edit their own listing" on providers;
create policy "owners edit their own listing"
  on providers for update
  using (owner = auth.uid())
  with check (owner = auth.uid() and status in ('pending','paused',status)); -- owners can't self-approve to live

-- ---------- booking_requests: the network's front desk ----------
create table if not exists booking_requests (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid references providers on delete set null,
  provider_slug text,
  name         text not null,
  contact      text not null,                  -- email or phone, requester's choice
  date_wanted  text,
  details      text,
  status       text not null default 'new'
               check (status in ('new','accepted','declined','done')),
  tithe_pct    int not null default 10,        -- the nonprofit's ask on booked work
  created_at   timestamptz default now()
);
alter table booking_requests enable row level security;

drop policy if exists "anyone can file a request" on booking_requests;
create policy "anyone can file a request"
  on booking_requests for insert
  with check (true);

drop policy if exists "providers read their own inbox" on booking_requests;
create policy "providers read their own inbox"
  on booking_requests for select
  using (exists (select 1 from providers p
                 where p.id = provider_id and p.owner = auth.uid()));

drop policy if exists "providers work their own inbox" on booking_requests;
create policy "providers work their own inbox"
  on booking_requests for update
  using (exists (select 1 from providers p
                 where p.id = provider_id and p.owner = auth.uid()));

-- ---------- sms_optins: the text list the platform owns ----------
create table if not exists sms_optins (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  consent    text not null,   -- the exact consent line shown at opt-in (TCPA record)
  source     text,            -- which page/flow captured it
  created_at timestamptz default now()
);
alter table sms_optins enable row level security;

drop policy if exists "anyone can opt in" on sms_optins;
create policy "anyone can opt in"
  on sms_optins for insert
  with check (true);
-- deliberately NO select policy for anon/authenticated:
-- the list is only readable from the Supabase dashboard / service role.

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists providers_touch on providers;
create trigger providers_touch before update on providers
  for each row execute function touch_updated_at();

-- ---------- members: the people inside the organization ----------
-- Board interest, Equity Uprise programming, volunteers, and the donor
-- circle that keeps the lights on with residual giving.
create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid references auth.users on delete cascade unique,
  name       text,
  interests  text[] default '{}',   -- Board service / Programming / Volunteer / Donor circle
  note       text,
  status     text not null default 'applied'
             check (status in ('applied','active','board','paused')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table members enable row level security;

drop policy if exists "members read their own record" on members;
create policy "members read their own record"
  on members for select using (owner = auth.uid());
drop policy if exists "members create their own record" on members;
create policy "members create their own record"
  on members for insert with check (owner = auth.uid());
drop policy if exists "members update their own record" on members;
create policy "members update their own record"
  on members for update using (owner = auth.uid()) with check (owner = auth.uid());

drop trigger if exists members_touch on members;
create trigger members_touch before update on members
  for each row execute function touch_updated_at();


-- ============================================================================
-- [03] admin-schema.sql
-- ============================================================================
-- ============================================================
-- Mission Control access. Run AFTER docs/network-schema.sql.
-- One admin — matthew@mccluster.org — verified from the signed
-- JWT itself, so the same magic-link sign-in that runs the
-- Talent and Members apps also opens Mission Control. Change
-- the email here if the throne ever moves.
-- ============================================================

create or replace function is_mcc_admin() returns boolean as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'matthew@mccluster.org';
$$ language sql stable;

-- the admin sees and works everything
drop policy if exists "admin reads all listings" on providers;
create policy "admin reads all listings"   on providers        for select using (is_mcc_admin());
drop policy if exists "admin updates all listings" on providers;
create policy "admin updates all listings" on providers        for update using (is_mcc_admin());
drop policy if exists "admin reads all requests" on booking_requests;
create policy "admin reads all requests"   on booking_requests for select using (is_mcc_admin());
drop policy if exists "admin updates all requests" on booking_requests;
create policy "admin updates all requests" on booking_requests for update using (is_mcc_admin());
drop policy if exists "admin reads all members" on members;
create policy "admin reads all members"    on members          for select using (is_mcc_admin());
drop policy if exists "admin updates all members" on members;
create policy "admin updates all members"  on members          for update using (is_mcc_admin());
drop policy if exists "admin reads the sms list" on sms_optins;
create policy "admin reads the sms list"   on sms_optins       for select using (is_mcc_admin());

-- the engagement board: the admin reads every player's synced state
-- (device_state carries the grind snapshot inside its model column)
drop policy if exists "admin reads all device state" on device_state;
create policy "admin reads all device state" on device_state for select using (is_mcc_admin());


-- ============================================================================
-- [04] collab-schema.sql
-- ============================================================================
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


-- ============================================================================
-- [05] market-schema.sql
-- ============================================================================
-- ============================================================
-- The Market: one Deal object for everything. Run AFTER the
-- earlier schemas in the Supabase SQL editor (safe to re-run).
--
-- Widens the deal engine to the full marketplace:
--   kinds:    service_booking · music_collab · song_split ·
--             work_for_hire · space_booking · project_funding ·
--             custom_offer   (legacy names stay valid)
--   statuses: draft → proposed → countered → locked → signed →
--             paid → completed · declined
-- and lets participants keep working a deal after signing
-- (marking it paid, then completed).
-- ============================================================

alter table deals drop constraint if exists deals_kind_check;
alter table deals add constraint deals_kind_check check (kind in (
  'service_booking','music_collab','song_split','work_for_hire',
  'space_booking','project_funding','custom_offer',
  -- legacy rows keep their names
  'song-split','feature','engineering','work-for-hire','space'
));

alter table deals drop constraint if exists deals_status_check;
alter table deals add constraint deals_status_check check (status in (
  'draft','proposed','countered','locked','signed','paid','completed','declined'
));

-- the deal stays workable through paid and completed; only the end states freeze
drop policy if exists "participants work their deals" on deals;
create policy "participants work their deals"
  on deals for update
  using (
    status not in ('completed','declined')
    and (from_owner = auth.uid()
         or exists (select 1 from providers p where p.slug = deals.to_slug and p.owner = auth.uid()))
  );

-- ============================================================
-- THE TICKER (added for M Pay): every member trades under a
-- symbol they claim at sign-up — 2 to 5 letters, like $MCC.
-- Uniqueness is enforced so no two people trade the same lane.
-- ============================================================
alter table providers add column if not exists ticker text;
create unique index if not exists providers_ticker_key
  on providers (upper(ticker)) where ticker is not null and ticker <> '';

-- ============================================================
-- THE ROOM (added for Spaces + the M Pay desk): the property
-- itself — rate, amenities, photo — lives on the listing and is
-- edited from the owner's desk in M Pay.
--   space: { "rate": 95, "unit": "hour", "amenities": ["house-audio", ...] }
--   photo: url or repo path shown on the Spaces floor
-- ============================================================
alter table providers add column if not exists space jsonb;
alter table providers add column if not exists photo text;


-- ============================================================================
-- [06] intake-schema.sql
-- ============================================================================
-- THE INTAKE RAIL — every ask on the record, none of it lost to inboxes.
-- Fellowship sign-ups, quote requests, booking questions, notify-me taps:
-- everything that used to fire a mailto link now files here, tagged with
-- a KIND the back end can route on. The kind field is the algorithm's
-- hook: auto-responders, scoring, digests all key off it later.
-- Write-open to the world; only the admin reads or works the queue.

create table if not exists public.intake (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  kind    text not null default 'general',   -- fellowship / quote-web / shoot / notify / …
  name    text default '',
  contact text default '',
  body    text default '',
  page    text default '',
  uid     uuid,
  status  text not null default 'new' check (status in ('new','read','answered'))
);
create index if not exists intake_at_idx on public.intake (at desc);
create index if not exists intake_status_idx on public.intake (status, at desc);

alter table public.intake enable row level security;

drop policy if exists "anyone files an ask" on public.intake;
create policy "anyone files an ask"
  on public.intake for insert
  to anon, authenticated
  with check (true);

drop policy if exists "only the admin reads the queue" on public.intake;
create policy "only the admin reads the queue"
  on public.intake for select
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "only the admin works the queue" on public.intake;
create policy "only the admin works the queue"
  on public.intake for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- self-check: expect 1
select count(*) as intake_ready from information_schema.tables
 where table_name = 'intake' and table_schema = 'public';


-- ============================================================================
-- [07] agreement-schema.sql
-- ============================================================================
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


-- ============================================================================
-- [08] analytics-schema.sql
-- ============================================================================
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


-- ============================================================================
-- [09] proofs-schema.sql
-- ============================================================================
-- MISSION PROOFS — the city stops taking your word for it.
-- A member turns in a photo or clip as proof of a real-world mission;
-- it lands in a private storage bucket only they and the desk can
-- read. The desk reviews it — by eye, or with one tap that has the
-- AI eyes (the scan-proof edge function) read the image against the
-- mission brief and stamp a verdict. Nothing pays out on the honor
-- system anymore.

-- the vault: private bucket, 8 MB cap, members write only their own folder
insert into storage.buckets (id, name, public, file_size_limit)
values ('proofs', 'proofs', false, 8388608)
on conflict (id) do nothing;

drop policy if exists "members file their own proofs" on storage.objects;
create policy "members file their own proofs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "proofs are read by their owner and the desk" on storage.objects;
create policy "proofs are read by their owner and the desk"
  on storage.objects for select to authenticated
  using (bucket_id = 'proofs'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or auth.jwt() ->> 'email' = 'matthew@mccluster.org'));

-- the docket: one row per turned-in proof
create table if not exists public.mission_proofs (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  owner   uuid not null default auth.uid(),
  mission text not null,
  kind    text default '',
  path    text not null,
  note    text default '',
  status  text not null default 'new' check (status in ('new', 'passed', 'failed')),
  verdict text default ''
);
alter table public.mission_proofs enable row level security;

drop policy if exists "members file and read their own proofs" on public.mission_proofs;
create policy "members file and read their own proofs"
  on public.mission_proofs for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "owners and the desk read proofs" on public.mission_proofs;
create policy "owners and the desk read proofs"
  on public.mission_proofs for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "the desk rules on proofs" on public.mission_proofs;
create policy "the desk rules on proofs"
  on public.mission_proofs for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- self-check: expect 1 · 1
select count(*) as proofs_vault from storage.buckets where id = 'proofs';
select count(*) as proofs_docket from information_schema.tables where table_name = 'mission_proofs';


-- ============================================================================
-- [10] push-schema.sql
-- ============================================================================
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


-- ============================================================================
-- [11] messages-schema.sql
-- ============================================================================
-- ============================================================
-- MESSAGES — visitor communication, both ways.
-- One thread per deal: the client and the operator talk inside
-- the record they're already signing. RLS: only the two parties
-- to the deal can read or write its thread.
-- Paste into Supabase → SQL editor → Run. Safe to re-run.
-- ============================================================

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  from_owner uuid not null,
  from_name text default '',
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz default now()
);

create index if not exists messages_deal_idx on messages (deal_id, created_at);

alter table messages enable row level security;

drop policy if exists "participants read the thread" on messages;
create policy "participants read the thread"
  on messages for select using (
    exists (
      select 1 from deals d where d.id = messages.deal_id
        and (d.from_owner = auth.uid()
             or exists (select 1 from providers p where p.slug = d.to_slug and p.owner = auth.uid()))
    )
  );

drop policy if exists "participants write the thread" on messages;
create policy "participants write the thread"
  on messages for insert with check (
    from_owner = auth.uid()
    and exists (
      select 1 from deals d where d.id = messages.deal_id
        and (d.from_owner = auth.uid()
             or exists (select 1 from providers p where p.slug = d.to_slug and p.owner = auth.uid()))
    )
  );


-- ============================================================================
-- [12] ratings-schema.sql
-- ============================================================================
-- ============================================================
-- RATINGS — reputation from the people who'd know.
-- Clients (paid you through a real deal) weigh ~3× peers.
-- One live rating per rater per subject; re-rating updates it.
-- Ratings are PUBLIC to read — reputation only works out loud.
-- Paste into Supabase → SQL editor → Run. Safe to re-run.
-- ============================================================

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  subject_slug text not null,                -- the listing being rated
  rater uuid not null,                       -- who's talking
  role text not null check (role in ('client','peer')),
  stars int not null check (stars between 1 and 5),
  note text default '' check (char_length(note) <= 400),
  deal_id uuid references deals(id) on delete set null,
  created_at timestamptz default now(),
  unique (subject_slug, rater)
);

create index if not exists ratings_subject_idx on ratings (subject_slug);

alter table ratings enable row level security;

drop policy if exists "reputation is public" on ratings;
create policy "reputation is public"
  on ratings for select using (true);

-- a CLIENT rating requires a real paid/completed deal between the two;
-- a PEER rating just requires being signed in. Nobody rates themselves.
drop policy if exists "members rate their people" on ratings;
create policy "members rate their people"
  on ratings for insert with check (
    rater = auth.uid()
    and not exists (select 1 from providers p where p.slug = ratings.subject_slug and p.owner = auth.uid())
    and (
      role = 'peer'
      or exists (
        select 1 from deals d
        where d.id = ratings.deal_id
          and d.from_owner = auth.uid()
          and d.to_slug = ratings.subject_slug
          and d.status in ('paid','completed')
      )
    )
  );

drop policy if exists "raters edit their own word" on ratings;
create policy "raters edit their own word"
  on ratings for update using (rater = auth.uid()) with check (rater = auth.uid());


-- ============================================================================
-- [13] music-schema.sql
-- ============================================================================
-- THE DISTRO — upload the record, keep everything.
-- Members put their music straight on the platform: the file lands in
-- a public streaming bucket (their own folder only), the row lands on
-- the rack, and fans back the artist DIRECTLY — no distributor, no
-- middleman, no fee to upload. Support flows over the same rails as
-- everything else (E-Up credit or card), straight to the artist.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracks', 'tracks', true, 26214400,
  array['audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/flac','audio/webm'])
on conflict (id) do nothing;

drop policy if exists "artists upload their own tracks" on storage.objects;
create policy "artists upload their own tracks"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tracks' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "artists pull their own tracks" on storage.objects;
create policy "artists pull their own tracks"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tracks' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.rack (
  id    uuid primary key default gen_random_uuid(),
  at    timestamptz default now(),
  owner uuid not null default auth.uid(),
  slug  text not null,
  title text not null check (char_length(title) between 1 and 80),
  path  text not null,
  kind  text default '',
  price numeric(10,2) not null default 0 check (price >= 0)
);
alter table public.rack enable row level security;

drop policy if exists "the rack is public" on public.rack;
create policy "the rack is public" on public.rack for select using (true);

drop policy if exists "artists rack their own records" on public.rack;
create policy "artists rack their own records"
  on public.rack for insert to authenticated
  with check (owner = auth.uid()
    and exists (select 1 from providers p where p.owner = auth.uid() and p.slug = rack.slug));

drop policy if exists "artists pull their own records" on public.rack;
create policy "artists pull their own records"
  on public.rack for delete
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- self-check: expect 1 · 1
select count(*) as distro_vault from storage.buckets where id = 'tracks';
select count(*) as distro_rack from information_schema.tables where table_name = 'rack';


-- ============================================================================
-- [14] sync-schema.sql
-- ============================================================================
-- ============================================================
-- Cross-device continuity, opt-in by design. Run AFTER the
-- earlier schemas in the Supabase SQL editor (safe to re-run).
--
-- Nothing changes for anonymous visitors: their model and
-- persona stay on their device, full stop. But a member who
-- SIGNS IN (the same magic-link key as everything else) gets
-- their state carried between phone and laptop — one row per
-- account, readable and writable only by its owner.
-- ============================================================

create table if not exists device_state (
  owner      uuid primary key references auth.users on delete cascade,
  model      jsonb not null default '{}'::jsonb,   -- MCC_MODEL state
  persona    jsonb not null default '{}'::jsonb,   -- MCC_PERSONA signals
  updated_at timestamptz default now()
);
alter table device_state enable row level security;

drop policy if exists "members read their own state" on device_state;
create policy "members read their own state"
  on device_state for select using (owner = auth.uid());
drop policy if exists "members write their own state" on device_state;
create policy "members write their own state"
  on device_state for insert with check (owner = auth.uid());
drop policy if exists "members update their own state" on device_state;
create policy "members update their own state"
  on device_state for update using (owner = auth.uid()) with check (owner = auth.uid());

drop trigger if exists device_state_touch on device_state;
create trigger device_state_touch before update on device_state
  for each row execute function touch_updated_at();


-- ============================================================================
-- [15] verify-schema.sql
-- ============================================================================
-- ID VERIFICATION — prove it's really you, wear the mark.
-- Stripe Identity does the scanning (government ID + selfie match) and
-- KEEPS the documents; the platform stores only the verdict and the
-- verified name. Same wall as the rail columns: only the service role
-- (the webhook) can stamp these — no member stamps themselves.

alter table public.providers add column if not exists id_verified boolean;
alter table public.providers add column if not exists verified_name text;

revoke update (id_verified, verified_name) on public.providers from authenticated, anon;
revoke insert (id_verified, verified_name) on public.providers from authenticated, anon;

-- self-check: expect 2
select count(*) as verify_ready from information_schema.columns
 where table_name = 'providers' and column_name in ('id_verified', 'verified_name');


-- ============================================================================
-- [16] mtoken-schema.sql
-- ============================================================================
-- ============================================================
-- M TOKEN — closed-loop platform credit, minted by real work.
-- 1 token = $1 of platform credit (fees, promotion, bookings).
-- NOT a floating asset, NOT tradeable off-platform, NO cash-out:
-- the Starbucks-stars structure, deliberately. When the Stripe
-- rails land, the ledger becomes dollar-backed; the shape holds.
--
-- MINTING is server-side only (the trigger below) — clients can
-- read their ledger, never write it. On a deal reaching
-- 'completed': the provider earns 5% of the fee in tokens, the
-- buyer earns 1% back. Real money is the only mint.
-- Paste into Supabase → SQL editor → Run. Safe to re-run.
-- ============================================================

create table if not exists mtoken_ledger (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  delta numeric(12,2) not null,
  reason text default '',
  ref text default '',                       -- deal id or event key
  created_at timestamptz default now(),
  unique (owner, ref, reason)                -- one mint per event per person
);

create index if not exists mtoken_owner_idx on mtoken_ledger (owner, created_at desc);

alter table mtoken_ledger enable row level security;

drop policy if exists "members read their own ledger" on mtoken_ledger;
create policy "members read their own ledger"
  on mtoken_ledger for select using (owner = auth.uid());
-- no insert/update/delete policies on purpose: only the trigger writes

-- HARDENED (audit #1): earned credit mints ONLY against money Stripe
-- actually captured (deal_payments, written by the webhook on the
-- service role — no browser can forge it), never against a fee a
-- participant typed, and never on a self-dealt buyer==provider leg.
-- This body is identical to docs/equity-schema.sql and
-- docs/hardening-schema.sql so no run-order can re-open the hole.
create or replace function mint_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  paid numeric;
  provider_owner uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select coalesce(sum(gross), 0) into paid from deal_payments where deal_id = new.id;
    if paid <= 0 then
      return new;  -- money moved outside the app, or not at all: nothing redeemable mints
    end if;
    select owner into provider_owner from providers where slug = new.to_slug limit 1;
    if provider_owner is not null then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (provider_owner, round(paid * 0.05, 2), 'deal completed — the work pays twice', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
    if new.from_owner is not null and new.from_owner is distinct from provider_owner then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (new.from_owner, round(paid * 0.01, 2), 'deal completed — thank you for moving money here', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mint_on_completion_t on deals;
create trigger mint_on_completion_t after update on deals
  for each row execute function mint_on_completion();


-- ============================================================================
-- [17] mtoken-transfer.sql
-- ============================================================================
-- M TOKEN TRANSFERS — trading, inside the loop.
-- Tokens move person-to-person by ticker: sender must cover it,
-- recipient must be a claimed account, both legs land in one
-- transaction through the same ledger the mint uses. Clients still
-- can't write the ledger directly — this function is the only pen.

create or replace function public.transfer_tokens(to_slug text, amt numeric, note text default '')
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  bal numeric;
  rcpt uuid;
  tid text;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  amt := round(coalesce(amt, 0), 2);
  if amt <= 0 then
    raise exception 'a positive amount';
  end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  if bal < amt then
    raise exception 'balance is % — not enough', bal;
  end if;
  select owner into rcpt from providers where slug = to_slug and owner is not null limit 1;
  if rcpt is null then
    raise exception 'no claimed account behind that name';
  end if;
  if rcpt = auth.uid() then
    raise exception 'that is your own ticker';
  end if;
  tid := gen_random_uuid()::text;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), -amt, 'transfer_out', to_slug || ' · ' || tid || (case when note <> '' then ' · ' || left(note, 60) else '' end));
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (rcpt, amt, 'transfer_in', tid);
  return bal - amt;
end;
$$;
grant execute on function public.transfer_tokens(text, numeric, text) to authenticated;

-- THE BETA BANKROLL — the fake rail's faucet.
-- During beta every signed-in account can claim 1,000 ᴹ once. That is
-- what lets the promo run: real people sending each other thousands on
-- the record with zero real dollars moving. One claim per account,
-- enforced server-side; shut the faucet later by revoking execute.
create or replace function public.claim_beta_bankroll()
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  already int;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  select count(*) into already from mtoken_ledger
   where owner = auth.uid() and reason = 'beta_bankroll';
  if already > 0 then
    return 0;
  end if;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), 1000.00, 'beta_bankroll', 'beta');
  return 1000.00;
end;
$$;
grant execute on function public.claim_beta_bankroll() to authenticated;

-- self-check: expect 2
select count(*) as rails_ready from pg_proc
 where proname in ('transfer_tokens', 'claim_beta_bankroll');


-- ============================================================================
-- [18] reserve-schema.sql
-- ============================================================================
-- THE EQUITY RESERVE — two colors of credit, one sacred peg.
-- 1 E⤴ = $1, forever. Nothing mints unbacked: purchases mint against
-- dollars in, deal mints against the platform's collected spread.
-- EARNED credit (work: deal completions, bounties, service pay) can
-- cash out — that's the platform paying for work. PURCHASED and
-- GIFTED credit spends in-loop only, never redeems (that line is the
-- money-transmission wall; it moves only with counsel's memo).

-- ---------- the earned test, in one place ----------
create or replace function public.is_earned_reason(r text)
returns boolean language sql immutable as $$
  select r like 'deal completed%' or r like 'bounty%' or r like 'service%';
$$;

-- ---------- what YOU could cash out right now ----------
create or replace function public.my_redeemable()
returns numeric language plpgsql security definer set search_path = public as $$
declare
  bal numeric; earned numeric; held numeric; refunded numeric;
begin
  if auth.uid() is null then return 0; end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  select coalesce(sum(-delta), 0) into held from mtoken_ledger
   where owner = auth.uid() and reason = 'cashout_hold';
  select coalesce(sum(delta), 0) into refunded from mtoken_ledger
   where owner = auth.uid() and reason = 'cashout_refund';
  return greatest(0, least(bal, earned - (held - refunded)));
end;
$$;
grant execute on function public.my_redeemable() to authenticated;

-- ---------- the cash-out queue ----------
create table if not exists public.cashout_requests (
  id     uuid primary key default gen_random_uuid(),
  at     timestamptz default now(),
  owner  uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'requested' check (status in ('requested','paid','denied')),
  note   text default ''
);
alter table public.cashout_requests enable row level security;

drop policy if exists "owners see their own cashouts" on public.cashout_requests;
create policy "owners see their own cashouts"
  on public.cashout_requests for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "the admin works the cashouts" on public.cashout_requests;
create policy "the admin works the cashouts"
  on public.cashout_requests for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- inserts only through the function: the hold and the request are one motion

create or replace function public.request_cashout(amt numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  can numeric; rid uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  amt := round(coalesce(amt, 0), 2);
  if amt < 5 then raise exception 'cash-outs start at 5.00'; end if;
  select public.my_redeemable() into can;
  if can < amt then raise exception 'redeemable is % — only EARNED credit cashes out', can; end if;
  rid := gen_random_uuid();
  insert into cashout_requests (id, owner, amount) values (rid, auth.uid(), amt);
  insert into mtoken_ledger (owner, delta, reason, ref) values (auth.uid(), -amt, 'cashout_hold', rid::text);
  return rid;
end;
$$;
grant execute on function public.request_cashout(numeric) to authenticated;

-- a denied request gives the hold back, automatically and exactly once
create or replace function public.cashout_deny_refund()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'denied' and old.status = 'requested' then
    insert into mtoken_ledger (owner, delta, reason, ref)
    values (new.owner, new.amount, 'cashout_refund', new.id::text)
    on conflict (owner, ref, reason) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists cashout_deny_refund_t on public.cashout_requests;
create trigger cashout_deny_refund_t after update on public.cashout_requests
  for each row execute function public.cashout_deny_refund();

-- ---------- the public reserve dashboard (aggregates only, no names) ----------
create table if not exists public.reserve_attest (
  id uuid primary key default gen_random_uuid(),
  at timestamptz default now(),
  dollars numeric(14,2) not null,
  note text default ''
);
alter table public.reserve_attest enable row level security;
drop policy if exists "the world reads the attestation" on public.reserve_attest;
create policy "the world reads the attestation"
  on public.reserve_attest for select using (true);
drop policy if exists "the admin attests" on public.reserve_attest;
create policy "the admin attests"
  on public.reserve_attest for insert
  with check (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

create or replace function public.reserve_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  outstanding numeric; earned numeric; purchased numeric; granted numeric;
  redeemed numeric; pending numeric; attest record;
begin
  select coalesce(sum(delta), 0) into outstanding from mtoken_ledger;
  select coalesce(sum(delta), 0) into earned from mtoken_ledger where delta > 0 and is_earned_reason(reason);
  select coalesce(sum(delta), 0) into purchased from mtoken_ledger where delta > 0 and reason = 'purchase';
  select coalesce(sum(delta), 0) into granted from mtoken_ledger
   where delta > 0 and not is_earned_reason(reason) and reason not in ('purchase', 'transfer_in');
  select coalesce(sum(amount), 0) into redeemed from cashout_requests where status = 'paid';
  select coalesce(sum(amount), 0) into pending from cashout_requests where status = 'requested';
  select * into attest from reserve_attest order by at desc limit 1;
  return jsonb_build_object(
    'outstanding', outstanding,
    'earned_minted', earned,
    'purchased_minted', purchased,
    'granted_minted', granted,
    'redeemed_paid', redeemed,
    'pending_cashouts', pending,
    'reserve_dollars', coalesce(attest.dollars, 0),
    'attested_at', attest.at
  );
end;
$$;
grant execute on function public.reserve_stats() to anon, authenticated;

-- self-checks: expect 1 · 1 · 1
select count(*) as queue_ready from information_schema.tables where table_name = 'cashout_requests';
select count(*) as redeemable_ready from pg_proc where proname = 'my_redeemable';
select count(*) as stats_ready from pg_proc where proname = 'reserve_stats';


-- ============================================================================
-- [19] fund-schema.sql
-- ============================================================================
-- THE ONE PERCENT FUND — one percent for the new one percent.
-- 1% of every deal flows into a community pool, taken from the
-- platform's own fee (the paying side's price never changes). It is
-- NOT any one member's money — it's the house's community chest,
-- visible to all, awarded by the desk to loyal members, contest
-- winners, and the people carrying the culture. Granted credit is
-- non-redeemable by the two-color law: a reward, not a payout.

-- the fund's own account — a sentinel owner in the same ledger
-- (00…f1 = "the fund"). Nothing signs in as it; only these
-- functions move its credit.
create or replace function public.fund_uid() returns uuid
  language sql immutable as $$ select '00000000-0000-0000-0000-0000000000f1'::uuid $$;

-- 1% of every completed deal accrues to the fund, from the platform's cut.
-- Runs alongside the token mint; unique (owner, ref, reason) makes it
-- idempotent no matter how many times completion fires.
-- HARDENED (audit #5): the 1% draws off the REAL captured total in
-- deal_payments, never a fee a participant typed into a deal they
-- completed themselves — so fake completions can't inflate the pool.
create or replace function public.fund_accrue_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare paid numeric; cut numeric;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select coalesce(sum(gross), 0) into paid from deal_payments where deal_id = new.id;
    cut := round(paid * 0.01, 2);         -- one percent of what actually cleared
    if cut > 0 then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (public.fund_uid(), cut, 'fund_accrue', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists fund_accrue_t on deals;
create trigger fund_accrue_t after update on deals
  for each row execute function public.fund_accrue_on_completion();

-- the public books: anyone can watch the fund grow (aggregates only)
create or replace function public.fund_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare accrued numeric; granted numeric; grants int;
begin
  select coalesce(sum(delta), 0) into accrued from mtoken_ledger
   where owner = public.fund_uid() and reason = 'fund_accrue';
  select coalesce(sum(-delta), 0) into granted from mtoken_ledger
   where owner = public.fund_uid() and reason = 'fund_grant';
  select count(*) into grants from mtoken_ledger
   where owner = public.fund_uid() and reason = 'fund_grant';
  return jsonb_build_object(
    'accrued', accrued, 'granted', granted, 'balance', accrued - granted, 'awards', grants
  );
end;
$$;
grant execute on function public.fund_stats() to anon, authenticated;

-- the desk awards from the fund: debits the pool, mints granted (non-
-- redeemable) credit to a member by ticker. Admin only, one motion.
create or replace function public.grant_from_fund(to_slug text, amt numeric, why text default 'community award')
returns numeric language plpgsql security definer set search_path = public as $$
declare bal numeric; rcpt uuid; tid text;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'matthew@mccluster.org' then
    raise exception 'the desk awards the fund';
  end if;
  amt := round(coalesce(amt, 0), 2);
  if amt <= 0 then raise exception 'a positive award'; end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = public.fund_uid();
  if bal < amt then raise exception 'the fund holds % — not enough', bal; end if;
  select owner into rcpt from providers where slug = to_slug and owner is not null limit 1;
  if rcpt is null then raise exception 'no claimed account behind that name'; end if;
  tid := gen_random_uuid()::text;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (public.fund_uid(), -amt, 'fund_grant', to_slug || ' · ' || tid);
  -- 'fund_award' is a GRANTED reason: spends in the loop, never cashes out
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (rcpt, amt, 'fund_award: ' || left(why, 48), tid);
  return bal - amt;
end;
$$;
grant execute on function public.grant_from_fund(text, numeric, text) to authenticated;

-- self-checks: expect 1 · 1 · 1
select count(*) as fund_trigger from pg_proc where proname = 'fund_accrue_on_completion';
select count(*) as fund_stats_ready from pg_proc where proname = 'fund_stats';
select count(*) as fund_grant_ready from pg_proc where proname = 'grant_from_fund';


-- ============================================================================
-- [20] house-schema.sql
-- ============================================================================
-- THE HOUSE — service bounties paid for in E-Up credit.
-- The capture engine: the house puts real services on the shelf (a music
-- video shoot, a mix, a studio day), priced in credit that must be EARNED,
-- so claiming one requires working the platform — run the claim run,
-- complete deals, get people to SEND you credit. Every path to the prize
-- is a path deeper into the app. One claim per person per offer,
-- enforced by the same ledger law as every mint.

create table if not exists public.house_offers (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title      text not null,
  blurb      text default '',
  kind       text default 'service',
  price      numeric(12,2) not null check (price > 0),
  stock      int,                              -- null = unlimited
  area       text default '',
  active     boolean not null default true
);
alter table public.house_offers enable row level security;

drop policy if exists "the shelf is public" on public.house_offers;
create policy "the shelf is public"
  on public.house_offers for select using (active = true);

drop policy if exists "the admin stocks the shelf" on public.house_offers;
create policy "the admin stocks the shelf"
  on public.house_offers for all
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org')
  with check (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

create table if not exists public.house_claims (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  offer_id uuid references public.house_offers on delete set null,
  owner    uuid not null,
  paid     numeric(12,2) not null,
  status   text not null default 'claimed' check (status in ('claimed','booked','done','denied')),
  unique (offer_id, owner)                     -- one claim per person per offer
);
alter table public.house_claims enable row level security;

drop policy if exists "claimants see their own" on public.house_claims;
create policy "claimants see their own"
  on public.house_claims for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "the admin works the claims" on public.house_claims;
create policy "the admin works the claims"
  on public.house_claims for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- inserts happen ONLY through the function below

-- HARDENED (audit #2): the shelf is EARNED-ONLY. You must have earned
-- the price through your own real work (deals / bounties / service pay)
-- — the beta bankroll, gauntlet awards, and credit transferred to you
-- are granted color and don't buy a real service. This is the capture
-- engine working: no funnelling free accounts' bankrolls into a shoot.
create or replace function public.claim_house_offer(offer uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  o record;
  bal numeric;
  earned numeric;
  taken int;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  select * into o from house_offers where id = offer and active = true;
  if o is null then
    raise exception 'that offer is off the shelf';
  end if;
  select count(*) into taken from house_claims where offer_id = offer and status <> 'denied';
  if o.stock is not null and taken >= o.stock then
    raise exception 'all claimed — watch the shelf for the next one';
  end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  if earned < o.price then
    raise exception 'the shelf is earned-only — you have % of % E⤴ earned through real work (the beta bankroll and gifted credit don''t count here)',
      earned, o.price;
  end if;
  if bal < o.price then
    raise exception 'you hold % — % short', bal, (o.price - bal);
  end if;
  -- the pay-the-house leg: unique(owner, ref, reason) makes double-claims impossible
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), -o.price, 'house_claim', offer::text);
  insert into house_claims (offer_id, owner, paid)
  values (offer, auth.uid(), o.price);
  return bal - o.price;
end;
$$;
grant execute on function public.claim_house_offer(uuid) to authenticated;

-- THE CAMPAIGN SEED: the free music video shoot, Atlanta.
-- Priced at 1,500 ᴹ on purpose: the 1,000 bankroll alone can't touch it —
-- the winner has to EARN or BE SENT the last 500. Stock of 1: a race.
insert into public.house_offers (title, blurb, price, stock, area, kind)
select 'Music Video Shoot — On The House',
       'A full music video shoot with the McCluster camera team: concept, shoot day, edit, delivered. One artist takes it. Stack 1,500 and pay the house — every one earned on the record or staked by your people.',
       1500.00, 1, 'Atlanta', 'service'
where not exists (select 1 from public.house_offers where title = 'Music Video Shoot — On The House');

-- self-check: expect 1 · 1
select count(*) as house_ready from pg_proc where proname = 'claim_house_offer';
select count(*) as shelf_stocked from public.house_offers where active = true;


-- ============================================================================
-- [21] gauntlet-schema.sql
-- ============================================================================
-- THE GAUNTLET — the whole app experience pays EXACTLY 5 E⤴, ever.
-- The house pays for a fully onboarded operator: ten milestones, each
-- verified against the real tables (never the honor system), each
-- minting once per member (the ledger's unique key is the wall), the
-- ten summing to 5.00 by construction. Gauntlet credit is GRANTED
-- color — it spends across the whole floor and never cashes out.
--   walk_in     0.50  finished the welcome walk-in
--   card_live   0.50  dressed the listing (headline on the card)
--   signed      0.25  Member Agreement on the record
--   first_post  0.50  spoke on the Wire
--   first_track 0.75  put a record on the Distro rack
--   first_deal  0.75  sent a deal
--   civic_card  0.50  filed a civic card at the HQ
--   push_on     0.25  armed notifications
--   first_plug  0.50  brought their first sign-up
--   explorer    0.50  moved on 5+ separate days
--                5.00 TOTAL — THE LAW.

create or replace function public.claim_gauntlet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me record; rec record; total numeric := 0; done jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select slug, ticker into me from providers where owner = auth.uid() limit 1;
  for rec in
    select * from (values
      ('walk_in',     0.50, exists(select 1 from events where uid = auth.uid() and name = 'welcome_done')),
      ('card_live',   0.50, exists(select 1 from providers where owner = auth.uid() and coalesce(headline, '') <> '')),
      ('signed',      0.25, exists(select 1 from agreements where owner = auth.uid())),
      ('first_post',  0.50, exists(select 1 from posts where owner = auth.uid())),
      ('first_track', 0.75, exists(select 1 from rack where owner = auth.uid())),
      ('first_deal',  0.75, exists(select 1 from deals where from_owner = auth.uid())),
      ('civic_card',  0.50, exists(select 1 from civic_profiles where owner = auth.uid())),
      ('push_on',     0.25, exists(select 1 from push_subs where owner = auth.uid())),
      ('first_plug',  0.50, exists(select 1 from providers g
                              where g.owner is not null and g.referred_by is not null
                                and upper(g.referred_by) in (nullif(upper(coalesce(me.ticker, '')), ''),
                                                             nullif(upper(coalesce(me.slug, '')), '')))),
      ('explorer',    0.50, (select count(distinct date(at)) from events where uid = auth.uid()) >= 5)
    ) t(k, amt, ok)
  loop
    if rec.ok then
      done := done || to_jsonb(rec.k);
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (auth.uid(), rec.amt, 'gauntlet award', 'gauntlet:' || rec.k)
      on conflict (owner, ref, reason) do nothing;
      if found then total := total + rec.amt; end if;
    end if;
  end loop;
  return jsonb_build_object('done', done, 'minted', total,
    'paid_total', coalesce((select sum(delta) from mtoken_ledger
                            where owner = auth.uid() and reason = 'gauntlet award'), 0));
end;
$$;
grant execute on function public.claim_gauntlet() to authenticated;

-- MY MISSION CONTROL — every member's own numbers, THEIR scope only.
-- The events table is admin-eyes-only by policy; this definer function
-- is the one keyhole, and it only ever answers about the caller's own
-- surfaces: their landing page, their ticker, their plug, their books.
create or replace function public.my_mission()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me record; out jsonb;
begin
  if auth.uid() is null then return null; end if;
  select slug, ticker, name, status into me from providers where owner = auth.uid() limit 1;
  select jsonb_build_object(
    'slug', me.slug, 'ticker', me.ticker, 'status', me.status,
    'page_views', (select count(*) from events where name = 'page_view'
                    and props ->> 'page' = coalesce(me.slug, '')),
    'floor_opens', (select count(*) from events where name = 'xc_ticker_open'
                     and upper(coalesce(props ->> 'tick', '')) = upper(coalesce(me.ticker, me.slug, ''))),
    'plug_landings', (select count(*) from events where name = 'acquired'
                       and upper(coalesce(props ->> 'plug', '')) in (nullif(upper(coalesce(me.ticker, '')), ''),
                                                                     nullif(upper(coalesce(me.slug, '')), ''))),
    'followers', (select count(*) from follows where creator_slug = coalesce(me.slug, '')),
    'posts', (select count(*) from posts where owner = auth.uid()),
    'tracks', (select count(*) from rack where owner = auth.uid()),
    'requests', (select count(*) from booking_requests br
                  join providers p on p.id = br.provider_id where p.owner = auth.uid()),
    'deals_open', (select count(*) from deals d
                    where (d.from_owner = auth.uid() or d.to_slug = coalesce(me.slug, ''))
                      and d.status in ('proposed', 'countered', 'locked', 'signed')),
    'deals_done', (select count(*) from deals d
                    where (d.from_owner = auth.uid() or d.to_slug = coalesce(me.slug, ''))
                      and d.status = 'completed'),
    'balance', coalesce((select sum(delta) from mtoken_ledger where owner = auth.uid()), 0),
    'earned', coalesce((select sum(delta) from mtoken_ledger
                        where owner = auth.uid() and delta > 0 and is_earned_reason(reason)), 0),
    'gauntlet_paid', coalesce((select sum(delta) from mtoken_ledger
                               where owner = auth.uid() and reason = 'gauntlet award'), 0),
    'active_days_30', (select count(distinct date(at)) from events
                        where uid = auth.uid() and at > now() - interval '30 days'),
    'rack_plays', (select count(*) from events where name = 'track_play'
                    and props ->> 'slug' = coalesce(me.slug, '')),
    'proofs_in', (select count(*) from mission_proofs where owner = auth.uid()),
    'proofs_passed', (select count(*) from mission_proofs
                       where owner = auth.uid() and status = 'passed')
  ) into out;
  return out;
end;
$$;
grant execute on function public.my_mission() to authenticated;

-- self-check: expect 2
select count(*) as gauntlet_ready from pg_proc
 where proname in ('claim_gauntlet', 'my_mission');


-- ============================================================================
-- [22] claimrun-bonus.sql
-- ============================================================================
-- THE CLAIM RUN BONUS — the run pays out in M Tokens.
-- One-time, per account, 5.00 tokens ($5 of platform credit) when a
-- member reaches Operator rank on the claim run. Server-side mint
-- through the same ledger the deal trigger uses; the unique
-- (owner, ref, reason) key makes double-claiming impossible no
-- matter what a client sends.

create or replace function public.claim_run_bonus()
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  already int;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  select count(*) into already from mtoken_ledger
    where owner = auth.uid() and reason = 'claim_run';
  if already > 0 then
    return 0; -- the bonus only pays once
  end if;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), 5.00, 'claim_run', 'operator');
  return 5.00;
end;
$$;
grant execute on function public.claim_run_bonus() to authenticated;

-- self-check: expect 1
select count(*) as run_bonus from pg_proc where proname = 'claim_run_bonus';


-- ============================================================================
-- [23] referral-schema.sql
-- ============================================================================
-- THE PLUG — three real ones = 1 E⤴, and "real" is enforced by the
-- database, not the honor system. A share link carries ?ref=TICKER;
-- the door files the new listing with referred_by. A referral COUNTS
-- only when the referred member: (1) holds a full claimed account,
-- (2) signed the Member Agreement, (3) moved on 3+ separate days,
-- and (4) put 3+ sign-ups of their own on. Clicks are worth nothing;
-- people are. On top of the sign-up bonus, the plug holds a LIFETIME
-- SHARE: 1% of every E⤴ their people ever EARN here, cut from the
-- house's own pocket the moment it mints. All referral credit is
-- GRANTED color — it spends across the whole floor but never cashes
-- out (the two-color law).

alter table public.providers add column if not exists referred_by text;
-- set once at the door; nobody rewrites history to farm credit
revoke update (referred_by) on public.providers from authenticated, anon;

-- who counts, computed one way for everyone
create or replace function public.referral_counts(t text, s text)
returns table (signups bigint, qualified bigint)
language sql stable security definer set search_path = public as $$
  with me as (
    select nullif(upper(coalesce(t, '')), '') as tick,
           nullif(upper(coalesce(s, '')), '') as slg
  ), kids as (
    select r.* from providers r, me
    where r.owner is not null and r.referred_by is not null
      and upper(r.referred_by) in (me.tick, me.slg)
  )
  select count(*),
         count(*) filter (where
           exists (select 1 from agreements a where a.owner = k.owner)
           and (select count(distinct date(e.at)) from events e where e.uid = k.owner) >= 3
           and (select count(*) from providers g
                 where g.owner is not null and g.referred_by is not null
                   and upper(g.referred_by) in (nullif(upper(coalesce(k.ticker, '')), ''),
                                                nullif(upper(coalesce(k.slug, '')), ''))) >= 3)
  from kids k;
$$;

-- the desk reads its own count
create or replace function public.referral_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me record; s bigint; q bigint; minted numeric;
begin
  if auth.uid() is null then
    return jsonb_build_object('signups', 0, 'qualified', 0, 'minted', 0);
  end if;
  select ticker, slug into me from providers where owner = auth.uid() limit 1;
  if me is null then
    return jsonb_build_object('signups', 0, 'qualified', 0, 'minted', 0);
  end if;
  select * into s, q from referral_counts(me.ticker, me.slug);
  select coalesce(sum(delta), 0) into minted from mtoken_ledger
   where owner = auth.uid() and reason = 'referral bonus';
  return jsonb_build_object('signups', coalesce(s, 0), 'qualified', coalesce(q, 0), 'minted', minted,
    'share', (select coalesce(sum(delta), 0) from mtoken_ledger
              where owner = auth.uid() and reason = 'referral share'));
end;
$$;
grant execute on function public.referral_stats() to authenticated;

-- THE LIFETIME SHARE — 1% of every E⤴ your people EARN here, forever.
-- Fires the moment any earned credit lands for a referred member: the
-- house cuts the referrer 1% from its own pocket (granted color —
-- spends across the floor, never cashes out). Idempotent per source
-- row, so replays and re-fires mint nothing twice.
create or replace function public.referral_share_on_mint()
returns trigger language plpgsql security definer set search_path = public as $$
declare kid record; plug uuid; cut numeric;
begin
  if new.delta > 0 and is_earned_reason(new.reason) then
    select ticker, slug, referred_by into kid from providers
     where owner = new.owner and referred_by is not null limit 1;
    if kid is not null then
      select owner into plug from providers
       where owner is not null and owner <> new.owner
         and upper(kid.referred_by) in (nullif(upper(coalesce(ticker, '')), ''),
                                        nullif(upper(coalesce(slug, '')), ''))
       limit 1;
      cut := round(new.delta * 0.01, 2);
      if plug is not null and cut > 0 then
        insert into mtoken_ledger (owner, delta, reason, ref)
        values (plug, cut, 'referral share', 'refshare:' || new.id::text)
        on conflict (owner, ref, reason) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists referral_share_t on public.mtoken_ledger;
create trigger referral_share_t after insert on public.mtoken_ledger
  for each row execute function public.referral_share_on_mint();

-- the mint: 1 E⤴ per full three qualified, idempotent per batch —
-- the worker calls this nightly; no member can call it at all
create or replace function public.referral_mint_all()
returns int language plpgsql security definer set search_path = public as $$
declare p record; s bigint; q bigint; owed int; b int; n int := 0;
begin
  for p in select owner, slug, ticker from providers where owner is not null loop
    select * into s, q from referral_counts(p.ticker, p.slug);
    owed := floor(coalesce(q, 0) / 3.0);
    if owed <= 0 then continue; end if;
    for b in 1..owed loop
      -- 'referral bonus' is a GRANTED reason: spends in the loop, never redeems
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (p.owner, 1, 'referral bonus', 'refmint:' || coalesce(p.slug, p.owner::text) || ':' || b)
      on conflict (owner, ref, reason) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end;
$$;
revoke execute on function public.referral_mint_all() from public, anon, authenticated;

-- self-checks: expect 1 · 4
select count(*) as ref_column from information_schema.columns
 where table_name = 'providers' and column_name = 'referred_by';
select count(*) as ref_fns from pg_proc
 where proname in ('referral_counts', 'referral_stats', 'referral_mint_all', 'referral_share_on_mint');


-- ============================================================================
-- [24] heat-schema.sql
-- ============================================================================
-- THE HEAT — the live play counter behind the app's chart.
-- One row per track; bump_play() is the only door in, and it only
-- ever adds one. Anyone can read the chart; nobody can write a row
-- directly (RLS has no insert/update policy — the security-definer
-- function is the sole writer).

create table if not exists public.track_plays (
  slug text primary key,
  plays bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.track_plays enable row level security;

drop policy if exists "anyone reads the heat" on public.track_plays;
create policy "anyone reads the heat" on public.track_plays
  for select using (true);

-- HARDENED (audit #4): one pulse per track, per device fingerprint,
-- per hour. A curl loop can no longer print a million plays; the same
-- fingerprint counts once an hour. play_pulses is the guard ledger,
-- locked to this security-definer writer (no RLS policy).
create table if not exists public.play_pulses (
  slug text not null,
  fp   text not null,
  hr   timestamptz not null,
  primary key (slug, fp, hr)
);
alter table public.play_pulses enable row level security;

create or replace function public.bump_play(p_slug text, p_fp text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare s text; f text; ins int;
begin
  s := lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9]', '', 'g'));
  if s = '' then return; end if;
  f := left(coalesce(nullif(p_fp, ''), 'anon'), 64);
  insert into public.play_pulses (slug, fp, hr)
  values (s, f, date_trunc('hour', now())) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return; end if;       -- this fingerprint already counted this hour
  insert into public.track_plays (slug, plays) values (s, 1)
  on conflict (slug) do update set plays = track_plays.plays + 1, updated_at = now();
end;
$$;

grant execute on function public.bump_play(text, text) to anon, authenticated;

-- self-check: expect 1 | 1
select
  (select count(*) from information_schema.tables where table_name = 'track_plays') as heat_table,
  (select count(*) from pg_proc where proname = 'bump_play') as heat_pump;


-- ============================================================================
-- [25] social-schema.sql
-- ============================================================================
-- THE PAGE — the artist-first social layer.
-- Creators (anyone with a listing) post; supporters follow and comment
-- but never post; every creator can export their own fan book. RLS is
-- the law on every table: the database itself enforces "fans can't
-- post" — not the UI.

-- the vibe: each listing carries its page design (accent, background,
-- cover, links, layout) as one document
alter table providers add column if not exists page jsonb;

-- 1 · POSTS — creators only. The insert policy checks the author owns
--     a listing with that slug; there is no other way in.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  slug text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
drop policy if exists "anyone reads posts" on public.posts;
create policy "anyone reads posts" on public.posts for select using (true);
drop policy if exists "creators post to their own page" on public.posts;
create policy "creators post to their own page" on public.posts for insert
  with check (
    owner = auth.uid()
    and exists (select 1 from providers p where p.owner = auth.uid() and p.slug = posts.slug)
  );
drop policy if exists "creators delete their own posts" on public.posts;
create policy "creators delete their own posts" on public.posts for delete
  using (owner = auth.uid());

-- 2 · SUPPORTERS — the fan profile. One per account, handle is public.
create table if not exists public.supporters (
  owner uuid primary key default auth.uid(),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  name text check (char_length(name) <= 60),
  created_at timestamptz not null default now()
);
alter table public.supporters enable row level security;
drop policy if exists "handles are public" on public.supporters;
create policy "handles are public" on public.supporters for select using (true);
drop policy if exists "you make your own supporter profile" on public.supporters;
create policy "you make your own supporter profile" on public.supporters for insert
  with check (owner = auth.uid());
drop policy if exists "you edit your own supporter profile" on public.supporters;
create policy "you edit your own supporter profile" on public.supporters for update
  using (owner = auth.uid());

-- 3 · FOLLOWS — a supporter follows creators across every niche.
create table if not exists public.follows (
  supporter uuid not null references public.supporters(owner) on delete cascade,
  creator_slug text not null,
  created_at timestamptz not null default now(),
  primary key (supporter, creator_slug)
);
alter table public.follows enable row level security;
drop policy if exists "follow counts are public" on public.follows;
create policy "follow counts are public" on public.follows for select using (true);
drop policy if exists "supporters follow" on public.follows;
create policy "supporters follow" on public.follows for insert
  with check (supporter = auth.uid());
drop policy if exists "supporters unfollow" on public.follows;
create policy "supporters unfollow" on public.follows for delete
  using (supporter = auth.uid());

-- 4 · COMMENTS — supporters speak under posts; creators moderate theirs.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  supporter uuid not null default auth.uid() references public.supporters(owner),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
drop policy if exists "anyone reads comments" on public.comments;
create policy "anyone reads comments" on public.comments for select using (true);
drop policy if exists "supporters comment" on public.comments;
create policy "supporters comment" on public.comments for insert
  with check (supporter = auth.uid() and exists (select 1 from supporters s where s.owner = auth.uid()));
drop policy if exists "you delete your own comment" on public.comments;
create policy "you delete your own comment" on public.comments for delete
  using (supporter = auth.uid());
drop policy if exists "creators moderate their page" on public.comments;
create policy "creators moderate their page" on public.comments for delete
  using (exists (select 1 from posts p where p.id = comments.post_id and p.owner = auth.uid()));

-- 5 · THE FAN BOOK — the export. A creator reads their own supporters
--     (followers + commenters), nobody else's. Security definer so the
--     join crosses RLS, gated inside to the caller's own slugs.
create or replace function public.my_supporters()
returns table (handle text, name text, followed_at timestamptz, comment_count bigint)
language sql security definer set search_path = public as $$
  with my_slugs as (select slug from providers where owner = auth.uid())
  select s.handle, s.name, f.created_at as followed_at,
    (select count(*) from comments c join posts p on p.id = c.post_id
      where c.supporter = s.owner and p.owner = auth.uid()) as comment_count
  from follows f
  join supporters s on s.owner = f.supporter
  where f.creator_slug in (select slug from my_slugs)
  union
  select s.handle, s.name, null, count(c.id)
  from comments c
  join posts p on p.id = c.post_id and p.owner = auth.uid()
  join supporters s on s.owner = c.supporter
  where not exists (select 1 from follows f2 where f2.supporter = s.owner
    and f2.creator_slug in (select slug from providers where owner = auth.uid()))
  group by s.handle, s.name;
$$;
grant execute on function public.my_supporters() to authenticated;

-- self-check: expect 4 | 1
select
  (select count(*) from information_schema.tables
    where table_name in ('posts','supporters','follows','comments')) as social_tables,
  (select count(*) from pg_proc where proname = 'my_supporters') as fan_book;


-- ============================================================================
-- [26] social2-schema.sql
-- ============================================================================
-- ============================================================
-- THE WIRE, LOUDER — reactions + the whole floor's feed.
--
-- Two additions to the social layer (docs/social-schema.sql):
--   1) REACTIONS — anyone with an account taps ❤️ 🔥 📈 on a post.
--      One reaction per member per post per kind; tap again to take
--      it back. Counts are public.
--   2) THE WIRE — one public feed of every creator's posts across
--      the whole floor, newest first, each carrying the creator's
--      name/photo and its reaction counts. One call feeds the page.
--
-- Paste whole into Supabase → SQL editor → Run. Safe to re-run.
-- Requires: social-schema.sql (posts, supporters, comments).
-- ============================================================

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  owner   uuid not null default auth.uid(),
  kind    text not null check (kind in ('heart','fire','up')),
  at      timestamptz default now(),
  primary key (post_id, owner, kind)
);
alter table public.post_reactions enable row level security;
drop policy if exists "reaction counts are public" on public.post_reactions;
create policy "reaction counts are public"
  on public.post_reactions for select using (true);
drop policy if exists "members react" on public.post_reactions;
create policy "members react"
  on public.post_reactions for insert to authenticated
  with check (owner = auth.uid());
drop policy if exists "members take reactions back" on public.post_reactions;
create policy "members take reactions back"
  on public.post_reactions for delete
  using (owner = auth.uid());

-- toggle in one motion: react if you haven't, un-react if you have
create or replace function public.react(p_post uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
declare removed int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_kind not in ('heart','fire','up') then raise exception 'heart, fire, or up'; end if;
  delete from post_reactions where post_id = p_post and owner = auth.uid() and kind = p_kind;
  get diagnostics removed = row_count;
  if removed > 0 then return false; end if;   -- taken back
  insert into post_reactions (post_id, owner, kind) values (p_post, auth.uid(), p_kind);
  return true;                                 -- landed
end;
$$;
grant execute on function public.react(uuid, text) to authenticated;

-- THE WIRE: the whole floor's posts, newest first, with the byline and
-- the counts. Public — the feed IS the front porch of the network.
create or replace function public.wire_feed(p_limit int default 40)
returns table (
  id uuid, slug text, body text, created_at timestamptz,
  creator text, photo text,
  hearts bigint, fires bigint, ups bigint, comments bigint, my_reactions jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.slug, p.body, p.created_at,
    coalesce(pr.name, p.slug) as creator,
    pr.photo,
    (select count(*) from post_reactions r where r.post_id = p.id and r.kind = 'heart') as hearts,
    (select count(*) from post_reactions r where r.post_id = p.id and r.kind = 'fire')  as fires,
    (select count(*) from post_reactions r where r.post_id = p.id and r.kind = 'up')    as ups,
    (select count(*) from comments c where c.post_id = p.id) as comments,
    coalesce((select jsonb_agg(r.kind) from post_reactions r
       where r.post_id = p.id and r.owner = auth.uid()), '[]'::jsonb) as my_reactions
  from posts p
  left join providers pr on pr.slug = p.slug
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;
grant execute on function public.wire_feed(int) to anon, authenticated;

-- self-checks: expect 1 · 2
select count(*) as reactions_table from information_schema.tables where table_name = 'post_reactions';
select count(*) as wire_fns from pg_proc where proname in ('react', 'wire_feed');


-- ============================================================================
-- [27] civic-schema.sql
-- ============================================================================
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


-- ============================================================================
-- [28] civic2-schema.sql
-- ============================================================================
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


-- ============================================================================
-- [29] control-schema.sql
-- ============================================================================
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


-- ============================================================================
-- [30] people-schema.sql
-- ============================================================================
-- THE PEOPLE ROOM — the whole person, computed, admin-only.
-- One dossier per claimed member: what they answered at the door
-- (hustles, goals), what they hold (both colors of credit), how they
-- deal, how they move (the events exhaust), the signature, the ID
-- mark, and the plug count. Mission Control's People tab reads this
-- and derives the archetypes in the open. Requires: agreements,
-- events, mtoken_ledger, deals, cashout_requests, referral_counts
-- (docs/referral-schema.sql) — run those pastes first.

create or replace function public.member_dossier()
returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'matthew@mccluster.org' then
    raise exception 'the owner''s room only';
  end if;
  return query
  select jsonb_build_object(
    'name', p.name,
    'slug', p.slug,
    'ticker', p.ticker,
    'status', p.status,
    'roles', coalesce(to_jsonb(p.roles), '[]'::jsonb),
    'area', p.area,
    'goals', coalesce(p.terms -> 'goals', '[]'::jsonb),
    'joined', p.created_at,
    'id_verified', coalesce(p.id_verified, false),
    'verified_name', p.verified_name,
    'charges_enabled', coalesce(p.charges_enabled, false),
    'referred_by', p.referred_by,
    'signed_agreement', exists (select 1 from agreements a where a.owner = p.owner),
    'balance', coalesce((select sum(l.delta) from mtoken_ledger l where l.owner = p.owner), 0),
    'earned', coalesce((select sum(l.delta) from mtoken_ledger l
                        where l.owner = p.owner and l.delta > 0 and is_earned_reason(l.reason)), 0),
    'spent', coalesce((select sum(-l.delta) from mtoken_ledger l
                       where l.owner = p.owner and l.delta < 0), 0),
    'deals_total', (select count(*) from deals d where d.from_owner = p.owner or d.to_slug = p.slug),
    'deals_done', (select count(*) from deals d
                   where (d.from_owner = p.owner or d.to_slug = p.slug) and d.status = 'completed'),
    'counterparties', (select count(distinct case when d.from_owner = p.owner
                                                  then d.to_slug else d.from_owner::text end)
                       from deals d where d.from_owner = p.owner or d.to_slug = p.slug),
    'events_total', (select count(*) from events e where e.uid = p.owner),
    'first_seen', (select min(e.at) from events e where e.uid = p.owner),
    'last_seen', (select max(e.at) from events e where e.uid = p.owner),
    'active_days_30', (select count(distinct date(e.at)) from events e
                       where e.uid = p.owner and e.at > now() - interval '30 days'),
    'top_moves', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'n', t.n))
                           from (select e.name, count(*) as n from events e
                                 where e.uid = p.owner group by e.name
                                 order by n desc limit 5) t), '[]'::jsonb),
    'cashouts', (select count(*) from cashout_requests c where c.owner = p.owner),
    'referrals', (select rc.qualified from referral_counts(p.ticker, p.slug) rc)
  )
  from providers p
  where p.owner is not null
  order by p.created_at desc;
end;
$$;
grant execute on function public.member_dossier() to authenticated;

-- self-check: expect 1
select count(*) as people_ready from pg_proc where proname = 'member_dossier';


-- ============================================================================
-- [31] admin-power.sql
-- ============================================================================
-- THE OPERATOR'S TOOLKIT — better scripts for the owner's room.
-- Three instruments, all admin-gated by the same is_mcc_admin() wall:
--   member_book()       one row per member: listing, balance, earned,
--                        deals, signature, last movement — the CRM.
--   daily_pulse()        the whole platform's last 24h in one JSON.
--   sweep_stale_deals(n) declines deals sitting 'proposed' n+ days and
--                        tells you how many it cleared.
-- Run in the SQL editor any time; they read live and touch nothing
-- except the sweeper, which only closes what's already dead.

create or replace function public.member_book()
returns table (
  member    text,
  ticker    text,
  status    text,
  balance   numeric,
  earned    numeric,
  deals_all bigint,
  deals_done bigint,
  signed_agreement boolean,
  last_move timestamptz,
  joined    timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_mcc_admin() then raise exception 'the owner''s room only'; end if;
  return query
  select p.name, p.ticker, p.status,
    coalesce((select sum(l.delta) from mtoken_ledger l where l.owner = p.owner), 0),
    coalesce((select sum(l.delta) from mtoken_ledger l
              where l.owner = p.owner and l.delta > 0 and is_earned_reason(l.reason)), 0),
    (select count(*) from deals d where d.from_owner = p.owner or d.to_slug = p.slug),
    (select count(*) from deals d where (d.from_owner = p.owner or d.to_slug = p.slug) and d.status = 'completed'),
    exists (select 1 from agreements a where a.owner = p.owner),
    (select max(e.at) from events e where e.uid = p.owner),
    p.created_at
  from providers p
  where p.owner is not null
  order by p.created_at desc;
end;
$$;

create or replace function public.daily_pulse()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_mcc_admin() then raise exception 'the owner''s room only'; end if;
  select jsonb_build_object(
    'new_members_24h',   (select count(*) from providers where created_at > now() - interval '24 hours'),
    'listings_pending',  (select count(*) from providers where status = 'pending'),
    'deals_moved_24h',   (select count(*) from deals where updated_at > now() - interval '24 hours'),
    'deals_open',        (select count(*) from deals where status in ('proposed','countered','locked','signed')),
    'events_24h',        (select count(*) from events where at > now() - interval '24 hours'),
    'souls_24h',         (select count(distinct uid) from events where at > now() - interval '24 hours' and uid is not null),
    'intake_new',        (select count(*) from intake where status = 'new'),
    'house_claims_open', (select count(*) from house_claims where status in ('claimed','booked')),
    'cashouts_pending',  (select count(*) from cashout_requests where status = 'requested'),
    'credit_outstanding',(select coalesce(sum(delta), 0) from mtoken_ledger),
    'credit_earned',     (select coalesce(sum(delta), 0) from mtoken_ledger where delta > 0 and is_earned_reason(reason))
  ) into out;
  return out;
end;
$$;

create or replace function public.sweep_stale_deals(older_than_days int default 30)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_mcc_admin() then raise exception 'the owner''s room only'; end if;
  update deals set status = 'declined'
   where status = 'proposed' and updated_at < now() - (older_than_days || ' days')::interval;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.member_book() to authenticated;
grant execute on function public.daily_pulse() to authenticated;
grant execute on function public.sweep_stale_deals(int) to authenticated;

-- how you use them, any day:
--   select * from member_book();
--   select daily_pulse();
--   select sweep_stale_deals(30);

-- self-check: expect 3
select count(*) as toolkit_ready from pg_proc
 where proname in ('member_book', 'daily_pulse', 'sweep_stale_deals');


-- ============================================================================
-- [32] brain-schema.sql
-- ============================================================================
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


-- ============================================================================
-- [33] worker-schema.sql
-- ============================================================================
-- THE NIGHT SHIFT — a worker inside the database itself.
-- pg_cron runs jobs on Supabase's own scheduler: no server, no
-- laptop, no GitHub secret — the database wakes itself. One nightly
-- shift does the housekeeping and writes the platform's daily
-- snapshot to pulse_log, giving Mission Control a history that
-- outlives raw event retention. The worker functions carry no admin
-- gate (cron has no sign-in) — instead EXECUTE is revoked from every
-- role a browser can hold, so only the scheduler can call them.
-- Requires: docs/admin-power.sql tables/concepts and
-- docs/referral-schema.sql (referral_mint_all) — run those first.

create extension if not exists pg_cron;

-- the long book: one row per day, forever
create table if not exists public.pulse_log (
  day  date primary key,
  at   timestamptz default now(),
  data jsonb not null
);
alter table public.pulse_log enable row level security;
drop policy if exists "only the admin reads the long book" on public.pulse_log;
create policy "only the admin reads the long book"
  on public.pulse_log for select
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- no insert policy on purpose: only the worker (table owner) writes

-- housekeeping: quietly declines deals sitting 'proposed' 30+ days
create or replace function public.worker_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update deals set status = 'declined'
   where status = 'proposed' and updated_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.worker_sweep() from public, anon, authenticated;

-- the nightly snapshot: the whole platform in one JSON, plus the
-- night's housekeeping results, banked under today's date
create or replace function public.worker_snapshot()
returns void language plpgsql security definer set search_path = public as $$
declare swept int; minted int;
begin
  swept := public.worker_sweep();
  minted := public.referral_mint_all();
  insert into pulse_log (day, data)
  values (current_date, jsonb_build_object(
    'new_members_24h',   (select count(*) from providers where created_at > now() - interval '24 hours'),
    'members_total',     (select count(*) from providers where owner is not null),
    'listings_pending',  (select count(*) from providers where status = 'pending'),
    'deals_moved_24h',   (select count(*) from deals where updated_at > now() - interval '24 hours'),
    'deals_open',        (select count(*) from deals where status in ('proposed','countered','locked','signed')),
    'events_24h',        (select count(*) from events where at > now() - interval '24 hours'),
    'souls_24h',         (select count(distinct uid) from events where at > now() - interval '24 hours' and uid is not null),
    'intake_new',        (select count(*) from intake where status = 'new'),
    'house_claims_open', (select count(*) from house_claims where status in ('claimed','booked')),
    'cashouts_pending',  (select count(*) from cashout_requests where status = 'requested'),
    'credit_outstanding',(select coalesce(sum(delta), 0) from mtoken_ledger),
    'credit_earned',     (select coalesce(sum(delta), 0) from mtoken_ledger where delta > 0 and is_earned_reason(reason)),
    'fund_balance',      (select coalesce(sum(delta), 0) from mtoken_ledger where owner = public.fund_uid()),
    'stale_deals_swept', swept,
    'referral_minted',   minted
  ))
  on conflict (day) do update set data = excluded.data, at = now();
end;
$$;
revoke execute on function public.worker_snapshot() from public, anon, authenticated;

-- the shift schedule: every night at 4:07 UTC (idempotent — scheduling
-- the same name again just updates it)
select cron.schedule('mcc-night-shift', '7 4 * * *', 'select public.worker_snapshot()');

-- run the first shift right now so the long book opens tonight
select public.worker_snapshot();

-- self-checks: expect 1 · 1 · at least 1
select count(*) as worker_ready from pg_proc where proname = 'worker_snapshot';
select count(*) as shift_scheduled from cron.job where jobname = 'mcc-night-shift';
select count(*) as long_book_open from pulse_log;


-- ============================================================================
-- [34] guide-schema.sql
-- ============================================================================
-- THE GUIDE'S MEMORY — one thread per member with the in-game concierge.
-- Members read only their own thread (the widget restores it on open);
-- nothing writes here except the-guide function on the service key, so
-- the record can't be forged from a browser. The desk reads the room.

create table if not exists public.guide_chats (
  id    uuid primary key default gen_random_uuid(),
  at    timestamptz default now(),
  owner uuid not null,
  role  text not null check (role in ('user', 'guide')),
  body  text not null check (char_length(body) between 1 and 4000)
);
create index if not exists guide_chats_owner_at on public.guide_chats (owner, at desc);

alter table public.guide_chats enable row level security;

drop policy if exists "your thread is yours" on public.guide_chats;
create policy "your thread is yours"
  on public.guide_chats for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- no insert/update/delete policies on purpose:
-- only the-guide function (service key) writes the record.

-- self-check: expect 1
select count(*) as guide_ready from information_schema.tables where table_name = 'guide_chats';


-- ============================================================================
-- [35] payments-schema.sql
-- ============================================================================
-- THE RAIL COLUMNS — where each listing's card checkout points.
-- square:          the provider's OWN Square link (owner-writable — it's theirs).
-- stripe_acct:     their Stripe Connect account id (acct_...), written ONLY by
--                  the connect-onboard edge function through the service role.
-- charges_enabled: stamped true by the same function once Stripe verifies them.
-- The column-level revokes are the wall: a listing owner must never be able
-- to stamp their own rail live or point it at someone else's account.

alter table public.providers add column if not exists square text;
alter table public.providers add column if not exists stripe_acct text;
alter table public.providers add column if not exists charges_enabled boolean;

revoke update (stripe_acct, charges_enabled) on public.providers from authenticated, anon;
revoke insert (stripe_acct, charges_enabled) on public.providers from authenticated, anon;

-- self-check: expect 3 rows
select column_name from information_schema.columns
 where table_name = 'providers'
   and column_name in ('square', 'stripe_acct', 'charges_enabled')
 order by column_name;


-- ============================================================================
-- [36] equity-schema.sql
-- ============================================================================
-- ============================================================
-- THE EQUITY POOL — and the wall that makes it honest.
--
-- Two things ship together here because they share one pipe:
--
-- 1) THE FIX. Until now a completed deal minted redeemable credit
--    from a fee a PARTICIPANT typed into the deal. Anyone could
--    complete a fake deal against themselves and mint real,
--    cash-outable dollars. This closes it: earned credit mints ONLY
--    against money Stripe actually captured (recorded by the webhook
--    on the service role, which no browser can forge), and never
--    against a self-dealt buyer==provider leg.
--
-- 2) THE POOL. A mandatory 1% draw on every real transaction accrues
--    as EQUITY POINTS to the profile that ran the transaction (the
--    provider). Customers accrue nothing unless that provider flips
--    the share toggle on their own dashboard. Equity points are
--    NON-CASHABLE by construction — their reason never matches the
--    earned test, so they can never enter the cash-out rail. A
--    member's stake is their points ÷ the whole pool.
--
-- Paste whole into Supabase → SQL editor → Run. Safe to re-run.
-- Requires: the webhook redeploy that records deal_payments.
-- ============================================================

-- ---------- the only proof of real money (service role writes it) ----------
create table if not exists public.deal_payments (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  deal_id uuid not null,
  gross   numeric(12,2) not null check (gross >= 0),   -- what the buyer actually paid, dollars
  ref     text unique                                  -- stripe session id: one record per capture
);
alter table public.deal_payments enable row level security;
-- RLS on with NO policy = locked to the service role and security-definer
-- functions only. The webhook writes it; the mint and the draw read it.

-- ---------- the mint, rewritten: real money is the ONLY mint ----------
create or replace function public.mint_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  paid numeric;
  provider_owner uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    -- the captured total for this deal — zero if the card rail never ran
    select coalesce(sum(gross), 0) into paid from deal_payments where deal_id = new.id;
    if paid <= 0 then
      return new;  -- money moved outside the app, or not at all: nothing redeemable mints
    end if;
    select owner into provider_owner from providers where slug = new.to_slug limit 1;
    if provider_owner is not null then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (provider_owner, round(paid * 0.05, 2), 'deal completed — the work pays twice', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
    -- the buyer's 1% back — never when the buyer IS the provider (no self-deal print)
    if new.from_owner is not null and new.from_owner is distinct from provider_owner then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (new.from_owner, round(paid * 0.01, 2), 'deal completed — thank you for moving money here', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
-- trigger already exists from mtoken-schema; re-bind to be safe
drop trigger if exists mint_on_completion_t on public.deals;
create trigger mint_on_completion_t after update on public.deals
  for each row execute function public.mint_on_completion();

-- ---------- the profile type + the provider's share toggle ----------
-- HARDENED (audit #7): default 'customer' — you're a customer until you
-- provide. The desk (or Connect onboarding) promotes to 'provider'.
alter table public.providers add column if not exists account_type text default 'customer';
alter table public.providers add column if not exists equity_share boolean default false;
-- a customer can't restyle themselves a provider to farm equity: the desk sets type
revoke update (account_type) on public.providers from authenticated, anon;
-- equity_share stays the provider's own switch on their dashboard

-- ---------- the equity ledger (non-cashable by design) ----------
create table if not exists public.equity_ledger (
  id     uuid primary key default gen_random_uuid(),
  at     timestamptz default now(),
  owner  uuid not null,
  points numeric(14,2) not null,          -- 1 point = $1 drawn into the pool for them
  reason text default '',
  ref    text default '',
  unique (owner, ref, reason)             -- one draw per capture per person
);
create index if not exists equity_owner_idx on public.equity_ledger (owner);
alter table public.equity_ledger enable row level security;
drop policy if exists "members read their own equity" on public.equity_ledger;
create policy "members read their own equity"
  on public.equity_ledger for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- no insert policy: only the draw below writes it

-- ---------- the 1% draw: fires on every recorded real transaction ----------
create or replace function public.equity_draw() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  provider_owner uuid; buyer uuid; share_on boolean; draw numeric; d_to text;
begin
  draw := round(new.gross * 0.01, 2);
  if draw <= 0 then return new; end if;
  select to_slug, from_owner into d_to, buyer from deals where id = new.deal_id;
  select owner, coalesce(equity_share, false) into provider_owner, share_on
    from providers where slug = d_to limit 1;
  -- the profile that ran the transaction always accrues the equity
  if provider_owner is not null then
    insert into equity_ledger (owner, points, reason, ref)
    values (provider_owner, draw, 'transaction draw', new.ref)
    on conflict (owner, ref, reason) do nothing;
  end if;
  -- the customer accrues only if this provider opened the share on their desk
  if share_on and buyer is not null and buyer is distinct from provider_owner then
    insert into equity_ledger (owner, points, reason, ref)
    values (buyer, draw, 'transaction draw (shared)', new.ref)
    on conflict (owner, ref, reason) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists equity_draw_t on public.deal_payments;
create trigger equity_draw_t after insert on public.deal_payments
  for each row execute function public.equity_draw();

-- ---------- what a member owns, and how big the pool is ----------
create or replace function public.my_equity()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare mine numeric; pool numeric;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(sum(points), 0) into mine from equity_ledger where owner = auth.uid();
  select coalesce(sum(points), 0) into pool from equity_ledger;
  return jsonb_build_object(
    'points', mine,
    'pool', pool,
    'stake_pct', case when pool > 0 then round(mine / pool * 100, 4) else 0 end
  );
end;
$$;
grant execute on function public.my_equity() to authenticated;

create or replace function public.equity_pool()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pool numeric; holders int;
begin
  select coalesce(sum(points), 0), count(distinct owner) into pool, holders from equity_ledger;
  return jsonb_build_object('pool', pool, 'holders', holders);
end;
$$;
grant execute on function public.equity_pool() to anon, authenticated;

-- self-checks: expect 2 tables, 4 functions
select count(*) as equity_tables from information_schema.tables
 where table_name in ('deal_payments', 'equity_ledger');
select count(*) as equity_fns from pg_proc
 where proname in ('mint_on_completion', 'equity_draw', 'my_equity', 'equity_pool');


-- ============================================================================
-- [37] records-schema.sql
-- ============================================================================
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
-- HARDENED (audit #4): dedupes like the heat counter — one stream per
-- record, per device fingerprint, per hour (shares the play_pulses
-- guard ledger, namespaced 'rec:'). Anon can still count a real listen;
-- a loop can't print streams.
create table if not exists public.play_pulses (
  slug text not null,
  fp   text not null,
  hr   timestamptz not null,
  primary key (slug, fp, hr)
);
alter table public.play_pulses enable row level security;

create or replace function public.stream_record(p_record_slug text, p_fp text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare s text; f text; ins int; n integer;
begin
  s := lower(coalesce(p_record_slug, ''));
  if s = '' then return 0; end if;
  f := left(coalesce(nullif(p_fp, ''), 'anon'), 64);
  insert into public.play_pulses (slug, fp, hr)
  values ('rec:' || s, f, date_trunc('hour', now())) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins > 0 then
    update records set streams = streams + 1 where slug = s;
  end if;
  select streams into n from records where slug = s;
  return coalesce(n, 0);
end;
$$;
grant execute on function public.stream_record(text, text) to anon, authenticated;

-- ============================================================
-- FIRST USE CASE — "Upset" (Hitman Benji × Rahndrx × Raheem), free
-- under Equity Uprise, three-way even split. Run this once after
-- the functions above to file the proposal; each party accepts by
-- claiming their profile and calling accept_split('upset').
-- ============================================================
-- Seeded with DIRECT inserts (not propose_split) so it runs cleanly in the
-- SQL editor as the postgres role — propose_split's is_mcc_admin() gate is
-- for browser callers and would (correctly) reject a role with no JWT.
-- Idempotent: the whole block no-ops once 'upset' exists.
do $$
declare rid uuid;
begin
  if exists (select 1 from public.records where slug = 'upset') then return; end if;
  insert into public.records (slug, title, free, house_owns, status)
  values ('upset', 'Upset', true, true, 'proposed') returning id into rid;
  insert into public.record_splits (record_id, party_slug, party_owner, pct)
  select rid, x.slug, (select owner from public.providers where slug = x.slug limit 1), x.pct
  from (values ('hitman-benji', 34::numeric), ('rahndrx', 33), ('raheem', 33)) as x(slug, pct);
end $$;

-- self-checks: expect 2 tables, 6 functions, 1 record
select count(*) as records_tables from information_schema.tables where table_name in ('records', 'record_splits');
select count(*) as records_fns from pg_proc
 where proname in ('mint_profile', 'propose_split', 'accept_split', 'record_board', 'stream_record');
select slug, title, status, free from public.records where slug = 'upset';


-- ============================================================================
-- [38] identifiers-schema.sql
-- ============================================================================
-- ============================================================
-- THE IDENTIFIER LOCKER — every Chaser's industry identity, in
-- the cloud, one row per identifier. The Metadata Engine saves
-- into it, the algorithm reads from it, and the GAME scores it:
-- identifier_power() returns a 0–100 completeness score the
-- profile can wear and the Trap can pay on.
-- Run AFTER admin-schema.sql. Safe to re-run.
-- ============================================================

create table if not exists public.member_identifiers (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  owner    uuid not null,
  kind     text not null check (kind in (
    'isrc_prefix','isrc','iswc','upc','ipi','isni','ipn','dpid',
    'spotify_artist','apple_artist','youtube_channel','soundcloud',
    'pro','publisher','label','ein','other')),
  value    text not null check (char_length(value) between 1 and 200),
  label    text default '',                -- e.g. the track slug an ISRC belongs to
  verified boolean not null default false, -- the desk can stamp it checked
  unique (owner, kind, value)
);
create index if not exists member_identifiers_owner on public.member_identifiers (owner);
alter table public.member_identifiers enable row level security;

drop policy if exists "your locker is yours" on public.member_identifiers;
create policy "your locker is yours"
  on public.member_identifiers for select
  using (owner = auth.uid() or is_mcc_admin());

drop policy if exists "you stock your own locker" on public.member_identifiers;
create policy "you stock your own locker"
  on public.member_identifiers for insert
  with check (owner = auth.uid());

drop policy if exists "you clean your own locker" on public.member_identifiers;
create policy "you clean your own locker"
  on public.member_identifiers for delete
  using (owner = auth.uid());

drop policy if exists "the desk verifies" on public.member_identifiers;
create policy "the desk verifies"
  on public.member_identifiers for update
  using (is_mcc_admin());

-- ---------- the game: identity power, 0–100 ----------
-- each identifier FAMILY you hold adds power; verified doubles that
-- family's weight. This is the score the profile wears and the Trap
-- can pay on ("stock your locker" mission).
create or replace function public.identifier_power()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  fams int; vfams int; total int := 10;  -- 10 families count toward power
  score int;
begin
  if auth.uid() is null then return null; end if;
  select count(distinct kind),
         count(distinct kind) filter (where verified)
    into fams, vfams
    from member_identifiers where owner = auth.uid()
     and kind in ('isrc_prefix','isrc','iswc','upc','ipi','isni',
                  'spotify_artist','youtube_channel','pro','publisher');
  score := least(100, (fams * 100 / total) + (vfams * 10));
  return jsonb_build_object('power', score, 'families', fams, 'verified_families', vfams,
    'next', case
      when fams = 0 then 'Start with your ISRC prefix or Spotify artist ID — the engine imports the rest.'
      when fams < 4 then 'Add your PRO membership and IPI — that''s the publishing money lane.'
      when fams < 8 then 'Add ISWC codes per song and your ISNI — the pros carry all ten.'
      else 'Locker deep. Get the desk to verify entries and max your power.' end);
end;
$$;
grant execute on function public.identifier_power() to authenticated;

-- self-checks: expect 1 · 1
select count(*) as locker_ready from information_schema.tables where table_name = 'member_identifiers';
select count(*) as power_ready from pg_proc where proname = 'identifier_power';


-- ============================================================================
-- [39] identifiers2-schema.sql
-- ============================================================================
-- ============================================================
-- IDENTIFIER LOCKER — go dynamic (per category of work).
--
-- The original locker fixed 'kind' to a music-only enum. Every new
-- industry that onboards (video, podcast, writing, art, software,
-- civic, venues…) carries its OWN correct identifiers — ISAN, ISBN,
-- ISSN, DOI, ORCID, podcast GUID, bundle IDs, charity numbers, and
-- more, all driven by data/distributors.json. So the constraint
-- opens up to any lowercase identifier slug instead of a fixed list.
-- The gamified identifier_power() still counts the music money-lanes;
-- extend it as new lanes matter.
--
-- Run AFTER identifiers-schema.sql (and web3-schema.sql if used).
-- Safe to re-run.
-- ============================================================

alter table public.member_identifiers drop constraint if exists member_identifiers_kind_check;
alter table public.member_identifiers add constraint member_identifiers_kind_check
  check (char_length(kind) between 2 and 40 and kind ~ '^[a-z0-9_]+$');

-- self-check: expect the constraint present, and inserts of new kinds allowed
select conname from pg_constraint where conname = 'member_identifiers_kind_check';


-- ============================================================================
-- [40] badges-schema.sql
-- ============================================================================
-- ============================================================
-- THE MULTICOLORED BADGE SYSTEM — made formal.
--
-- Until now the six M-Verified seals were a display + a form that
-- posted to a sheet. This makes them REAL held credentials: a member
-- applies for the seal their category earns, the desk verifies (checks
-- the required identifiers are in their locker), and a VERIFIED badge
-- shows on their profile for the whole floor to see. Colors, tiers and
-- required identifiers are canonical in data/badges.json.
--
-- One badge per member per seal. Verified badges are public (a seal
-- is a public claim); applications and revocations are the member's
-- and the desk's business only.
--
-- Run AFTER admin-schema.sql (needs is_mcc_admin) and identifiers2.
-- Safe to re-run.
-- ============================================================

create table if not exists public.member_badges (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid(),
  badge_id    text not null,                  -- performer / rights-owner / creator / venue / nonprofit / federal
  label       text default '',
  color       text default '',
  status      text not null default 'applied' check (status in ('applied','verified','revoked')),
  note        text default '',
  applied_at  timestamptz default now(),
  verified_at timestamptz,
  verified_by text default '',
  unique (owner, badge_id)
);
alter table public.member_badges enable row level security;

-- a VERIFIED seal is a public claim; the member also sees their own pending ones
drop policy if exists "verified badges are public" on public.member_badges;
create policy "verified badges are public" on public.member_badges for select
  using (status = 'verified' or owner = auth.uid() or is_mcc_admin());
-- the member applies (insert only as themselves, always as 'applied')
drop policy if exists "you apply for your own badges" on public.member_badges;
create policy "you apply for your own badges" on public.member_badges for insert
  with check (owner = auth.uid() and status = 'applied');
-- the member can withdraw an application; the desk works all
drop policy if exists "you withdraw your own" on public.member_badges;
create policy "you withdraw your own" on public.member_badges for delete
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "the desk verifies badges" on public.member_badges;
create policy "the desk verifies badges" on public.member_badges for update
  using (is_mcc_admin());

-- apply for a seal (member) — idempotent; re-applying an unverified one is a no-op
create or replace function public.apply_badge(p_badge text, p_label text default '', p_color text default '')
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into member_badges (owner, badge_id, label, color, status)
  values (auth.uid(), p_badge, left(p_label, 80), left(p_color, 16), 'applied')
  on conflict (owner, badge_id) do nothing;
  return 'applied — the desk reviews your identifiers and stamps it verified';
end;
$$;
grant execute on function public.apply_badge(text, text, text) to authenticated;

-- award / verify a seal (desk) — grants it verified straight to a member by ticker/slug
create or replace function public.award_badge(to_slug text, p_badge text, p_label text default '', p_color text default '')
returns text language plpgsql security definer set search_path = public as $$
declare rcpt uuid;
begin
  if not is_mcc_admin() then raise exception 'the desk awards badges'; end if;
  select owner into rcpt from providers where slug = to_slug and owner is not null limit 1;
  if rcpt is null then raise exception 'no claimed account behind that name'; end if;
  insert into member_badges (owner, badge_id, label, color, status, verified_at, verified_by)
  values (rcpt, p_badge, left(p_label, 80), left(p_color, 16), 'verified', now(), 'desk')
  on conflict (owner, badge_id) do update
    set status = 'verified', verified_at = now(), verified_by = 'desk',
        label = coalesce(nullif(excluded.label, ''), member_badges.label),
        color = coalesce(nullif(excluded.color, ''), member_badges.color);
  return 'verified — the seal is live on their profile';
end;
$$;
grant execute on function public.award_badge(text, text, text, text) to authenticated;

-- my badges (any status) — feeds the desk card
create or replace function public.my_badges()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', badge_id, 'label', label, 'color', color, 'status', status) order by applied_at), '[]'::jsonb)
    into out from member_badges where owner = auth.uid();
  return out;
end;
$$;
grant execute on function public.my_badges() to authenticated;

-- the verified seals on any listing (public) — feeds profiles/cards
create or replace function public.badges_for(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.badge_id, 'label', b.label, 'color', b.color)), '[]'::jsonb)
  from member_badges b join providers p on p.owner = b.owner
  where p.slug = p_slug and b.status = 'verified';
$$;
grant execute on function public.badges_for(text) to anon, authenticated;

-- self-checks: expect 1 table · 4 functions
select count(*) as badges_table from information_schema.tables where table_name = 'member_badges';
select count(*) as badges_fns from pg_proc where proname in ('apply_badge','award_badge','my_badges','badges_for');


-- ============================================================================
-- [41] web3-schema.sql
-- ============================================================================
-- ============================================================
-- THE WEB3 WING — the treasury, the academy, and the gas grants.
--
-- The play: the platform's pool buys real, existing cryptocurrency
-- on a licensed exchange (the desk does this OFF-platform — the app
-- never custodies keys or moves coins). The app does three honest
-- things:
--   1) TREASURY — the desk attests what the treasury holds (asset,
--      quantity, note), publicly readable. Don't trust — verify.
--   2) ACADEMY — members learn Web3 in lessons; progress lives here.
--   3) GAS GRANTS — a member who FINISHES the academy saves their
--      own wallet address and requests one small gas grant. The desk
--      fulfils it manually from the exchange and stamps the tx hash.
--      One per member, education-gated, server-enforced.
--
-- What this deliberately is NOT: no token is issued, no custody is
-- taken, no swaps happen in-app. That keeps the platform out of
-- money-transmission and securities territory; the treasury buy is
-- an ordinary asset purchase by the org, and grants are small gifts.
--
-- Paste whole into Supabase → SQL editor → Run. Safe to re-run.
-- Requires: admin-schema (is_mcc_admin), identifiers-schema.
-- ============================================================

-- ---------- let the identifier locker hold wallet addresses ----------
alter table public.member_identifiers drop constraint if exists member_identifiers_kind_check;
alter table public.member_identifiers add constraint member_identifiers_kind_check check (kind in (
  'isrc_prefix','isrc','iswc','upc','ipi','isni','ipn','dpid',
  'spotify_artist','apple_artist','youtube_channel','soundcloud',
  'pro','publisher','label','ein','other',
  'wallet_evm','wallet_sol','wallet_btc'));

-- ---------- 1 · the treasury, attested in public ----------
create table if not exists public.treasury_holdings (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  asset    text not null,                      -- 'ETH', 'BTC', 'USDC' …
  quantity numeric(24,8) not null check (quantity >= 0),
  note     text default ''                     -- exchange, cost basis, why
);
alter table public.treasury_holdings enable row level security;
drop policy if exists "the world reads the treasury" on public.treasury_holdings;
create policy "the world reads the treasury"
  on public.treasury_holdings for select using (true);
drop policy if exists "the desk attests the treasury" on public.treasury_holdings;
create policy "the desk attests the treasury"
  on public.treasury_holdings for all
  using (is_mcc_admin()) with check (is_mcc_admin());

-- ---------- 2 · academy progress: one row per member per lesson ----------
create table if not exists public.web3_progress (
  owner  uuid not null,
  lesson text not null check (lesson in (
    'wallets','seed-safety','gas','layers','scams','treasury')),
  at     timestamptz default now(),
  primary key (owner, lesson)
);
alter table public.web3_progress enable row level security;
drop policy if exists "your progress is yours" on public.web3_progress;
create policy "your progress is yours"
  on public.web3_progress for select
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "you log your own lessons" on public.web3_progress;
create policy "you log your own lessons"
  on public.web3_progress for insert
  with check (owner = auth.uid());

-- ---------- 3 · the gas grants: finish the academy, get your first gas ----------
create table if not exists public.gas_grants (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  owner   uuid not null unique,                -- ONE grant per member, ever
  address text not null check (address ~ '^0x[a-fA-F0-9]{40}$'),
  status  text not null default 'requested' check (status in ('requested','sent','denied')),
  tx_hash text default ''                      -- the desk stamps the receipt
);
alter table public.gas_grants enable row level security;
drop policy if exists "you see your own grant" on public.gas_grants;
create policy "you see your own grant"
  on public.gas_grants for select
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "the desk works the grants" on public.gas_grants;
create policy "the desk works the grants"
  on public.gas_grants for update
  using (is_mcc_admin());
-- inserts ONLY through the function below: the education gate is server law

create or replace function public.request_gas_grant(p_address text)
returns text language plpgsql security definer set search_path = public as $$
declare done int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_address !~ '^0x[a-fA-F0-9]{40}$' then
    raise exception 'that is not an EVM address — 0x plus 40 hex characters';
  end if;
  select count(*) into done from web3_progress where owner = auth.uid();
  if done < 6 then
    raise exception 'finish the academy first — % of 6 lessons done', done;
  end if;
  insert into gas_grants (owner, address) values (auth.uid(), lower(p_address));
  -- save the address to the identifier locker too (idempotent)
  insert into member_identifiers (owner, kind, value, label)
  values (auth.uid(), 'wallet_evm', lower(p_address), 'gas grant wallet')
  on conflict (owner, kind, value) do nothing;
  return 'requested — the desk sends your first gas and stamps the receipt here';
exception when unique_violation then
  raise exception 'one gas grant per member — yours is already on the books';
end;
$$;
grant execute on function public.request_gas_grant(text) to authenticated;

-- my academy card: progress + grant state in one call
create or replace function public.my_web3()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lessons jsonb; g record;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(jsonb_agg(lesson), '[]'::jsonb) into lessons
    from web3_progress where owner = auth.uid();
  select status, tx_hash, address into g from gas_grants where owner = auth.uid();
  return jsonb_build_object(
    'lessons', lessons,
    'grant_status', coalesce(g.status, ''),
    'grant_tx', coalesce(g.tx_hash, ''),
    'grant_address', coalesce(g.address, '')
  );
end;
$$;
grant execute on function public.my_web3() to authenticated;

-- self-checks: expect 3 tables · 2 functions
select count(*) as web3_tables from information_schema.tables
 where table_name in ('treasury_holdings', 'web3_progress', 'gas_grants');
select count(*) as web3_fns from pg_proc
 where proname in ('request_gas_grant', 'my_web3');


-- ============================================================================
-- [42] vault-schema.sql
-- ============================================================================
-- ============================================================
-- THE VAULT — the reserve that only ever fills.
--
-- When a member SPENDS earned credit inside the loop (claims a house
-- offer, pays a platform fee), that credit doesn't evaporate — it
-- flows into The Vault: a single reserve account with NO debit path
-- anywhere in this schema or the app. It only accrues. It is the
-- platform's permanent backing reserve, attested publicly, forever
-- untouched.
--
-- WHY NO WITHDRAWAL EXISTS: this is deliberate, not unfinished. A
-- reserve you can draw down is a reserve you can misuse; a reserve
-- with no code path out is one nobody — not even the desk — can
-- raid. If a backed digital asset is ever issued against this Vault,
-- this ledger is its audit trail. Until counsel clears that, there
-- is no token and no wallet debit — only the honest reserve and a
-- read-only view of what each member holds against it.
--
-- Paste whole into Supabase → SQL editor → Run. Safe to re-run.
-- Requires: mtoken-schema (mtoken_ledger), reserve-schema
-- (is_earned_reason), house-schema (house_claim reason).
-- ============================================================

-- the Vault's own sentinel owner in the shared ledger
-- (00…f2 = "the vault" — sibling of the fund's 00…f1). Nothing signs
-- in as it; nothing debits it. These functions only ever add.
create or replace function public.vault_uid() returns uuid
  language sql immutable as $$ select '00000000-0000-0000-0000-0000000000f2'::uuid $$;

-- ---------- the intake: spent EARNED credit lands in the Vault ----------
-- Fires whenever a debit is written to the ledger that represents an
-- in-loop spend of earned credit (a house claim, a platform fee).
-- The Vault accrues the absolute value; unique(owner,ref,reason)
-- keeps it idempotent no matter how often the row is touched.
create or replace function public.vault_intake() returns trigger
language plpgsql security definer set search_path = public as $$
declare amt numeric;
begin
  -- only debits (spends), and only the reasons that are real in-loop spends
  if new.delta < 0 and new.reason in ('house_claim', 'platform_fee') then
    amt := round(-new.delta, 2);
    if amt > 0 then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (public.vault_uid(), amt, 'vault_reserve', new.reason || ':' || coalesce(new.ref, new.id::text))
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vault_intake_t on public.mtoken_ledger;
create trigger vault_intake_t after insert on public.mtoken_ledger
  for each row execute function public.vault_intake();

-- ---------- the public books: watch the reserve grow (aggregates) ----------
-- Anyone can read the Vault's size and how many spends built it. There
-- is no function anywhere that subtracts from it — by design.
create or replace function public.vault_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare reserve numeric; fills int; attested numeric; attest_at timestamptz;
begin
  select coalesce(sum(delta), 0), count(*) into reserve, fills
    from mtoken_ledger where owner = public.vault_uid() and reason = 'vault_reserve';
  -- reuse the reserve-schema attestation if present (dollars actually held)
  begin
    select dollars, at into attested, attest_at from reserve_attest order by at desc limit 1;
  exception when undefined_table then attested := null; end;
  return jsonb_build_object(
    'reserve', reserve,           -- E⤴ locked in the Vault, forever
    'fills', fills,               -- how many in-loop spends built it
    'backed_dollars', coalesce(attested, 0),
    'attested_at', attest_at,
    'withdrawable', 0             -- always zero: there is no debit path
  );
end;
$$;
grant execute on function public.vault_stats() to anon, authenticated;

-- ---------- the member wallet: what YOU hold, read-only ----------
-- One call feeds the wallet card: your spendable balance, your earned
-- (cash-out-eligible) credit, your equity points, your stake in the
-- Vault-backed pool, and your lifetime contribution to the reserve.
create or replace function public.my_wallet() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  bal numeric; earned numeric; contributed numeric;
  points numeric; pool numeric; reserve numeric;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  -- what this member has personally poured into the Vault (their spends)
  select coalesce(sum(-delta), 0) into contributed from mtoken_ledger
   where owner = auth.uid() and delta < 0 and reason in ('house_claim', 'platform_fee');
  -- equity stake (equity-schema), guarded in case it isn't installed
  begin
    select coalesce(sum(points), 0) into points from equity_ledger where owner = auth.uid();
    select coalesce(sum(points), 0) into pool from equity_ledger;
  exception when undefined_table then points := 0; pool := 0; end;
  select coalesce(sum(delta), 0) into reserve
   from mtoken_ledger where owner = public.vault_uid() and reason = 'vault_reserve';
  return jsonb_build_object(
    'balance', bal,
    'earned', earned,
    'contributed_to_vault', contributed,
    'equity_points', points,
    'equity_stake_pct', case when pool > 0 then round(points / pool * 100, 4) else 0 end,
    'vault_reserve', reserve
  );
end;
$$;
grant execute on function public.my_wallet() to authenticated;

-- ---------- backfill: sweep any spends that already happened ----------
-- Run once safely — idempotent. Pulls historic house_claim/platform_fee
-- debits into the Vault so the reserve reflects all past in-loop spends.
insert into mtoken_ledger (owner, delta, reason, ref)
select public.vault_uid(), round(-delta, 2), 'vault_reserve', reason || ':' || coalesce(ref, id::text)
  from mtoken_ledger
 where delta < 0 and reason in ('house_claim', 'platform_fee')
on conflict (owner, ref, reason) do nothing;

-- self-checks: expect 1 · 1 · 1 · (reserve total)
select count(*) as vault_uid_fn   from pg_proc where proname = 'vault_uid';
select count(*) as vault_stats_fn from pg_proc where proname = 'vault_stats';
select count(*) as wallet_fn      from pg_proc where proname = 'my_wallet';
select public.vault_stats() as vault_now;


-- ============================================================================
-- [43] distribution-schema.sql
-- ============================================================================
-- ============================================================
-- THE DISTRIBUTION DESK — every member's real income, connected.
--
-- Two tables + a summary. This is the ingestion layer for the whole
-- platform: a member says which platforms they distribute/earn
-- through (per industry), deep-links straight to that platform's
-- reports/bank, and uploads the earnings-report CSV. The parsed
-- totals live here as the member's REAL, self-reported income —
-- a desk-verifiable signal (not cash-outable platform credit; the
-- two-color law still holds — this never touches mtoken_ledger).
--
-- Dynamic by design: 'industry' and 'distributor_id' are free text
-- driven by data/distributors.json, so a new industry or platform
-- needs zero schema change.
--
-- Run AFTER admin-schema.sql. Safe to re-run.
-- ============================================================

-- 1 · CONNECTIONS — who you distribute through
create table if not exists public.member_connections (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid(),
  industry      text not null,
  distributor_id text not null,
  distributor    text not null,                 -- display name (or the 'Other' the member typed)
  handle        text default '',                -- their account/artist name on that platform, optional
  reports_url   text default '',                -- deep link the member opens (from the registry or their own)
  verified      boolean not null default false, -- the desk can stamp a connection confirmed
  at            timestamptz default now(),
  unique (owner, distributor_id)
);
alter table public.member_connections enable row level security;
drop policy if exists "your connections are yours" on public.member_connections;
create policy "your connections are yours" on public.member_connections for select
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "you connect your own" on public.member_connections;
create policy "you connect your own" on public.member_connections for insert
  with check (owner = auth.uid());
drop policy if exists "you edit your own connections" on public.member_connections;
create policy "you edit your own connections" on public.member_connections for update
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "you drop your own connections" on public.member_connections;
create policy "you drop your own connections" on public.member_connections for delete
  using (owner = auth.uid());

-- 2 · EARNINGS REPORTS — the CSV you upload, parsed to a total
create table if not exists public.earnings_reports (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid(),
  distributor_id text not null,
  distributor    text not null,
  period        text default '',                -- e.g. "2026-05" or "Q1 2026" — from the file or the member
  gross         numeric(14,2) not null default 0,
  currency      text default 'USD',
  rows          int not null default 0,         -- line-items counted in the CSV
  note          text default '',
  filename      text default '',
  verified      boolean not null default false,
  at            timestamptz default now()
);
alter table public.earnings_reports enable row level security;
drop policy if exists "your reports are yours" on public.earnings_reports;
create policy "your reports are yours" on public.earnings_reports for select
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "you file your own reports" on public.earnings_reports;
create policy "you file your own reports" on public.earnings_reports for insert
  with check (owner = auth.uid());
drop policy if exists "you drop your own reports" on public.earnings_reports;
create policy "you drop your own reports" on public.earnings_reports for delete
  using (owner = auth.uid());
drop policy if exists "the desk verifies reports" on public.earnings_reports;
create policy "the desk verifies reports" on public.earnings_reports for update
  using (is_mcc_admin());

-- 3 · MY DISTRIBUTION — connections + reports + lifetime total, one call
create or replace function public.my_distribution()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare conns jsonb; reps jsonb; total numeric; last12 numeric;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', distributor_id, 'name', distributor, 'industry', industry,
      'handle', handle, 'reports_url', reports_url, 'verified', verified) order by at), '[]'::jsonb)
    into conns from member_connections where owner = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'distributor', distributor, 'period', period, 'gross', gross,
      'rows', rows, 'verified', verified, 'at', at) order by at desc), '[]'::jsonb)
    into reps from earnings_reports where owner = auth.uid();
  select coalesce(sum(gross), 0) into total from earnings_reports where owner = auth.uid();
  select coalesce(sum(gross), 0) into last12 from earnings_reports
    where owner = auth.uid() and at > now() - interval '365 days';
  return jsonb_build_object(
    'connections', conns, 'reports', reps,
    'reported_total', total, 'reported_12mo', last12);
end;
$$;
grant execute on function public.my_distribution() to authenticated;

-- self-checks: expect 2 tables · 1 function
select count(*) as dist_tables from information_schema.tables
 where table_name in ('member_connections', 'earnings_reports');
select count(*) as dist_fn from pg_proc where proname = 'my_distribution';


-- ============================================================================
-- [44] desk-tools.sql
-- ============================================================================
-- ============================================================
-- DESK TOOLS — the eraser. Desk-only (is_mcc_admin).
-- unclaim_listing(slug): release a claim, listing stays on the floor.
-- erase_listing(slug): delete the listing row entirely.
-- Run AFTER admin-schema. Safe to re-run.
-- ============================================================
create or replace function public.unclaim_listing(p_slug text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not is_mcc_admin() then raise exception 'the desk holds the eraser'; end if;
  update providers set owner = null where slug = p_slug;
  begin update providers set claimed = false where slug = p_slug; exception when undefined_column then null; end;
  return 'released — ' || p_slug || ' is unclaimed and claimable again';
end;
$$;
grant execute on function public.unclaim_listing(text) to authenticated;

create or replace function public.erase_listing(p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_mcc_admin() then raise exception 'the desk holds the eraser'; end if;
  delete from providers where slug = p_slug;
  get diagnostics n = row_count;
  return n || ' listing(s) erased: ' || p_slug;
end;
$$;
grant execute on function public.erase_listing(text) to authenticated;

select count(*) as eraser_ready from pg_proc where proname in ('unclaim_listing','erase_listing');


-- ============================================================================
-- [45] signals-schema.sql
-- ============================================================================
-- ============================================================
-- EXTERNAL SIGNALS — the outside world, on the record.
-- signal-sweep (edge function) files one row per member, per source,
-- per metric, per day: Spotify followers/popularity, YouTube
-- views/subscribers, Last.fm scrobbles. The score's Reach pillar
-- reads this as it fills. Run AFTER identifiers2. Safe to re-run.
-- ============================================================

create table if not exists public.external_signals (
  owner  uuid not null,
  source text not null check (source in ('spotify','youtube','lastfm','songstats')),
  kind   text not null check (char_length(kind) between 2 and 24),
  value  numeric not null default 0,
  at     date not null default current_date,
  primary key (owner, source, kind, at)
);
alter table public.external_signals enable row level security;
-- public read: these are public platform numbers, attributed to their source
drop policy if exists "signals are public" on public.external_signals;
create policy "signals are public" on public.external_signals for select using (true);
-- no member insert policy: only the sweep (service role) writes

-- my latest outside numbers — feeds the desk card
create or replace function public.my_signals()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('source', s.source, 'kind', s.kind, 'value', s.value, 'at', s.at)), '[]'::jsonb)
  from (select distinct on (source, kind) source, kind, value, at
          from external_signals where owner = auth.uid()
         order by source, kind, at desc) s;
$$;
grant execute on function public.my_signals() to authenticated;

-- the nightly kick: pg_cron calls the sweep with the shared secret.
-- REPLACE <PROJECT-REF> and <SWEEP_SECRET> before running this block.
-- (Set the same SWEEP_SECRET as a secret on the signal-sweep function.)
-- do $$ begin
--   perform cron.schedule('mcc-signal-sweep', '17 8 * * *',
--     $c$ select net.http_post(
--       url := 'https://<PROJECT-REF>.supabase.co/functions/v1/signal-sweep',
--       headers := '{"x-sweep-secret": "<SWEEP_SECRET>", "Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb) $c$);
-- end $$;

-- self-check: expect 1 · 1
select count(*) as signals_tbl from information_schema.tables where table_name = 'external_signals';
select count(*) as signals_fn from pg_proc where proname = 'my_signals';


-- ============================================================================
-- [46] rescale-schema.sql
-- ============================================================================
-- ============================================================
-- THE GREAT RESCALE — the money machine, rebuilt honest.
--
-- Three moves, one paste:
--
--   1. THE RESET. Every balance goes to zero EXCEPT money that is
--      real: EARNED credit (deals/bounties/services against captured
--      payments), PURCHASED credit (the webhook's own 'purchase'
--      rows — people paid dollars for those), cash-out plumbing, and
--      the community fund's accruals. Grants, bankrolls, old mission
--      awards and transfers are wiped. The old ledger is archived
--      first (mtoken_ledger_legacy) — nothing is destroyed, it just
--      stops counting.
--
--   2. THE BANKROLL RETIRES. claim_beta_bankroll() now mints nothing.
--      1,000 E⤴ for showing up is over.
--
--   3. THE THOUSAND. 1,000 E⤴ is now what the app pays a member who
--      does LITERALLY EVERYTHING — 26 verified milestones across the
--      whole platform (975) plus the back-end claim run (25). Every
--      milestone is checked against the record, minted once, granted
--      color (spends in-loop, never cashes out). The frontend Trap
--      (mymission.html) shows the same numbers.
--
-- Run AFTER the full ladder (it touches identifiers, badges,
-- distribution, web3, control, guide tables). Safe to re-run — the
-- archive only fills once, the reset only deletes what the law says,
-- the mints stay idempotent.
-- ============================================================

-- ---------- 1 · THE RESET ----------
create table if not exists public.mtoken_ledger_legacy
  (like public.mtoken_ledger including defaults);
alter table public.mtoken_ledger_legacy enable row level security;
-- no policies on purpose: the archive is the desk's cold storage

insert into public.mtoken_ledger_legacy
select * from public.mtoken_ledger
where not exists (select 1 from public.mtoken_ledger_legacy limit 1);

delete from public.mtoken_ledger
where not (
     (delta > 0 and is_earned_reason(reason))  -- real work, real captures
  or reason = 'purchase'                        -- real dollars via the webhook
  or reason like 'cashout%'                     -- the cash-out plumbing stays true
  or reason = 'fund_accrue'                     -- the community fund's own accruals
);

-- ---------- 2 · THE BANKROLL RETIRES ----------
create or replace function public.claim_beta_bankroll()
returns numeric language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  return 0; -- retired: the app pays for doing, not for arriving
end;
$$;
grant execute on function public.claim_beta_bankroll() to authenticated;

-- ---------- 3 · THE THOUSAND ----------
-- 26 milestones · 975 E⤴ · every check reads the record, never the
-- honor system. Same reason ('gauntlet award') and refs as before so
-- the mint stays idempotent; the reset wiped the old 5-E⤴ rows, so
-- every member re-earns at the new scale.
create or replace function public.claim_gauntlet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me record; rec record; total numeric := 0; done jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select slug, ticker into me from providers where owner = auth.uid() limit 1;
  for rec in
    select * from (values
      -- THE WALK-IN · 100
      ('walk_in',        20.0, exists(select 1 from events where uid = auth.uid() and name = 'welcome_done')),
      ('card_live',      20.0, exists(select 1 from providers where owner = auth.uid() and coalesce(headline, '') <> '')),
      ('signed',         15.0, exists(select 1 from agreements where owner = auth.uid())),
      ('push_on',        10.0, exists(select 1 from push_subs where owner = auth.uid())),
      ('explorer',       35.0, (select count(distinct date(at)) from events where uid = auth.uid()) >= 5),
      -- THE IDENTITY · 150
      ('ticker_claimed', 25.0, exists(select 1 from providers where owner = auth.uid() and coalesce(ticker, '') <> '')),
      ('first_id',       40.0, exists(select 1 from member_identifiers where owner = auth.uid())),
      ('id_stack',       45.0, (select count(distinct kind) from member_identifiers where owner = auth.uid()) >= 3),
      ('badge_applied',  40.0, exists(select 1 from member_badges where owner = auth.uid())),
      -- THE CRAFT · 150
      ('first_post',     25.0, exists(select 1 from posts where owner = auth.uid())),
      ('on_the_wire',    30.0, (select count(*) from posts where owner = auth.uid()) >= 3),
      ('first_track',    45.0, exists(select 1 from rack where owner = auth.uid())),
      ('listing_live',   50.0, exists(select 1 from providers where owner = auth.uid() and status = 'live')),
      -- THE BUSINESS · 255
      ('first_deal',     40.0, exists(select 1 from deals where from_owner = auth.uid())),
      ('deal_signed',    60.0, exists(select 1 from deals d
                                where (d.from_owner = auth.uid()
                                       or d.to_slug in (select slug from providers where owner = auth.uid()))
                                  and d.status in ('signed', 'paid', 'completed'))),
      ('distro_connected', 50.0, exists(select 1 from member_connections where owner = auth.uid())),
      ('earnings_filed', 60.0, exists(select 1 from earnings_reports where owner = auth.uid())),
      ('payouts_armed',  45.0, exists(select 1 from providers where owner = auth.uid() and coalesce(stripe_acct, '') <> '')),
      -- THE COMMUNITY · 200
      ('civic_card',     30.0, exists(select 1 from civic_profiles where owner = auth.uid())),
      ('first_vote',     40.0, exists(select 1 from proposal_votes where owner = auth.uid())),
      ('proposal_filed', 40.0, exists(select 1 from proposals where owner = auth.uid())),
      ('first_plug',     50.0, exists(select 1 from providers g
                                where g.owner is not null and g.referred_by is not null
                                  and upper(g.referred_by) in (nullif(upper(coalesce(me.ticker, '')), ''),
                                                               nullif(upper(coalesce(me.slug, '')), '')))),
      ('guide_talk',     40.0, exists(select 1 from guide_chats where owner = auth.uid())),
      -- THE SCHOLAR · 120
      ('scholar_3',      50.0, (select count(*) from web3_progress where owner = auth.uid()) >= 3),
      ('scholar_6',      40.0, (select count(*) from web3_progress where owner = auth.uid()) >= 6),
      ('gas_wallet',     30.0, exists(select 1 from gas_grants where owner = auth.uid()))
    ) t(k, amt, ok)
  loop
    if rec.ok then
      done := done || to_jsonb(rec.k);
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (auth.uid(), rec.amt, 'gauntlet award', 'gauntlet:' || rec.k)
      on conflict (owner, ref, reason) do nothing;
      if found then total := total + rec.amt; end if;
    end if;
  end loop;
  return jsonb_build_object('done', done, 'minted', total,
    'paid_total', coalesce((select sum(delta) from mtoken_ledger
                            where owner = auth.uid() and reason = 'gauntlet award'), 0));
end;
$$;
grant execute on function public.claim_gauntlet() to authenticated;

-- the back-end claim run completes the thousand: 25 E⤴, once
create or replace function public.claim_run_bonus()
returns numeric language plpgsql security definer set search_path = public as $$
declare already int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select count(*) into already from mtoken_ledger
   where owner = auth.uid() and reason = 'claim_run';
  if already > 0 then return 0; end if; -- the bonus only pays once
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), 25.00, 'claim_run', 'operator');
  return 25.00;
end;
$$;
grant execute on function public.claim_run_bonus() to authenticated;

-- ---------- SELF-CHECKS ----------
-- the budget: expect full_run_pays = 1000.00
select 975.00 + 25.00 as full_run_pays;
-- the reset held the line: expect zero granted/bankroll rows surviving
select count(*) as unbacked_left from mtoken_ledger
 where delta > 0 and not is_earned_reason(reason)
   and reason not in ('purchase', 'fund_accrue') and reason not like 'cashout%'
   and reason not in ('gauntlet award', 'claim_run');
-- the archive is cold and full: expect >= the live row count
select (select count(*) from mtoken_ledger_legacy) as archived,
       (select count(*) from mtoken_ledger) as live;


-- ============================================================================
-- [47] hardening-schema.sql
-- ============================================================================
-- ============================================================
-- THE HARDENING — the demolition report, sealed.
--
-- One paste that closes every hole the adversarial audit found.
-- Run it LAST, after every other schema. It is the authoritative
-- last word: it re-asserts the safe version of every function the
-- audit flagged, so it no longer matters what order the older files
-- ran in, or whether an old file gets re-pasted later. Idempotent.
--
-- Findings closed here:
--   #1  duelling mint_on_completion() — the cash-out hole re-arming
--   #2  house offers claimable with granted (Sybil bankroll) credit
--   #3  either party could flip a deal's identity / fake 'paid'
--   #4  bump_play / stream_record: anon, unbounded, poisonable
--   #5  the 1% fund accrued on fake completions (no payment proof)
--   #7  account_type defaulted everyone to 'provider'
--   #8  run-order fragility (this file makes it moot)
-- ============================================================

-- ------------------------------------------------------------
-- #1 + #5  MONEY MINTS ONLY AGAINST MONEY STRIPE ACTUALLY TOOK
-- The one safe mint, re-asserted so no older/unsafe copy can win.
-- Earned credit (cash-outable) prints only from deal_payments —
-- the row the webhook writes on the service role, unforgeable by
-- any browser — and never on a self-dealt buyer==provider leg.
-- ------------------------------------------------------------
create or replace function public.mint_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare paid numeric; provider_owner uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select coalesce(sum(gross), 0) into paid from deal_payments where deal_id = new.id;
    if paid <= 0 then
      return new;  -- money moved outside the app, or not at all: nothing redeemable mints
    end if;
    select owner into provider_owner from providers where slug = new.to_slug limit 1;
    if provider_owner is not null then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (provider_owner, round(paid * 0.05, 2), 'deal completed — the work pays twice', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
    if new.from_owner is not null and new.from_owner is distinct from provider_owner then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (new.from_owner, round(paid * 0.01, 2), 'deal completed — thank you for moving money here', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists mint_on_completion_t on public.deals;
create trigger mint_on_completion_t after update on public.deals
  for each row execute function public.mint_on_completion();

-- the community fund's 1% now draws off the REAL captured total too,
-- never a fee a participant typed into a deal they completed themselves.
create or replace function public.fund_accrue_on_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare paid numeric; cut numeric;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select coalesce(sum(gross), 0) into paid from deal_payments where deal_id = new.id;
    cut := round(paid * 0.01, 2);
    if cut > 0 then
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (public.fund_uid(), cut, 'fund_accrue', new.id::text)
      on conflict (owner, ref, reason) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists fund_accrue_t on public.deals;
create trigger fund_accrue_t after update on public.deals
  for each row execute function public.fund_accrue_on_completion();

-- ------------------------------------------------------------
-- #3  A DEAL'S IDENTITY IS STONE; 'paid' IS THE WEBHOOK'S WORD
-- Participants keep working their deal, but they can't rewrite who
-- sent it, and they can't hand-stamp it 'paid' — that word only
-- lands when a real capture exists in deal_payments. The webhook
-- (service role) and the desk pass through untouched.
-- ------------------------------------------------------------
create or replace function public.deals_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' or is_mcc_admin() then
    return new;
  end if;
  if new.from_owner is distinct from old.from_owner then
    raise exception 'the sender on a deal is fixed';
  end if;
  if new.status = 'paid' and old.status is distinct from 'paid'
     and not exists (select 1 from deal_payments where deal_id = new.id) then
    raise exception 'a deal turns paid when the card clears, not by hand';
  end if;
  return new;
end;
$$;
drop trigger if exists deals_guard_t on public.deals;
create trigger deals_guard_t before update on public.deals
  for each row execute function public.deals_guard();

-- ------------------------------------------------------------
-- #2  THE HOUSE SHELF IS EARNED-ONLY
-- The capture engine, made real: you can't buy a real service off
-- the shelf with granted color (the beta bankroll, gauntlet awards,
-- credit someone transferred you). You must have EARNED the price
-- through your own deals / bounties / service pay. Sybil-funnelling
-- a dozen free accounts' bankrolls into one buys you nothing here.
-- ------------------------------------------------------------
create or replace function public.claim_house_offer(offer uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare o record; bal numeric; earned numeric; taken int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into o from house_offers where id = offer and active = true;
  if o is null then raise exception 'that offer is off the shelf'; end if;
  select count(*) into taken from house_claims where offer_id = offer and status <> 'denied';
  if o.stock is not null and taken >= o.stock then
    raise exception 'all claimed — watch the shelf for the next one';
  end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  if earned < o.price then
    raise exception 'the shelf is earned-only — you have % of % E⤴ earned through real work (the beta bankroll and gifted credit don''t count here)',
      earned, o.price;
  end if;
  if bal < o.price then
    raise exception 'you hold % — % short', bal, (o.price - bal);
  end if;
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), -o.price, 'house_claim', offer::text);
  insert into house_claims (offer_id, owner, paid)
  values (offer, auth.uid(), o.price);
  return bal - o.price;
end;
$$;
grant execute on function public.claim_house_offer(uuid) to authenticated;

-- the desk card reads the right number: total balance AND earned,
-- so the button matches what the server will actually allow.
create or replace function public.house_wallet()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare bal numeric; earned numeric;
begin
  if auth.uid() is null then return jsonb_build_object('balance', 0, 'earned', 0); end if;
  select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
  select coalesce(sum(delta), 0) into earned from mtoken_ledger
   where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
  return jsonb_build_object('balance', bal, 'earned', earned);
end;
$$;
grant execute on function public.house_wallet() to authenticated;

-- ------------------------------------------------------------
-- #4  THE HEAT CAN'T BE PRINTED
-- One pulse per track, per device fingerprint, per hour. A curl
-- loop that used to drive a track to a million now counts once an
-- hour per fingerprint. The score reads these at low, capped weight
-- anyway — this stops them poisoning the chart in the meantime.
-- ------------------------------------------------------------
create table if not exists public.play_pulses (
  slug text not null,
  fp   text not null,
  hr   timestamptz not null,
  primary key (slug, fp, hr)
);
alter table public.play_pulses enable row level security;
-- no policy on purpose: only the security-definer counters below write it

create or replace function public.bump_play(p_slug text, p_fp text default '')
returns void language plpgsql security definer set search_path = public as $$
declare s text; f text; ins int;
begin
  s := lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9]', '', 'g'));
  if s = '' then return; end if;
  f := left(coalesce(nullif(p_fp, ''), 'anon'), 64);
  insert into play_pulses (slug, fp, hr)
  values (s, f, date_trunc('hour', now())) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return; end if;       -- this fingerprint already counted this hour
  insert into track_plays (slug, plays) values (s, 1)
  on conflict (slug) do update set plays = track_plays.plays + 1, updated_at = now();
end;
$$;
grant execute on function public.bump_play(text, text) to anon, authenticated;

create or replace function public.stream_record(p_record_slug text, p_fp text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare s text; f text; ins int; n integer;
begin
  s := lower(coalesce(p_record_slug, ''));
  if s = '' then return 0; end if;
  f := left(coalesce(nullif(p_fp, ''), 'anon'), 64);
  insert into play_pulses (slug, fp, hr)
  values ('rec:' || s, f, date_trunc('hour', now())) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins > 0 then
    update records set streams = streams + 1 where slug = s;
  end if;
  select streams into n from records where slug = s;
  return coalesce(n, 0);
end;
$$;
grant execute on function public.stream_record(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- #7  YOU ARE A CUSTOMER UNTIL YOU PROVIDE
-- New listings default to 'customer'. The desk promotes a member to
-- 'provider' (or Connect onboarding does). Equity still accrues to
-- whoever actually took real money — this is the label, set honestly.
-- ------------------------------------------------------------
alter table public.providers alter column account_type set default 'customer';

-- ============================================================
-- SELF-CHECKS — expect every count = 1
-- ============================================================
select
  (select count(*) from pg_proc where proname = 'mint_on_completion')        as mint_fn,
  (select count(*) from pg_proc where proname = 'fund_accrue_on_completion')  as fund_fn,
  (select count(*) from pg_proc where proname = 'deals_guard')                as guard_fn,
  (select count(*) from pg_proc where proname = 'claim_house_offer')          as house_fn,
  (select count(*) from pg_proc where proname = 'house_wallet')               as wallet_fn,
  (select count(*) from pg_proc where proname = 'bump_play')                  as heat_fn,
  (select count(*) from pg_proc where proname = 'stream_record')              as stream_fn,
  (select count(*) from information_schema.tables where table_name = 'play_pulses') as pulses_tbl;


-- ============================================================================
-- [48] score-schema.sql
-- ============================================================================
-- ============================================================
-- THE SCORE ENGINE + THE ONE CARD — the glue that makes the
-- whole machine agree with itself.
--
-- Two things every surface has been reaching for separately:
--
--   street_score()  ONE number (0–1000) computed ONLY from spines
--                   the hardening made unforgeable: real captured
--                   money, verified identifiers, deduped plays,
--                   head-counted votes, webhook-recorded deals.
--                   Six pillars, log-curved, confidence-capped.
--
--   my_card()       ONE call that answers "who am I here?" across
--                   every table — listing, ticker, supporter handle,
--                   balances (all colors), equity stake, vault fed,
--                   identifier power, academy progress, gas grant,
--                   score. The client stops making six round trips.
--
-- Plus score_snapshots (the daily tape momentum + charts ride on),
-- ticker_price (score → $5.00–$100.00 standing index, momentum
-- swings ±25%), snapshot_all() for the desk/cron, and a guarded
-- pg_cron schedule so the tape writes itself nightly.
--
-- EVERY pillar is wrapped so missing schemas count zero instead of
-- erroring: this file runs correctly no matter which other pastes
-- have landed. Run it LAST, after hardening-schema. Safe to re-run.
--
-- The honest label: this is a REPUTATION index and a standing
-- price, not a credit score in the FCRA sense and not a security.
-- Never wire it to lending/housing/employment decisions.
-- ============================================================

-- ---------- the tape: one row per member per day ----------
create table if not exists public.score_snapshots (
  owner  uuid not null,
  at     date not null default current_date,
  score  int not null,
  ticker numeric(8,2) not null,
  parts  jsonb default '{}'::jsonb,
  primary key (owner, at)
);
alter table public.score_snapshots enable row level security;
drop policy if exists "snapshots are public" on public.score_snapshots;
create policy "snapshots are public"
  on public.score_snapshots for select using (true);
-- no insert policy: only snapshot_all() below writes the tape

-- ---------- the curve: log-normalized 0–100 ----------
create or replace function public.n_log(x numeric, c numeric)
returns numeric language sql immutable as $$
  select least(100, greatest(0,
    case when coalesce(x,0) <= 0 or coalesce(c,0) <= 0 then 0
         else 100 * ln(1 + x) / ln(1 + c) end));
$$;

-- ---------- THE SCORE: six pillars, one number ----------
create or replace function public.street_score(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  capital numeric := 0; craft numeric := 0; reach numeric := 0;
  community numeric := 0; consistency numeric := 0; cosign numeric := 0;
  gross90 numeric := 0; gross_all numeric := 0; eq_pts numeric := 0;
  fams int := 0; vfams int := 0;
  followers int := 0; plays bigint := 0; reacts bigint := 0;
  refs int := 0; votes int := 0; postn int := 0; collabs int := 0;
  days30 int := 0; age_days int := 0;
  lessons int := 0; grant_sent boolean := false; signed boolean := false;
  confidence numeric; score int; raw numeric;
begin
  if p_owner is null then return null; end if;

  -- CAPITAL (0.30): real captured money for their desks + equity stake.
  -- deal_payments is webhook-written on the service role — unforgeable.
  begin
    select coalesce(sum(dp.gross) filter (where dp.at > now() - interval '90 days'), 0),
           coalesce(sum(dp.gross), 0)
      into gross90, gross_all
      from deal_payments dp
      join deals d on d.id = dp.deal_id
      join providers p on p.slug = d.to_slug
     where p.owner = p_owner;
  exception when undefined_table or undefined_column then null; end;
  begin
    select coalesce(sum(points), 0) into eq_pts from equity_ledger where owner = p_owner;
  exception when undefined_table then null; end;
  capital := 0.60 * n_log(gross90, 10000) + 0.25 * n_log(eq_pts, 5000) + 0.15 * n_log(gross_all, 50000);

  -- CRAFT (0.15): the identifier locker — families held, verified doubled.
  begin
    select count(distinct kind), count(distinct kind) filter (where verified)
      into fams, vfams
      from member_identifiers where owner = p_owner
       and kind in ('isrc_prefix','isrc','iswc','upc','ipi','isni',
                    'spotify_artist','youtube_channel','pro','publisher');
  exception when undefined_table then null; end;
  craft := least(100, fams * 10 + vfams * 10);

  -- REACH (0.15): followers + deduped plays + reactions their posts earned.
  begin
    select count(*) into followers from follows f
     where f.creator_slug in (select slug from providers where owner = p_owner);
  exception when undefined_table then null; end;
  begin
    select coalesce(sum(tp.plays), 0) into plays from track_plays tp
     where tp.slug in (select lower(regexp_replace(coalesce(slug,''),'[^a-zA-Z0-9]','','g'))
                         from providers where owner = p_owner);
  exception when undefined_table then null; end;
  begin
    select count(*) into reacts from post_reactions r
      join posts po on po.id = r.post_id where po.owner = p_owner;
  exception when undefined_table then null; end;
  reach := 0.50 * n_log(followers, 5000) + 0.30 * n_log(plays, 10000) + 0.20 * n_log(reacts, 500);

  -- COMMUNITY (0.15): plugs brought, votes cast, posts, locked collabs.
  begin
    select count(*) into refs from providers g
     where g.referred_by is not null and upper(g.referred_by) in (
       select upper(x) from (
         select ticker as x from providers where owner = p_owner and coalesce(ticker,'') <> ''
         union select slug from providers where owner = p_owner and coalesce(slug,'') <> '') t);
  exception when undefined_table or undefined_column then null; end;
  begin
    select count(*) into votes from proposal_votes where owner = p_owner;
  exception when undefined_table then null; end;
  begin
    select count(*) into postn from posts where owner = p_owner;
  exception when undefined_table then null; end;
  begin
    select count(*) into collabs from record_splits s
      join records r on r.id = s.record_id and r.status = 'locked'
     where s.party_owner = p_owner and s.accepted;
  exception when undefined_table then null; end;
  community := 0.30 * n_log(refs, 50) + 0.20 * n_log(votes, 50)
             + 0.20 * n_log(postn, 100) + 0.30 * n_log(collabs, 20);

  -- CONSISTENCY (0.10): shows up, keeps showing up.
  begin
    select count(distinct date(at)) into days30 from events
     where uid = p_owner and at > now() - interval '30 days';
  exception when undefined_table or undefined_column then null; end;
  begin
    select coalesce(extract(day from now() - min(created_at)), 0)::int
      into age_days from providers where owner = p_owner;
  exception when undefined_table then null; end;
  consistency := 0.60 * least(100, days30 * 100.0 / 30) + 0.40 * n_log(age_days, 730);

  -- COSIGN (0.15): third-party trust — verified families, the academy,
  -- a fulfilled gas grant, the Member Agreement on the record.
  begin
    select count(*) into lessons from web3_progress where owner = p_owner;
  exception when undefined_table then null; end;
  begin
    select exists(select 1 from gas_grants where owner = p_owner and status = 'sent') into grant_sent;
  exception when undefined_table then null; end;
  begin
    select exists(select 1 from agreements where owner = p_owner) into signed;
  exception when undefined_table then null; end;
  cosign := least(100, vfams * 15 + least(lessons, 6) * 5
                       + (case when grant_sent then 10 else 0 end)
                       + (case when signed then 10 else 0 end));

  -- the cold-start cap: a fresh account can't flash 900.
  confidence := least(1.0, 0.4 + (vfams
    + (case when gross_all > 0 then 3 else 0 end)
    + (case when lessons >= 6 then 1 else 0 end)
    + (case when signed then 1 else 0 end)) / 10.0);

  raw := 0.30 * capital + 0.15 * craft + 0.15 * reach
       + 0.15 * community + 0.10 * consistency + 0.15 * cosign;
  score := round(1000 * (raw / 100) * confidence);

  return jsonb_build_object(
    'score', score,
    'confidence', round(confidence, 2),
    'pillars', jsonb_build_object(
      'capital', round(capital), 'craft', round(craft), 'reach', round(reach),
      'community', round(community), 'consistency', round(consistency), 'cosign', round(cosign))
  );
end;
$$;
grant execute on function public.street_score(uuid) to authenticated;

-- ---------- score → standing price ($5.00–$100.00, momentum ±25%) ----------
create or replace function public.ticker_price(p_score int, p_prev int)
returns numeric language sql immutable as $$
  select round(
    (5 + (least(1000, greatest(0, coalesce(p_score, 0))) / 1000.0) * 95)
    * (1 + least(0.25, greatest(-0.25, (coalesce(p_score,0) - coalesce(p_prev, p_score, 0)) / 1000.0)))
  , 2);
$$;

-- my score, my price, my momentum — the caller's own, one call
create or replace function public.my_score()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; prev int; price numeric;
begin
  if auth.uid() is null then return null; end if;
  s := street_score(auth.uid());
  select score into prev from score_snapshots
   where owner = auth.uid() and at <= current_date - 30
   order by at desc limit 1;
  price := ticker_price((s ->> 'score')::int, prev);
  return s || jsonb_build_object('price', price, 'prev_30d', prev);
end;
$$;
grant execute on function public.my_score() to authenticated;

-- the public board: every listed desk's latest tape line (the floor reads this)
create or replace function public.score_board(p_limit int default 100)
returns table (slug text, ticker text, name text, score int, price numeric, at date)
language sql stable security definer set search_path = public as $$
  select p.slug, p.ticker, p.name, s.score, s.ticker as price, s.at
  from providers p
  join lateral (select score, ticker, at from score_snapshots ss
                 where ss.owner = p.owner order by at desc limit 1) s on true
  where p.owner is not null and p.status = 'live'
  order by s.score desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
grant execute on function public.score_board(int) to anon, authenticated;

-- ---------- the nightly tape: score every claimed desk ----------
create or replace function public.snapshot_all()
returns int language plpgsql security definer set search_path = public as $$
declare r record; s jsonb; prev int; n int := 0;
begin
  -- the desk or the cron writes the tape; nobody else
  if not (coalesce(auth.jwt() ->> 'email', '') = 'matthew@mccluster.org'
          or auth.uid() is null) then
    raise exception 'the desk writes the tape';
  end if;
  for r in select distinct owner from providers where owner is not null loop
    s := street_score(r.owner);
    select score into prev from score_snapshots
     where owner = r.owner and at <= current_date - 30 order by at desc limit 1;
    insert into score_snapshots (owner, at, score, ticker, parts)
    values (r.owner, current_date, (s ->> 'score')::int,
            ticker_price((s ->> 'score')::int, prev), s -> 'pillars')
    on conflict (owner, at) do update
      set score = excluded.score, ticker = excluded.ticker, parts = excluded.parts;
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.snapshot_all() to authenticated;

-- nightly at 09:07 UTC — guarded so this paste succeeds even if
-- pg_cron isn't enabled yet (enable it under Database → Extensions)
do $$ begin
  perform cron.schedule('mcc-score-tape', '7 9 * * *', 'select public.snapshot_all()');
exception when others then
  raise notice 'pg_cron not ready — enable the extension and re-run this block';
end $$;

-- ---------- THE ONE CARD: who am I here, in one call ----------
create or replace function public.my_card()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me jsonb := '{}'::jsonb; bal numeric := 0; earned numeric := 0; redeem numeric := 0;
  fed numeric := 0; eq jsonb; idp jsonb; w3 jsonb; handle text; sc jsonb;
begin
  if auth.uid() is null then return null; end if;
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
        'slug', slug, 'ticker', ticker, 'name', name, 'status', status,
        'roles', to_jsonb(roles), 'area', area) order by created_at), '[]'::jsonb)
      into me from providers where owner = auth.uid();
  exception when undefined_table or undefined_column then me := '[]'::jsonb; end;
  begin
    select coalesce(sum(delta), 0) into bal from mtoken_ledger where owner = auth.uid();
    select coalesce(sum(delta), 0) into earned from mtoken_ledger
     where owner = auth.uid() and delta > 0 and is_earned_reason(reason);
    select coalesce(sum(-delta), 0) into fed from mtoken_ledger
     where owner = auth.uid() and delta < 0 and reason in ('house_claim', 'platform_fee');
  exception when undefined_table or undefined_function then null; end;
  begin select my_redeemable() into redeem; exception when others then redeem := 0; end;
  begin select my_equity() into eq; exception when others then eq := null; end;
  begin select identifier_power() into idp; exception when others then idp := null; end;
  begin select my_web3() into w3; exception when others then w3 := null; end;
  begin select s.handle into handle from supporters s where s.owner = auth.uid();
  exception when undefined_table then null; end;
  begin select my_score() into sc; exception when others then sc := null; end;
  return jsonb_build_object(
    'uid', auth.uid(),
    'listings', me,
    'supporter_handle', handle,
    'balance', bal, 'earned', earned, 'redeemable', redeem,
    'vault_fed', fed,
    'equity', eq,
    'identifier_power', idp,
    'web3', w3,
    'score', sc
  );
end;
$$;
grant execute on function public.my_card() to authenticated;

-- self-checks: expect 1 table · 6 functions
select count(*) as tape_ready from information_schema.tables where table_name = 'score_snapshots';
select count(*) as engine_ready from pg_proc
 where proname in ('street_score','ticker_price','my_score','score_board','snapshot_all','my_card');


-- ============================================================================
-- [49] game-tape.sql
-- ============================================================================
-- ============================================================
-- THE GAME TAPE — the market IS the game.
--
-- The old standing price ($5–$100 off the reputation score) is
-- retired. The new law: every desk's price starts at $0.00 and
-- climbs with the record — every quiz answered, song played, run
-- delivered, post reacted to, dollar earned. 100 game points move
-- the price $1, the same 100-points-to-the-dollar law the Trap
-- already runs on.
--
--   game_weights   the public price list: what each interaction
--                  pays and its per-day cap (loops can't print).
--   game_points()  one member's whole interaction record, totaled.
--   game_price()   points → dollars on the tape (pts / 100).
--   my_score()     now returns points + game price on top of the
--                  six reputation pillars (score stays 0–1000).
--   snapshot_all() writes the GAME price to the nightly tape.
--
-- Anti-forgery: client events are capped hard per day; the heavy
-- points come from spines nobody can fake — webhook-captured
-- dollars, verified identifiers, deduped plays, swept platform
-- numbers. Run AFTER score-schema.sql (it reuses n_log and the
-- snapshots table). Safe to re-run. Ends by resetting the tape so
-- every desk restarts at its true record.
-- ============================================================

-- ---------- the price list: what every interaction pays ----------
create table if not exists public.game_weights (
  name    text primary key,
  pts     numeric not null default 0.5,
  cap_day int not null default 40
);
alter table public.game_weights enable row level security;
drop policy if exists "the price list is public" on public.game_weights;
create policy "the price list is public" on public.game_weights for select using (true);
-- no write policy: the desk tunes this from the SQL editor only

insert into public.game_weights (name, pts, cap_day) values
  -- study: quizzes and lessons are the heaviest everyday earn
  ('quiz_answer',        25,   24),
  ('marker_quiz',        25,   24),
  ('ow_marker',          25,    9),
  ('mcity_badge',        50,    4),
  ('web3_lesson',       100,    6),
  ('welcome_done',      200,    1),
  ('welcome_step',        2,   30),
  ('tour_done',         100,    1),
  ('verify_submit',      50,    5),
  -- sound: playing the records
  ('track_play',          5,   60),
  ('song_start',          2,   60),
  ('docket_song_play',    5,   30),
  -- the game: driving Our World
  ('ow_enter',            5,    3),
  ('ow_run_start',        1,   40),
  ('ow_run_done',        10,   40),
  ('ow_nav',              1,   30),
  -- community: talking, backing, moving on people
  ('wire_post',          10,   10),
  ('wire_react',          2,   40),
  ('foryou_tap',          1,   30),
  ('supporter_created', 100,    1),
  ('spaces_request',     50,    5),
  ('xc_business_filed', 150,    2),
  ('cta_click',           1,   20)
on conflict (name) do update set pts = excluded.pts, cap_day = excluded.cap_day;

-- ---------- the whole record, totaled ----------
create or replace function public.game_points(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  evt numeric := 0; played numeric := 0; money numeric := 0;
  ident numeric := 0; world numeric := 0; total numeric;
begin
  if p_owner is null then return null; end if;

  -- EVERY interaction: each tracked event pays its listed points,
  -- capped per name per day. Unlisted events earn the floor rate
  -- (half a point, 40 a day) — nothing a member does counts zero.
  begin
    select coalesce(sum(least(c.n, coalesce(w.cap_day, 40)) * coalesce(w.pts, 0.5)), 0)
      into evt
      from (select e.name, date(e.at) as d, count(*) as n
              from events e where e.uid = p_owner group by 1, 2) c
      left join game_weights w on w.name = c.name;
  exception when others then evt := 0; end;

  -- THE CROWD: real deduped plays of their tracks — 1 pt each
  begin
    select coalesce(sum(tp.plays), 0) into played from track_plays tp
     where tp.slug in (select lower(regexp_replace(coalesce(slug,''),'[^a-zA-Z0-9]','','g'))
                         from providers where owner = p_owner);
  exception when others then played := 0; end;

  -- REAL MONEY: webhook-captured dollars — $1 earned = 100 pts = $1 on the tape
  begin
    select coalesce(sum(dp.gross), 0) * 100 into money
      from deal_payments dp
      join deals d on d.id = dp.deal_id
      join providers p on p.slug = d.to_slug
     where p.owner = p_owner;
  exception when others then money := 0; end;

  -- IDENTITY: identifiers banked pay 100, verified pay 250
  begin
    select coalesce(sum(case when verified then 250 else 100 end), 0) into ident
      from member_identifiers where owner = p_owner;
  exception when others then ident := 0; end;

  -- THE WORLD OUTSIDE: swept Spotify/YouTube/Last.fm numbers,
  -- log-curved so a million followers is worth $10, not the moon
  begin
    select coalesce(10 * n_log(sum(v.value), 1000000), 0) into world
      from (select distinct on (source, kind) value
              from external_signals where owner = p_owner
             order by source, kind, at desc) v;
  exception when others then world := 0; end;
  world := least(world, 1000);

  total := round(evt + played + money + ident + world, 2);
  return jsonb_build_object('points', total, 'parts', jsonb_build_object(
    'interactions', round(evt), 'plays', round(played), 'money', round(money),
    'identity', round(ident), 'world', round(world)));
end;
$$;
grant execute on function public.game_points(uuid) to authenticated;

-- ---------- points → the price: starts at 0, 100 pts = $1 ----------
create or replace function public.game_price(p_points numeric)
returns numeric language sql immutable as $$
  select round(least(10000, greatest(0, coalesce(p_points, 0))) / 100.0, 2);
$$;
grant execute on function public.game_price(numeric) to anon, authenticated;

-- ---------- my score, my points, my price — one call ----------
create or replace function public.my_score()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; g jsonb; prev int;
begin
  if auth.uid() is null then return null; end if;
  s := street_score(auth.uid());
  g := game_points(auth.uid());
  select score into prev from score_snapshots
   where owner = auth.uid() and at <= current_date - 30
   order by at desc limit 1;
  return s || jsonb_build_object(
    'price', game_price((g ->> 'points')::numeric),
    'points', (g ->> 'points')::numeric,
    'game', g -> 'parts',
    'prev_30d', prev);
end;
$$;
grant execute on function public.my_score() to authenticated;

-- ---------- the nightly tape now writes the GAME price ----------
create or replace function public.snapshot_all()
returns int language plpgsql security definer set search_path = public as $$
declare r record; s jsonb; g jsonb; n int := 0;
begin
  -- the desk or the cron writes the tape; nobody else
  if not (coalesce(auth.jwt() ->> 'email', '') = 'matthew@mccluster.org'
          or auth.uid() is null) then
    raise exception 'the desk writes the tape';
  end if;
  for r in select distinct owner from providers where owner is not null loop
    s := street_score(r.owner);
    g := game_points(r.owner);
    insert into score_snapshots (owner, at, score, ticker, parts)
    values (r.owner, current_date, (s ->> 'score')::int,
            game_price((g ->> 'points')::numeric),
            (s -> 'pillars') || jsonb_build_object('points', (g ->> 'points')::numeric, 'game', g -> 'parts'))
    on conflict (owner, at) do update
      set score = excluded.score, ticker = excluded.ticker, parts = excluded.parts;
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.snapshot_all() to authenticated;

-- ---------- THE RESET: every desk restarts at its true record ----------
delete from public.score_snapshots;
select snapshot_all() as fresh_tape_lines;

-- self-checks: expect 2 functions · 23 price-list rows · fresh tape
select count(*) as game_fn from pg_proc where proname in ('game_points','game_price');
select count(*) as price_list from game_weights;
select (select count(*) from score_snapshots) as tape_lines;


-- ============================================================================
-- [50] signals-board.sql
-- ============================================================================
-- ============================================================
-- THE PUBLIC STATS LINE — real numbers on every ticker sheet.
--
-- board_signals(slug): the latest swept platform numbers
-- (Spotify followers, YouTube subs/views, Last.fm plays), the
-- in-app play count, and the identifier tally for one desk.
-- All of it already public data — this just serves it in one
-- call so the floor can print it under the chart. Run any time
-- after signals-schema.sql. Safe to re-run.
-- ============================================================
create or replace function public.board_signals(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o uuid; sig jsonb := '[]'::jsonb; ids int := 0; vids int := 0; pl bigint := 0;
begin
  select owner into o from providers
   where slug = p_slug and owner is not null limit 1;
  if o is null then return null; end if;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
        'source', s.source, 'kind', s.kind, 'value', s.value, 'at', s.at)), '[]'::jsonb)
      into sig
      from (select distinct on (source, kind) source, kind, value, at
              from external_signals where owner = o
             order by source, kind, at desc) s;
  exception when undefined_table then null; end;

  begin
    select count(*), count(*) filter (where verified)
      into ids, vids from member_identifiers where owner = o;
  exception when undefined_table then null; end;

  begin
    select coalesce(sum(plays), 0) into pl from track_plays
     where slug in (select lower(regexp_replace(coalesce(slug,''),'[^a-zA-Z0-9]','','g'))
                      from providers where owner = o);
  exception when undefined_table then null; end;

  return jsonb_build_object('signals', sig, 'identifiers', ids, 'verified', vids, 'plays', pl);
end;
$$;
grant execute on function public.board_signals(text) to anon, authenticated;

-- self-check: expect 1
select count(*) as stats_line_ready from pg_proc where proname = 'board_signals';


-- ============================================================================
-- [51] green-light.sql
-- ============================================================================
-- ============================================================
-- THE GREEN LIGHT — Our Street runs itself; the desk watches.
-- Members make accounts, post listings, and go LIVE the moment
-- they post — no Mission Control approval in the way. The admin
-- keeps three powers instead of a gate:
--   · THE NOTICE — every go-live rings the admin's bell
--   · THE UNDO  — one button pulls a listing back (paused, with
--                 a reason the member sees)
--   · THE PEN   — one button messages the member from the desk
-- Payment approvals are untouched — money keeps its gates.
-- Safe to re-run.
-- ============================================================

-- 1 · new listings are born LIVE
alter table public.providers alter column status set default 'live';

-- 2 · owners run their own cards (the old "can't self-approve"
--     clause was the gate; the green light retires it — undo stays
--     the desk's power because a paused row can be re-lit by its
--     owner only while the desk hasn't stamped a review_note)
drop policy if exists "owners edit their own listing" on public.providers;
create policy "owners edit their own listing"
  on public.providers for update
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- 3 · open the waiting room: everyone stuck in review goes live now
update public.providers set status = 'live' where status = 'pending';

-- 4 · THE NOTICE — every go-live rings the desk's bell (rides the
--     inbox rail from docs/inbox.sql; if that paste isn't in yet,
--     the trigger stays quiet instead of blocking the member)
create or replace function public.tg_greenlight()
returns trigger language plpgsql security definer set search_path = public as $$
declare adm uuid;
begin
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select id into adm from auth.users where email = 'matthew@mccluster.org' limit 1;
    if adm is not null and adm <> new.owner then
      begin
        perform public.notify(adm, 'greenlight',
          '🟢 ' || coalesce(new.name, 'A new member') || ' went live on Our Street',
          'Self-served, no gate. Undo it or message them from Mission Control → Listings.',
          'mission.html');
      exception when others then null;
      end;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists greenlight_ins_t on public.providers;
create trigger greenlight_ins_t after insert on public.providers
  for each row execute function public.tg_greenlight();
drop trigger if exists greenlight_upd_t on public.providers;
create trigger greenlight_upd_t after update on public.providers
  for each row execute function public.tg_greenlight();

-- 5 · THE PEN — the desk messages any member about what they did;
--     it lands on their bell and their desk
create or replace function public.admin_note_member(p_owner uuid, p_msg text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select email from auth.users where id = auth.uid()), '') <> 'matthew@mccluster.org' then
    return jsonb_build_object('ok', false, 'why', 'the pen is the desk''s');
  end if;
  if p_owner is null or coalesce(trim(p_msg), '') = '' then
    return jsonb_build_object('ok', false, 'why', 'a real note');
  end if;
  perform public.notify(p_owner, 'desk', '✉️ A note from the desk',
    left(trim(p_msg), 800), 'mymission.html');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_note_member(uuid, text) from public;
grant execute on function public.admin_note_member(uuid, text) to authenticated;

-- self-check: expect 'live' · 2 · 1
select column_default as listing_default from information_schema.columns
 where table_name = 'providers' and column_name = 'status';
select count(*) as greenlight_triggers from pg_trigger where tgname like 'greenlight%';
select count(*) as pen from pg_proc where proname = 'admin_note_member';


-- ============================================================================
-- [52] nameplate.sql
-- ============================================================================
-- ============================================================
-- THE NAMEPLATE — a claimed ticker is YOURS: one holder, ever.
-- The walk claims it live, the device wears it as its name, and
-- nobody else can take it — enforced at the database, not the
-- honor system. Safe to re-run.
-- ============================================================

-- 1 · one ticker, one member (case-blind). If duplicates already
--     exist the index politely refuses and names them instead of
--     breaking anyone — re-run after re-homing the dupes.
do $$
declare dupes text;
begin
  select string_agg(t, ', ') into dupes from (
    select upper(ticker) as t from public.providers
     where coalesce(ticker, '') <> ''
     group by upper(ticker) having count(*) > 1) x;
  if dupes is not null then
    raise notice 'duplicate tickers need re-homing first: %', dupes;
  else
    begin
      create unique index if not exists providers_ticker_one
        on public.providers (upper(ticker)) where coalesce(ticker, '') <> '';
    exception when others then raise notice 'ticker index: %', sqlerrm;
    end;
  end if;
end $$;

-- 2 · the live availability check (the walk asks before claiming)
create or replace function public.ticker_free(p_tick text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(trim(p_tick), '') <> ''
     and not exists (select 1 from providers where upper(ticker) = upper(trim(p_tick)));
$$;
grant execute on function public.ticker_free(text) to anon, authenticated;

-- self-check: expect 1 · t
select count(*) as nameplate_fn from pg_proc where proname = 'ticker_free';
select public.ticker_free('ZZZZZ') as a_free_name_reads_true;


-- ============================================================================
-- [53] traps-engine.sql
-- ============================================================================
-- ============================================================
-- T.R.A.P.S. ENGINE v2 — every mission on the board is REAL.
-- The audit found the wound: the desk shows 26 missions worth
-- 975 E⤴, but the old claim_gauntlet() only verified 10 keys
-- worth 5 E⤴ total — sixteen missions could never complete,
-- never save, never pay. This paste replaces the engine:
--   · all 26 keys verified against the REAL tables (never the
--     honor system) — a missing table just reads as not-yet-done
--   · pays the board's exact values: 975 E⤴ = 97,500 points
--   · tops up anyone the old engine shorted (monotonic: a
--     mission's pay only ever grows, never double-mints)
--   · gauntlet credit registered GOLD (the two-color law)
--   · game_points() v3: mission pay lands on the SCOREBOARD —
--     1 E⤴ = 100 points on the tape, live
-- Safe to re-run.
-- ============================================================

-- the two-color law learns the engine's reason strings
insert into public.credit_colors (reason, color) values
  ('gauntlet award', 'gold'),
  ('claim_run', 'gold')
on conflict (reason) do nothing;

-- the pay window: only the engine calls this (definer-context only —
-- no role holds EXECUTE, so it cannot be dialed from outside)
create or replace function public.gauntlet_pay(p_key text, p_amt numeric)
returns void language sql security definer set search_path = public as $$
  insert into mtoken_ledger (owner, delta, reason, ref)
  values (auth.uid(), p_amt, 'gauntlet award', 'gauntlet:' || p_key)
  on conflict (owner, ref, reason) do update
    set delta = greatest(mtoken_ledger.delta, excluded.delta);
$$;
revoke all on function public.gauntlet_pay(text, numeric) from public, anon, authenticated;

create or replace function public.claim_gauntlet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me record;
  done jsonb := '[]'::jsonb;
  before_total numeric;
  after_total numeric;
  ok boolean;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select slug, ticker, status into me from providers where owner = auth.uid() limit 1;
  select coalesce(sum(delta), 0) into before_total
    from mtoken_ledger where owner = auth.uid() and reason = 'gauntlet award';

  -- ---- THE WALK-IN · 100 ----
  ok := false; begin select exists(select 1 from events where uid = auth.uid() and name = 'welcome_done') into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('walk_in'::text); perform public.gauntlet_pay('walk_in', 20); end if;

  ok := false; begin select exists(select 1 from providers where owner = auth.uid() and coalesce(headline, '') <> '') into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('card_live'::text); perform public.gauntlet_pay('card_live', 20); end if;

  ok := false; begin select exists(select 1 from agreements where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('signed'::text); perform public.gauntlet_pay('signed', 15); end if;

  ok := false; begin select exists(select 1 from push_subs where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('push_on'::text); perform public.gauntlet_pay('push_on', 10); end if;

  ok := false; begin select (select count(distinct date(at)) from events where uid = auth.uid()) >= 5 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('explorer'::text); perform public.gauntlet_pay('explorer', 35); end if;

  -- ---- THE IDENTITY · 150 ----
  ok := coalesce(me.ticker, '') <> '';
  if ok then done := done || to_jsonb('ticker_claimed'::text); perform public.gauntlet_pay('ticker_claimed', 25); end if;

  ok := false; begin select exists(select 1 from member_identifiers where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_id'::text); perform public.gauntlet_pay('first_id', 40); end if;

  ok := false; begin select (select count(distinct kind) from member_identifiers where owner = auth.uid()) >= 3 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('id_stack'::text); perform public.gauntlet_pay('id_stack', 45); end if;

  ok := false; begin select exists(select 1 from member_badges where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('badge_applied'::text); perform public.gauntlet_pay('badge_applied', 40); end if;

  -- ---- THE CRAFT · 150 ----
  ok := false; begin select exists(select 1 from posts where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_post'::text); perform public.gauntlet_pay('first_post', 25); end if;

  ok := false; begin select (select count(*) from posts where owner = auth.uid()) >= 3 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('on_the_wire'::text); perform public.gauntlet_pay('on_the_wire', 30); end if;

  ok := false; begin select exists(select 1 from rack where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_track'::text); perform public.gauntlet_pay('first_track', 45); end if;

  ok := coalesce(me.status, '') = 'live';
  if ok then done := done || to_jsonb('listing_live'::text); perform public.gauntlet_pay('listing_live', 50); end if;

  -- ---- THE BUSINESS · 255 ----
  ok := false; begin select exists(select 1 from deals where from_owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_deal'::text); perform public.gauntlet_pay('first_deal', 40); end if;

  ok := false; begin select exists(select 1 from deals where (from_owner = auth.uid() or to_slug = coalesce(me.slug, '___'))
    and status in ('signed', 'completed')) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('deal_signed'::text); perform public.gauntlet_pay('deal_signed', 60); end if;

  ok := false; begin select exists(select 1 from member_connections where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('distro_connected'::text); perform public.gauntlet_pay('distro_connected', 50); end if;

  ok := false; begin select exists(select 1 from earnings_reports where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('earnings_filed'::text); perform public.gauntlet_pay('earnings_filed', 60); end if;

  ok := false; begin select exists(select 1 from providers where owner = auth.uid() and coalesce(stripe_acct, '') <> '') into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('payouts_armed'::text); perform public.gauntlet_pay('payouts_armed', 45); end if;

  -- ---- THE COMMUNITY · 200 ----
  ok := false; begin select exists(select 1 from civic_profiles where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('civic_card'::text); perform public.gauntlet_pay('civic_card', 30); end if;

  ok := false; begin select exists(select 1 from proposal_votes where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_vote'::text); perform public.gauntlet_pay('first_vote', 40); end if;

  ok := false; begin select exists(select 1 from proposals where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('proposal_filed'::text); perform public.gauntlet_pay('proposal_filed', 40); end if;

  ok := false; begin select exists(select 1 from providers g
      where g.referred_by is not null
        and upper(g.referred_by) in (nullif(upper(coalesce(me.ticker, '')), ''),
                                     nullif(upper(coalesce(me.slug, '')), ''))) into ok;
  exception when others then ok := false; end;
  if ok then done := done || to_jsonb('first_plug'::text); perform public.gauntlet_pay('first_plug', 50); end if;

  ok := false; begin select exists(select 1 from guide_chats where owner = auth.uid() and role = 'user') into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('guide_talk'::text); perform public.gauntlet_pay('guide_talk', 40); end if;

  -- ---- THE SCHOLAR · 120 ----
  ok := false; begin select (select count(*) from web3_progress where owner = auth.uid()) >= 3 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('scholar_3'::text); perform public.gauntlet_pay('scholar_3', 50); end if;

  ok := false; begin select (select count(*) from web3_progress where owner = auth.uid()) >= 6 into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('scholar_6'::text); perform public.gauntlet_pay('scholar_6', 40); end if;

  ok := false; begin select exists(select 1 from gas_grants where owner = auth.uid()) into ok; exception when others then ok := false; end;
  if ok then done := done || to_jsonb('gas_wallet'::text); perform public.gauntlet_pay('gas_wallet', 30); end if;

  select coalesce(sum(delta), 0) into after_total
    from mtoken_ledger where owner = auth.uid() and reason = 'gauntlet award';

  return jsonb_build_object('done', done,
    'minted', after_total - before_total,
    'paid_total', after_total);
end;
$$;
grant execute on function public.claim_gauntlet() to authenticated;

-- ============================================================
-- THE SCOREBOARD LEARNS THE TRAP — game_points v3: mission pay
-- (and the claim-run bonus) rides onto the live tape at the
-- standing law, 1 E⤴ = 100 points. Everything else unchanged.
-- ============================================================
create or replace function public.game_points(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  evt numeric := 0; played numeric := 0; money numeric := 0;
  ident numeric := 0; world numeric := 0; trap numeric := 0; total numeric;
begin
  if p_owner is null then return null; end if;

  -- EVERY interaction: each tracked event pays its listed points,
  -- capped per name per day. Unlisted events earn the floor rate
  -- (half a point, 40 a day) — nothing a member does counts zero.
  begin
    select coalesce(sum(least(c.n, coalesce(w.cap_day, 40)) * coalesce(w.pts, 0.5)), 0)
      into evt
      from (select e.name, date(e.at) as d, count(*) as n
              from events e where e.uid = p_owner group by 1, 2) c
      left join game_weights w on w.name = c.name;
  exception when others then evt := 0; end;

  -- THE CROWD: real deduped plays of their tracks — 1 pt each
  begin
    select coalesce(sum(tp.plays), 0) into played from track_plays tp
     where tp.slug in (select lower(regexp_replace(coalesce(slug,''),'[^a-zA-Z0-9]','','g'))
                         from providers where owner = p_owner);
  exception when others then played := 0; end;

  -- REAL MONEY: webhook-captured dollars — $1 earned = 100 pts = $1 on the tape
  begin
    select coalesce(sum(dp.gross), 0) * 100 into money
      from deal_payments dp
      join deals d on d.id = dp.deal_id
      join providers p on p.slug = d.to_slug
     where p.owner = p_owner;
  exception when others then money := 0; end;

  -- IDENTITY: identifiers banked pay 100, verified pay 250
  begin
    select coalesce(sum(case when verified then 250 else 100 end), 0) into ident
      from member_identifiers where owner = p_owner;
  exception when others then ident := 0; end;

  -- THE WORLD OUTSIDE: swept Spotify/YouTube/Last.fm numbers,
  -- log-curved so a million followers is worth $10, not the moon
  begin
    select coalesce(10 * n_log(sum(v.value), 1000000), 0) into world
      from (select distinct on (source, kind) value
              from external_signals where owner = p_owner
             order by source, kind, at desc) v;
  exception when others then world := 0; end;
  world := least(world, 1000);

  -- THE TRAP PAYS ON THE BOARD: mission credit + the claim run —
  -- 1 E⤴ = 100 points, live on the tape (the stake is a LOAN and
  -- deliberately does not score)
  begin
    select coalesce(sum(delta), 0) * 100 into trap
      from mtoken_ledger
     where owner = p_owner and delta > 0
       and reason in ('gauntlet award', 'claim_run');
  exception when others then trap := 0; end;

  total := round(evt + played + money + ident + world + trap, 2);
  return jsonb_build_object('points', total, 'parts', jsonb_build_object(
    'interactions', round(evt), 'plays', round(played), 'money', round(money),
    'identity', round(ident), 'world', round(world), 'missions', round(trap)));
end;
$$;

-- self-check: expect 3 · 2
select count(*) as engine_fns from pg_proc where proname in ('claim_gauntlet', 'gauntlet_pay', 'game_points');
select count(*) as gold_engine_reasons from credit_colors where reason in ('gauntlet award', 'claim_run') and color = 'gold';


-- ============================================================================
-- [54] one-tape.sql
-- ============================================================================
-- ============================================================
-- THE ONE TAPE — one algorithm, real data only, profiles linked.
--
-- The two half-merged engines are done. The law after this paste:
--   · game_points() is THE algorithm (real interactions, real
--     money, real identifiers, real swept platform numbers).
--   · The floor's charts are the ACTUAL nightly snapshot history —
--     score_board now returns each desk's real series, so the
--     client never invents a line again.
--   · The tape restarts clean, and the link check at the bottom
--     shows every claimed profile wired to its market line.
--
-- Run AFTER game-tape.sql. Safe to re-run.
-- ============================================================

-- score_board v2: same board + the real chart history per desk
drop function if exists public.score_board(int);
create or replace function public.score_board(p_limit int default 100)
returns table (slug text, ticker text, name text, score int, price numeric, at date, series jsonb)
language sql stable security definer set search_path = public as $$
  select p.slug, p.ticker, p.name, s.score, s.ticker as price, s.at,
         (select coalesce(jsonb_agg(jsonb_build_object('d', h.at, 'v', h.ticker) order by h.at), '[]'::jsonb)
            from (select ss.at, ss.ticker from score_snapshots ss
                   where ss.owner = p.owner order by ss.at desc limit 30) h) as series
  from providers p
  join lateral (select score, ticker, at from score_snapshots ss
                 where ss.owner = p.owner order by at desc limit 1) s on true
  where p.owner is not null and p.status = 'live'
  order by s.score desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
grant execute on function public.score_board(int) to anon, authenticated;

-- clean restart under the one law: wipe the old tape, write today fresh
delete from public.score_snapshots;
select snapshot_all() as fresh_tape_lines;

-- ---------- THE LINK CHECK: every claimed profile ↔ its market line ----------
-- Each row is a claimed desk. price_on_tape filled = the profile IS
-- linked to the market. game_points filled = the algorithm sees them.
select p.slug, p.ticker, p.status,
       t.price as price_on_tape,
       (game_points(p.owner) ->> 'points') as game_points
  from providers p
  left join lateral (select ticker as price from score_snapshots ss
                      where ss.owner = p.owner order by at desc limit 1) t on true
 where p.owner is not null
 order by t.price desc nulls last;


-- ============================================================================
-- [55] we-driver.sql
-- ============================================================================
-- ============================================================
-- THE WHEEL — Whip Equipped drivers go online, for real.
-- One table carries live driver state; two doors touch it:
--   driver_ping(online, lat, lng, heading)  ← the driver's own
--       heartbeat, every ~20s while the wheel is on. Flipping
--       online=false (or 3 minutes of silence) takes them off
--       the road.
--   drivers_on_road()  ← what riders see: name, face, live spot
--       of every driver pinged inside the last 3 minutes. Public
--       read — going online IS publishing your position, and the
--       toggle says so in plain words.
-- Dynamic by design: any member with a listing can drive — the
-- Rides lane is additive, it never touches the rest of their
-- desk, their roles, or their listing.
-- Safe to re-run.
-- ============================================================

create table if not exists public.driver_status (
  owner      uuid primary key references auth.users (id) on delete cascade,
  online     boolean not null default false,
  lat        double precision,
  lng        double precision,
  heading    double precision,
  updated_at timestamptz not null default now()
);
alter table public.driver_status enable row level security;
drop policy if exists driver_status_read on public.driver_status;
create policy driver_status_read on public.driver_status for select using (true);
-- no insert/update policies: the only door in is the rpc below

create or replace function public.driver_ping(
  p_online boolean,
  p_lat double precision default null,
  p_lng double precision default null,
  p_heading double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'why', 'signed out');
  end if;
  if not exists (select 1 from providers where owner = auth.uid()) then
    return jsonb_build_object('ok', false, 'why', 'walk in first — the road needs your listing');
  end if;
  insert into driver_status (owner, online, lat, lng, heading, updated_at)
  values (auth.uid(), p_online, p_lat, p_lng, p_heading, now())
  on conflict (owner) do update
    set online = excluded.online,
        lat = excluded.lat,
        lng = excluded.lng,
        heading = excluded.heading,
        updated_at = now();
  return jsonb_build_object('ok', true, 'online', p_online);
end $$;
revoke all on function public.driver_ping(boolean, double precision, double precision, double precision) from public;
grant execute on function public.driver_ping(boolean, double precision, double precision, double precision) to authenticated;

create or replace function public.drivers_on_road()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', p.slug, 'name', p.name, 'area', p.area, 'photo', p.photo,
    'lat', d.lat, 'lng', d.lng, 'heading', d.heading, 'at', d.updated_at)), '[]'::jsonb)
    from driver_status d
    join providers p on p.owner = d.owner
   where d.online
     and d.updated_at > now() - interval '3 minutes'
     and d.lat is not null;
$$;
grant execute on function public.drivers_on_road() to anon, authenticated;

-- self-check: expect 1 · 2
select count(*) as wheel_table from information_schema.tables where table_name = 'driver_status';
select count(*) as wheel_fns from pg_proc where proname in ('driver_ping', 'drivers_on_road');


-- ============================================================================
-- [56] desk-imprint.sql
-- ============================================================================
-- ============================================================
-- THE IMPRINT v2 — what you claim about yourself STAYS claimed,
-- and you can claim SEVERAL things at once. The member desk
-- remembers your faces (every "you" that runs the room), your
-- primary face, and your card paths — on the ACCOUNT, not the
-- device: any phone, any pass, the desk opens already sorted
-- to the whole combination. Safe to re-run; upgrades v1 in place.
-- ============================================================

alter table public.member_prefs add column if not exists face text;
alter table public.member_prefs add column if not exists paths text[];
alter table public.member_prefs add column if not exists faces text[];

-- v1 had a two-argument imprint; drop it so the three-argument
-- version below is the only door (PostgREST hates ambiguity)
drop function if exists public.imprint_desk(text, text[]);

create or replace function public.imprint_desk(p_face text, p_paths text[], p_faces text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f text;
  ps text[];
  fs text[];
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'why', 'signed out');
  end if;
  f := nullif(btrim(coalesce(p_face, '')), '');
  if f is not null and f !~ '^[A-Za-z][A-Za-z0-9 /&+.-]{0,23}$' then
    return jsonb_build_object('ok', false, 'why', 'that face reads wrong');
  end if;
  select array_agg(distinct t) into ps
    from unnest(coalesce(p_paths, '{}')) t
   where t in ('signal', 'infra', 'capital', 'culture', 'justice', 'access', 'proof', 'command');
  -- the faces: up to 12, each a clean name; an EMPTY array is a real
  -- choice (clearing your faces), so it writes — only null means
  -- "leave what's imprinted"
  if p_faces is not null then
    select coalesce(array_agg(distinct t), '{}') into fs
      from (select unnest(p_faces) as t limit 12) x
     where t ~ '^[A-Za-z][A-Za-z0-9 /&+.-]{0,23}$';
  end if;
  insert into member_prefs (owner, face, paths, faces)
  values (auth.uid(), f, ps, fs)
  on conflict (owner) do update
    set face  = coalesce(excluded.face,  member_prefs.face),
        paths = coalesce(excluded.paths, member_prefs.paths),
        faces = coalesce(excluded.faces, member_prefs.faces);
  return (select jsonb_build_object('ok', true, 'face', face,
                                    'paths', to_jsonb(coalesce(paths, '{}'::text[])),
                                    'faces', to_jsonb(coalesce(faces, '{}'::text[])))
            from member_prefs where owner = auth.uid());
end $$;
revoke all on function public.imprint_desk(text, text[], text[]) from public;
grant execute on function public.imprint_desk(text, text[], text[]) to authenticated;

create or replace function public.my_imprint()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(
    (select jsonb_build_object('face', face,
                               'paths', to_jsonb(coalesce(paths, '{}'::text[])),
                               'faces', to_jsonb(coalesce(faces, '{}'::text[])))
       from member_prefs where owner = auth.uid()),
    '{}'::jsonb);
$$;
revoke all on function public.my_imprint() from public;
grant execute on function public.my_imprint() to authenticated;

-- self-check: expect 2 · 1
select count(*) as imprint_fns from pg_proc where proname in ('imprint_desk', 'my_imprint');
select count(*) as faces_col from information_schema.columns
 where table_name = 'member_prefs' and column_name = 'faces';

