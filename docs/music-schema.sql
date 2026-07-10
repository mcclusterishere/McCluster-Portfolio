-- THE DISTRO — upload the record, keep everything.
-- Members put their music straight on the platform: the file lands in
-- a public streaming bucket (their own folder only), the row lands on
-- the rack, and fans back the artist DIRECTLY — no distributor, no
-- middleman, no fee to upload. Support flows over the same rails as
-- everything else (E-Up credit or card), straight to the artist.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracks', 'tracks', true, 26214400,
  array['audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/flac','audio/webm'])
on conflict (id) do nothing;

drop policy if exists "artists upload their own tracks" on storage.objects;
create policy "artists upload their own tracks"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tracks' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "artists pull their own tracks" on storage.objects;
create policy "artists pull their own tracks"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tracks' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.rack (
  id    uuid primary key default gen_random_uuid(),
  at    timestamptz default now(),
  owner uuid not null default auth.uid(),
  slug  text not null,
  title text not null check (char_length(title) between 1 and 80),
  path  text not null,
  kind  text default '',
  price numeric(10,2) not null default 0 check (price >= 0)
);
alter table public.rack enable row level security;

drop policy if exists "the rack is public" on public.rack;
create policy "the rack is public" on public.rack for select using (true);

drop policy if exists "artists rack their own records" on public.rack;
create policy "artists rack their own records"
  on public.rack for insert to authenticated
  with check (owner = auth.uid()
    and exists (select 1 from providers p where p.owner = auth.uid() and p.slug = rack.slug));

drop policy if exists "artists pull their own records" on public.rack;
create policy "artists pull their own records"
  on public.rack for delete
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- self-check: expect 1 · 1
select count(*) as distro_vault from storage.buckets where id = 'tracks';
select count(*) as distro_rack from information_schema.tables where table_name = 'rack';
