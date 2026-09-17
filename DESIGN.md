# Weblaze EMS — Design System

**Purpose:** this is the design contract for upgrading the visual design of Weblaze EMS. It is written so an AI agent (or a human) can pick up the repository and execute a coherent redesign without guessing.

**Read first:** `Architecture.md` (how the app works) — this document only defines how it should *look and feel*.

---

## 1. Goal and principles

Upgrade a working but utilitarian internal EMS into a polished, dense, fast product UI. The app is used daily by staff on desktop; it is a **tool**, not a marketing site.

1. **Clarity over decoration.** Density is a feature — people scan attendance and EOD status, so information hierarchy matters more than whitespace.
2. **Fast above all.** No WebGL, no heavy 3D, no large hero media. CSS-only ambience if any. Budgets are listed in §7.
3. **One design language.** Sidebar, tables, forms and charts must share tokens, spacing and motion.
4. **Don't break what works.** Route map, server action signatures and data contracts are fixed (§8).
5. **Brand-correct.** Weblaze logo must be the right polarity on every surface.

---

## 2. Current state (verified audit)

| Aspect | Today |
|---|---|
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss`; tokens declared under `@theme inline` in `src/app/globals.css`; `shadcn/tailwind.css` and `tw-animate-css` imported |
| Fonts | Geist Sans + Geist Mono via `next/font/google`, exposed as `--font-geist-sans` / `--font-geist-mono` |
| Primitives | 16 shadcn-style components in `src/components/ui/` (button, card, dialog, select, table, tabs, sheet, badge, avatar, dropdown-menu, input, label, textarea, separator, sonner, dropdown) |
| Shell | `src/app/(app)/layout.tsx` + `src/components/layout/sidebar.tsx` — **dark** sidebar (`slate-800/900`, `border-slate-700/50`, white text) with the Weblaze logo and a mobile sheet |
| Auth | `src/app/(auth)/layout.tsx` — **light** gradient page with `logo_light.png` and a "Weblaze EMS" heading |
| Accent | Blue-600 family in the existing UI; `public/manifest.json` declares `theme_color #2563eb`, `background_color #0f172a` |
| Charts | Recharts 3.8.1 (installed, lightly used) |
| Assets | `public/logo_dark.png` (white artwork → dark surfaces), `public/logo_light.png` (dark artwork → light surfaces), `icon-192/512.png`, `src/app/icon.png` |

**Inconsistencies to resolve in this upgrade:**

- Dark sidebar against a light content area is currently unmanaged — no explicit token for the two surfaces.
- The dashboard (`~60 KB` source) mixes card grids, tables and stat strips with no consistent spacing scale or status colour mapping.
- Status colours (present / late / half_day / missed / submitted) are not centralised, so the same state can look different per screen.
- Density varies: some tables are compact, some are airy.

---

## 3. Recommended design system

Generated with the `ui-ux-pro-max` design intelligence engine for "internal employee management dashboard, enterprise, productivity, attendance/tasks/reports".

### Style: **Micro-interactions**

Small, tactile feedback — hover lifts, focus rings, button press states, skeleton → content transitions, optimistic state changes. Performance: excellent. Accessibility: good. Supports light and dark fully.

Keywords to honour: subtle animation, contextual feedback, responsive, tactile.

### Colour

Dark-first enterprise palette (matches the existing dark shell and the manifest background):

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#0F172A` | Sidebar / chrome |
| `--color-on-primary` | `#FFFFFF` | Text on primary |
| `--color-secondary` | `#1E293B` | Elevated surfaces |
| `--color-accent` | `#22C55E` | Positive status, primary CTA accent |
| `--color-background` | `#020617` | App background |
| `--color-foreground` | `#F8FAFC` | Primary text |
| `--color-muted` | `#1A1E2F` | Muted fills |
| `--color-border` | `#334155` | Dividers, table borders |
| `--color-destructive` | `#EF4444` | Errors, missed status |
| `--color-ring` | `#0F172A` | Focus ring |

Keep the existing Weblaze blue as a **secondary** accent for links and selected states so the product stays recognisable, but do not use it for status semantics.

**Status colour map (centralise this):**

| Status | Colour | Applies to |
|---|---|---|
| Present / submitted / done | `#22C55E` green | attendance, EOD, tasks |
| Late | `#F59E0B` amber | attendance |
| Half day | `#38BDF8` sky (partial, not negative) | attendance |
| Missed / not submitted / overdue | `#EF4444` red | EOD compliance, tasks |
| Neutral / pending | `#94A3B8` slate | everything unstarted |

Never encode status in colour alone — always pair with a text label or icon (WCAG 1.4.1).

### Typography

- **Body / UI:** keep Geist Sans (already wired via `next/font`) for continuity.
- **Numeric and tabular data:** use the mono face (`--font-geist-mono`, or Fira Code which the engine recommends for "dashboard / data / precise") for times, hours, counts and table numerics, with `font-variant-numeric: tabular-nums` so columns align.
- Scale: 12/13px for table meta, 14px body, 16–18px section headings, 24–30px page title. Weight 500–600 for headings, 400 for body.

