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

create or replace function public.bump_play(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.track_plays (slug, plays)
  values (lower(regexp_replace(p_slug, '[^a-zA-Z0-9]', '', 'g')), 1)
  on conflict (slug) do update
    set plays = track_plays.plays + 1, updated_at = now();
$$;

grant execute on function public.bump_play(text) to anon, authenticated;

-- self-check: expect 1 | 1
select
  (select count(*) from information_schema.tables where table_name = 'track_plays') as heat_table,
  (select count(*) from pg_proc where proname = 'bump_play') as heat_pump;
