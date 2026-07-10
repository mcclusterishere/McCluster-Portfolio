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
