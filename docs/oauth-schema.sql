-- ============================================================
-- THE HANDSHAKE VAULT — where connected accounts live.
-- One row per member per provider. Tokens are service-role-only:
-- RLS is on with NO policies, so no browser can ever read them —
-- only the edge functions. Safe to re-run.
-- ============================================================
create table if not exists public.member_oauth (
  owner         uuid not null,
  provider      text not null check (provider in ('youtube','spotify','google')),
  ext_id        text not null,
  ext_name      text default '',
  access_token  text default '',
  refresh_token text default '',
  expires_at    timestamptz,
  at            timestamptz not null default now(),
  primary key (owner, provider)
);
alter table public.member_oauth enable row level security;
-- no policies on purpose: the vault answers to the service role only

-- my connections, safely: names and providers, never tokens
create or replace function public.my_connections()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', provider, 'name', ext_name, 'at', at)), '[]'::jsonb)
  from member_oauth where owner = auth.uid();
$$;
grant execute on function public.my_connections() to authenticated;

-- self-check: expect 1 · 1
select count(*) as vault_ready from information_schema.tables where table_name = 'member_oauth';
select count(*) as connections_fn from pg_proc where proname = 'my_connections';
