-- ===========================================================================
-- Repwise — ONE-SHOT Supabase setup  (schema + exercise library)
-- ===========================================================================
-- Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Idempotent: safe to run more than once. Nothing here drops a table or a row.
--
-- Generated from supabase/schema.sql + supabase/seed.sql. Edit those, not this.
-- ===========================================================================

-- ===========================================================================
-- Repwise â€” complete database schema
-- ===========================================================================
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   Then run supabase/seed.sql the same way to populate the exercise library.
--
--   (CLI alternative: `supabase db push`, which applies supabase/migrations/*.)
--
-- This script is IDEMPOTENT â€” running it twice is safe and non-destructive.
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
-- 2. Shared helper â€” keep updated_at honest
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
-- 3. profiles â€” one row per auth user; everything the AI personalises on
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
-- 4. exercises â€” shared read-only library, not user-owned
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

  -- Epley, capped at 12 reps â€” the formula loses all meaning in high-rep sets,
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

-- profiles: a user sees and edits only their own row. No delete policy â€”
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


-- ===========================================================================
-- PART 2 — exercise library seed (~90 exercises, home + gym)
-- ===========================================================================
-- Repwise â€” exercise library seed
--
-- Run AFTER 0001_init.sql. Safe to re-run: every row upserts on `slug`.
--
-- Deliberately balanced between home-viable equipment (bodyweight, dumbbell,
-- band, pull-up bar) and gym equipment (barbell, machine, cable). The AI plan
-- generator may only choose exercises from this table whose `equipment` is in
-- the user's `available_equipment`, so a thin home section here would produce
-- thin home plans.

insert into public.exercises
  (slug, name, primary_muscle, secondary_muscles, equipment, is_bodyweight, is_compound, difficulty, instructions)
values
-- ============================== CHEST ==============================
('push-up', 'Push-Up', 'chest', '{triceps,shoulders,core}', 'bodyweight', true, true, 'beginner',
 'Hands slightly wider than shoulders. Keep a straight line from head to heels, brace the core, lower until the chest is just above the floor, then press away.'),
('incline-push-up', 'Incline Push-Up', 'chest', '{triceps,shoulders}', 'bodyweight', true, true, 'beginner',
 'Hands elevated on a bench, step or sturdy table. The higher the hands, the easier the movement â€” the go-to regression for a first push-up.'),
('decline-push-up', 'Decline Push-Up', 'chest', '{shoulders,triceps}', 'bodyweight', true, true, 'intermediate',
 'Feet elevated on a chair or bench. Shifts load toward the upper chest and front delts.'),
('diamond-push-up', 'Diamond Push-Up', 'triceps', '{chest,shoulders}', 'bodyweight', true, true, 'intermediate',
 'Hands together under the chest forming a diamond. Keep elbows tucked close to the ribs.'),
('dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', '{triceps,shoulders}', 'dumbbell', false, true, 'beginner',
 'Lie on a bench, dumbbells at chest level, wrists stacked over elbows. Press up and slightly together without locking out hard.'),
('dumbbell-floor-press', 'Dumbbell Floor Press', 'chest', '{triceps}', 'dumbbell', false, true, 'beginner',
 'Bench-press variation performed lying on the floor. The floor limits the range of motion, which is easier on the shoulders and needs no bench.'),
('dumbbell-fly', 'Dumbbell Fly', 'chest', '{shoulders}', 'dumbbell', false, false, 'intermediate',
 'Slight bend in the elbows held constant. Open the arms wide in an arc, feel the stretch, then hug them back together.'),
('incline-dumbbell-press', 'Incline Dumbbell Press', 'chest', '{shoulders,triceps}', 'dumbbell', false, true, 'intermediate',
 'Bench set to roughly 30 degrees. Emphasises the upper chest.'),
('barbell-bench-press', 'Barbell Bench Press', 'chest', '{triceps,shoulders}', 'barbell', false, true, 'intermediate',
 'Shoulder blades retracted and pinned to the bench, feet planted. Lower to mid-chest with control, press back to lockout. Use a spotter when going heavy.'),
('incline-barbell-press', 'Incline Barbell Press', 'chest', '{shoulders,triceps}', 'barbell', false, true, 'intermediate',
 'Bench at 30-45 degrees. Bar touches the upper chest just below the collarbone.'),
('chest-press-machine', 'Chest Press Machine', 'chest', '{triceps,shoulders}', 'machine', false, true, 'beginner',
 'Seat height set so the handles sit level with mid-chest. The fixed path makes this a safe heavy option without a spotter.'),
('cable-crossover', 'Cable Crossover', 'chest', '{shoulders}', 'cable', false, false, 'intermediate',
 'Pulleys set high, slight forward lean. Sweep the handles down and together in front of the hips.'),
('band-chest-press', 'Resistance Band Chest Press', 'chest', '{triceps,shoulders}', 'resistance_band', false, true, 'beginner',
 'Anchor the band behind you at chest height. Press forward until the arms are straight, resisting the return.'),

-- ============================== BACK ==============================
('pull-up', 'Pull-Up', 'back', '{biceps,forearms}', 'pull_up_bar', true, true, 'advanced',
 'Overhand grip just wider than shoulders. Pull the elbows down to the ribs until the chin clears the bar, lower under control.'),
('chin-up', 'Chin-Up', 'back', '{biceps}', 'pull_up_bar', true, true, 'intermediate',
 'Underhand grip, shoulder width. Slightly easier than a pull-up and heavier on the biceps.'),
('inverted-row', 'Inverted Row', 'back', '{biceps,core}', 'bodyweight', true, true, 'beginner',
 'Lie under a bar or sturdy table, body straight, pull the chest to the edge. Walk the feet in to make it easier.'),
('superman', 'Superman', 'back', '{glutes,hamstrings}', 'bodyweight', true, false, 'beginner',
 'Face down, lift the chest, arms and thighs off the floor together. Hold briefly at the top.'),
('dumbbell-row', 'Single-Arm Dumbbell Row', 'back', '{biceps,forearms}', 'dumbbell', false, true, 'beginner',
 'One knee and hand on a bench, back flat. Pull the dumbbell to the hip, keeping the elbow close to the body.'),
('dumbbell-bent-over-row', 'Bent-Over Dumbbell Row', 'back', '{biceps,core}', 'dumbbell', false, true, 'intermediate',
 'Hinge at the hips to roughly 45 degrees, spine neutral. Row both dumbbells to the lower ribs.'),
('dumbbell-pullover', 'Dumbbell Pullover', 'back', '{chest,triceps}', 'dumbbell', false, false, 'intermediate',
 'Lie across or along a bench, arms nearly straight. Lower one dumbbell behind the head, then pull it back over the chest.'),
('barbell-row', 'Barbell Bent-Over Row', 'back', '{biceps,core}', 'barbell', false, true, 'intermediate',
 'Hinge forward with a flat back, bar hanging at arm''s length. Row to the navel and lower with control.'),
('deadlift', 'Barbell Deadlift', 'back', '{hamstrings,glutes,core,forearms}', 'barbell', false, true, 'advanced',
 'Bar over mid-foot, flat back, chest up. Drive the floor away with the legs and lock out with the hips. Technique before load, always.'),
('lat-pulldown', 'Lat Pulldown', 'back', '{biceps}', 'cable', false, true, 'beginner',
 'Grip wider than shoulders. Pull the bar to the upper chest, driving the elbows down and back. The best pull-up substitute while building strength.'),
('seated-cable-row', 'Seated Cable Row', 'back', '{biceps,forearms}', 'cable', false, true, 'beginner',
 'Chest tall, slight backward lean. Pull the handle to the navel and squeeze the shoulder blades together.'),
('band-lat-pulldown', 'Band Lat Pulldown', 'back', '{biceps}', 'resistance_band', false, true, 'beginner',
 'Anchor the band overhead. Kneel and pull the ends down to the shoulders, driving the elbows toward the ribs.'),
('band-row', 'Seated Band Row', 'back', '{biceps}', 'resistance_band', false, true, 'beginner',
 'Sit with legs extended, band looped around the feet. Row the handles to the waist.'),

-- ============================== SHOULDERS ==============================
('pike-push-up', 'Pike Push-Up', 'shoulders', '{triceps,chest}', 'bodyweight', true, true, 'intermediate',
 'Hips high in an inverted V. Lower the crown of the head toward the floor and press back up â€” the bodyweight overhead press.'),
('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'shoulders', '{triceps,core}', 'dumbbell', false, true, 'beginner',
 'Seated or standing, dumbbells at ear height. Press overhead without flaring the ribs.'),
('lateral-raise', 'Dumbbell Lateral Raise', 'shoulders', '{}', 'dumbbell', false, false, 'beginner',
 'Slight elbow bend, raise the arms out to the sides to shoulder height. Lead with the elbows, not the hands.'),
('front-raise', 'Dumbbell Front Raise', 'shoulders', '{}', 'dumbbell', false, false, 'beginner',
 'Raise the dumbbells straight in front to shoulder height with a controlled tempo.'),
('rear-delt-fly', 'Bent-Over Rear Delt Fly', 'shoulders', '{back}', 'dumbbell', false, false, 'intermediate',
 'Hinge forward, arms hanging. Sweep the dumbbells out and back, squeezing the rear shoulders.'),
('arnold-press', 'Arnold Press', 'shoulders', '{triceps}', 'dumbbell', false, true, 'intermediate',
 'Start with palms facing you, rotate outward as you press overhead. Hits all three deltoid heads.'),
('overhead-press', 'Barbell Overhead Press', 'shoulders', '{triceps,core}', 'barbell', false, true, 'intermediate',
 'Bar at collarbone height, glutes and core braced. Press straight overhead, moving the head slightly back then through.'),
('upright-row', 'Cable Upright Row', 'shoulders', '{traps,biceps}', 'cable', false, true, 'intermediate',
 'Pull the bar up along the body to chest height, elbows leading. Stop if it pinches the shoulder.'),
('face-pull', 'Cable Face Pull', 'shoulders', '{back}', 'cable', false, false, 'beginner',
 'Rope at face height. Pull toward the forehead, splitting the hands apart. Excellent posture and shoulder-health work.'),
('band-lateral-raise', 'Band Lateral Raise', 'shoulders', '{}', 'resistance_band', false, false, 'beginner',
 'Stand on the band, raise the arms out to the sides against the resistance.'),

-- ============================== LEGS ==============================
('bodyweight-squat', 'Bodyweight Squat', 'quadriceps', '{glutes,core}', 'bodyweight', true, true, 'beginner',
 'Feet shoulder width, toes slightly out. Sit back and down keeping the chest up and knees tracking over the toes.'),
('lunge', 'Walking Lunge', 'quadriceps', '{glutes,hamstrings}', 'bodyweight', true, true, 'beginner',
 'Step forward, drop the back knee toward the floor, drive through the front heel to stand.'),
('bulgarian-split-squat', 'Bulgarian Split Squat', 'quadriceps', '{glutes,hamstrings}', 'bodyweight', true, true, 'intermediate',
 'Rear foot elevated on a bench or chair. Lower straight down over the front leg. Brutal, and one of the best single-leg builders.'),
('glute-bridge', 'Glute Bridge', 'glutes', '{hamstrings,core}', 'bodyweight', true, false, 'beginner',
 'Lie on the back, feet flat. Drive the hips up until the body forms a straight line, squeeze the glutes at the top.'),
('single-leg-glute-bridge', 'Single-Leg Glute Bridge', 'glutes', '{hamstrings,core}', 'bodyweight', true, false, 'intermediate',
 'One foot planted, the other leg extended. Drive the hips up with a single leg.'),
('wall-sit', 'Wall Sit', 'quadriceps', '{glutes}', 'bodyweight', true, false, 'beginner',
 'Back flat to a wall, thighs parallel to the floor. Hold for time.'),
('calf-raise', 'Standing Calf Raise', 'calves', '{}', 'bodyweight', true, false, 'beginner',
 'Rise onto the toes as high as possible, pause, lower slowly. Use a step for a deeper stretch.'),
('step-up', 'Step-Up', 'quadriceps', '{glutes,hamstrings}', 'bodyweight', true, true, 'beginner',
 'Step onto a sturdy box or bench, driving through the top heel. Control the way down.'),
('goblet-squat', 'Goblet Squat', 'quadriceps', '{glutes,core}', 'dumbbell', false, true, 'beginner',
 'Hold one dumbbell at chest height. The front load makes it easier to stay upright than a back squat.'),
('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'hamstrings', '{glutes,back}', 'dumbbell', false, true, 'beginner',
 'Soft knees, push the hips back and slide the dumbbells down the thighs. Feel the hamstring stretch, then drive the hips forward.'),
('dumbbell-lunge', 'Dumbbell Lunge', 'quadriceps', '{glutes,hamstrings}', 'dumbbell', false, true, 'intermediate',
 'Lunge holding a dumbbell in each hand at the sides.'),
('dumbbell-calf-raise', 'Dumbbell Calf Raise', 'calves', '{}', 'dumbbell', false, false, 'beginner',
 'Hold dumbbells at the sides and rise onto the toes. Add a step for range of motion.'),
('barbell-back-squat', 'Barbell Back Squat', 'quadriceps', '{glutes,hamstrings,core}', 'barbell', false, true, 'intermediate',
 'Bar on the upper traps, brace hard, sit down between the hips. Depth to at least parallel if mobility allows.'),
('barbell-front-squat', 'Barbell Front Squat', 'quadriceps', '{core,glutes}', 'barbell', false, true, 'advanced',
 'Bar racked on the front delts, elbows high. More upright than a back squat and far more quad-dominant.'),
('romanian-deadlift', 'Barbell Romanian Deadlift', 'hamstrings', '{glutes,back}', 'barbell', false, true, 'intermediate',
 'From standing, hinge at the hips with a flat back, bar tracking the legs. Stop when the hamstrings run out of stretch.'),
('hip-thrust', 'Barbell Hip Thrust', 'glutes', '{hamstrings}', 'barbell', false, true, 'intermediate',
 'Upper back on a bench, bar across the hips with a pad. Drive the hips to full extension and squeeze.'),
('leg-press', 'Leg Press', 'quadriceps', '{glutes,hamstrings}', 'machine', false, true, 'beginner',
 'Feet shoulder width on the platform. Lower until the knees reach about 90 degrees, press back without locking out hard.'),
('leg-curl', 'Lying Leg Curl', 'hamstrings', '{calves}', 'machine', false, false, 'beginner',
 'Curl the heels toward the glutes against the pad, lower slowly.'),
('leg-extension', 'Leg Extension', 'quadriceps', '{}', 'machine', false, false, 'beginner',
 'Extend the knees to straight, pause at the top, lower under control.'),
('seated-calf-raise', 'Seated Calf Raise', 'calves', '{}', 'machine', false, false, 'beginner',
 'Knees bent under the pad. Targets the soleus, the deeper calf muscle.'),
('band-squat', 'Band Squat', 'quadriceps', '{glutes}', 'resistance_band', false, true, 'beginner',
 'Stand on the band, ends at the shoulders. Squat against the added tension.'),

-- ============================== ARMS ==============================
('bench-dip', 'Bench Dip', 'triceps', '{chest,shoulders}', 'bodyweight', true, true, 'beginner',
 'Hands on a bench behind you, legs extended. Lower the hips until the elbows reach 90 degrees, press back up.'),
('close-grip-push-up', 'Close-Grip Push-Up', 'triceps', '{chest}', 'bodyweight', true, true, 'intermediate',
 'Push-up with the hands under the shoulders and elbows tracking backward.'),
('dumbbell-curl', 'Dumbbell Biceps Curl', 'biceps', '{forearms}', 'dumbbell', false, false, 'beginner',
 'Elbows pinned at the sides. Curl up without swinging, lower slowly.'),
('hammer-curl', 'Hammer Curl', 'biceps', '{forearms}', 'dumbbell', false, false, 'beginner',
 'Neutral grip, palms facing each other. Emphasises the brachialis and forearm.'),
('concentration-curl', 'Concentration Curl', 'biceps', '{}', 'dumbbell', false, false, 'intermediate',
 'Seated, elbow braced against the inner thigh. Strict, isolated curl.'),
('overhead-triceps-extension', 'Overhead Triceps Extension', 'triceps', '{}', 'dumbbell', false, false, 'beginner',
 'One dumbbell held overhead in both hands. Lower behind the head, keeping the elbows pointing up.'),
('dumbbell-kickback', 'Triceps Kickback', 'triceps', '{}', 'dumbbell', false, false, 'beginner',
 'Hinge forward, upper arm parallel to the torso. Extend the elbow straight back and squeeze.'),
('barbell-curl', 'Barbell Curl', 'biceps', '{forearms}', 'barbell', false, false, 'beginner',
 'Shoulder-width grip, elbows fixed. Curl the bar to chest height without leaning back.'),
('skull-crusher', 'Skull Crusher', 'triceps', '{}', 'barbell', false, false, 'intermediate',
 'Lying, bar over the forehead. Bend at the elbows only, lowering toward the hairline.'),
('cable-triceps-pushdown', 'Cable Triceps Pushdown', 'triceps', '{}', 'cable', false, false, 'beginner',
 'Elbows tucked, push the bar or rope down to full extension and squeeze.'),
('cable-curl', 'Cable Biceps Curl', 'biceps', '{forearms}', 'cable', false, false, 'beginner',
 'Constant tension throughout the curl, which free weights lose at the top.'),
('band-curl', 'Band Biceps Curl', 'biceps', '{forearms}', 'resistance_band', false, false, 'beginner',
 'Stand on the band and curl the handles, resisting on the way down.'),

-- ============================== CORE ==============================
('plank', 'Plank', 'core', '{shoulders,glutes}', 'bodyweight', true, false, 'beginner',
 'Forearms and toes on the floor, body in a straight line. Squeeze the glutes and brace â€” do not let the hips sag.'),
('side-plank', 'Side Plank', 'core', '{shoulders}', 'bodyweight', true, false, 'beginner',
 'On one forearm, hips stacked and lifted. Targets the obliques.'),
('dead-bug', 'Dead Bug', 'core', '{}', 'bodyweight', true, false, 'beginner',
 'On the back, arms up and knees at 90 degrees. Extend the opposite arm and leg while keeping the lower back flat.'),
('bicycle-crunch', 'Bicycle Crunch', 'core', '{}', 'bodyweight', true, false, 'beginner',
 'Alternate bringing each elbow toward the opposite knee with a slow, controlled twist.'),
('leg-raise', 'Lying Leg Raise', 'core', '{}', 'bodyweight', true, false, 'intermediate',
 'On the back, legs straight. Raise to vertical and lower without letting the lower back arch.'),
('hanging-knee-raise', 'Hanging Knee Raise', 'core', '{forearms}', 'pull_up_bar', true, false, 'intermediate',
 'Hang from the bar, draw the knees up toward the chest by curling the pelvis.'),
('mountain-climber', 'Mountain Climber', 'core', '{shoulders,quadriceps}', 'bodyweight', true, true, 'beginner',
 'From a push-up position, drive the knees toward the chest alternately at pace.'),
('russian-twist', 'Russian Twist', 'core', '{}', 'bodyweight', true, false, 'beginner',
 'Seated, leaning back, feet off the floor. Rotate the torso side to side. Hold a weight to progress.'),
('ab-wheel-rollout', 'Ab Wheel Rollout', 'core', '{shoulders,back}', 'bodyweight', true, true, 'advanced',
 'From the knees, roll out as far as control allows with a flat back, then pull back in.'),
('cable-crunch', 'Cable Crunch', 'core', '{}', 'cable', false, false, 'intermediate',
 'Kneeling under a high pulley, rope at the head. Crunch by flexing the spine, not pulling with the arms.'),

-- ============================== CONDITIONING ==============================
('burpee', 'Burpee', 'full_body', '{chest,quadriceps,core}', 'bodyweight', true, true, 'intermediate',
 'Squat, kick back to a plank, push-up, jump the feet in, jump up. The full-body conditioning staple.'),
('jumping-jack', 'Jumping Jack', 'full_body', '{calves,shoulders}', 'bodyweight', true, true, 'beginner',
 'Jump the feet wide while raising the arms overhead. Simple, effective warm-up.'),
('high-knees', 'High Knees', 'full_body', '{quadriceps,core}', 'bodyweight', true, true, 'beginner',
 'Run in place driving the knees to hip height at pace.'),
('jump-squat', 'Jump Squat', 'quadriceps', '{glutes,calves}', 'bodyweight', true, true, 'intermediate',
 'Squat down then explode into a jump, landing softly straight back into the next rep.'),
('kettlebell-swing', 'Kettlebell Swing', 'glutes', '{hamstrings,core,back}', 'kettlebell', false, true, 'intermediate',
 'Hip hinge, not a squat. Snap the hips forward to float the bell to chest height, let it fall back between the legs.'),
('kettlebell-goblet-squat', 'Kettlebell Goblet Squat', 'quadriceps', '{glutes,core}', 'kettlebell', false, true, 'beginner',
 'Hold the bell by the horns at chest height and squat.'),
('farmers-carry', 'Farmer''s Carry', 'core', '{forearms,traps}', 'dumbbell', false, true, 'beginner',
 'Walk with a heavy dumbbell in each hand, shoulders back and core braced.'),
('medicine-ball-slam', 'Medicine Ball Slam', 'full_body', '{core,shoulders}', 'medicine_ball', false, true, 'beginner',
 'Raise the ball overhead and slam it down hard, catching the bounce or picking it back up.')

on conflict (slug) do update set
  name              = excluded.name,
  primary_muscle    = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment         = excluded.equipment,
  is_bodyweight     = excluded.is_bodyweight,
  is_compound       = excluded.is_compound,
  difficulty        = excluded.difficulty,
  instructions      = excluded.instructions;

