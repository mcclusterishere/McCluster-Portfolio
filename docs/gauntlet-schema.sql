-- THE GAUNTLET — the whole app experience pays EXACTLY 5 E⤴, ever.
-- The house pays for a fully onboarded operator: ten milestones, each
-- verified against the real tables (never the honor system), each
-- minting once per member (the ledger's unique key is the wall), the
-- ten summing to 5.00 by construction. Gauntlet credit is GRANTED
-- color — it spends across the whole floor and never cashes out.
--   walk_in     0.50  finished the welcome walk-in
--   card_live   0.50  dressed the listing (headline on the card)
--   signed      0.25  Member Agreement on the record
--   first_post  0.50  spoke on the Wire
--   first_track 0.75  put a record on the Distro rack
--   first_deal  0.75  sent a deal
--   civic_card  0.50  filed a civic card at the HQ
--   push_on     0.25  armed notifications
--   first_plug  0.50  brought their first sign-up
--   explorer    0.50  moved on 5+ separate days
--                5.00 TOTAL — THE LAW.

create or replace function public.claim_gauntlet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me record; rec record; total numeric := 0; done jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select slug, ticker into me from providers where owner = auth.uid() limit 1;
  for rec in
    select * from (values
      ('walk_in',     0.50, exists(select 1 from events where uid = auth.uid() and name = 'welcome_done')),
      ('card_live',   0.50, exists(select 1 from providers where owner = auth.uid() and coalesce(headline, '') <> '')),
      ('signed',      0.25, exists(select 1 from agreements where owner = auth.uid())),
      ('first_post',  0.50, exists(select 1 from posts where owner = auth.uid())),
      ('first_track', 0.75, exists(select 1 from rack where owner = auth.uid())),
      ('first_deal',  0.75, exists(select 1 from deals where from_owner = auth.uid())),
      ('civic_card',  0.50, exists(select 1 from civic_profiles where owner = auth.uid())),
      ('push_on',     0.25, exists(select 1 from push_subs where owner = auth.uid())),
      ('first_plug',  0.50, exists(select 1 from providers g
                              where g.owner is not null and g.referred_by is not null
                                and upper(g.referred_by) in (nullif(upper(coalesce(me.ticker, '')), ''),
                                                             nullif(upper(coalesce(me.slug, '')), '')))),
      ('explorer',    0.50, (select count(distinct date(at)) from events where uid = auth.uid()) >= 5)
    ) t(k, amt, ok)
  loop
    if rec.ok then
      done := done || to_jsonb(rec.k);
      insert into mtoken_ledger (owner, delta, reason, ref)
      values (auth.uid(), rec.amt, 'gauntlet award', 'gauntlet:' || rec.k)
      on conflict (owner, ref, reason) do nothing;
      if found then total := total + rec.amt; end if;
    end if;
  end loop;
  return jsonb_build_object('done', done, 'minted', total,
    'paid_total', coalesce((select sum(delta) from mtoken_ledger
                            where owner = auth.uid() and reason = 'gauntlet award'), 0));
end;
$$;
grant execute on function public.claim_gauntlet() to authenticated;

-- MY MISSION CONTROL — every member's own numbers, THEIR scope only.
-- The events table is admin-eyes-only by policy; this definer function
-- is the one keyhole, and it only ever answers about the caller's own
-- surfaces: their landing page, their ticker, their plug, their books.
create or replace function public.my_mission()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me record; out jsonb;
begin
  if auth.uid() is null then return null; end if;
  select slug, ticker, name, status into me from providers where owner = auth.uid() limit 1;
  select jsonb_build_object(
    'slug', me.slug, 'ticker', me.ticker, 'status', me.status,
    'page_views', (select count(*) from events where name = 'page_view'
                    and props ->> 'page' = coalesce(me.slug, '')),
    'floor_opens', (select count(*) from events where name = 'xc_ticker_open'
                     and upper(coalesce(props ->> 'tick', '')) = upper(coalesce(me.ticker, me.slug, ''))),
    'plug_landings', (select count(*) from events where name = 'acquired'
                       and upper(coalesce(props ->> 'plug', '')) in (nullif(upper(coalesce(me.ticker, '')), ''),
                                                                     nullif(upper(coalesce(me.slug, '')), ''))),
    'followers', (select count(*) from follows where creator_slug = coalesce(me.slug, '')),
    'posts', (select count(*) from posts where owner = auth.uid()),
    'tracks', (select count(*) from rack where owner = auth.uid()),
    'requests', (select count(*) from booking_requests br
                  join providers p on p.id = br.provider_id where p.owner = auth.uid()),
    'deals_open', (select count(*) from deals d
                    where (d.from_owner = auth.uid() or d.to_slug = coalesce(me.slug, ''))
                      and d.status in ('proposed', 'countered', 'locked', 'signed')),
    'deals_done', (select count(*) from deals d
                    where (d.from_owner = auth.uid() or d.to_slug = coalesce(me.slug, ''))
                      and d.status = 'completed'),
    'balance', coalesce((select sum(delta) from mtoken_ledger where owner = auth.uid()), 0),
    'earned', coalesce((select sum(delta) from mtoken_ledger
                        where owner = auth.uid() and delta > 0 and is_earned_reason(reason)), 0),
    'gauntlet_paid', coalesce((select sum(delta) from mtoken_ledger
                               where owner = auth.uid() and reason = 'gauntlet award'), 0),
    'active_days_30', (select count(distinct date(at)) from events
                        where uid = auth.uid() and at > now() - interval '30 days'),
    'rack_plays', (select count(*) from events where name = 'track_play'
                    and props ->> 'slug' = coalesce(me.slug, '')),
    'proofs_in', (select count(*) from mission_proofs where owner = auth.uid()),
    'proofs_passed', (select count(*) from mission_proofs
                       where owner = auth.uid() and status = 'passed')
  ) into out;
  return out;
end;
$$;
grant execute on function public.my_mission() to authenticated;

-- self-check: expect 2
select count(*) as gauntlet_ready from pg_proc
 where proname in ('claim_gauntlet', 'my_mission');
