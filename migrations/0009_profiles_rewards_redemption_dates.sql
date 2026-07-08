-- 0009_profiles_rewards_redemption_dates.sql
-- Timestamp per tier at redeem time, so the Delivered history view can show
-- 'Redeemed 3 days ago' instead of only the cross date. Shape: { "<level>": "<ISO>" }.
--
-- Older redemptions predate this column and just render '—' in the redeemed-at
-- column. New redemptions write the current timestamp; undoing clears the entry.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rewards_redemption_dates JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.rewards_redemption_dates IS
  'Per-tier redemption timestamp keyed by level as string. Written when the admin marks a tier redeemed; cleared on undo. Falls back silently when absent (legacy rows).';
