-- ============================================================
-- Cross-device continuity, opt-in by design. Run AFTER the
-- earlier schemas in the Supabase SQL editor (safe to re-run).
--
-- Nothing changes for anonymous visitors: their model and
-- persona stay on their device, full stop. But a member who
-- SIGNS IN (the same magic-link key as everything else) gets
-- their state carried between phone and laptop — one row per
-- account, readable and writable only by its owner.
-- ============================================================

create table if not exists device_state (
  owner      uuid primary key references auth.users on delete cascade,
  model      jsonb not null default '{}'::jsonb,   -- MCC_MODEL state
  persona    jsonb not null default '{}'::jsonb,   -- MCC_PERSONA signals
  updated_at timestamptz default now()
);
alter table device_state enable row level security;

drop policy if exists "members read their own state" on device_state;
create policy "members read their own state"
  on device_state for select using (owner = auth.uid());
drop policy if exists "members write their own state" on device_state;
create policy "members write their own state"
  on device_state for insert with check (owner = auth.uid());
drop policy if exists "members update their own state" on device_state;
create policy "members update their own state"
  on device_state for update using (owner = auth.uid()) with check (owner = auth.uid());

drop trigger if exists device_state_touch on device_state;
create trigger device_state_touch before update on device_state
  for each row execute function touch_updated_at();
