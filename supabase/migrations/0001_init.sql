-- Repwise — initial schema
-- Run in the Supabase SQL Editor (or `supabase db push`).
--
-- Every user-owned table has Row Level Security enabled with a policy scoped to
-- auth.uid(). Without RLS any authenticated user could read every other user's
-- body stats, workout logs and chat history — Supabase's anon key is public by
-- design, so RLS *is* the access control layer, not a nice-to-have.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type sex_type            as enum ('male', 'female', 'other');
create type experience_level    as enum ('beginner', 'intermediate', 'advanced');
create type fitness_goal        as enum ('lose_fat', 'build_muscle', 'gain_strength', 'stay_fit');
create type training_location   as enum ('home', 'gym');
create type activity_level      as enum ('sedentary', 'light', 'moderate', 'active', 'very_active');
create type meal_type           as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type chat_role           as enum ('user', 'assistant');
create type equipment_type      as enum (
  'bodyweight', 'dumbbell', 'barbell', 'kettlebell', 'resistance_band',
  'pull_up_bar', 'bench', 'machine', 'cable', 'medicine_ball'
);

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, holds everything the AI personalises on
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  full_name             text,
  phone                 text,
  date_of_birth         date,
  sex                   sex_type,
  height_cm             numeric(5, 1),
  weight_kg             numeric(5, 1),
  experience_level      experience_level,
  goal                  fitness_goal,
  training_location     training_location,
  available_equipment   equipment_type[] not null default '{}',
  days_per_week         smallint check (days_per_week between 1 and 7),
  activity_level        activity_level,
  dietary_preference    text,
  allergies             text[] not null default '{}',
  injuries              text,
  onboarding_completed  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create the profile row automatically the moment a user signs up, so the app
-- never has to handle a logged-in user with no profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- exercises — shared read-only library, not user-owned
-- ---------------------------------------------------------------------------

create table public.exercises (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  primary_muscle     text not null,
  secondary_muscles  text[] not null default '{}',
  equipment          equipment_type not null,
  is_bodyweight      boolean not null default false,
  is_compound        boolean not null default false,
  difficulty         experience_level not null default 'beginner',
  instructions       text,
  created_at         timestamptz not null default now()
);

create index exercises_equipment_idx      on public.exercises (equipment);
create index exercises_primary_muscle_idx on public.exercises (primary_muscle);

-- ---------------------------------------------------------------------------
-- Workout plans
-- ---------------------------------------------------------------------------

create table public.workout_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  goal           fitness_goal not null,
  location       training_location not null,
  days_per_week  smallint not null check (days_per_week between 1 and 7),
  summary        text,
  is_active      boolean not null default true,
  generated_at   timestamptz not null default now()
);

create index workout_plans_user_idx on public.workout_plans (user_id, is_active);

create table public.plan_days (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.workout_plans(id) on delete cascade,
  day_index  smallint not null,
  name       text not null,
  focus      text,
  unique (plan_id, day_index)
);

create index plan_days_plan_idx on public.plan_days (plan_id);

create table public.plan_exercises (
  id            uuid primary key default gen_random_uuid(),
  plan_day_id   uuid not null references public.plan_days(id) on delete cascade,
  exercise_id   uuid not null references public.exercises(id) on delete restrict,
  position      smallint not null,
  target_sets   smallint not null check (target_sets between 1 and 12),
  target_reps   text not null,               -- "8-12" or "AMRAP", so text not int
  rest_seconds  smallint not null default 90,
  notes         text,
  unique (plan_day_id, position)
);

create index plan_exercises_day_idx on public.plan_exercises (plan_day_id);

-- ---------------------------------------------------------------------------
-- Workout logging
-- ---------------------------------------------------------------------------

create table public.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  plan_day_id  uuid references public.plan_days(id) on delete set null,  -- null = freestyle
  name         text not null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  notes        text
);

create index workout_sessions_user_idx on public.workout_sessions (user_id, started_at desc);

create table public.set_logs (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id) on delete restrict,
  set_number   smallint not null check (set_number > 0),
  weight_kg    numeric(6, 2) check (weight_kg >= 0),
  reps         smallint check (reps >= 0),
  rpe          numeric(3, 1) check (rpe between 1 and 10),
  completed    boolean not null default true,
  logged_at    timestamptz not null default now(),
  unique (session_id, exercise_id, set_number)
);

create index set_logs_session_idx  on public.set_logs (session_id);
create index set_logs_exercise_idx on public.set_logs (exercise_id, logged_at desc);

-- ---------------------------------------------------------------------------
-- Diet
-- ---------------------------------------------------------------------------

