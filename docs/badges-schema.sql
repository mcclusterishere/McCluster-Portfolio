-- ============================================================
-- THE MULTICOLORED BADGE SYSTEM — made formal.
--
-- Until now the six M-Verified seals were a display + a form that
-- posted to a sheet. This makes them REAL held credentials: a member
-- applies for the seal their category earns, the desk verifies (checks
-- the required identifiers are in their locker), and a VERIFIED badge
-- shows on their profile for the whole floor to see. Colors, tiers and
-- required identifiers are canonical in data/badges.json.
--
-- One badge per member per seal. Verified badges are public (a seal
-- is a public claim); applications and revocations are the member's
-- and the desk's business only.
--
-- Run AFTER admin-schema.sql (needs is_mcc_admin) and identifiers2.
-- Safe to re-run.
-- ============================================================

create table if not exists public.member_badges (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid(),
  badge_id    text not null,                  -- performer / rights-owner / creator / venue / nonprofit / federal
  label       text default '',
  color       text default '',
  status      text not null default 'applied' check (status in ('applied','verified','revoked')),
  note        text default '',
  applied_at  timestamptz default now(),
  verified_at timestamptz,
  verified_by text default '',
  unique (owner, badge_id)
);
alter table public.member_badges enable row level security;

-- a VERIFIED seal is a public claim; the member also sees their own pending ones
drop policy if exists "verified badges are public" on public.member_badges;
create policy "verified badges are public" on public.member_badges for select
  using (status = 'verified' or owner = auth.uid() or is_mcc_admin());
-- the member applies (insert only as themselves, always as 'applied')
drop policy if exists "you apply for your own badges" on public.member_badges;
create policy "you apply for your own badges" on public.member_badges for insert
  with check (owner = auth.uid() and status = 'applied');
-- the member can withdraw an application; the desk works all
drop policy if exists "you withdraw your own" on public.member_badges;
create policy "you withdraw your own" on public.member_badges for delete
  using (owner = auth.uid() or is_mcc_admin());
drop policy if exists "the desk verifies badges" on public.member_badges;
create policy "the desk verifies badges" on public.member_badges for update
  using (is_mcc_admin());

-- apply for a seal (member) — idempotent; re-applying an unverified one is a no-op
create or replace function public.apply_badge(p_badge text, p_label text default '', p_color text default '')
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into member_badges (owner, badge_id, label, color, status)
  values (auth.uid(), p_badge, left(p_label, 80), left(p_color, 16), 'applied')
  on conflict (owner, badge_id) do nothing;
  return 'applied — the desk reviews your identifiers and stamps it verified';
end;
$$;
grant execute on function public.apply_badge(text, text, text) to authenticated;

-- award / verify a seal (desk) — grants it verified straight to a member by ticker/slug
create or replace function public.award_badge(to_slug text, p_badge text, p_label text default '', p_color text default '')
returns text language plpgsql security definer set search_path = public as $$
declare rcpt uuid;
begin
  if not is_mcc_admin() then raise exception 'the desk awards badges'; end if;
  select owner into rcpt from providers where slug = to_slug and owner is not null limit 1;
  if rcpt is null then raise exception 'no claimed account behind that name'; end if;
  insert into member_badges (owner, badge_id, label, color, status, verified_at, verified_by)
  values (rcpt, p_badge, left(p_label, 80), left(p_color, 16), 'verified', now(), 'desk')
  on conflict (owner, badge_id) do update
    set status = 'verified', verified_at = now(), verified_by = 'desk',
        label = coalesce(nullif(excluded.label, ''), member_badges.label),
        color = coalesce(nullif(excluded.color, ''), member_badges.color);
  return 'verified — the seal is live on their profile';
end;
$$;
grant execute on function public.award_badge(text, text, text, text) to authenticated;

-- my badges (any status) — feeds the desk card
create or replace function public.my_badges()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', badge_id, 'label', label, 'color', color, 'status', status) order by applied_at), '[]'::jsonb)
    into out from member_badges where owner = auth.uid();
  return out;
end;
$$;
grant execute on function public.my_badges() to authenticated;

-- the verified seals on any listing (public) — feeds profiles/cards
create or replace function public.badges_for(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.badge_id, 'label', b.label, 'color', b.color)), '[]'::jsonb)
  from member_badges b join providers p on p.owner = b.owner
  where p.slug = p_slug and b.status = 'verified';
$$;
grant execute on function public.badges_for(text) to anon, authenticated;

-- self-checks: expect 1 table · 4 functions
select count(*) as badges_table from information_schema.tables where table_name = 'member_badges';
select count(*) as badges_fns from pg_proc where proname in ('apply_badge','award_badge','my_badges','badges_for');
