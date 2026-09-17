# Weblaze EMS — Architecture

**Repository:** https://github.com/iamsrishanth/weblaze-ems (branch `main`)
**Live:** https://ems.weblaze.co.in (Vercel project `weblaze-ems`)
**Stack:** Next.js 16.2.6 (App Router) · React 19.2.4 · TypeScript 5 · Tailwind CSS v4 · Supabase (`@supabase/ssr` 0.10.3, `supabase-js` 2.106.2) · Recharts 3.8.1 · Zod 4 · lucide-react
**Size:** 58 TS/TSX files, ~11.3k LOC (excluding `package-lock.json`)

This document is the map of the system. Read it before changing anything. Every claim below was verified against the running code and the live database, not inferred.

---

## 1. What the application is

An internal Employee Management System for Weblaze. Four surfaces:

| Surface | Purpose |
|---|---|
| Attendance | Daily check-in / check-out with status (present / late / half_day), hours, history, team view |
| EOD Reports | End-of-day report submission, history, compliance tracking |
| Weekly Reports | Auto-generated weekly rollups (leads, calls, tasks, EOD submitted, days present) |
| Tasks | Task assignment and status tracking across a department |
| Admin | User and department management (super admin / admin) |

Three roles: `super_admin` (all departments), `admin` (own department), `employee` (self only).

---

## 2. Directory structure

```
weblaze-ems/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 Root layout (fonts, metadata)
│   │   ├── page.tsx                   Root redirect
│   │   ├── icon.png                   App icon (Next auto-favicon)
│   │   ├── (auth)/
│   │   │   ├── layout.tsx             Centered card shell + Weblaze logo
│   │   │   ├── login/page.tsx         Email + password sign-in
│   │   │   └── setup/page.tsx         Forced password change (must_change_pw)
│   │   ├── (app)/
│   │   │   ├── layout.tsx             Authenticated shell (sidebar, role gate)
│   │   │   ├── dashboard/page.tsx     Role-aware org dashboard (largest file, ~60 KB)
│   │   │   ├── attendance/page.tsx    Today / History / Team tabs
│   │   │   ├── tasks/page.tsx         Task list + filters
│   │   │   ├── reports/page.tsx       Submit EOD / History / Compliance
│   │   │   ├── reports/weekly/page.tsx
│   │   │   └── admin/
│   │   │       ├── layout.tsx         Admin shell
│   │   │       ├── users/page.tsx     + users-client.tsx, actions.ts
│   │   │       └── departments/page.tsx + departments-client.tsx, actions.ts
│   │   └── api/
│   │       ├── cron/eod-cutoff/route.ts        Marks missing EOD as missed
│   │       ├── cron/weekly-rollup/route.ts     Generates weekly reports
│   │       └── export/{attendance,eod,weekly}/route.ts   CSV exports
│   ├── components/
│   │   ├── ui/                        16 shadcn-style primitives (button, card,
│   │   │                              dialog, select, table, tabs, sheet, …)
│   │   └── layout/sidebar.tsx         Nav (Dashboard, Attendance, Tasks, Reports,
│   │                                  Users, Departments) + user block + mobile sheet
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              Browser client  (NEXT_PUBLIC_* keys)
│   │   │   ├── server.ts              Server client   (cookie session, per request)
│   │   │   ├── admin.ts               Service-role client (bypasses RLS — server only)
│   │   │   └── middleware.ts          Session refresh
│   │   ├── auth/require-role.ts       requireRole() + authenticatedAction() wrapper
│   │   ├── request-ip.ts              Client IP / user-agent from proxy headers
│   │   ├── audit.ts                   logAuditEvent() → audit_log
│   │   ├── utils.ts                   cn(), formatDate/Time, orgToday() (Asia/Kolkata)
│   │   └── validations/index.ts       Zod schemas for every action input
│   └── types/index.ts                 AppUser, Attendance, Task, EODReport, …
├── supabase/migrations/               001…008 (see §5)
├── public/                            logo_dark.png, logo_light.png, icon-192/512,
│                                      manifest.json, default Next SVGs
├── middleware.ts (proxy)              Route protection
└── vercel.json                        Framework + cron schedule
```

