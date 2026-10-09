-- Messaging: threads and messages. Run once in Supabase SQL Editor.
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'party' check (kind in ('party','whisper','secret')),
  title text not null default 'Party chat',
  members uuid[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.threads enable row level security;
alter table public.messages enable row level security;

-- threads: see those you're in; only DM or creator can edit
create policy "threads read" on public.threads for select to authenticated
  using (auth.uid() = any(members) or public.is_dm());
create policy "threads create" on public.threads for insert to authenticated
  with check (public.is_dm() or auth.uid() = created_by);
create policy "threads update" on public.threads for update to authenticated
  using (public.is_dm() or auth.uid() = created_by)
  with check (public.is_dm() or auth.uid() = created_by);

-- messages: see those in threads you're in
create policy "messages read" on public.messages for select to authenticated
  using (thread_id in (select id from public.threads where auth.uid() = any(members) or public.is_dm()));
create policy "messages send" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and 
    thread_id in (select id from public.threads where auth.uid() = any(members)));

alter publication supabase_realtime add table public.threads, public.messages;
