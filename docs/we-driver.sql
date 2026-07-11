-- ============================================================
-- THE WHEEL — Whip Equipped drivers go online, for real.
-- One table carries live driver state; two doors touch it:
--   driver_ping(online, lat, lng, heading)  ← the driver's own
--       heartbeat, every ~20s while the wheel is on. Flipping
--       online=false (or 3 minutes of silence) takes them off
--       the road.
--   drivers_on_road()  ← what riders see: name, face, live spot
--       of every driver pinged inside the last 3 minutes. Public
--       read — going online IS publishing your position, and the
--       toggle says so in plain words.
-- Dynamic by design: any member with a listing can drive — the
-- Rides lane is additive, it never touches the rest of their
-- desk, their roles, or their listing.
-- Safe to re-run.
-- ============================================================

create table if not exists public.driver_status (
  owner      uuid primary key references auth.users (id) on delete cascade,
  online     boolean not null default false,
  lat        double precision,
  lng        double precision,
  heading    double precision,
  updated_at timestamptz not null default now()
);
alter table public.driver_status enable row level security;
drop policy if exists driver_status_read on public.driver_status;
create policy driver_status_read on public.driver_status for select using (true);
-- no insert/update policies: the only door in is the rpc below

create or replace function public.driver_ping(
  p_online boolean,
  p_lat double precision default null,
  p_lng double precision default null,
  p_heading double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'why', 'signed out');
  end if;
  if not exists (select 1 from providers where owner = auth.uid()) then
    return jsonb_build_object('ok', false, 'why', 'walk in first — the road needs your listing');
  end if;
  insert into driver_status (owner, online, lat, lng, heading, updated_at)
  values (auth.uid(), p_online, p_lat, p_lng, p_heading, now())
  on conflict (owner) do update
    set online = excluded.online,
        lat = excluded.lat,
        lng = excluded.lng,
        heading = excluded.heading,
        updated_at = now();
  return jsonb_build_object('ok', true, 'online', p_online);
end $$;
revoke all on function public.driver_ping(boolean, double precision, double precision, double precision) from public;
grant execute on function public.driver_ping(boolean, double precision, double precision, double precision) to authenticated;

create or replace function public.drivers_on_road()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', p.slug, 'name', p.name, 'area', p.area, 'photo', p.photo,
    'lat', d.lat, 'lng', d.lng, 'heading', d.heading, 'at', d.updated_at)), '[]'::jsonb)
    from driver_status d
    join providers p on p.owner = d.owner
   where d.online
     and d.updated_at > now() - interval '3 minutes'
     and d.lat is not null;
$$;
grant execute on function public.drivers_on_road() to anon, authenticated;

-- self-check: expect 1 · 2
select count(*) as wheel_table from information_schema.tables where table_name = 'driver_status';
select count(*) as wheel_fns from pg_proc where proname in ('driver_ping', 'drivers_on_road');
