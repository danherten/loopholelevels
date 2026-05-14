# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Create React App project — no test runner is wired up.

- `npm start` — dev server on `http://localhost:3000`
- `npm run build` — production build to `build/`

Required env vars (in `.env` / `.env.local`, all prefixed `REACT_APP_` so CRA exposes them to the client):

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_ADMIN_PASSWORD` — gates the in-app `/admin` page (default `LoopholeLads123` in [src/App.js:5](src/App.js:5))

## Architecture

**Loophole Levels** is an affiliate-rewards / gamification PWA for TikTok Shop creators. Admins import TikTok Shop sales reports (`.csv` / `.xlsx`); creators earn XP and level up based on their net GMV. The entire app is a single ~1900-line file.

### The whole app is `src/App.js`

[src/App.js](src/App.js) is the entire application — a single default-exported `App` component with all state, all data-loading functions, all page views, and all admin tooling. The only other source files are [src/index.js](src/index.js) (mounts `<App/>`) and [src/lib/supabase.js](src/lib/supabase.js) (Supabase client; `storageKey: 'll-auth'`, no URL session detection).

Before editing, expect to read large slices of `App.js`. Key landmarks:

- **Constants & parsers** ([src/App.js:1-127](src/App.js)): `DEFAULT_LEVELS`, `DEFAULT_MILESTONES`, `XP_PER_10_GMV` (= 100 XP per £10 net GMV), `TCOLS` (fuzzy header-name aliases for CSV/XLSX import), and pure helpers (`getLv`, `getNx`, `xpPct`, `fmtGBP`, `parseCSV`, `splitLine`, `findCol`).
- **Inline CSS** ([src/App.js:129-328](src/App.js)): everything is styled via a single `CSS` template literal injected into a `<style>` tag. CSS custom properties (`--bg`, `--card`, `--pu`, `--fh` Bebas Neue, `--fb` Space Grotesk) drive the dark theme. There is **no CSS file** — change styles here.
- **`App` component** ([src/App.js:340](src/App.js)): owns ~60 `useState` hooks. View routing is a single `page` string (`'home' | 'rewards' | 'lb' | 'level' | 'referrals' | 'products' | 'profile' | 'admin'`); each page is a `{page==='x' && (...)}` block. `navTo(pg)` ([src/App.js:633](src/App.js)) is the navigation primitive and triggers per-page data loads.
- **Responsive shell**: `isDesktop` (≥ 768px) swaps between a left sidebar and a bottom mobile nav. Both call `navTo`.

### Data model (Supabase tables)

All persistence is Postgres via `@supabase/supabase-js`. Tables referenced:

- `profiles` — `id` (auth user id), `username`, `tiktok_handles[]`, `xp`, `streak`, `last_claim`, `referral_code`, `referred_by`, `referral_earnings`, plus cumulative totals: `total_sales`, `total_gmv`, `total_orders`, `total_commission`, `total_aov`, `total_cancelled`, `total_cancelled_gmv`, `total_live_streams`. **Cumulative totals are denormalized** — `handleFile` and `deleteImportByDate` must keep them in sync with `xp_events`.
- `xp_events` — every XP change. `reason ∈ {'import','manual','streak_milestone','referral_bonus'}`. Import rows additionally carry `gmv`, `commission`, `aov`, `orders`, `sales`, `live_streams`, `cancelled`, `cancelled_gmv`, `product_name`, and a backdated `created_at` (parsed from filename `YYYYMMDD`).
- `affiliate_product_stats` — per-(profile, product) aggregate. Rebuilt by `deleteImportByDate` from remaining `xp_events`.
- `rewards` — drives the level ladder. `LEVELS` is computed dynamically from `rewards` ordered by `xp_required` ([src/App.js:831](src/App.js)); falls back to `DEFAULT_LEVELS` when empty.
- `streak_milestones` — overrides `DEFAULT_MILESTONES`.
- `products` + `product_mappings` — product catalog with `keywords[]` used to map raw import names to canonical products.
- `xp_exclusions` — `(profile_id, product_name, start_date?, end_date?)` rows that zero out XP for matching imports while still recording sale stats.
- `payouts` — monthly referral payout records (1% of referrer's referred-creator net GMV).
- `app_meta` — singleton row with `key='last_import'` for the "last updated by" banner.
- `live_sessions` — affiliate-logged live streams: `started_at`, `ended_at`, `product_name`, `gmv`, `units`, `notes`. A row with `ended_at IS NULL` is the in-progress session for that profile (a unique partial index enforces at most one). Schema/RLS lives at [migrations/0001_live_sessions.sql](migrations/0001_live_sessions.sql).

### The import pipeline ([src/App.js:652-783](src/App.js))

`handleFile(file)` is the heart of the admin flow and the most error-prone code in the repo:

1. Parse `.csv` (custom `parseCSV` handling quoted fields) or `.xlsx`/`.xls` (via `xlsx` package).
2. Resolve columns by fuzzy header match using `TCOLS` — TikTok Shop exports come in many shapes, so always extend `TCOLS` rather than hard-coding header names.
3. Extract import date from filename (`...20260319...` → `2026-03-19`); fall back to today.
4. Match each row's `@handle` to a profile by scanning `tiktok_handles[]` (case-insensitive, optional `@` prefix). Unmatched → logged, skipped.
5. Resolve product name via `products[].keywords` first, then name contains, then raw.
6. Check `xp_exclusions` — excluded rows still update sale totals but insert `amount: 0` XP events.
7. Return-only rows (no new sales, only cancellations) subtract XP: `XP_PER_10_GMV * floor(cancelled_gmv/10)`.
8. Normal rows: `xpGain = floor(netGMV/10) * XP_PER_10_GMV` where `netGMV = max(0, gmv - cancelled_gmv)`.
9. Streak: incremented if `importDate` is exactly 1 day after `last_claim`, reset on gaps. Hitting a milestone day adds bonus XP via a separate `xp_events` row reason.
10. Referrer is credited `referral_earnings += 1% * netGMV`.

`deleteImportByDate(date)` is the inverse and must subtract the same fields it added — keep them in lockstep when extending the schema.

### Auth & admin

- Supabase Auth (email + password). `doSignup` ([src/App.js:576](src/App.js)) creates an `auth.users` row, then inserts the `profiles` row (using the auth user id as the profile id), generates a `referral_code`, and applies referral bonuses bidirectionally.
- The admin page is gated by a client-side password check against `REACT_APP_ADMIN_PASSWORD`, persisted in `localStorage['ll-admin']`. **This is not a security boundary** — Supabase Row Level Security on the tables is the actual guard; if you're adding admin-only writes, put the check in RLS, not in the UI.

### Conventions to match

- The codebase favors **terse single-line functions** and inline styles for one-off layout, with the shared `CSS` block carrying reusable classes. Match the existing density; don't introduce a CSS-in-JS library or split components into separate files unless you're doing a deliberate refactor.
- All currency is GBP (`fmtGBP`). Dates use `en-GB` locale.
- No TypeScript, no linter config, no test setup — don't add them silently.
