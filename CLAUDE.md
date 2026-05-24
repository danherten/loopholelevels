# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Create React App project — no test runner is wired up.

- `npm start` — dev server on `http://localhost:3000`
- `npm run build` — production build to `build/`

Required env vars (in `.env` / `.env.local`, all prefixed `REACT_APP_` so CRA exposes them to the client):

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_ADMIN_PASSWORD` — gates the in-app admin page (default `LoopholeLads123` in [src/App.js:5](src/App.js:5)). **Bundled into the JS — not a security boundary.**

## Architecture

**Loophole Levels** is an affiliate-rewards / gamification PWA for TikTok Shop creators. Admins import TikTok Shop sales reports (`.csv` / `.xlsx`); creators earn XP and level up based on their net GMV. The whole app is one ~2600-line React file.

### The whole app is `src/App.js`

[src/App.js](src/App.js) is the entire application — a single default-exported `App` component with all state, all data-loading functions, all page views, and all admin tooling. Other source files:

- [src/index.js](src/index.js) mounts `<App/>` AND runs critical iOS-PWA viewport fix-up (see *iOS PWA viewport quirks* below) before React mounts.
- [src/lib/supabase.js](src/lib/supabase.js) — Supabase client. `storageKey: 'll-auth'`, `detectSessionInUrl: false`.

Expect to read large slices of `App.js` before editing. Key landmarks (rough line numbers — file grows, search by name):

- **Constants & helpers** (top): `DEFAULT_LEVELS`, `DEFAULT_MILESTONES`, `XP_PER_10_GMV` (= 100 XP per £10 net GMV), `TCOLS` (fuzzy header-name aliases for CSV/XLSX import), pure helpers (`getLv`, `getNx`, `xpPct`, `fmtGBP`, `parseCSV`, `splitLine`, `findCol`).
- **Inline CSS** (~lines 180-330): one `CSS` template literal injected into `<style>`. CSS custom properties (`--bg`, `--card`, `--pu`, `--fh` Bebas Neue, `--fb` Space Grotesk) drive the dark theme. **No CSS file** — edit styles here.
- **`App` component**: ~70 `useState` hooks. View routing is a single `page` string (`'home' | 'rewards' | 'lb' | 'level' | 'referrals' | 'products' | 'profile' | 'admin'`); each page is a `{page==='x' && (...)}` block. `navTo(pg)` is the navigation primitive and triggers per-page data loads.
- **Responsive shell**: `isDesktop` (≥ 768px) swaps between a left sidebar and a bottom mobile nav. The bottom nav is rendered **outside** `.app` (sibling under the root fragment) to dodge an iOS WebKit `overflow:hidden` containing-block bug.

### Data model (Supabase tables)

All persistence is Postgres via `@supabase/supabase-js`. Tables referenced from code:

- `profiles` — `id` (auth user id), `username`, `tiktok_handles[]`, `avatar_url`, `xp`, `streak`, `last_claim`, `referral_code`, `referred_by`, `referral_earnings`, plus cumulative totals: `total_sales`, `total_gmv`, `total_orders`, `total_commission`, `total_aov`, `total_cancelled`, `total_cancelled_gmv`, `total_live_streams`. **Cumulative totals are denormalized** — `handleFile`, `deleteImportByDate`, `saveEditAffiliate`, `revertReferral`, and `deleteAffiliate` must keep them in sync with `xp_events`.
- `xp_events` — every XP change. `reason ∈ {'import','manual','streak_milestone','referral_bonus'}`. Import rows additionally carry `gmv`, `commission`, `aov`, `orders`, `sales`, `live_streams`, `cancelled`, `cancelled_gmv`, `product_name`, and a backdated `created_at` (parsed from filename `YYYYMMDD`). **Canonical source of truth** — `profiles` totals are derivable from this.
- `affiliate_product_stats` — per-(profile, product) aggregate. Rebuilt by `deleteImportByDate` from remaining `xp_events`.
- `rewards` — drives the level ladder. `LEVELS` is computed dynamically from `rewards` ordered by `xp_required`; falls back to `DEFAULT_LEVELS` when empty.
- `streak_milestones` — overrides `DEFAULT_MILESTONES`.
- `products` + `product_mappings` — product catalog with `keywords[]` used to map raw import names to canonical products. `products.free_shipping: boolean` toggles a green "🚚 FREE SHIPPING" chip on customer product cards (migration `0002_products_free_shipping.sql`).
- `xp_exclusions` — `(profile_id, product_name, start_date?, end_date?)` rows that zero out XP for matching imports while still recording sale stats.
- `payouts` — monthly referral payout records (1% of referrer's referred-creator net GMV). Created via the admin "💷 Generate Payout Records" button; marked paid one-by-one in the Referral Payouts section.
- `app_meta` — singleton row with `key='last_import'` for the "last updated by" banner.

⚠️ The code in `deleteAffiliate` still calls `delete from live_sessions where profile_id = …`. The `live_sessions` table was added (PR #2) and reverted (PR #3); production may or may not have the table. The delete is wrapped in a try/catch so it's tolerant of the table not existing, but **see [TODO.md](TODO.md)** for cleanup.

### The import pipeline (`handleFile`)

`handleFile(file)` is the heart of the admin flow and historically the most error-prone code. Major bugs were fixed in PR #8 (multi-row race, write order, backdated-streak). What it does now:

1. Parse `.csv` (custom `parseCSV` handling quoted fields) or `.xlsx`/`.xls` (via `xlsx` package).
2. Resolve columns by fuzzy header match using `TCOLS` — TikTok Shop exports come in many shapes. **Extend `TCOLS` rather than hard-coding header names** when columns shift.
3. Extract import date from filename (`...20260319...` → `2026-03-19`); fall back to today.
4. Load `profiles` once. **Mutate `p` in-place via `Object.assign` after each row's writes** so multi-row imports for the same creator accumulate correctly (the original bug that lost gains on rows 1..N-1).
5. Match each row's `@handle` to a profile by scanning `tiktok_handles[]` (case-insensitive, optional `@` prefix). Unmatched → logged, skipped.
6. Resolve product name via `products[].keywords` first, then name contains, then raw.
7. Check `xp_exclusions` — excluded rows still update sale totals but insert `amount: 0` XP events.
8. Return-only rows (no new sales, only cancellations) subtract XP: `XP_PER_10_GMV * floor(cancelled_gmv/10)`.
9. Normal rows: `xpGain = floor(netGMV/10) * XP_PER_10_GMV` where `netGMV = max(0, gmv - cancelled_gmv)`.
10. **Write order: `xp_events.insert` FIRST, then `profiles.update`**. `xp_events` is canonical — if the profile-update fails, totals can be re-derived from events.
11. Streak: only updated when **`importDate >= last_claim`**. Backdated rows (admin re-importing an older date after a newer one) skip the streak math so it doesn't corrupt the next correct import.
12. Referrer is credited `referral_earnings += 1% * netGMV`, mutated in-place on `refP` so subsequent rows for the same referrer accumulate too.

`deleteImportByDate(date)` is the inverse — and it must subtract everything `handleFile` added, **including** the 1% referrer earnings (PR #8 added that reversal). It also resets `streak`/`last_claim` on affected profiles since the deleted day breaks continuity.

The admin upload zone accepts **multiple files at once** (drag-drop or file picker); they're processed sequentially via `await` so each subsequent file sees post-previous state.

### Daily admin workflow

Per the user's launch routine, TikTok Shop produces **one Creator List export per product per day**. Admin's daily flow:

1. Export each product's Creator List from TikTok Shop for yesterday (the filename auto-contains `YYYYMMDD-YYYYMMDD`).
2. Open admin → drag all the day's files (one per product) onto the upload zone at once.
3. Watch the per-file toasts confirm matched/unmatched counts. A final `✅ Imported N files` toast confirms the batch finished.

If a file lacks a Product column, the importer falls back to a slug extracted from the filename (matched against `products[].keywords`).

### Auth & admin gate

- Supabase Auth (email + password). `doSignup` creates an `auth.users` row, then inserts the `profiles` row (using the auth user id as the profile id), generates a `referral_code`, and applies referral bonuses bidirectionally (+100 XP to both new user and referrer).
- `doLogin` has orphan-recovery: if the auth user exists but no `profiles` row does, it lazy-creates a minimal one (PR #8). **Caveat:** this means an affiliate deleted via the admin Delete button can re-login and re-create a fresh empty profile. To fully lock someone out, also use **Supabase Dashboard → Authentication → Users → Ban user**.
- Visibility-aware session recovery (PR #20): on `visibilitychange` / `focus`, if `profileRef.current` is null but Supabase has a session, the app reloads the profile. Mitigates iOS WKWebView suspending the PWA and resuming with stale React state.
- The admin page gate is a client-side password check against `REACT_APP_ADMIN_PASSWORD`, persisted in `localStorage['ll-admin']`. **This is not a security boundary** — Supabase Row Level Security on every table is the actual guard. Confirmed/required: every table needs RLS scoped to `auth.uid()`.

### iOS PWA viewport quirks (very important)

The bottom nav had a long, painful saga of "floats too high on initial load on iOS standalone PWA". Final fix (PRs #25–#27):

- `src/index.js` runs `document.body.style.height = h + 'px'` **before React mounts**. `h` is computed from a candidate list: `visualViewport.height`, `window.innerHeight`, `documentElement.clientHeight`, plus — **only in standalone PWA mode** — `screen.height` (orientation-aware). The max wins.
- The reason for the screen.height fallback: iOS WKWebView in standalone mode returns a stale Safari-with-toolbar-visible `innerHeight` even though the PWA has no toolbar. Adding `screen.height` as a candidate corrects it.
- CSS-side: `body { height: 100%; overflow: hidden; overscroll-behavior: none }`. JS overrides the height.
- `.app { display: flex; flex-direction: column; flex: 1; min-height: 0 }` — no `overflow: hidden`, no explicit height.
- `.bnav` is rendered **outside** `.app` (as a sibling under the React fragment root), `position: fixed; bottom: 0; left: 0; right: 0`. This avoids an iOS WebKit quirk where `position: fixed` inside an `overflow: hidden` ancestor gets trapped to a stale viewport-bottom.
- A `useEffect` in `App` re-applies the body height on `resize` / `orientationchange` / `visualViewport.resize`.

If you change the layout/wrapper structure, **read PR descriptions #9, #10, #19, #22, #25, #26, #27** to understand what each pattern is defending against. The current setup works on iOS Safari, iOS standalone PWA, and desktop. Touching it lightly is risky.

### Admin UI (desktop redesign)

Big redesign in PR #30 + extensions in PR #31. The admin page is desktop-first (mobile keeps the legacy per-card layout):

1. **Hero overview card** — gradient backdrop, 11-column grid on desktop showing: Affiliates · Total Net GMV (big) · Commission · Orders · Units Sold · Returns · XP Awarded · Referrals · Owed · Paid Out · Avg Level.
2. **3-column leaderboards row** (desktop) — Top by GMV / Top Referrers / 💷 Payouts Due. Each ranks the top 5 with avatar + handle + right-aligned coloured Bebas Neue value.
3. **Import drop zone** — multi-file drag-drop.
4. **Affiliate section** — referral tree (collapsible, default-open on desktop), search/level filter, sort selector (`Net GMV / XP / Referrals / Newest / Name`), then the affiliate list.
   - On desktop: a CSS-grid **table** with columns: `# · Affiliate · Lv · XP · Net GMV · Commission · Orders · Units · Streak · Referrals · Actions`. Action cell contains a 54-px wide XP-amount input + small `+ / − / ✏️ / ↩ (revert referral, only when referred_by) / 🗑️` buttons. Container is `overflow-x: auto` with row `min-width: 1100` as a safety net for narrow desktops.
   - On mobile: legacy stacked cards with the same data.