---

## 3. Routing and route protection

`src/middleware.ts` runs on every request, refreshes the Supabase session cookie, and redirects unauthenticated users to `/login?redirect=…`. Note: Next.js 16 renamed the middleware convention — this repo's file is picked up correctly (the build output lists `ƒ Proxy (Middleware)`).

| Route | Rendering | Gate |
|---|---|---|
| `/` | dynamic | redirects by role |
| `/login`, `/setup` | static shell | public |
| `/dashboard` | dynamic | authenticated |
| `/attendance`, `/tasks`, `/reports`, `/reports/weekly` | dynamic | `employee`, `admin`, `super_admin` |
| `/admin/users`, `/admin/departments` | dynamic | `admin`, `super_admin` |
| `/api/export/*` | dynamic | authenticated + role |
| `/api/cron/*` | dynamic | `CRON_SECRET` (returns 401 without it) |

Vercel cron (from `vercel.json`): `eod-cutoff` `30 12 * * 1-6`, `weekly-rollup` `30 12 * * 6`.

---

## 4. Data access layer — read this before writing any query

Three clients, three different trust levels:

| Client | File | Runs in | Respects RLS | Use for |
|---|---|---|---|---|
| `createClient()` from `@/lib/supabase/client` | client.ts | browser | yes | client components |
| `await createClient()` from `@/lib/supabase/server` | server.ts | server components, server actions | yes | normal reads/writes |
| `createServiceClient()` from `@/lib/supabase/admin` | admin.ts | server only | **no** | privileged writes (IP log, auth admin API) |

Rules that keep this safe and working:

1. **Never import `admin.ts` into a client component.** It carries the service-role key.
2. **Call `await createClient()` once per request** inside server actions.
3. Use `authenticatedAction({ schema, roles, handler })` from `@/lib/auth/require-role` for new mutations — it validates with Zod, enforces roles, and caches the profile lookup per request.
4. `requireRole([...])` throws `AccessDeniedError` when the role does not match; `wrapAction` converts thrown errors into `{ success: false, error }` results.

### Correct query shapes

```ts
// Server action — RLS applies, user scoped automatically
const supabase = await createClient()
const { data, error } = await supabase
  .from('attendance')
  .select('id, user_id, work_date, check_in_at, check_out_at, status, total_hours')
  .eq('user_id', userId)
  .eq('work_date', orgToday())
  .maybeSingle()

// Embedding app_user -> department: you MUST pin the FK column.
// app_user <-> department has TWO foreign keys (app_user.department_id and
// department.head_id), so `department:department(name)` is ambiguous and
// PostgREST rejects it with "more than one relationship was found".
.select('id, name, email, department_id, department:department_id(name)')

// Privileged insert (bypasses RLS) — server only
const serviceClient = createServiceClient()
await serviceClient.from('attendance_ip_log').insert({ ... })
```

### Column names — the single most common bug in this codebase

The code was written against slightly different names than the schema. **Always check this table before writing a filter or insert.**

| Table | Gotcha |
|---|---|
| `attendance` | date column is **`work_date`** (not `date`); timestamps are `check_in_at` / `check_out_at`; **no `note` column** |
| `eod_report` | date column is **`report_date`** (not `date`) |
| `daily_metrics` | date column is **`entry_date`**; only `leads` and `calls` exist (no `meetings`, `proposals`, `closed_deals`, `revenue`) |
| `department` | **no `status`** column and **no `description`** — active flag is `is_active` (boolean) |
| `task` | `assigned_to` and `assigned_by` are both `NOT NULL`; use FK-column embeds (`assignee:assigned_to(name)`) |

---

## 5. Database

