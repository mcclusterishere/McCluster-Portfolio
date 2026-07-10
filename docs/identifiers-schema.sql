-- ============================================================
-- THE IDENTIFIER LOCKER — every Chaser's industry identity, in
-- the cloud, one row per identifier. The Metadata Engine saves
-- into it, the algorithm reads from it, and the GAME scores it:
-- identifier_power() returns a 0–100 completeness score the
-- profile can wear and the Trap can pay on.
-- Run AFTER admin-schema.sql. Safe to re-run.
-- ============================================================

create table if not exists public.member_identifiers (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz default now(),
  owner    uuid not null,
  kind     text not null check (kind in (
    'isrc_prefix','isrc','iswc','upc','ipi','isni','ipn','dpid',
    'spotify_artist','apple_artist','youtube_channel','soundcloud',
    'pro','publisher','label','ein','other')),
  value    text not null check (char_length(value) between 1 and 200),
  label    text default '',                -- e.g. the track slug an ISRC belongs to
  verified boolean not null default false, -- the desk can stamp it checked
  unique (owner, kind, value)
);
create index if not exists member_identifiers_owner on public.member_identifiers (owner);
alter table public.member_identifiers enable row level security;

drop policy if exists "your locker is yours" on public.member_identifiers;
create policy "your locker is yours"
  on public.member_identifiers for select
  using (owner = auth.uid() or is_mcc_admin());

drop policy if exists "you stock your own locker" on public.member_identifiers;
create policy "you stock your own locker"
  on public.member_identifiers for insert
  with check (owner = auth.uid());

drop policy if exists "you clean your own locker" on public.member_identifiers;
create policy "you clean your own locker"
  on public.member_identifiers for delete
  using (owner = auth.uid());

drop policy if exists "the desk verifies" on public.member_identifiers;
create policy "the desk verifies"
  on public.member_identifiers for update
  using (is_mcc_admin());

-- ---------- the game: identity power, 0–100 ----------
-- each identifier FAMILY you hold adds power; verified doubles that
-- family's weight. This is the score the profile wears and the Trap
-- can pay on ("stock your locker" mission).
create or replace function public.identifier_power()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  fams int; vfams int; total int := 10;  -- 10 families count toward power
  score int;
begin
  if auth.uid() is null then return null; end if;
  select count(distinct kind),
         count(distinct kind) filter (where verified)
    into fams, vfams
    from member_identifiers where owner = auth.uid()
     and kind in ('isrc_prefix','isrc','iswc','upc','ipi','isni',
                  'spotify_artist','youtube_channel','pro','publisher');
  score := least(100, (fams * 100 / total) + (vfams * 10));
  return jsonb_build_object('power', score, 'families', fams, 'verified_families', vfams,
    'next', case
      when fams = 0 then 'Start with your ISRC prefix or Spotify artist ID — the engine imports the rest.'
      when fams < 4 then 'Add your PRO membership and IPI — that''s the publishing money lane.'
      when fams < 8 then 'Add ISWC codes per song and your ISNI — the pros carry all ten.'
      else 'Locker deep. Get the desk to verify entries and max your power.' end);
end;
$$;
grant execute on function public.identifier_power() to authenticated;

-- self-checks: expect 1 · 1
select count(*) as locker_ready from information_schema.tables where table_name = 'member_identifiers';
select count(*) as power_ready from pg_proc where proname = 'identifier_power';
