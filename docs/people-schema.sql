-- THE PEOPLE ROOM — the whole person, computed, admin-only.
-- One dossier per claimed member: what they answered at the door
-- (hustles, goals), what they hold (both colors of credit), how they
-- deal, how they move (the events exhaust), the signature, the ID
-- mark, and the plug count. Mission Control's People tab reads this
-- and derives the archetypes in the open. Requires: agreements,
-- events, mtoken_ledger, deals, cashout_requests, referral_counts
-- (docs/referral-schema.sql) — run those pastes first.

create or replace function public.member_dossier()
returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'matthew@mccluster.org' then
    raise exception 'the owner''s room only';
  end if;
  return query
  select jsonb_build_object(
    'name', p.name,
    'slug', p.slug,
    'ticker', p.ticker,
    'status', p.status,
    'roles', coalesce(to_jsonb(p.roles), '[]'::jsonb),
    'area', p.area,
    'goals', coalesce(p.terms -> 'goals', '[]'::jsonb),
    'joined', p.created_at,
    'id_verified', coalesce(p.id_verified, false),
    'verified_name', p.verified_name,
    'charges_enabled', coalesce(p.charges_enabled, false),
    'referred_by', p.referred_by,
    'signed_agreement', exists (select 1 from agreements a where a.owner = p.owner),
    'balance', coalesce((select sum(l.delta) from mtoken_ledger l where l.owner = p.owner), 0),
    'earned', coalesce((select sum(l.delta) from mtoken_ledger l
                        where l.owner = p.owner and l.delta > 0 and is_earned_reason(l.reason)), 0),
    'spent', coalesce((select sum(-l.delta) from mtoken_ledger l
                       where l.owner = p.owner and l.delta < 0), 0),
    'deals_total', (select count(*) from deals d where d.from_owner = p.owner or d.to_slug = p.slug),
    'deals_done', (select count(*) from deals d
                   where (d.from_owner = p.owner or d.to_slug = p.slug) and d.status = 'completed'),
    'counterparties', (select count(distinct case when d.from_owner = p.owner
                                                  then d.to_slug else d.from_owner::text end)
                       from deals d where d.from_owner = p.owner or d.to_slug = p.slug),
    'events_total', (select count(*) from events e where e.uid = p.owner),
    'first_seen', (select min(e.at) from events e where e.uid = p.owner),
    'last_seen', (select max(e.at) from events e where e.uid = p.owner),
    'active_days_30', (select count(distinct date(e.at)) from events e
                       where e.uid = p.owner and e.at > now() - interval '30 days'),
    'top_moves', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'n', t.n))
                           from (select e.name, count(*) as n from events e
                                 where e.uid = p.owner group by e.name
                                 order by n desc limit 5) t), '[]'::jsonb),
    'cashouts', (select count(*) from cashout_requests c where c.owner = p.owner),
    'referrals', (select rc.qualified from referral_counts(p.ticker, p.slug) rc)
  )
  from providers p
  where p.owner is not null
  order by p.created_at desc;
end;
$$;
grant execute on function public.member_dossier() to authenticated;

-- self-check: expect 1
select count(*) as people_ready from pg_proc where proname = 'member_dossier';
