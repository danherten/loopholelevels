-- 0005_rewards_value_admin_only.sql
-- Defence-in-depth for rewards.value (£ cost per tier). Previous client
-- patch hides the column from non-admin loadRewards() calls, but the
-- anon key could still be used to query it directly. This locks it at
-- the database level:
--
--   1. Adds profiles.is_admin so we can identify which auth users are
--      allowed to read the value.
--   2. Revokes SELECT on the rewards.value column from anon / authenticated.
--      PostgREST will silently omit `value` from any response from those
--      roles — even if the client tries to select it explicitly.
--   3. Provides an admin RPC `admin_get_reward_values()` that returns
--      (id, value) pairs after verifying the caller is an admin. The
--      Catalog editor and Rewards Owed tab call this via supabase.rpc().
--
-- After running this, mark your owner account as admin (last block).

-- 1. is_admin column on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. is_admin() helper — SECURITY DEFINER so it can read profiles regardless
--    of the caller's own RLS scope. STABLE so Postgres can cache it per query.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), FALSE);
$$;

-- 3. Revoke column-level SELECT on rewards.value from the public anon /
--    authenticated roles. PostgREST translates this into an automatic
--    column drop from response payloads — no error to the client, just no
--    value field. Admin reads route through the RPC below instead.
REVOKE SELECT (value) ON public.rewards FROM anon, authenticated;

-- 4. Admin RPC for reading reward values. Raises if caller isn't admin so
--    a non-admin who guesses the function name still can't get the values.
CREATE OR REPLACE FUNCTION public.admin_get_reward_values()
RETURNS TABLE(id UUID, value NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT r.id, r.value FROM public.rewards r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_reward_values() TO authenticated;

-- 5. One-time setup: mark the admin account. Replace the user id below with
--    your owner's auth.users id (find it in Supabase Dashboard → Authentication
--    → Users, or run:
--      SELECT id, email FROM auth.users ORDER BY created_at LIMIT 5;
--    to look it up).
--
--    Run this once after the migration:
--
-- UPDATE public.profiles SET is_admin = TRUE WHERE id = '<paste-your-auth-user-id>';
--
-- If rewards.id turns out to be BIGINT instead of UUID in your schema, change
-- the RETURNS TABLE type in step 4 from `id UUID` to `id BIGINT` and rerun.
