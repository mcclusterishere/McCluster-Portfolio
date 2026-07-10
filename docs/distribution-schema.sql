-- ============================================================
-- THE DISTRIBUTION DESK — every member's real income, connected.
--
-- Two tables + a summary. This is the ingestion layer for the whole
-- platform: a member says which platforms they distribute/earn
-- through (per industry), deep-links straight to that platform's
-- reports/bank, and uploads the earnings-report CSV. The parsed
-- totals live here as the member's REAL, self-reported income —
-- a desk-verifiable signal (not cash-outable platform credit; the
-- two-color law still holds — this never touches mtoken_ledger).
--
-- Dynamic by design: 'industry' and 'distributor_id' are free text
-- driven by data/distributors.json, so a new industry or platform
-- needs zero schema change.
--
-- Run AFTER admin-schema.sql. Safe to re-run.
-- ============================================================

-- 1 · CONNECTIONS — who you distribute through
create table if not exists public.member_connections (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid(),
  industry      text not null,
  distributor_id text not null,
  distributor    text not null,                 -- display name (or the 'Other' the member typed)
  handle        text default '',                -- their account/artist name on that platform, optional
  reports_url   text default '',                -- deep link the member opens (from the registry or their own)
  verified      boolean not null default false, -- the desk can stamp a connection confirmed
  at            timestamptz default now(),
  unique (owner, distributor_id)
);
alter table public.member_connections enable row level security;
drop policy if exists "your connections are yours" on public.member_connections;
create policy "your connections are yours" on public.member_connections for select
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "you connect your own" on public.member_connections;
create policy "you connect your own" on public.member_connections for insert
  with check (owner = auth.uid());
drop policy if exists "you edit your own connections" on public.member_connections;
create policy "you edit your own connections" on public.member_connections for update
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "you drop your own connections" on public.member_connections;
create policy "you drop your own connections" on public.member_connections for delete
  using (owner = auth.uid());

-- 2 · EARNINGS REPORTS — the CSV you upload, parsed to a total
create table if not exists public.earnings_reports (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid(),
  distributor_id text not null,
  distributor    text not null,
  period        text default '',                -- e.g. "2026-05" or "Q1 2026" — from the file or the member
  gross         numeric(14,2) not null default 0,
  currency      text default 'USD',
  rows          int not null default 0,         -- line-items counted in the CSV
  note          text default '',
  filename      text default '',
  verified      boolean not null default false,
  at            timestamptz default now()
);
alter table public.earnings_reports enable row level security;
drop policy if exists "your reports are yours" on public.earnings_reports;
create policy "your reports are yours" on public.earnings_reports for select
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "you file your own reports" on public.earnings_reports;
create policy "you file your own reports" on public.earnings_reports for insert
  with check (owner = auth.uid());
drop policy if exists "you drop your own reports" on public.earnings_reports;
create policy "you drop your own reports" on public.earnings_reports for delete
  using (owner = auth.uid());
drop policy if exists "the desk verifies reports" on public.earnings_reports;
create policy "the desk verifies reports" on public.earnings_reports for update
  using (is_mcc_admin());

-- 3 · MY DISTRIBUTION — connections + reports + lifetime total, one call
create or replace function public.my_distribution()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare conns jsonb; reps jsonb; total numeric; last12 numeric;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', distributor_id, 'name', distributor, 'industry', industry,
      'handle', handle, 'reports_url', reports_url, 'verified', verified) order by at), '[]'::jsonb)
    into conns from member_connections where owner = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'distributor', distributor, 'period', period, 'gross', gross,
      'rows', rows, 'verified', verified, 'at', at) order by at desc), '[]'::jsonb)
    into reps from earnings_reports where owner = auth.uid();
  select coalesce(sum(gross), 0) into total from earnings_reports where owner = auth.uid();
  select coalesce(sum(gross), 0) into last12 from earnings_reports
    where owner = auth.uid() and at > now() - interval '365 days';
  return jsonb_build_object(
    'connections', conns, 'reports', reps,
    'reported_total', total, 'reported_12mo', last12);
end;
$$;
grant execute on function public.my_distribution() to authenticated;

-- self-checks: expect 2 tables · 1 function
select count(*) as dist_tables from information_schema.tables
 where table_name in ('member_connections', 'earnings_reports');
select count(*) as dist_fn from pg_proc where proname = 'my_distribution';
