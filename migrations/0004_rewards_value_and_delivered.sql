-- 0004_rewards_value_and_delivered.sql
-- Adds:
--   1. rewards.value — the £ value of each level's reward (e.g. £50 Amazon
--      Voucher = 50.00, JBL Flip 7 = 139.99). Admin uses this in the new
--      'Rewards Owed' admin tab to compute what's owed to affiliates that
--      have unlocked reward tiers.
--
--   2. profiles.rewards_delivered_level — the highest level reward the
--      admin has confirmed they've delivered to this affiliate. NULL = no
--      rewards delivered yet. Together with the profile's current calculated
--      level, this drives the per-affiliate 'owed' total.

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS value NUMERIC(10,2) DEFAULT 0;
COMMENT ON COLUMN rewards.value IS
  '£ value of the level''s reward, used by the admin Rewards Owed tracker.';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rewards_delivered_level INT;
COMMENT ON COLUMN profiles.rewards_delivered_level IS
  'Highest level reward physically delivered to this affiliate, per admin acknowledgement. NULL = nothing delivered yet.';
