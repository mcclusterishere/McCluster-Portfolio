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