create table public.diet_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  target_kcal   integer not null check (target_kcal > 0),
  protein_g     integer not null check (protein_g >= 0),
  carbs_g       integer not null check (carbs_g >= 0),
  fat_g         integer not null check (fat_g >= 0),
  summary       text,
  is_active     boolean not null default true,
  generated_at  timestamptz not null default now()
);

create index diet_plans_user_idx on public.diet_plans (user_id, is_active);

create table public.diet_plan_meals (
  id            uuid primary key default gen_random_uuid(),
  diet_plan_id  uuid not null references public.diet_plans(id) on delete cascade,
  meal_type     meal_type not null,
  position      smallint not null default 0,
  name          text not null,
  description   text,
  kcal          integer not null check (kcal >= 0),
  protein_g     integer not null check (protein_g >= 0),
  carbs_g       integer not null check (carbs_g >= 0),
  fat_g         integer not null check (fat_g >= 0)
);

create index diet_plan_meals_plan_idx on public.diet_plan_meals (diet_plan_id);

create table public.meal_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  logged_on   date not null default current_date,
  meal_type   meal_type not null,
  name        text not null,
  kcal        integer not null check (kcal >= 0),
  protein_g   integer not null default 0 check (protein_g >= 0),
  carbs_g     integer not null default 0 check (carbs_g >= 0),
  fat_g       integer not null default 0 check (fat_g >= 0),
  created_at  timestamptz not null default now()
);

create index meal_logs_user_day_idx on public.meal_logs (user_id, logged_on desc);

-- ---------------------------------------------------------------------------
-- Bodyweight tracking
-- ---------------------------------------------------------------------------

create table public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  weight_kg  numeric(5, 1) not null check (weight_kg > 0),
  logged_on  date not null default current_date,
  unique (user_id, logged_on)
);

create index weight_logs_user_idx on public.weight_logs (user_id, logged_on desc);

-- ---------------------------------------------------------------------------
-- AI coach chat
-- ---------------------------------------------------------------------------

create table public.chat_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index chat_threads_user_idx on public.chat_threads (user_id, updated_at desc);

create trigger chat_threads_touch_updated_at
  before update on public.chat_threads
  for each row execute function public.touch_updated_at();

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        chat_role not null,
  content     text not null,
  created_at  timestamptz not null default now()
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.exercises        enable row level security;
alter table public.workout_plans    enable row level security;
alter table public.plan_days        enable row level security;
alter table public.plan_exercises   enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.set_logs         enable row level security;
alter table public.diet_plans       enable row level security;
alter table public.diet_plan_meals  enable row level security;
alter table public.meal_logs        enable row level security;
alter table public.weight_logs      enable row level security;
alter table public.chat_threads     enable row level security;
alter table public.chat_messages    enable row level security;

-- profiles: a user sees and edits only their own row.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- exercises: shared library, readable by any signed-in user, writable by none.
-- Seeding is done with the service-role key, which bypasses RLS.
create policy "exercises_select_authenticated" on public.exercises
  for select to authenticated using (true);

-- Directly-owned tables: one policy covering all commands.
create policy "workout_plans_own" on public.workout_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "workout_sessions_own" on public.workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "diet_plans_own" on public.diet_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "meal_logs_own" on public.meal_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "weight_logs_own" on public.weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chat_threads_own" on public.chat_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chat_messages_own" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Child tables have no user_id of their own, so ownership is proved by walking
-- up to the parent. Without these, child rows would be readable by everyone.
create policy "plan_days_own" on public.plan_days
  for all using (
    exists (
      select 1 from public.workout_plans p
      where p.id = plan_days.plan_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workout_plans p
      where p.id = plan_days.plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_exercises_own" on public.plan_exercises
  for all using (
    exists (
      select 1 from public.plan_days d
      join public.workout_plans p on p.id = d.plan_id
      where d.id = plan_exercises.plan_day_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.plan_days d
      join public.workout_plans p on p.id = d.plan_id
      where d.id = plan_exercises.plan_day_id and p.user_id = auth.uid()
    )
  );

create policy "set_logs_own" on public.set_logs
  for all using (
    exists (
      select 1 from public.workout_sessions s
      where s.id = set_logs.session_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workout_sessions s
      where s.id = set_logs.session_id and s.user_id = auth.uid()
    )
  );

create policy "diet_plan_meals_own" on public.diet_plan_meals
  for all using (
    exists (
      select 1 from public.diet_plans dp
      where dp.id = diet_plan_meals.diet_plan_id and dp.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.diet_plans dp
      where dp.id = diet_plan_meals.diet_plan_id and dp.user_id = auth.uid()
    )
  );
