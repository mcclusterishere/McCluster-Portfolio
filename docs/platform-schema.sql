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
