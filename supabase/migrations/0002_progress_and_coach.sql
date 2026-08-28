-- Repwise — progress tracking and coach metadata
--
-- Incremental migration on top of 0001_init.sql, for the CLI path
-- (`supabase db push`). If you instead pasted supabase/schema.sql into the SQL
-- Editor, everything here is already applied — schema.sql is the consolidated
-- equivalent of 0001 + 0002 and is safe to re-run.

-- ---------------------------------------------------------------------------
-- Body measurements — tape and body-fat tracking for the Progress section
-- ---------------------------------------------------------------------------
-- Every column past the date is nullable: people measure whichever sites they
-- care about, and requiring a full set would mean logging nothing on the days
-- they only check their waist.

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

create index if not exists body_measurements_user_idx
  on public.body_measurements (user_id, logged_on desc);

-- ---------------------------------------------------------------------------
-- Personal records — best-ever effort per exercise
-- ---------------------------------------------------------------------------

create table if not exists public.personal_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  exercise_id     uuid not null references public.exercises(id) on delete cascade,
  weight_kg       numeric(6, 2) not null check (weight_kg >= 0),
  reps            smallint not null check (reps > 0),
  -- Epley estimated 1RM. Stored rather than computed on read so the best row
  -- can be picked with a plain ORDER BY, and so history survives a formula change.
  est_one_rep_max numeric(6, 2) not null,
  set_log_id      uuid references public.set_logs(id) on delete set null,
  achieved_on     date not null default current_date,
  created_at      timestamptz not null default now(),
  unique (user_id, exercise_id)
);

create index if not exists personal_records_user_idx
  on public.personal_records (user_id, est_one_rep_max desc);

-- Maintained by trigger rather than by the app, so a PR is recorded no matter
-- which code path logged the set. security definer because it writes to
-- personal_records on the user's behalf and must not be blocked by that table's
-- RLS policy; the user_id it writes is read from the parent session, never from
-- the caller, so it cannot be tricked into writing a row for someone else.
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
  -- and an uncapped 30-rep bodyweight set would register as a PR that no amount
  -- of real strength could beat. Mirrors estimateOneRepMax() in
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
-- Coach chat metadata
-- ---------------------------------------------------------------------------
-- Which model produced an assistant turn; null for user turns. Kept so a thread
-- stays interpretable after the app switches models.

alter table public.chat_messages add column if not exists model text;

-- ---------------------------------------------------------------------------
-- RLS for the new tables
-- ---------------------------------------------------------------------------

alter table public.body_measurements enable row level security;
alter table public.personal_records  enable row level security;

drop policy if exists "body_measurements_own" on public.body_measurements;
create policy "body_measurements_own" on public.body_measurements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "personal_records_own" on public.personal_records;
create policy "personal_records_own" on public.personal_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