5. **Actions section** — Edit Rewards, Edit Milestones, Edit Products, Generate Payouts, etc.
6. **XP Exclusions**, **Import History — Delete by Date**, **Referral Payouts** (per-month mark-paid management).

Container width: `1320px` on desktop for the admin page, `700px` for everything else.

### Auth/data-edit helpers

- `admAwardXP(profileId, subtract)` — +/− `xpAmounts[profileId]` (default 100) to a profile; logs an `xp_events` row with reason `'manual'`.
- `openEditAffiliate(p)` / `saveEditAffiliate()` — modal that lets admin manually set any of the 9 denormalized totals. Computes deltas, inserts a `manual` `xp_events` audit row with the deltas, then writes new absolute values + recomputed AOV.
- `revertReferral(profileId)` — for foul-play cases. Subtracts the +100 XP signup bonus from both sides, clears `referred_by`, sums the 1% earnings credited to the referrer from this affiliate's import history and subtracts that from their `referral_earnings`. Logs audit rows on both sides.
- `deleteAffiliate(profileId)` — nulls out `referred_by` on anyone they referred, then deletes from `xp_events`, `affiliate_product_stats`, `xp_exclusions`, `payouts`, `live_sessions`, `profiles`. **Does NOT remove the `auth.users` row** (requires service-role key). Admin should also Ban the user in the Supabase dashboard to prevent re-login.

