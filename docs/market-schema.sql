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
