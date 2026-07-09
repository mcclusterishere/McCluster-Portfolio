-- THE RAIL COLUMNS — where each listing's card checkout points.
-- square:          the provider's OWN Square link (owner-writable — it's theirs).
-- stripe_acct:     their Stripe Connect account id (acct_...), written ONLY by
--                  the connect-onboard edge function through the service role.
-- charges_enabled: stamped true by the same function once Stripe verifies them.
-- The column-level revokes are the wall: a listing owner must never be able
-- to stamp their own rail live or point it at someone else's account.

alter table public.providers add column if not exists square text;
alter table public.providers add column if not exists stripe_acct text;
alter table public.providers add column if not exists charges_enabled boolean;

revoke update (stripe_acct, charges_enabled) on public.providers from authenticated, anon;
revoke insert (stripe_acct, charges_enabled) on public.providers from authenticated, anon;

-- self-check: expect 3 rows
select column_name from information_schema.columns
 where table_name = 'providers'
   and column_name in ('square', 'stripe_acct', 'charges_enabled')
 order by column_name;
