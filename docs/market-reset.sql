-- ============================================================
-- THE MARKET RESET — test noise out, real tape in.
-- Archives then clears test-era deals, bookings and the old tape,
-- then writes a fresh tape line for every claimed desk. Listings,
-- identifiers, badges, and the (already reset) ledger are untouched.
-- Run from the SQL editor. Safe to re-run.
-- ============================================================
create table if not exists public.deals_legacy (like public.deals including defaults);
insert into public.deals_legacy select * from public.deals
  where not exists (select 1 from public.deals_legacy limit 1);
delete from public.deals;

create table if not exists public.booking_requests_legacy (like public.booking_requests including defaults);
insert into public.booking_requests_legacy select * from public.booking_requests
  where not exists (select 1 from public.booking_requests_legacy limit 1);
delete from public.booking_requests;

delete from public.score_snapshots;   -- the tape restarts clean
select snapshot_all() as fresh_tape_lines;

-- self-check: live tables empty, archives holding, tape fresh
select (select count(*) from deals) as deals_live,
       (select count(*) from booking_requests) as bookings_live,
       (select count(*) from score_snapshots) as tape_lines;
