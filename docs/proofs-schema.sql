-- MISSION PROOFS — the city stops taking your word for it.
-- A member turns in a photo or clip as proof of a real-world mission;
-- it lands in a private storage bucket only they and the desk can
-- read. The desk reviews it — by eye, or with one tap that has the
-- AI eyes (the scan-proof edge function) read the image against the
-- mission brief and stamp a verdict. Nothing pays out on the honor
-- system anymore.

-- the vault: private bucket, 8 MB cap, members write only their own folder
insert into storage.buckets (id, name, public, file_size_limit)
values ('proofs', 'proofs', false, 8388608)
on conflict (id) do nothing;

drop policy if exists "members file their own proofs" on storage.objects;
create policy "members file their own proofs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "proofs are read by their owner and the desk" on storage.objects;
create policy "proofs are read by their owner and the desk"
  on storage.objects for select to authenticated
  using (bucket_id = 'proofs'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or auth.jwt() ->> 'email' = 'matthew@mccluster.org'));

-- the docket: one row per turned-in proof
create table if not exists public.mission_proofs (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz default now(),
  owner   uuid not null default auth.uid(),
  mission text not null,
  kind    text default '',
  path    text not null,
  note    text default '',
  status  text not null default 'new' check (status in ('new', 'passed', 'failed')),
  verdict text default ''
);
alter table public.mission_proofs enable row level security;

drop policy if exists "members file and read their own proofs" on public.mission_proofs;
create policy "members file and read their own proofs"
  on public.mission_proofs for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "owners and the desk read proofs" on public.mission_proofs;
create policy "owners and the desk read proofs"
  on public.mission_proofs for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

drop policy if exists "the desk rules on proofs" on public.mission_proofs;
create policy "the desk rules on proofs"
  on public.mission_proofs for update
  using (auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- self-check: expect 1 · 1
select count(*) as proofs_vault from storage.buckets where id = 'proofs';
select count(*) as proofs_docket from information_schema.tables where table_name = 'mission_proofs';
