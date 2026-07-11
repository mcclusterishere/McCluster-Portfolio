-- ============================================================
-- THE IMPRINT v2 — what you claim about yourself STAYS claimed,
-- and you can claim SEVERAL things at once. The member desk
-- remembers your faces (every "you" that runs the room), your
-- primary face, and your card paths — on the ACCOUNT, not the
-- device: any phone, any pass, the desk opens already sorted
-- to the whole combination. Safe to re-run; upgrades v1 in place.
-- ============================================================

alter table public.member_prefs add column if not exists face text;
alter table public.member_prefs add column if not exists paths text[];
alter table public.member_prefs add column if not exists faces text[];

-- v1 had a two-argument imprint; drop it so the three-argument
-- version below is the only door (PostgREST hates ambiguity)
drop function if exists public.imprint_desk(text, text[]);

create or replace function public.imprint_desk(p_face text, p_paths text[], p_faces text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f text;
  ps text[];
  fs text[];
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'why', 'signed out');
  end if;
  f := nullif(btrim(coalesce(p_face, '')), '');
  if f is not null and f !~ '^[A-Za-z][A-Za-z0-9 /&+.-]{0,23}$' then
    return jsonb_build_object('ok', false, 'why', 'that face reads wrong');
  end if;
  select array_agg(distinct t) into ps
    from unnest(coalesce(p_paths, '{}')) t
   where t in ('signal', 'infra', 'capital', 'culture', 'justice', 'access', 'proof', 'command');
  -- the faces: up to 12, each a clean name; an EMPTY array is a real
  -- choice (clearing your faces), so it writes — only null means
  -- "leave what's imprinted"
  if p_faces is not null then
    select coalesce(array_agg(distinct t), '{}') into fs
      from (select unnest(p_faces) as t limit 12) x
     where t ~ '^[A-Za-z][A-Za-z0-9 /&+.-]{0,23}$';
  end if;
  insert into member_prefs (owner, face, paths, faces)
  values (auth.uid(), f, ps, fs)
  on conflict (owner) do update
    set face  = coalesce(excluded.face,  member_prefs.face),
        paths = coalesce(excluded.paths, member_prefs.paths),
        faces = coalesce(excluded.faces, member_prefs.faces);
  return (select jsonb_build_object('ok', true, 'face', face,
                                    'paths', to_jsonb(coalesce(paths, '{}'::text[])),
                                    'faces', to_jsonb(coalesce(faces, '{}'::text[])))
            from member_prefs where owner = auth.uid());
end $$;
revoke all on function public.imprint_desk(text, text[], text[]) from public;
grant execute on function public.imprint_desk(text, text[], text[]) to authenticated;

create or replace function public.my_imprint()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(
    (select jsonb_build_object('face', face,
                               'paths', to_jsonb(coalesce(paths, '{}'::text[])),
                               'faces', to_jsonb(coalesce(faces, '{}'::text[])))
       from member_prefs where owner = auth.uid()),
    '{}'::jsonb);
$$;
revoke all on function public.my_imprint() from public;
grant execute on function public.my_imprint() to authenticated;

-- self-check: expect 2 · 1
select count(*) as imprint_fns from pg_proc where proname in ('imprint_desk', 'my_imprint');
select count(*) as faces_col from information_schema.columns
 where table_name = 'member_prefs' and column_name = 'faces';
