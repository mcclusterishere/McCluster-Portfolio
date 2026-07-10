-- THE NIGHT SHIFT — a worker inside the database itself.
-- pg_cron runs jobs on Supabase's own scheduler: no server, no
-- laptop, no GitHub secret — the database wakes itself. One nightly
-- shift does the housekeeping and writes the platform's daily
-- snapshot to pulse_log, giving Mission Control a history that
-- outlives raw event retention. The worker functions carry no admin
-- gate (cron has no sign-in) — instead EXECUTE is revoked from every
-- role a browser can hold, so only the scheduler can call them.
-- Requires: docs/admin-power.sql tables/concepts and
-- docs/referral-schema.sql (referral_mint_all) — run those first.

create extension if not exists pg_cron;

-- the long book: one row per day, forever
create table if not exists public.pulse_log (
  day  date primary key,
  at   timestamptz default now(),
  data jsonb not null
);
alter table public.pulse_log enable row level security;
drop policy if exists "only the admin reads the long book" on public.pulse_log;
create policy "only the admin reads the long book"
  on public.pulse_log for select
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');
-- no insert policy on purpose: only the worker (table owner) writes

-- housekeeping: quietly declines deals sitting 'proposed' 30+ days
create or replace function public.worker_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update deals set status = 'declined'
   where status = 'proposed' and updated_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.worker_sweep() from public, anon, authenticated;

-- the nightly snapshot: the whole platform in one JSON, plus the
-- night's housekeeping results, banked under today's date
create or replace function public.worker_snapshot()
returns void language plpgsql security definer set search_path = public as $$
declare swept int; minted int;
begin
  swept := public.worker_sweep();
  minted := public.referral_mint_all();
  insert into pulse_log (day, data)
  values (current_date, jsonb_build_object(
    'new_members_24h',   (select count(*) from providers where created_at > now() - interval '24 hours'),
    'members_total',     (select count(*) from providers where owner is not null),
    'listings_pending',  (select count(*) from providers where status = 'pending'),
    'deals_moved_24h',   (select count(*) from deals where updated_at > now() - interval '24 hours'),
    'deals_open',        (select count(*) from deals where status in ('proposed','countered','locked','signed')),
    'events_24h',        (select count(*) from events where at > now() - interval '24 hours'),
    'souls_24h',         (select count(distinct uid) from events where at > now() - interval '24 hours' and uid is not null),
    'intake_new',        (select count(*) from intake where status = 'new'),
    'house_claims_open', (select count(*) from house_claims where status in ('claimed','booked')),
    'cashouts_pending',  (select count(*) from cashout_requests where status = 'requested'),
    'credit_outstanding',(select coalesce(sum(delta), 0) from mtoken_ledger),
    'credit_earned',     (select coalesce(sum(delta), 0) from mtoken_ledger where delta > 0 and is_earned_reason(reason)),
    'fund_balance',      (select coalesce(sum(delta), 0) from mtoken_ledger where owner = public.fund_uid()),
    'stale_deals_swept', swept,
    'referral_minted',   minted
  ))
  on conflict (day) do update set data = excluded.data, at = now();
end;
$$;
revoke execute on function public.worker_snapshot() from public, anon, authenticated;

-- the shift schedule: every night at 4:07 UTC (idempotent — scheduling
-- the same name again just updates it)
select cron.schedule('mcc-night-shift', '7 4 * * *', 'select public.worker_snapshot()');

-- run the first shift right now so the long book opens tonight
select public.worker_snapshot();

-- self-checks: expect 1 · 1 · at least 1
select count(*) as worker_ready from pg_proc where proname = 'worker_snapshot';
select count(*) as shift_scheduled from cron.job where jobname = 'mcc-night-shift';
select count(*) as long_book_open from pulse_log;
