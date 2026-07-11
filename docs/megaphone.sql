-- ============================================================
-- THE MEGAPHONE — post to your OWN platforms from the desk.
-- Hootsuite energy, house rules: write it once in Mission
-- Control, pick the lanes (the Wire · Discord · X), fire —
-- receipts come back per lane. Admin-first: only the admin's
-- sign-in can speak for now; widening the gate later is one line.
-- Run this whole tab as one paste.
-- ============================================================

-- the ledger: every shot fired, with per-lane receipts
create table if not exists public.megaphone_queue (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid(),
  body text not null check (char_length(body) between 1 and 500),
  targets text[] not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'partial', 'failed')),
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.megaphone_queue enable row level security;
drop policy if exists "own megaphone reads" on public.megaphone_queue;
create policy "own megaphone reads" on public.megaphone_queue
  for select using (owner = auth.uid());
-- no insert/update policies on purpose: the RPC below and the
-- service key (megaphone-send writing receipts) are the only writers

create or replace function public.megaphone_post(p_body text, p_targets text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  em text;
  tgt text[];
  externals text[];
  qid bigint;
  my_slug text;
  wired boolean := false;
  pk text;
begin
  -- ADMIN-FIRST: the megaphone answers one voice for now.
  -- Rollout later = widen or drop this check.
  em := coalesce(auth.jwt() ->> 'email', '');
  if em <> 'matthew@mccluster.org' then
    return jsonb_build_object('ok', false, 'why', 'the megaphone is admin-first for now');
  end if;
  if p_body is null or char_length(btrim(p_body)) < 1 or char_length(p_body) > 500 then
    return jsonb_build_object('ok', false, 'why', 'say something — 1 to 500 characters');
  end if;
  select array_agg(distinct t) into tgt
    from unnest(coalesce(p_targets, '{}')) t
   where t in ('wire', 'discord', 'x');
  if tgt is null then
    return jsonb_build_object('ok', false, 'why', 'pick at least one platform');
  end if;

  -- THE WIRE lane is internal — it lands right here in the database
  if 'wire' = any(tgt) then
    select slug into my_slug from providers where owner = auth.uid() limit 1;
    if my_slug is not null then
      insert into posts (owner, slug, body) values (auth.uid(), my_slug, btrim(p_body));
      wired := true;
    end if;
  end if;

  select array_agg(t) into externals from unnest(tgt) t where t <> 'wire';

  insert into megaphone_queue (owner, body, targets, status, results)
  values (auth.uid(), btrim(p_body), tgt,
          case when externals is null then (case when wired then 'sent' else 'failed' end)
               else 'queued' end,
          case when wired then jsonb_build_object('wire', 'sent')
               when 'wire' = any(tgt) then jsonb_build_object('wire', 'no listing slug yet')
               else '{}'::jsonb end)
  returning id into qid;

  -- external lanes ride megaphone-send; the vaulted push key is the
  -- pass, so nothing secret lives in this paste
  if externals is not null then
    begin
      select priv into pk from push_config where id = 1;
      if pk is not null then
        perform net.http_post(
          url := 'https://fxbkvcrfbbcmrrupdcjt.supabase.co/functions/v1/megaphone-send',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := jsonb_build_object('id', qid, 'secret', pk));
      end if;
    exception when others then null; end;
  end if;

  return jsonb_build_object('ok', true, 'id', qid, 'targets', tgt);
end $$;

revoke all on function public.megaphone_post(text, text[]) from public;
grant execute on function public.megaphone_post(text, text[]) to authenticated;

-- self-check: expect 1 · 1
select count(*) as megaphone_tbl from information_schema.tables where table_name = 'megaphone_queue';
select count(*) as megaphone_fn from pg_proc where proname = 'megaphone_post';
