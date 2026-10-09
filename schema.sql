-- Curse of Strahd companion: database setup.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1. People and roles -------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'player' check (role in ('dm','player'))
);

create function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create function public.is_dm() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'dm', false) $$;

-- every new login gets a player profile automatically
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Characters -------------------------------------------------------------
-- sheet = the full D&D Beyond style sheet (abilities, skills, spells, gear, story)
-- live  = fast-changing play state (HP, temp HP, slots, conditions, inspiration)
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  kind text not null default 'pc' check (kind in ('pc','npc')),
  owner uuid references public.profiles(id),
  revealed boolean not null default true,      -- NPCs can be hidden until the DM reveals them
  portrait_path text,
  sheet jsonb not null default '{}'::jsonb,
  live jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. DM posts: recaps, handouts, NPC notes, maps, secrets ------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'recap' check (kind in ('recap','handout','npc','map','secret')),
  title text not null,
  body text not null default '',
  image_path text,
  revealed boolean not null default false,
  audience uuid[],                              -- null = every player, otherwise only these people
  created_at timestamptz not null default now()
);

-- 4. Player notes: private to their author -------------------------------------
create table public.player_notes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) default auth.uid(),
  character_id uuid references public.characters(id) on delete set null,
  body text not null default '',
  updated_at timestamptz not null default now()
);

-- 5. Combat: one row per encounter, DM controls it ------------------------------
create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default false,
  round int not null default 1,
  turn_index int not null default 0,
  combatants jsonb not null default '[]'::jsonb,  -- [{name, init, hp, maxHp, conditions, hidden, characterId}]
  updated_at timestamptz not null default now()
);

-- 6. Row-level security -----------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.characters   enable row level security;
alter table public.posts        enable row level security;
alter table public.player_notes enable row level security;
alter table public.encounters   enable row level security;

-- profiles: everyone signed in can see names; you edit your own name but never your role
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role());
create policy "profiles dm all" on public.profiles for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- characters: players see every revealed character, edit only their own; DM does everything
create policy "characters read" on public.characters for select to authenticated
  using (public.is_dm() or revealed or owner = auth.uid());
create policy "characters owner update" on public.characters for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy "characters dm all" on public.characters for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- posts: players only see revealed posts meant for them; only the DM writes
create policy "posts read" on public.posts for select to authenticated
  using (public.is_dm() or (revealed and (audience is null or auth.uid() = any(audience))));
create policy "posts dm write" on public.posts for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- notes: only the author can read or write (the DM cannot read player notes)
create policy "notes own" on public.player_notes for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- encounters: everyone reads, DM writes
create policy "encounters read" on public.encounters for select to authenticated using (true);
create policy "encounters dm write" on public.encounters for all to authenticated
  using (public.is_dm()) with check (public.is_dm());

-- 7. Image storage ------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('campaign', 'campaign', false)
  on conflict (id) do nothing;
create policy "campaign read" on storage.objects for select to authenticated
  using (bucket_id = 'campaign');
create policy "campaign dm write" on storage.objects for all to authenticated
  using (bucket_id = 'campaign' and public.is_dm())
  with check (bucket_id = 'campaign' and public.is_dm());

-- 8. Live updates ----------------------------------------------------------------------
alter publication supabase_realtime add table public.characters, public.posts, public.encounters;

-- 9. AFTER creating the four logins (Authentication -> Users -> Add user), make Sam and
--    yourself DMs. Replace the emails, then run this line on its own:
-- update public.profiles set role = 'dm'
--   where id in (select id from auth.users where email in ('YOUR_EMAIL','SAMS_EMAIL'));
