-- THE PLUG — three real ones = 1 E⤴, and "real" is enforced by the
-- database, not the honor system. A share link carries ?ref=TICKER;
-- the door files the new listing with referred_by. A referral COUNTS
-- only when the referred member: (1) holds a full claimed account,
-- (2) signed the Member Agreement, (3) moved on 3+ separate days,
-- and (4) put 3+ sign-ups of their own on. Clicks are worth nothing;
-- people are. On top of the sign-up bonus, the plug holds a LIFETIME
-- SHARE: 1% of every E⤴ their people ever EARN here, cut from the
-- house's own pocket the moment it mints. All referral credit is
-- GRANTED color — it spends across the whole floor but never cashes
-- out (the two-color law).

alter table public.providers add column if not exists referred_by text;
-- set once at the door; nobody rewrites history to farm credit
revoke update (referred_by) on public.providers from authenticated, anon;

-- who counts, computed one way for everyone
create or replace function public.referral_counts(t text, s text)
returns table (signups bigint, qualified bigint)
language sql stable security definer set search_path = public as $$
  with me as (
    select nullif(upper(coalesce(t, '')), '') as tick,
           nullif(upper(coalesce(s, '')), '') as slg
  ), kids as (
    select r.* from providers r, me
    where r.owner is not null and r.referred_by is not null
      and upper(r.referred_by) in (me.tick, me.slg)
  )
  select count(*),
         count(*) filter (where
           exists (select 1 from agreements a where a.owner = k.owner)
           and (select count(distinct date(e.at)) from events e where e.uid = k.owner) >= 3
           and (select count(*) from providers g
                 where g.owner is not null and g.referred_by is not null
                   and upper(g.referred_by) in (nullif(upper(coalesce(k.ticker, '')), ''),
                                                nullif(upper(coalesce(k.slug, '')), ''))) >= 3)
  from kids k;
$$;

-- the desk reads its own count
create or replace function public.referral_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me record; s bigint; q bigint; minted numeric;
begin
  if auth.uid() is null then
    return jsonb_build_object('signups', 0, 'qualified', 0, 'minted', 0);
  end if;
  select ticker, slug into me from providers where owner = auth.uid() limit 1;
  if me is null then
    return jsonb_build_object('signups', 0, 'qualified', 0, 'minted', 0);
  end if;
  select * into s, q from referral_counts(me.ticker, me.slug);
  select coalesce(sum(delta), 0) into minted from mtoken_ledger
   where owner = auth.uid() and reason = 'referral bonus';
  return jsonb_build_object('signups', coalesce(s, 0), 'qualified', coalesce(q, 0), 'minted', minted,
    'share', (select coalesce(sum(delta), 0) from mtoken_ledger
              where owner = auth.uid() and reason = 'referral share'));
end;
$$;
grant execute on function public.referral_stats() to authenticated;

-- THE LIFETIME SHARE — 1% of every E⤴ your people EARN here, forever.
-- Fires the moment any earned credit lands for a referred member: the
-- house cuts the referrer 1% from its own pocket (granted color —
-- spends across the floor, never cashes out). Idempotent per source
-- row, so replays and re-fires mint nothing twice.
create or replace function public.referral_share_on_mint()
returns trigger language plpgsql security definer set search_path = public as $$
declare kid record; plug uuid; cut numeric;
begin
  if new.delta > 0 and is_earned_reason(new.reason) then
    select ticker, slug, referred_by into kid from providers
     where owner = new.owner and referred_by is not null limit 1;
    if kid is not null then
      select owner into plug from providers
       where owner is not null and owner <> new.owner
         and upper(kid.referred_by) in (nullif(upper(coalesce(ticker, '')), ''),
                                        nullif(upper(coalesce(slug, '')), ''))
       limit 1;
      cut := round(new.delta * 0.01, 2);
      if plug is not null and cut > 0 then
        insert into mtoken_ledger (owner, delta, reason, ref)
        values (plug, cut, 'referral share', 'refshare:' || new.id::text)
        on conflict (owner, ref, reason) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists referral_share_t on public.mtoken_ledger;
create trigger referral_share_t after insert on public.mtoken_ledger
  for each row execute function public.referral_share_on_mint();

-- the mint: 1 E⤴ per full three qualified, idempotent per batch —
-- the worker calls this nightly; no member can call it at all
create or replace function public.referral_mint_all()
returns int language plpgsql security definer set search_path = public as $$
declare p record; s bigint; q bigint; owed int; b int; n int := 0;
begin
  for p in select owner, slug, ticker from providers where owner is not null loop
    select * into s, q from referral_counts(p.ticker, p.slug);
    owed := floor(coalesce(q, 0) / 3.0);
    if owed <= 0 then continue; end if;
    for b in 1..owed loop
      -- 'referral bonus' is a GRANTED reason: spends in the loop, never redeems
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (p.owner, 1, 'referral bonus', 'refmint:' || coalesce(p.slug, p.owner::text) || ':' || b)
      on conflict (owner, ref, reason) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end;
$$;
revoke execute on function public.referral_mint_all() from public, anon, authenticated;

-- self-checks: expect 1 · 4
select count(*) as ref_column from information_schema.columns
 where table_name = 'providers' and column_name = 'referred_by';
select count(*) as ref_fns from pg_proc
 where proname in ('referral_counts', 'referral_stats', 'referral_mint_all', 'referral_share_on_mint');
