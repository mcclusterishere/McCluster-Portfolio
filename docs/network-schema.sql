-- ============================================================
-- The M Network backend: providers, booking requests, SMS list.
-- Run AFTER docs/platform-schema.sql in the Supabase SQL editor.
-- RLS is the wall — the anon key can only do what these policies
-- allow: read live listings, file a booking request, opt in to
-- texts. Owners manage their own listing and their own inbox.
-- ============================================================

-- ---------- providers: the talent & vendor directory ----------
create table if not exists providers (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users on delete set null,
  slug        text unique,
  name        text not null,
  headline    text,
  blurb       text,
  area        text,
  roles       text[] default '{}',            -- Photo / Video / Web / Studios / Stages
  badge_color text default '#e5383b',
  href        text,                           -- portfolio link
  book        text,                           -- booking link (or blank: requests flow)
  status      text not null default 'pending' -- pending -> live -> paused
              check (status in ('pending','live','paused')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table providers enable row level security;

create policy "live listings are public"
  on providers for select
  using (status = 'live' or owner = auth.uid());

create policy "signed-in talent creates their own listing"
  on providers for insert
  with check (owner = auth.uid());

create policy "owners edit their own listing"
  on providers for update
  using (owner = auth.uid())
  with check (owner = auth.uid() and status in ('pending','paused',status)); -- owners can't self-approve to live

-- ---------- booking_requests: the network's front desk ----------
create table if not exists booking_requests (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid references providers on delete set null,
  provider_slug text,
  name         text not null,
  contact      text not null,                  -- email or phone, requester's choice
  date_wanted  text,
  details      text,
  status       text not null default 'new'
               check (status in ('new','accepted','declined','done')),
  tithe_pct    int not null default 10,        -- the nonprofit's ask on booked work
  created_at   timestamptz default now()
);
alter table booking_requests enable row level security;

create policy "anyone can file a request"
  on booking_requests for insert
  with check (true);

create policy "providers read their own inbox"
  on booking_requests for select
  using (exists (select 1 from providers p
                 where p.id = provider_id and p.owner = auth.uid()));

create policy "providers work their own inbox"
  on booking_requests for update
  using (exists (select 1 from providers p
                 where p.id = provider_id and p.owner = auth.uid()));

-- ---------- sms_optins: the text list the platform owns ----------
create table if not exists sms_optins (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  consent    text not null,   -- the exact consent line shown at opt-in (TCPA record)
  source     text,            -- which page/flow captured it
  created_at timestamptz default now()
);
alter table sms_optins enable row level security;

create policy "anyone can opt in"
  on sms_optins for insert
  with check (true);
-- deliberately NO select policy for anon/authenticated:
-- the list is only readable from the Supabase dashboard / service role.

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists providers_touch on providers;
create trigger providers_touch before update on providers
  for each row execute function touch_updated_at();

-- ---------- members: the people inside the organization ----------
-- Board interest, Equity Uprise programming, volunteers, and the donor
-- circle that keeps the lights on with residual giving.
create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid references auth.users on delete cascade unique,
  name       text,
  interests  text[] default '{}',   -- Board service / Programming / Volunteer / Donor circle
  note       text,
  status     text not null default 'applied'
             check (status in ('applied','active','board','paused')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table members enable row level security;

create policy "members read their own record"
  on members for select using (owner = auth.uid());
create policy "members create their own record"
  on members for insert with check (owner = auth.uid());
create policy "members update their own record"
  on members for update using (owner = auth.uid()) with check (owner = auth.uid());

drop trigger if exists members_touch on members;
create trigger members_touch before update on members
  for each row execute function touch_updated_at();
