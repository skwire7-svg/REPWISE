# Repwise

AI-powered fitness, workout and nutrition tracker. Personalised workout and diet
plans, workout logging, and an AI coach grounded in your own training log.

Build plan: `C:\Users\HP\.claude\plans\so-we-want-to-toasty-kay.md`

---

## Setup

### 1. Install Node.js — done

Node.js **24.19.0 LTS** and npm 11.17.0 are installed. Node 20 reached
end-of-life in April 2026, so the current LTS was used instead.

It was installed as a winget portable package. Because the `node` command alias
needs admin rights (or Developer Mode) to create, this directory was appended to
your **user** PATH manually:

```
%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64
```

Verify in a **new** terminal:

```powershell
node --version   # v24.19.0
npm --version    # 11.17.0
```

### 2. Install dependencies — done

`npm install` has been run (107 packages). Re-run it after pulling changes.

### 3. Apply the database schema — **do this before first run**

The Supabase project is already connected in `.env.local`, but a fresh project
has no tables. In the Supabase dashboard open **SQL Editor → New query** and run,
in order:

1. **`supabase/schema.sql`** — every table, enum, trigger and RLS policy.
   Idempotent, so re-running it is safe and non-destructive.
2. **`supabase/seed.sql`** — the exercise library (~90 exercises, home + gym).
   Upserts on `slug`, so it is also safe to re-run.

Until step 1 runs, signup fails and every page 500s with
`Could not find the table 'public.profiles'`.

> CLI alternative: `supabase link --project-ref <ref>` then `supabase db push`
> applies `supabase/migrations/*` instead. It needs your database password;
> the SQL Editor path needs nothing extra, which is why it's the default here.

Then, in **Authentication → Providers → Email**, decide whether to require email
confirmation. With it on, signup shows a "check your inbox" notice instead of
going straight to onboarding.

### 4. Configure environment variables

`.env.local` is already filled in with the Supabase project URL and publishable
key, so auth and all data storage work as-is.

To turn on the AI coach, the workout generator and the diet generator, add a
Gemini key from [Google AI Studio](https://aistudio.google.com/apikey):

```
GEMINI_API_KEY=AIza...
```

A free-tier key is enough. The free tier is rate limited per minute and per
day, so generating several plans in quick succession can trip a quota error;
the app reports that as a "wait a minute and try again" message.

Without it those three features show a "not configured" message; logging,
tracking and the rest of the app work fine. `SUPABASE_SERVICE_ROLE_KEY` is
optional and only needed for maintenance scripts that must bypass RLS.

`.env.local` is gitignored and must stay that way. Restart the dev server after
editing it — Next.js reads env files only at startup.

### 5. Run it

```powershell
npm run dev
```

Open <http://localhost:3000>.

---

## Architecture notes

**Math in code, judgment in the AI.** Calorie and macro targets are computed in
`lib/fitness/metrics.ts` using Mifflin-St Jeor, then handed to the model as
fixed constraints. The AI selects exercises and meals; it never does arithmetic.
A hallucinated calorie target is the worst bug this app could ship, so the
numbers are never the model's responsibility.

**The Gemini key never reaches the browser.** Every model call happens inside
an `app/api/**` route handler or a server action. There is no client-side
Gemini SDK usage.

**RLS is the access control layer.** Supabase's publishable key is public by
design, so the Row Level Security policies in `schema.sql` are what actually keep
one user's data away from another. Child tables (`plan_days`, `set_logs`, …)
prove ownership by walking up to their parent. Never work around an empty query
result by reaching for the service-role client — an empty result usually means
RLS is doing its job.

**Supabase is the only store.** There is no local fallback. An earlier build
wrote to a JSON file when credentials were missing; that is gone, because a
silent fallback looks exactly like a working app right up until you notice
nothing was ever saved. Missing env vars now throw at startup instead.

**Personal records are maintained by a trigger, not the app.** `set_logs_record_pr`
fires on every logged set, so a PR is recorded no matter which code path wrote
it. The Epley formula is duplicated in `lib/fitness/metrics.ts` and in that
trigger — change both together.

---

## Layout

```
app/
  (auth)/login, signup        Authentication
  auth/callback               OAuth / email confirmation exchange
  onboarding/                 Multi-step profile wizard
  (app)/dashboard             Today's intake, sessions this week, weight
  (app)/plans                 Plan generation, plan days, live session logging
  (app)/diet                  Targets, meal logging, generated meal plan
  (app)/progress              Weight + volume charts, PRs, tape measurements
  (app)/coach                 Streaming AI chat, persisted per thread
  api/coach/route.ts          Streams the model and saves both turns
lib/
  ai/                         Gemini client, prompts, plan generators
  db/                         All Supabase reads and writes, one file per domain
  fitness/metrics.ts          BMR, TDEE, macros, 1RM, volume, safety clamps
  supabase/                   Browser, server and middleware clients
  types/database.ts           Row types mirroring the SQL schema
supabase/
  schema.sql                  Consolidated, idempotent — run this one
  migrations/                 Incremental equivalents for `supabase db push`
  seed.sql                    Exercise library
```

---

## What gets stored

| Section | Tables |
|---|---|
| Profile / onboarding | `profiles` |
| Workout plan | `workout_plans`, `plan_days`, `plan_exercises` |
| Workout logging | `workout_sessions`, `set_logs` |
| Diet | `diet_plans`, `diet_plan_meals`, `meal_logs` |
| Progress | `weight_logs`, `body_measurements`, `personal_records` |
| AI coach | `chat_threads`, `chat_messages` |
| Shared library | `exercises` (read-only to users) |

Every one of these has RLS enabled and is scoped to `auth.uid()`.

---

## Verifying RLS (do this before trusting the app with real data)

RLS failures are silent and look completely fine in single-user testing. Create
two accounts, then from account A's session attempt to read account B's rows:

```js
// In the browser console while logged in as user A
const { data } = await supabase.from("profiles").select("*");
// Expect exactly one row — user A's own. Any more means a policy is missing.
```

Repeat for `workout_sessions` and `meal_logs`.
