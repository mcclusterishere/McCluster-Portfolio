-- ============================================================
-- RATINGS — reputation from the people who'd know.
-- Clients (paid you through a real deal) weigh ~3× peers.
-- One live rating per rater per subject; re-rating updates it.
-- Ratings are PUBLIC to read — reputation only works out loud.
-- Paste into Supabase → SQL editor → Run. Safe to re-run.
-- ============================================================

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  subject_slug text not null,                -- the listing being rated
  rater uuid not null,                       -- who's talking
  role text not null check (role in ('client','peer')),
  stars int not null check (stars between 1 and 5),
  note text default '' check (char_length(note) <= 400),
  deal_id uuid references deals(id) on delete set null,
  created_at timestamptz default now(),
  unique (subject_slug, rater)
);

create index if not exists ratings_subject_idx on ratings (subject_slug);

alter table ratings enable row level security;

drop policy if exists "reputation is public" on ratings;
create policy "reputation is public"
  on ratings for select using (true);

-- a CLIENT rating requires a real paid/completed deal between the two;
-- a PEER rating just requires being signed in. Nobody rates themselves.
drop policy if exists "members rate their people" on ratings;
create policy "members rate their people"
  on ratings for insert with check (
    rater = auth.uid()
    and not exists (select 1 from providers p where p.slug = ratings.subject_slug and p.owner = auth.uid())
    and (
      role = 'peer'
      or exists (
        select 1 from deals d
        where d.id = ratings.deal_id
          and d.from_owner = auth.uid()
          and d.to_slug = ratings.subject_slug
          and d.status in ('paid','completed')
      )
    )
  );

drop policy if exists "raters edit their own word" on ratings;
create policy "raters edit their own word"
  on ratings for update using (rater = auth.uid()) with check (rater = auth.uid());
