# PROMPT.md — Design upgrade brief for an AI agent

Copy everything in the block below and paste it into the coding agent that will perform the upgrade. It is self-contained: it tells the agent how to obtain the repository, what to read, what to change, how to talk to the database, and how to prove it worked.

---

```text
You are upgrading the visual design of an existing, working Next.js application.
Your job is a DESIGN UPGRADE, not a rewrite. The app works — do not restructure it,
do not migrate frameworks, do not invent new features.

==============================================================================
1. GET THE CODE
==============================================================================
git clone https://github.com/iamsrishanth/weblaze-ems.git
cd weblaze-ems
npm install

Branch: main. Live reference: https://ems.weblaze.co.in (read-only, for comparison).

==============================================================================
2. READ BEFORE YOU TOUCH ANYTHING (in this order)
==============================================================================
1. Architecture.md   — routes, data layer, database schema, known landmines
2. DESIGN.md         — the design system you must implement (tokens, components,
                       charts, accessibility checklist, fixed contract)
3. src/app/globals.css        — existing Tailwind v4 tokens (@theme inline)
4. src/components/ui/*        — 16 existing primitives; reuse and extend these
5. src/components/layout/sidebar.tsx and src/app/(app)/layout.tsx  — app shell
6. src/app/(app)/dashboard/page.tsx  — largest screen, most design debt

Treat Architecture.md and DESIGN.md as requirements, not suggestions. If they
conflict with your instinct, follow the documents and flag the conflict in your
final report.

==============================================================================
3. WHAT TO DO
==============================================================================
Upgrade every authenticated screen to the design system in DESIGN.md:

- App shell: consistent sidebar, sticky page headers, one spacing scale.
- Dashboard: clear KPI hierarchy, bullet charts for KPI-vs-target, consistent cards.
- Attendance (Today / History / Team), Tasks, Reports (Submit EOD / History /
  Compliance), Weekly reports: consistent tables, status pills, empty + loading +
  error states.
- Admin screens (Users, Departments): same table and form patterns.
- Auth screens (login, setup): light surface, correct logo polarity.

Non-negotiable design rules:
- Centralise status colours — one source of truth (present/late/half_day/missed/
  submitted/overdone), always paired with a text label or icon, never colour alone.
- Numeric data uses the mono font with tabular-nums.
- No emoji as icons; use lucide-react (already installed).
- No WebGL / Three.js / heavy animation. CSS-only effects. Respect
  prefers-reduced-motion.
- Logo polarity: logo_dark.png on dark surfaces, logo_light.png on light surfaces.

==============================================================================
4. HARD CONSTRAINTS — VIOLATING ANY OF THESE IS A FAILURE
==============================================================================
a) ROUTES stay identical: /login, /setup, /dashboard, /attendance, /tasks,
   /reports, /reports/weekly, /admin/users, /admin/departments,
   /api/export/{attendance,eod,weekly}, /api/cron/{eod-cutoff,weekly-rollup}.
   Every sidebar and dashboard link must resolve — no dead links, no 404s.
b) SERVER ACTIONS keep their names and signatures: checkIn(location?),
   checkOut(location?), getTodayAttendance, getAttendanceHistory,
   getTeamAttendance, submitEOD, getEODHistory, getEODCompliance, listUsers,
   createUser, updateUser, listDepartments, createDepartment, updateDepartment.
c) DO NOT change the database schema for a design task. If a change is genuinely
   unavoidable, see section 5.
d) DO NOT expose the service-role key to the client. Never import
   @/lib/supabase/admin into a client component.
e) "Today" must come from orgToday() in src/lib/utils.ts (Asia/Kolkata). Never
   replace it with new Date().toISOString().split('T')[0] — that files an early-morning check-in onto the previous calendar day.
f) Keep performance: the dashboard must not exceed ~25 database queries per load.

==============================================================================
5. HOW TO TALK TO THE DATABASE (and where SQL files go)
==============================================================================
There are NO REST endpoints for app data — the app uses Supabase via three clients:

  - Browser:            createClient()      from '@/lib/supabase/client'
  - Server / actions:   await createClient() from '@/lib/supabase/server'   (RLS applies)
  - Privileged, server: createServiceClient() from '@/lib/supabase/admin'   (bypasses RLS)

Column names (these are the #1 source of bugs in this repo — check before you filter):
  - attendance    -> date column is work_date  (NOT date); times are check_in_at /
                     check_out_at; there is no `note` column
  - eod_report    -> report_date  (NOT date)
  - daily_metrics -> entry_date; only leads and calls exist
  - department    -> is_active (boolean); there is NO status and NO description column
  - task          -> assigned_to and assigned_by are both NOT NULL

Embedding app_user -> department: app_user and department have TWO foreign keys
between them, so you must pin the FK column:
    .select('id, name, email, department_id, department:department_id(name)')
The form 'department:department(name)' fails with "more than one relationship
was found for 'app_user' and 'department'".

Row Level Security is default-deny. Employees see only their own rows. Super admin
can read and write every department. Never weaken a policy to make a query work.

IF YOU MUST CHANGE THE SCHEMA:
  - Add a NEW file: supabase/migrations/009_<what_it_does>.sql
  - Never edit or renumber an already-applied migration (001-008 exist).
  - Apply with: psql -h db.vmxgijspqyhibybestud.supabase.co -p 6543 -U postgres \
        -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/009_*.sql
    Port 6543. Port 5432 is refused. Use ON_ERROR_STOP=1 or a half-applied schema
    exits 0 and looks successful.
  - If the change should also exist on a fresh install, mirror it into
    003_seed.sql as well.
  - Any script calling the Supabase REST API with the service-role key must send a
    non-browser User-Agent (e.g. curl/8.5.0), otherwise every call returns
    "401 Forbidden use of secret API key in browser".

==============================================================================
6. VERIFY BEFORE YOU SAY YOU ARE DONE
==============================================================================
Run all of these and include the real output in your report:

  npx tsc --noEmit
  env NODE_ENV=production npx next build
  npm run dev   (then check in a browser)

Browser checks (logged in as a super admin):
  - /dashboard, /attendance, /tasks, /reports, /reports/weekly, /admin/users,
    /admin/departments all render with no console errors and no error toasts
  - every sidebar and dashboard link navigates somewhere real
  - loading, empty and error states all render (not a blank screen)
  - responsive at 375px, 768px, 1024px, 1440px
  - dashboard numbers reconcile: 10 employees, 4 departments,
    Technical 7 / Management 2 / 1 unassigned

Deploy only if asked: `vercel deploy --prod` from the repo root.

==============================================================================
7. HOW TO REPORT
==============================================================================
Finish with a short report containing:
  1. Files changed (grouped: shell / screens / primitives / styles)
  2. Screens upgraded and what specifically changed on each
  3. Verification output — the actual tsc and build results, route-by-route status
  4. Anything you deliberately did NOT change, and why
  5. Any conflict you found between DESIGN.md and the existing code
  6. Follow-ups you recommend but did not do

Be honest about what you verified versus what you only believe works. If a screen
was not opened in a browser, say so.
```

---

## Notes for the human handing this over

- The prompt expects the agent to have network access (npm install, cloning) and, ideally, a browser for verification. Without a browser, section 6 cannot be fully satisfied — ask the agent to state that limitation rather than claim success.
- Credentials are **not** included. The agent will need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` to run the app locally; copy the template from `.env.example`, which ships with blank placeholders.
- If you want the agent to also deploy, keep step 6's deploy line; otherwise delete it.