Nine relations in schema `public`:

| Table / view | Columns |
|---|---|
| `app_user` | id, name, email, role, department_id, manager_id, status, must_change_pw, join_date, created_at, updated_at |
| `department` | id, name, head_id, leads_target, calls_target, is_active, created_at, updated_at |
| `attendance` | id, user_id, work_date, check_in_at, check_out_at, status, total_hours, created_at, updated_at, check_in_lat, check_in_lng, check_out_lat, check_out_lng, check_in_ip, check_out_ip |
| `attendance_ip_log` | id, attendance_id, user_id, event, ip (inet), ip_version, user_agent, created_at |
| `eod_report` | id, user_id, report_date, summary, tasks_completed, hours_worked, status, submitted_at, created_at, updated_at |
| `weekly_report` | id, user_id, week_start, week_end, leads_total, calls_total, tasks_completed, eod_submitted, days_present, employee_note, generated_at |
| `task` | id, title, description, assigned_to, assigned_by, priority, status, due_date, completed_at, created_at, updated_at |
| `daily_metrics` | id, user_id, entry_date, leads, calls, created_at, updated_at |
| `audit_log` | id, actor_id, action, target_type, target_id, details, created_at |
| `v_missed_eod` (view) | user_id, name, department_id, department_name, report_date, checked_at_utc |

Unique constraints worth knowing: `attendance(user_id, work_date)`, `eod_report(user_id, report_date)`, `weekly_report(user_id, week_start)`, `app_user(email)`.

### Migrations — where new SQL goes

`supabase/migrations/` is an ordered chain. **Add a new numbered file; never edit an applied migration.**

| File | Purpose |
|---|---|
| `001_schema.sql` | Enums, all tables, indexes, triggers, `handle_new_user()` |
| `002_rls.sql` | RLS enable + policies, helper functions (`is_super_admin`, `is_department_admin`, …) |
| `003_seed.sql` | Departments (Technical, Management active; Sales, Development inactive) |
| `004_cron.sql` | pg_cron jobs `eod-cutoff`, `weekly-rollup` (not idempotent — unschedule first) |
| `005_super_admin_write.sql` | Super-admin write policies on attendance / eod_report / daily_metrics / weekly_report |
| `006_attendance_geo.sql` | `check_in_lat/lng`, `check_out_lat/lng` + WGS84 bounds check |
| `007_attendance_ip.sql` | `check_in_ip`, `check_out_ip` (inet) + append-only `attendance_ip_log` |
| `008_performance_indexes.sql` | 12 indexes for date/department/status aggregations |

**To change the schema:** create `supabase/migrations/009_<what_it_does>.sql`, apply it with `psql` (see §8), mirror any seed/status change into `003_seed.sql` only if a fresh install should match, and never renumber existing files.

### Row Level Security

Default-deny. `is_department_admin(dept_id)` returns true for any `super_admin`, and for `admin` only on their own department — that single function drives most read policies.

- Employees see only their own rows in `attendance`, `eod_report`, `weekly_report`, `daily_metrics`.
- Super admin can read **and write** all of them (005), and is the only role that can read `audit_log`.
- `attendance_ip_log` is written with the service-role client and readable only by super admin — users cannot forge their own history.
- `app_user` insert is not granted to `authenticated`; the `on_auth_user_created` trigger creates the row.

---

## 6. Server actions (the API surface — there are no REST endpoints)

| Module | Actions |
|---|---|
| `attendance/actions.ts` | `getProfile`, `getTodayAttendance`, `checkIn(location?)`, `checkOut(location?)`, `getAttendanceHistory`, `getTeamAttendance`, `getUsers` |
| `reports/actions.ts` | `submitEOD`, `getTodayEOD`, `getEODHistory`, `getEODCompliance`, weekly report reads |
| `tasks/actions.ts` | task list, create/update/status |
| `admin/users/actions.ts` | `listUsers`, `createUser`, `updateUser`, … |
| `admin/departments/actions.ts` | `listDepartments`, `createDepartment`, `updateDepartment`, `getEligibleHeads` |

