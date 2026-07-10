-- ID VERIFICATION — prove it's really you, wear the mark.
-- Stripe Identity does the scanning (government ID + selfie match) and
-- KEEPS the documents; the platform stores only the verdict and the
-- verified name. Same wall as the rail columns: only the service role
-- (the webhook) can stamp these — no member stamps themselves.

alter table public.providers add column if not exists id_verified boolean;
alter table public.providers add column if not exists verified_name text;

revoke update (id_verified, verified_name) on public.providers from authenticated, anon;
revoke insert (id_verified, verified_name) on public.providers from authenticated, anon;

-- self-check: expect 2
select count(*) as verify_ready from information_schema.columns
 where table_name = 'providers' and column_name in ('id_verified', 'verified_name');
