-- THE OPERATOR'S TOOLKIT — better scripts for the owner's room.
-- Three instruments, all admin-gated by the same is_mcc_admin() wall:
--   member_book()       one row per member: listing, balance, earned,
--                        deals, signature, last movement — the CRM.
--   daily_pulse()        the whole platform's last 24h in one JSON.
--   sweep_stale_deals(n) declines deals sitting 'proposed' n+ days and
--                        tells you how many it cleared.
-- Run in the SQL editor any time; they read live and touch nothing
-- except the sweeper, which only closes what's already dead.

create or replace function public.member_book()
returns table (
  member    text,
  ticker    text,
  status    text,
  balance   numeric,
  earned    numeric,
  deals_all bigint,
  deals_done bigint,
  signed_agreement boolean,
  last_move timestamptz,
  joined    timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_mcc_admin() then raise exception 'the owner''s room only'; end if;
  return query
  select p.name, p.ticker, p.status,
    coalesce((select sum(l.delta) from mtoken_ledger l where l.owner = p.owner), 0),
    coalesce((select sum(l.delta) from mtoken_ledger l
              where l.owner = p.owner and l.delta > 0 and is_earned_reason(l.reason)), 0),
    (select count(*) from deals d where d.from_owner = p.owner or d.to_slug = p.slug),
    (select count(*) from deals d where (d.from_owner = p.owner or d.to_slug = p.slug) and d.status = 'completed'),
    exists (select 1 from agreements a where a.owner = p.owner),
    (select max(e.at) from events e where e.uid = p.owner),
    p.created_at
  from providers p
  where p.owner is not null
  order by p.created_at desc;
end;
$$;

create or replace function public.daily_pulse()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_mcc_admin() then raise exception 'the owner''s room only'; end if;
  select jsonb_build_object(
    'new_members_24h',   (select count(*) from providers where created_at > now() - interval '24 hours'),
    'listings_pending',  (select count(*) from providers where status = 'pending'),
    'deals_moved_24h',   (select count(*) from deals where updated_at > now() - interval '24 hours'),
    'deals_open',        (select count(*) from deals where status in ('proposed','countered','locked','signed')),
    'events_24h',        (select count(*) from events where at > now() - interval '24 hours'),
    'souls_24h',         (select count(distinct uid) from events where at > now() - interval '24 hours' and uid is not null),
    'intake_new',        (select count(*) from intake where status = 'new'),
    'house_claims_open', (select count(*) from house_claims where status in ('claimed','booked')),
    'cashouts_pending',  (select count(*) from cashout_requests where status = 'requested'),
    'credit_outstanding',(select coalesce(sum(delta), 0) from mtoken_ledger),
    'credit_earned',     (select coalesce(sum(delta), 0) from mtoken_ledger where delta > 0 and is_earned_reason(reason))
  ) into out;
  return out;
end;
$$;

create or replace function public.sweep_stale_deals(older_than_days int default 30)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_mcc_admin() then raise exception 'the owner''s room only'; end if;
  update deals set status = 'declined'
   where status = 'proposed' and updated_at < now() - (older_than_days || ' days')::interval;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.member_book() to authenticated;
grant execute on function public.daily_pulse() to authenticated;
grant execute on function public.sweep_stale_deals(int) to authenticated;

-- how you use them, any day:
--   select * from member_book();
--   select daily_pulse();
--   select sweep_stale_deals(30);

-- self-check: expect 3
select count(*) as toolkit_ready from pg_proc
 where proname in ('member_book', 'daily_pulse', 'sweep_stale_deals');
