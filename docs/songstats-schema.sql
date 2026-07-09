-- SONG STATS — every platform, one dashboard, daily history.
-- The shape Matthew specified (2026-07-09): an artists registry and a
-- daily stats snapshot. The nightly GitHub Action (Spotify + YouTube +
-- Last.fm + Deezer, free APIs) writes with the service role; the site
-- reads publicly; nobody writes from a browser — RLS grants no insert
-- or update to anon/authenticated at all.

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,            -- joins the floor: providers.slug
  name text not null,
  spotify_id text,
  musicbrainz_id text,
  instagram_handle text,
  tiktok_handle text,
  youtube_channel_id text,
  city text,
  genre text,
  equity_uprise_score numeric,          -- the proprietary layer, computed nightly
  created_at timestamptz not null default now()
);
alter table public.artists enable row level security;
drop policy if exists "artists are public" on public.artists;
create policy "artists are public" on public.artists for select using (true);

create table if not exists public.artist_daily_stats (
  artist_id uuid not null references public.artists(id) on delete cascade,
  date date not null,
  spotify_followers bigint,
  spotify_popularity int,
  youtube_subscribers bigint,
  youtube_views bigint,
  instagram_followers bigint,
  tiktok_followers bigint,
  playlist_count int,
  chart_positions jsonb,
  primary key (artist_id, date)
);
alter table public.artist_daily_stats enable row level security;
drop policy if exists "stats are public" on public.artist_daily_stats;
create policy "stats are public" on public.artist_daily_stats for select using (true);

-- the first two artists on the books
insert into public.artists (slug, name, city, genre)
values ('mccluster', 'Matthew McCluster', 'Bridgeport, CT', 'Hip-hop'),
       ('k-cohiba', 'K-Cohiba', 'Boston, MA', 'Hip-hop')
on conflict (slug) do nothing;

-- self-check: expect 2 | 2
select
  (select count(*) from information_schema.tables
    where table_name in ('artists','artist_daily_stats')) as stat_tables,
  (select count(*) from public.artists) as artists_on_books;
