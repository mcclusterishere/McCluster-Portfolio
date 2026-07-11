-- ============================================================
-- THE HANDSHAKE v2 — the signals table learns every platform.
-- external_signals was born speaking four sources; the registry
-- now connects GitHub, Twitch, Reddit and X too (TikTok and
-- Instagram reserved for when their apps clear review). Widening
-- the check is the only schema change v2 needs. Safe to re-run.
-- ============================================================
alter table public.external_signals drop constraint if exists external_signals_source_check;
alter table public.external_signals add constraint external_signals_source_check
  check (source in ('spotify','youtube','lastfm','songstats',
                    'github','twitch','reddit','x','tiktok','instagram'));

-- self-check: expect 1 — the widened rule is on
select count(*) as widened from information_schema.check_constraints
 where constraint_name = 'external_signals_source_check'
   and check_clause like '%github%';
