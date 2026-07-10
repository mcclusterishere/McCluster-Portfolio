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