CSV exports are the only HTTP data endpoints: `/api/export/attendance`, `/api/export/eod`, `/api/export/weekly`.

---

## 7. Environment variables

| Variable | Read by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client, server, middleware | new project `vmxgijspqyhibybestud` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client, server, middleware | publishable key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | `admin.ts` only | server-only |
| `CRON_SECRET` | `/api/cron/*` | without it the endpoints return 401 |

**Do not set `SUPABASE_DB_URL`.** `src/lib/supabase/server.ts` uses it as the REST base URL, so a `postgres://` value there breaks every server-side call.

---

## 8. Working with the database directly

- Host `db.vmxgijspqyhibybestud.supabase.co`, **port 6543** (5432 is refused from most networks), user `postgres`. Connection string lives in `.env.local` (gitignored) as `DATABASE_URL`.
- Apply a migration:
  `psql -h db.vmxgijspqyhibybestud.supabase.co -p 6543 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/00X_*.sql`
  Always use `ON_ERROR_STOP=1` — without it a half-applied schema exits 0.
- Supabase rejects `sb_secret_*` keys from clients that look like browsers. Any script calling the REST API must send a non-browser `User-Agent` (e.g. `curl/8.5.0`) or every call returns `401 Forbidden use of secret API key in browser`.

---

## 9. Repo graph (graphify)

`graphify .` output is committed under `graphify-out/` (`graph.json`, `graph.html`, `GRAPH_REPORT.md`). Regenerate with `graphify . -o graphify-out`.

- **531 nodes / 1,130 links.** Relations: `contains` 399, `imports` 299, `imports_from` 139, `calls` 130, `uses` 23, `references` 20, `reads_from` 18, plus `triggers`, `belongs_to`, `scopes`, `gates`.
- **Communities:** c1 (34 files — the `(app)` routes + their actions), c0 (21 — UI primitives + components), c3 (14), c2 (9), c7 (8). Config files and each migration form their own singleton community.
- **Highest-connectivity symbols:** `cn()` (88), `users-client.tsx` (51), `departments-client.tsx` (46), `utils.ts` (34), `validations/index.ts` (32), `createClient()` (31).

Practical reading: `src/lib/utils.ts` and `src/lib/validations/index.ts` are the shared contracts — changing their signatures touches most of the app. The two admin clients (`users-client.tsx`, `departments-client.tsx`) are the densest UI files and the most likely place for regressions.

---

## 10. Known landmines (all previously hit and fixed)

1. `public.citext` does not exist — Supabase installs citext into `extensions`. Use bare `citext`.
2. `date` is not a column anywhere; use `work_date` / `report_date` / `entry_date`.
3. `app_user` ↔ `department` needs FK-pinned embeds (`department_id(name)`).
4. `createDepartment` / `updateDepartment` must use `is_active`, not `status`/`description`.
5. "Today" must come from `orgToday()` (Asia/Kolkata). UTC filed a 04:47 IST check-in onto the previous day and marked it late.
6. `task.assigned_by` is NOT NULL — always set it.
7. Port 5432 refused; use 6543.
8. Service-role REST calls need a curl-like User-Agent.

---

## 11. Build, verify, deploy

```bash
npm install
npx tsc --noEmit
env NODE_ENV=production npx next build     # never `source .env` first: NODE_ENV drift
                                           # breaks the build with a bogus /_global-error
vercel deploy --prod                       # from repo root, .vercel already linked
```

Verification battery after any change: `tsc --noEmit` clean · production build succeeds · `/dashboard`, `/attendance`, `/tasks`, `/reports`, `/reports/weekly`, `/admin/users`, `/admin/departments` all return 200 with no error toasts · dashboard KPIs reconcile (10 employees, 4 departments, Technical 7 / Management 2 / 1 unassigned).
