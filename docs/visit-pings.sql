-- ============================================================
-- VISIT PINGS — somebody pulls up to your spot in UPRISE NATION
-- and your pocket gets tapped. Run after inbox.sql.
--   member_prefs: the switch (visit pings on by default)
--   ping_visit(slug): called by the game when a whip reaches a
--     member's door — files the bell note and rides push-send to
--     the owner's device. Guards: never your own spot, owner's
--     switch respected, one ping per spot per 30 minutes no
--     matter how many laps. The push pass is the vaulted VAPID
--     key itself — no new secret to manage.
-- Requires push-send v2 (the 'system' action) deployed.
-- Safe to re-run.
-- ============================================================

create table if not exists public.member_prefs (
  owner       uuid primary key default auth.uid(),
  visit_pings boolean not null default true
);
alter table public.member_prefs enable row level security;
drop policy if exists "own prefs read" on public.member_prefs;
create policy "own prefs read" on public.member_prefs for select using (owner = auth.uid());
drop policy if exists "own prefs set" on public.member_prefs;
create policy "own prefs set" on public.member_prefs for insert to authenticated with check (owner = auth.uid());
drop policy if exists "own prefs flip" on public.member_prefs;
create policy "own prefs flip" on public.member_prefs for update using (owner = auth.uid()) with check (owner = auth.uid());

create or replace function public.ping_visit(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o uuid; visitor text := 'A whip'; last timestamptz; pk text;
begin
  select owner into o from providers where slug = p_slug and owner is not null limit 1;
  if o is null then return jsonb_build_object('ok', false, 'why', 'no spot'); end if;
  if o = auth.uid() then return jsonb_build_object('ok', false, 'why', 'own spot'); end if;
  -- the switch: the owner said no
  if exists (select 1 from member_prefs where owner = o and visit_pings = false) then
    return jsonb_build_object('ok', false, 'why', 'off');
  end if;
  -- the cooldown: one ping per spot per 30 minutes, however many laps
  select max(at) into last from notifications where owner = o and kind = 'visit';
  if last is not null and last > now() - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'why', 'cooldown');
  end if;
  if auth.uid() is not null then
    select coalesce(nullif(name, ''), 'A member') into visitor
      from providers where owner = auth.uid() limit 1;
    visitor := coalesce(visitor, 'A member');
  end if;
  perform notify(o, 'visit', 'Somebody pulled up',
    visitor || ' is outside your spot in Uprise Nation right now.', 'ourworld.html');
  -- the pocket tap: push-send speaks to their devices; the vaulted
  -- key is the pass, so nothing secret lives in this paste
  begin
    select priv into pk from push_config where id = 1;
    if pk is not null then
      perform net.http_post(
        url := 'https://fxbkvcrfbbcmrrupdcjt.supabase.co/functions/v1/push-send',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object('action', 'system', 'secret', pk, 'owner', o::text,
          'title', 'Somebody pulled up 🚗',
          'body', visitor || ' is outside your spot in Uprise Nation.',
          'url', 'ourworld.html'));
    end if;
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.ping_visit(text) to anon, authenticated;

-- self-check: expect 1 · 1
select count(*) as prefs_tbl from information_schema.tables where table_name = 'member_prefs';
select count(*) as ping_fn from pg_proc where proname = 'ping_visit';
