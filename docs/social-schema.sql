-- THE PAGE — the artist-first social layer.
-- Creators (anyone with a listing) post; supporters follow and comment
-- but never post; every creator can export their own fan book. RLS is
-- the law on every table: the database itself enforces "fans can't
-- post" — not the UI.

-- the vibe: each listing carries its page design (accent, background,
-- cover, links, layout) as one document
alter table providers add column if not exists page jsonb;

-- 1 · POSTS — creators only. The insert policy checks the author owns
--     a listing with that slug; there is no other way in.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  slug text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
drop policy if exists "anyone reads posts" on public.posts;
create policy "anyone reads posts" on public.posts for select using (true);
drop policy if exists "creators post to their own page" on public.posts;
create policy "creators post to their own page" on public.posts for insert
  with check (
    owner = auth.uid()
    and exists (select 1 from providers p where p.owner = auth.uid() and p.slug = posts.slug)
  );
drop policy if exists "creators delete their own posts" on public.posts;
create policy "creators delete their own posts" on public.posts for delete
  using (owner = auth.uid());

-- 2 · SUPPORTERS — the fan profile. One per account, handle is public.
create table if not exists public.supporters (
  owner uuid primary key default auth.uid(),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  name text check (char_length(name) <= 60),
  created_at timestamptz not null default now()
);
alter table public.supporters enable row level security;
drop policy if exists "handles are public" on public.supporters;
create policy "handles are public" on public.supporters for select using (true);
drop policy if exists "you make your own supporter profile" on public.supporters;
create policy "you make your own supporter profile" on public.supporters for insert
  with check (owner = auth.uid());
drop policy if exists "you edit your own supporter profile" on public.supporters;
create policy "you edit your own supporter profile" on public.supporters for update
  using (owner = auth.uid());

-- 3 · FOLLOWS — a supporter follows creators across every niche.
create table if not exists public.follows (
  supporter uuid not null references public.supporters(owner) on delete cascade,
  creator_slug text not null,
  created_at timestamptz not null default now(),
  primary key (supporter, creator_slug)
);
alter table public.follows enable row level security;
drop policy if exists "follow counts are public" on public.follows;
create policy "follow counts are public" on public.follows for select using (true);
drop policy if exists "supporters follow" on public.follows;
create policy "supporters follow" on public.follows for insert
  with check (supporter = auth.uid());
drop policy if exists "supporters unfollow" on public.follows;
create policy "supporters unfollow" on public.follows for delete
  using (supporter = auth.uid());

-- 4 · COMMENTS — supporters speak under posts; creators moderate theirs.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  supporter uuid not null default auth.uid() references public.supporters(owner),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
drop policy if exists "anyone reads comments" on public.comments;
create policy "anyone reads comments" on public.comments for select using (true);
drop policy if exists "supporters comment" on public.comments;
create policy "supporters comment" on public.comments for insert
  with check (supporter = auth.uid() and exists (select 1 from supporters s where s.owner = auth.uid()));
drop policy if exists "you delete your own comment" on public.comments;
create policy "you delete your own comment" on public.comments for delete
  using (supporter = auth.uid());
drop policy if exists "creators moderate their page" on public.comments;
create policy "creators moderate their page" on public.comments for delete
  using (exists (select 1 from posts p where p.id = comments.post_id and p.owner = auth.uid()));

-- 5 · THE FAN BOOK — the export. A creator reads their own supporters
--     (followers + commenters), nobody else's. Security definer so the
--     join crosses RLS, gated inside to the caller's own slugs.
create or replace function public.my_supporters()
returns table (handle text, name text, followed_at timestamptz, comment_count bigint)
language sql security definer set search_path = public as $$
  with my_slugs as (select slug from providers where owner = auth.uid())
  select s.handle, s.name, f.created_at as followed_at,
    (select count(*) from comments c join posts p on p.id = c.post_id
      where c.supporter = s.owner and p.owner = auth.uid()) as comment_count
  from follows f
  join supporters s on s.owner = f.supporter
  where f.creator_slug in (select slug from my_slugs)
  union
  select s.handle, s.name, null, count(c.id)
  from comments c
  join posts p on p.id = c.post_id and p.owner = auth.uid()
  join supporters s on s.owner = c.supporter
  where not exists (select 1 from follows f2 where f2.supporter = s.owner
    and f2.creator_slug in (select slug from providers where owner = auth.uid()))
  group by s.handle, s.name;
$$;
grant execute on function public.my_supporters() to authenticated;

-- self-check: expect 4 | 1
select
  (select count(*) from information_schema.tables
    where table_name in ('posts','supporters','follows','comments')) as social_tables,
  (select count(*) from pg_proc where proname = 'my_supporters') as fan_book;
