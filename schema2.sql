-- DM tools: quests and scene push. Run once in Supabase SQL Editor.
create table public.quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  status text not null default 'active' check (status in ('active','done','failed')),
  revealed boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  image_path text,
  active boolean not null default true,
  pushed_at timestamptz not null default now()
);
alter table public.quests enable row level security;
alter table public.scenes enable row level security;
create policy "quests read" on public.quests for select to authenticated using (public.is_dm() or revealed);
create policy "quests dm write" on public.quests for all to authenticated using (public.is_dm()) with check (public.is_dm());
create policy "scenes read" on public.scenes for select to authenticated using (true);
create policy "scenes dm write" on public.scenes for all to authenticated using (public.is_dm()) with check (public.is_dm());
alter publication supabase_realtime add table public.quests, public.scenes;