### Effects and motion

- Transitions 150–300 ms on hover/state change; micro hover 50–100 ms.
- Skeleton loaders that match final layout size (no layout shift).
- Toast notifications via the existing `sonner` integration.
- Respect `prefers-reduced-motion` — disable transforms and fades.

### Anti-patterns to avoid

Complex onboarding flows · slow, animation-heavy pages · emoji used as icons · decorative gradients behind data · hover-only information.

---

## 4. Layout and component specification

**App shell:** fixed left sidebar (collapsible to icons on ≤1024px, sheet on ≤768px), content area with a sticky page header (title + primary action + filters) and a max content width that keeps tables readable (~1440px, centred).

**Sidebar:** dark surface (`--color-primary`), Weblaze logo at top with `logo_dark.png`, grouped nav (Work: Dashboard, Attendance, Tasks, Reports · Admin: Users, Departments), active item with a left accent bar + subtle background, user block at bottom with avatar initials and role badge.

**Cards:** one consistent card — 16px radius, 1px `--color-border`, subtle elevation on hover for interactive cards, 16–20px padding, title 14–16px semibold, value 24–28px tabular mono.

**Tables:** sticky header, 36–40px row height, zebra or hover row highlight (not both), right-aligned numerics in mono, status rendered as a pill (dot + label), empty state with an icon, a one-line explanation and a primary action.

**Forms:** label above input, 8px gap, 40px control height, inline validation under the field, destructive only for irreversible actions, primary button right-aligned in forms.

**Charts (from the chart intelligence rules):**
- KPI vs target → **bullet chart** (compact, works in a grid of 3–10); ranges bad/ok/good, target marker, value always visible as text.
- Single KPI with emphasis → gauge.
- Trend over time → line/area; comparison across departments → horizontal bar.
- Keep Recharts; do not add a second chart library.

**States:** every data surface needs loading (skeleton), empty, error (with retry) and partial-data states. The EOD history and attendance history screens previously failed silently — never swallow an error into an empty state.

---

## 5. Accessibility and responsive checklist (pre-delivery)

- [ ] No emoji as icons — use `lucide-react` (already a dependency)
- [ ] `cursor-pointer` on every clickable element
- [ ] Hover/focus transitions 150–300 ms
- [ ] Text contrast ≥ 4.5:1 (AA) in both light and dark surfaces
- [ ] Visible focus ring, 2–4px, on all interactive elements
- [ ] `prefers-reduced-motion` honoured
- [ ] Verified at 375px, 768px, 1024px, 1440px
- [ ] All images have `alt`; the Weblaze logo carries `alt="Weblaze"`
- [ ] Form labels associated with inputs
- [ ] Status conveyed by text/icon, not colour alone
- [ ] Tables have headers and are keyboard navigable

---

## 6. Brand asset rules

| Surface | Asset |
|---|---|
| Dark background (sidebar, dark cards) | `/logo_dark.png` (white artwork) |
| Light background (auth, light surfaces) | `/logo_light.png` (dark artwork) |

Never use the wrong polarity — the light logo on a dark surface is nearly invisible. PWA icons (`icon-192.png`, `icon-512.png`) and the app icon (`src/app/icon.png`) must stay in sync with any palette change.

---

## 7. Performance budget

- No WebGL / Three.js. CSS-only ambient effects only.
- Dashboard currently issues ~25 database queries with response ~300 ms — keep it at or below that; do not add per-row queries in loops.
- Images: next/image with explicit dimensions; lazy-load below the fold.
- Keep bundle additions minimal; prefer the existing `lucide-react` icon set.

---

## 8. Fixed contract — do not break

1. **Routes:** `/login`, `/setup`, `/dashboard`, `/attendance`, `/tasks`, `/reports`, `/reports/weekly`, `/admin/users`, `/admin/departments`, `/api/export/{attendance,eod,weekly}`, `/api/cron/{eod-cutoff,weekly-rollup}`.
2. **Server actions** keep their names and signatures (`checkIn(location?)`, `checkOut(location?)`, `submitEOD`, `listUsers`, `createUser`, …).
3. **Database:** no schema changes for a pure design upgrade. If a change is genuinely required, add `supabase/migrations/009_*.sql` — never edit an applied migration.
4. **Env vars** unchanged; never expose the service-role key to the client.
5. `orgToday()` (Asia/Kolkata) must remain the source of "today" — changing it refiles check-ins onto the wrong day.

---

## 9. Definition of done

- `npx tsc --noEmit` clean and `env NODE_ENV=production npx next build` succeeds
- Every route in §8 returns 200 with no console errors and no error toasts
- All states implemented (loading, empty, error, partial)
- Checklist in §5 passes
- Sidebar navigation actually navigates (no dead links)
- Dashboard numbers reconcile: 10 employees, 4 departments, Technical 7 / Management 2 / 1 unassigned
- Logo polarity correct on every surface
