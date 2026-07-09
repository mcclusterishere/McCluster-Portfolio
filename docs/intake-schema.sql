-- THE INTAKE RAIL — every ask on the record, none of it lost to inboxes.
-- Fellowship sign-ups, quote requests, booking questions, notify-me taps:
-- everything that used to fire a mailto link now files here, tagged with
-- a KIND the back end can route on. The kind field is the algorithm's
-- hook: auto-responders, scoring, digests all key off it later.
-- Write-open to the world; only the admin reads or works the queue.

create table if not exists public.intake (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  kind    text not null default 'general',   -- fellowship / quote-web / shoot / notify / …
  name    text default '',
  contact text default '',
  body    text default '',
  page    text default '',
  uid     uuid,
  status  text not null default 'new' check (status in ('new','read','answered'))
);
create index if not exists intake_at_idx on public.intake (at desc);
create index if not exists intake_status_idx on public.intake (status, at desc);

alter table public.intake enable row level security;

drop policy if exists "anyone files an ask" on public.intake;
create policy "anyone files an ask"
  on public.intake for insert
  to anon, authenticated
  with check (true);

drop policy if exists "only the admin reads the queue" on public.intake;
create policy "only the admin reads the queue"
  on public.intake for select
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "only the admin works the queue" on public.intake;
create policy "only the admin works the queue"
  on public.intake for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- self-check: expect 1
select count(*) as intake_ready from information_schema.tables
 where table_name = 'intake' and table_schema = 'public';
