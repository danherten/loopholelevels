# TODO.md

Outstanding items and known gotchas as of the end of the May 2026 session. Listed roughly in order of "if you only do one thing, do this".

## Known leftover code (small cleanup tasks)

### `live_sessions` references after revert
PR #2 added a `Lives` feature with a `live_sessions` table. PR #3 reverted the feature and the table was scheduled to be dropped in Supabase. **But `deleteAffiliate` in `src/App.js` still calls `await supabase.from('live_sessions').delete().eq('profile_id', profileId)`** (around line 934). Plus a `CLAUDE.md` reference still mentions the call.

The delete is inside a `try/catch` so it won't crash if the table doesn't exist — but it's dead code that should either:
- (a) be removed entirely if `live_sessions` is gone from production, or
- (b) get the Lives feature re-introduced if the user changes their mind.

If you're not sure whether the table exists, ask the user. Don't drop the call until confirmed.

### Migrations folder numbering gap
`0001_live_sessions.sql` was deleted in PR #3's revert. Only `0002_products_free_shipping.sql` exists now. Any future migration should be `0003_…` to keep the order monotonic.

## Operational items (admin must do these in Supabase)

### RLS verification (high priority)
The admin password is bundled into the client JS — **the only real security boundary is Supabase Row Level Security**. Confirm every table has RLS enabled and policies scoped to `auth.uid()` (not `using (true)`):
- `profiles`, `xp_events`, `affiliate_product_stats`, `rewards`, `streak_milestones`, `products`, `product_mappings`, `xp_exclusions`, `payouts`, `app_meta`.

Tables where ordinary affiliates should only read/write their OWN row: `profiles`, `xp_events`, `affiliate_product_stats`, `xp_exclusions`. Admin-only writes need a separate policy or service-role.

### Supabase Site URL
Authentication → URL Configuration → Site URL should be the production domain (not `localhost:3000`). The user hit this when the password-recovery email pointed at localhost.

### JWT expiry
Default is 1 hour. The user bumped it to 24h+ during the auto-logout debugging session (PR #20). Confirm Supabase Auth → Settings → JWT Expiry is at least `86400`.

### Banning vs deleting
The in-app `🗑️` Delete button removes the `profiles` row + related data but **cannot** remove the `auth.users` row (no service-role key on the client). To fully prevent a deleted user from logging back in (where `doLogin` would lazy-create a fresh empty profile), also Ban them in **Supabase Dashboard → Authentication → Users → row menu → Ban user**.

## Architectural caveats to keep in mind

### iOS PWA viewport hack is fragile
The bottom-nav-floats-too-high bug took 7 PRs to nail down (#9, #10, #19, #22, #25, #26, #27). The final fix relies on:
- `body.style.height = window.innerHeight + 'px'` (JS-managed) — set both before React mounts AND on every viewport resize.
- In standalone PWA mode, `screen.height` (orientation-aware) is added to the candidate list and the max wins, because iOS returns a stale `innerHeight` from the Safari-with-toolbar context.
- `.bnav` is rendered **outside** `.app` (as a sibling under the React fragment) to dodge `overflow:hidden`-trap quirks.

If you touch the layout shell (`html`/`body`/`#root`/`.app`), expect to re-verify on a real iOS PWA. Don't change the body-height JS without reading PR #27.

### `detectSessionInUrl: false`
[src/lib/supabase.js](src/lib/supabase.js) explicitly disables URL-fragment session detection. This was so password-recovery magic links don't auto-log-in (since there's no proper recovery page yet). **If you ever build a forgot-password flow**, you'll need to flip this to `true` and build a `/auth/recovery` page that handles the redirect.

### Denormalized totals
`profiles.total_*` columns are derived from `xp_events`. Every write path (`handleFile`, `deleteImportByDate`, `saveEditAffiliate`, `revertReferral`, `deleteAffiliate`) must keep them in lockstep. If you add a new write-path, audit it against `handleFile`'s field list.

## Feature gaps / possible future work

Not bugs — just things that were discussed but not built. Only pursue if the user asks:

- **Forgot password flow in-app.** Currently the user has to reset via the Supabase dashboard. Needs `detectSessionInUrl: true` + a recovery handler page + a "Forgot password?" link on the sign-in screen.
- **Lives session tracking** (the feature reverted in PR #3). If the user changes their mind, the original code is in the git history of PR #2.
- **Recent activity feed** in admin. The Top Performers / Top Referrers / Payouts Due trio is nice but doesn't show "what happened today." Could query `xp_events` ordered by `created_at desc limit 50`.
- **GMV over time chart on admin overview.** Possibly similar to the home page's `MiniChart` but scoped to platform-wide. Would need a per-day aggregation across all profiles' import events.
- **Period filter on admin** (Today / Yesterday / 7D / Month). All admin stats are currently lifetime totals. The home page has period filtering via `dateRange`/`rangeBounds`; admin could borrow it.
- **Charts on individual affiliate's admin row.** Click to expand → show their XP timeline + GMV per day. Currently you'd open the ✏️ Edit modal which only shows current values.

## Long-running watch items

- **Auto-logouts.** PR #20 added diagnostic logging (later removed in PR #28) and visibility-aware session recovery. The user hasn't reported recent auto-logouts; assume it's working but keep an ear out. If it comes back, the diagnostic-only commit from PR #20 is in the history and can be re-applied for a debugging session.

## Saved memory (agent context)

The user has the following preference saved in `~/.claude/projects/-Users-danielwilson-Documents-GitHub-loopholelevels/memory/`:

> **Always create a PR for changes — never commit directly to main.** Every change must go through `gh pr create`; never push to main directly.

This was switched from the opposite preference earlier in the May 2026 session. Honor it.
