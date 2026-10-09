-- Messaging upgrades: image attachments and read tracking. Run once in Supabase SQL Editor.

alter table public.messages add column if not exists image_path text;

create table public.message_reads (
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table public.message_reads enable row level security;

-- a player only ever reads or writes their own read-receipt row
create policy "reads own" on public.message_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.message_reads;
