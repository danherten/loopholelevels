-- 0008_profiles_rewards_redemption_amounts.sql
-- Lets the admin override the delivered £ per tier at redeem time — actual
-- postage/product cost varies from the catalog value, and admin wanted to keep
-- the audit trail precise. Keyed by tier level (as text), value is the actual
-- £ the business paid to deliver that reward.
--
-- Absence of an entry = fall back to derived value (rewards.value for product,
-- rewards.value * 0.8 for cash). Presence = use the stored amount verbatim.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rewards_redemption_amounts JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.rewards_redemption_amounts IS
  'Per-tier override of the delivered £ at redeem time. Shape: { "<level>": <numeric> }. Falls back to catalog value when absent.';