### Discord CTA flow

- First-login per-profile-per-device popup (PR #13) with a 5-second locked X button. localStorage key `ll-discord-cta-<profileId>`.
- Persistent "Join Discord" button on the Profile page + WhatsApp fallback link (PRs #14).
- Both link to `https://discord.gg/eR4eJAhcVG`, support fallback to `https://wa.me/447498435748`.

### Conventions to match

- The codebase favors **terse single-line functions** and inline styles for one-off layout, with the shared `CSS` block carrying reusable classes. Match the existing density; don't introduce a CSS-in-JS library or split components into separate files unless you're doing a deliberate refactor.
- All currency is GBP (`fmtGBP`). Dates use `en-GB` locale.
- No TypeScript, no linter config, no test setup — don't add them silently.
- Visual previews: when changing a UI region that's behind auth, **render the slice in a focused `index.js` harness** with mock data, screenshot via the Claude Preview tool, revert the harness before commit. This pattern is used heavily throughout the PR history.

### Workflow

- **Always create a PR** for changes — never commit directly to `main`. (User preference, saved in agent memory.)
- Branches are `claude/<short-slug>`, pushed via `gh pr create`, merged via `gh pr merge <n> --merge` then `git push origin --delete <branch>` to clean up.
- Migrations live in `migrations/` numbered `0001_…`, `0002_…`. Current state: only `0002_products_free_shipping.sql` exists (0001 was the reverted `live_sessions` migration — see [TODO.md](TODO.md)). New migrations should be `0003_…`.
