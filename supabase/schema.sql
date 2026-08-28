-- ===========================================================================
-- Repwise — complete database schema
-- ===========================================================================
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   Then run supabase/seed.sql the same way to populate the exercise library.
--
--   (CLI alternative: `supabase db push`, which applies supabase/migrations/*.)
--
-- This script is IDEMPOTENT — running it twice is safe and non-destructive.
-- Every create is guarded, every policy is dropped before being recreated, and
-- no statement drops a table or deletes a row.
--
-- SECURITY MODEL
--   Supabase's anon/publishable key ships to the browser by design, so Row
--   Level Security *is* the access control layer, not a hardening extra. Every
--   user-owned table below enables RLS with a policy scoped to auth.uid().
--   Child tables (plan_days, set_logs, ...) carry no user_id of their own, so
--   they prove ownership by walking up to their parent.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
-- `create type` has no IF NOT EXISTS, so each is wrapped to swallow the
-- duplicate_object error on a re-run.

do $$ begin
  create type sex_type as enum ('male', 'female', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type experience_level as enum ('beginner', 'intermediate', 'advanced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fitness_goal as enum ('lose_fat', 'build_muscle', 'gain_strength', 'stay_fit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type training_location as enum ('home', 'gym');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_level as enum ('sedentary', 'light', 'moderate', 'active', 'very_active');
exception when duplicate_object then null; end $$;

do $$ begin
  create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type equipment_type as enum (
    'bodyweight', 'dumbbell', 'barbell', 'kettlebell', 'resistance_band',
    'pull_up_bar', 'bench', 'machine', 'cable', 'medicine_ball'
  );
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 2. Shared helper — keep updated_at honest
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
-- 3. profiles — one row per auth user; everything the AI personalises on
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
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

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create the profile row the moment a user signs up, so the app never has to
-- handle a signed-in user with no profile.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 4. exercises — shared read-only library, not user-owned
-- ---------------------------------------------------------------------------

create table if not exists public.exercises (
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

create index if not exists exercises_equipment_idx      on public.exercises (equipment);
create index if not exists exercises_primary_muscle_idx on public.exercises (primary_muscle);


-- ---------------------------------------------------------------------------
-- 5. Workout plans  (the "Plan" section)
-- ---------------------------------------------------------------------------

create table if not exists public.workout_plans (
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

create index if not exists workout_plans_user_idx on public.workout_plans (user_id, is_active);

create table if not exists public.plan_days (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.workout_plans(id) on delete cascade,
  day_index  smallint not null,
  name       text not null,
  focus      text,
  unique (plan_id, day_index)
);

create index if not exists plan_days_plan_idx on public.plan_days (plan_id);

create table if not exists public.plan_exercises (
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

create index if not exists plan_exercises_day_idx on public.plan_exercises (plan_day_id);


-- ---------------------------------------------------------------------------
-- 6. Workout logging  (feeds the Dashboard and Progress sections)
-- ---------------------------------------------------------------------------

create table if not exists public.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  plan_day_id  uuid references public.plan_days(id) on delete set null,  -- null = freestyle
  name         text not null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  notes        text
);

create index if not exists workout_sessions_user_idx on public.workout_sessions (user_id, started_at desc);

create table if not exists public.set_logs (
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

create index if not exists set_logs_session_idx  on public.set_logs (session_id);
create index if not exists set_logs_exercise_idx on public.set_logs (exercise_id, logged_at desc);


-- ---------------------------------------------------------------------------
-- 7. Diet  (the "Diet" section)
-- ---------------------------------------------------------------------------

create table if not exists public.diet_plans (
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

create index if not exists diet_plans_user_idx on public.diet_plans (user_id, is_active);

create table if not exists public.diet_plan_meals (
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

create index if not exists diet_plan_meals_plan_idx on public.diet_plan_meals (diet_plan_id);

-- What the user actually ate, as opposed to what was prescribed.
create table if not exists public.meal_logs (
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

create index if not exists meal_logs_user_day_idx on public.meal_logs (user_id, logged_on desc);


-- ---------------------------------------------------------------------------
-- 8. Progress tracking  (the "Progress" section)
-- ---------------------------------------------------------------------------

create table if not exists public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  weight_kg  numeric(5, 1) not null check (weight_kg > 0),
  logged_on  date not null default current_date,
  unique (user_id, logged_on)
);

create index if not exists weight_logs_user_idx on public.weight_logs (user_id, logged_on desc);

-- Tape-measure and body-fat tracking. Every column past the date is nullable:
-- people measure whichever sites they care about, and forcing a full set would
-- mean logging nothing on the days they only check their waist.
create table if not exists public.body_measurements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  logged_on      date not null default current_date,
  body_fat_pct   numeric(4, 1) check (body_fat_pct between 1 and 70),
  neck_cm        numeric(5, 1) check (neck_cm > 0),
  chest_cm       numeric(5, 1) check (chest_cm > 0),
  waist_cm       numeric(5, 1) check (waist_cm > 0),
  hips_cm        numeric(5, 1) check (hips_cm > 0),
  left_arm_cm    numeric(5, 1) check (left_arm_cm > 0),
  right_arm_cm   numeric(5, 1) check (right_arm_cm > 0),
  left_thigh_cm  numeric(5, 1) check (left_thigh_cm > 0),
  right_thigh_cm numeric(5, 1) check (right_thigh_cm > 0),
  notes          text,
  created_at     timestamptz not null default now(),
  unique (user_id, logged_on)
);

create index if not exists body_measurements_user_idx on public.body_measurements (user_id, logged_on desc);

-- Best-ever effort per exercise. Maintained by trigger (section 10) rather than
-- by the app, so a PR is recorded no matter which code path logged the set.
create table if not exists public.personal_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  exercise_id   uuid not null references public.exercises(id) on delete cascade,
  weight_kg     numeric(6, 2) not null check (weight_kg >= 0),
  reps          smallint not null check (reps > 0),
  -- Epley estimated 1RM. Stored rather than computed on read so the "best" row
  -- can be picked with a plain ORDER BY, and so history survives a formula change.
  est_one_rep_max numeric(6, 2) not null,
  set_log_id    uuid references public.set_logs(id) on delete set null,
  achieved_on   date not null default current_date,
  created_at    timestamptz not null default now(),
  unique (user_id, exercise_id)
);

create index if not exists personal_records_user_idx on public.personal_records (user_id, est_one_rep_max desc);


-- ---------------------------------------------------------------------------
-- 9. AI coach chat  (the "Coach" section)
-- ---------------------------------------------------------------------------

create table if not exists public.chat_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists chat_threads_user_idx on public.chat_threads (user_id, updated_at desc);

drop trigger if exists chat_threads_touch_updated_at on public.chat_threads;
create trigger chat_threads_touch_updated_at
  before update on public.chat_threads
  for each row execute function public.touch_updated_at();

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        chat_role not null,
  content     text not null,
  -- Which model produced an assistant turn. Null for user turns. Kept so a
  -- thread stays interpretable after the app switches models.
  model       text,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

-- Added after the initial release; guarded so re-running on an older database
-- backfills the column instead of failing.
alter table public.chat_messages add column if not exists model text;


-- ---------------------------------------------------------------------------
-- 10. Personal-record maintenance
-- ---------------------------------------------------------------------------
-- Fires on every logged set. security definer because it writes to
-- personal_records on the user's behalf and must not be blocked by that table's
-- own RLS policy; the user_id it writes is read from the parent session, never
-- from the caller, so it cannot be tricked into writing a row for someone else.

create or replace function public.record_personal_best()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  session_user_id uuid;
  capped_reps     smallint;
  e1rm            numeric(6, 2);
begin
  -- Only completed sets with real numbers on both sides can be a record.
  if new.completed is not true
     or new.weight_kg is null or new.weight_kg <= 0
     or new.reps is null      or new.reps <= 0 then
    return new;
  end if;

  select s.user_id into session_user_id
  from public.workout_sessions s
  where s.id = new.session_id;

  if session_user_id is null then
    return new;
  end if;

  -- Epley, capped at 12 reps — the formula loses all meaning in high-rep sets,
  -- and an uncapped 30-rep bodyweight set would otherwise register as a PR that
  -- no amount of real strength could ever beat. Mirrors estimateOneRepMax() in
  -- lib/fitness/metrics.ts; change both together.
  capped_reps := least(new.reps, 12);
  e1rm := round(new.weight_kg * (1 + capped_reps::numeric / 30), 2);

  insert into public.personal_records
    (user_id, exercise_id, weight_kg, reps, est_one_rep_max, set_log_id, achieved_on)
  values
    (session_user_id, new.exercise_id, new.weight_kg, new.reps, e1rm, new.id, current_date)
  on conflict (user_id, exercise_id) do update
    set weight_kg       = excluded.weight_kg,
        reps            = excluded.reps,
        est_one_rep_max = excluded.est_one_rep_max,
        set_log_id      = excluded.set_log_id,
        achieved_on     = excluded.achieved_on
    -- Strictly greater: ties keep the older row, so achieved_on stays the date
    -- the user first hit the number rather than the last time they matched it.
    where excluded.est_one_rep_max > public.personal_records.est_one_rep_max;

  return new;
end;
$$;

drop trigger if exists set_logs_record_pr on public.set_logs;
create trigger set_logs_record_pr
  after insert or update on public.set_logs
  for each row execute function public.record_personal_best();


-- ---------------------------------------------------------------------------
-- 11. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.exercises         enable row level security;
alter table public.workout_plans     enable row level security;
alter table public.plan_days         enable row level security;
alter table public.plan_exercises    enable row level security;
alter table public.workout_sessions  enable row level security;
alter table public.set_logs          enable row level security;
alter table public.diet_plans        enable row level security;
alter table public.diet_plan_meals   enable row level security;
alter table public.meal_logs         enable row level security;
alter table public.weight_logs       enable row level security;
alter table public.body_measurements enable row level security;
alter table public.personal_records  enable row level security;
alter table public.chat_threads      enable row level security;
alter table public.chat_messages     enable row level security;

-- profiles: a user sees and edits only their own row. No delete policy —
-- profiles are removed by the cascade from auth.users, never by the app.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- exercises: shared library, readable by any signed-in user, writable by none.
-- Seeding runs as the postgres role in the SQL Editor, which bypasses RLS.
drop policy if exists "exercises_select_authenticated" on public.exercises;
create policy "exercises_select_authenticated" on public.exercises
  for select to authenticated using (true);

-- Directly-owned tables: one policy each, covering all commands.
drop policy if exists "workout_plans_own" on public.workout_plans;
create policy "workout_plans_own" on public.workout_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "workout_sessions_own" on public.workout_sessions;
create policy "workout_sessions_own" on public.workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "diet_plans_own" on public.diet_plans;
create policy "diet_plans_own" on public.diet_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meal_logs_own" on public.meal_logs;
create policy "meal_logs_own" on public.meal_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "weight_logs_own" on public.weight_logs;
create policy "weight_logs_own" on public.weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "body_measurements_own" on public.body_measurements;
create policy "body_measurements_own" on public.body_measurements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "personal_records_own" on public.personal_records;
create policy "personal_records_own" on public.personal_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "chat_threads_own" on public.chat_threads;
create policy "chat_threads_own" on public.chat_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "chat_messages_own" on public.chat_messages;
create policy "chat_messages_own" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Child tables have no user_id, so ownership is proved by walking up to the
-- parent. Without these, child rows would be readable by every signed-in user.
drop policy if exists "plan_days_own" on public.plan_days;
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

drop policy if exists "plan_exercises_own" on public.plan_exercises;
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

drop policy if exists "set_logs_own" on public.set_logs;
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

drop policy if exists "diet_plan_meals_own" on public.diet_plan_meals;
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
