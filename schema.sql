-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- 1. Profiles table - links Supabase Auth to your student_id
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  gmail text unique not null,
  student_id uuid default uuid_generate_v4() unique not null,
  created_at timestamp with time zone default now()
);

-- Auto-create profile on new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, gmail)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Rooms
create table public.rooms (
  id uuid default uuid_generate_v4() primary key,
  created_by uuid references public.profiles(id),
  schedule jsonb not null,
  content_text text not null,
  status text default 'scheduled',
  created_at timestamp with time zone default now()
);

-- 3. Room members + points
create table public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  points integer default 100,
  showed_up boolean default false,
  joined_at timestamp with time zone default now(),
  primary key (room_id, user_id)
);

-- 4. Sessions
create table public.sessions (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.rooms(id) on delete cascade,
  timer_duration integer not null,
  timer_end_at timestamp with time zone,
  extension_count integer default 0,
  status text default 'active',
  quiz_questions jsonb default null
);

-- 5. Chat messages
create table public.chat_messages (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  user_id uuid references public.profiles(id),
  message text not null,
  is_offtopic boolean default false,
  created_at timestamp with time zone default now()
);

-- 6. Test results
create table public.test_results (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  user_id uuid references public.profiles(id),
  answers jsonb,
  score integer,
  time_taken integer,
  submitted_at timestamp with time zone default now()
);

-- 7. Mindmaps
create table public.mindmaps (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  user_id uuid references public.profiles(id),
  mermaid_code text
);

-- 8. Flashcards
create table public.flashcards (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  user_id uuid references public.profiles(id),
  cards_json jsonb
);

-- RPC function for atomic point deduction
create or replace function public.deduct_points(p_room_id uuid, p_user_id uuid, p_amount integer)
returns void as $$
begin
  update public.room_members
  set points = points - p_amount
  where room_id = p_room_id and user_id = p_user_id;
end;
$$ language plpgsql security definer;
