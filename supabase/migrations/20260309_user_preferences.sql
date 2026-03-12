create table if not exists public.user_preferences (
user_id text primary key,
offer text,
updated_at timestamp with time zone default now()
);

alter table public.user_preferences enable row level security;

-- Allow server-side access (Clerk auth is verified in the API)
create policy "Server access"
on public.user_preferences
for all
using (true)
with check (true);
