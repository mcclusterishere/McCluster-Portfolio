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
