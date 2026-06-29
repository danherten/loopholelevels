-- 0007_profiles_rewards_redeemed_cash_levels.sql
-- Tracks which redeemed tiers the affiliate took as the 80% cash alternative
-- rather than the physical product. Subset of rewards_redeemed_levels — every
-- entry here must also appear in rewards_redeemed_levels. Levels in
-- rewards_redeemed_levels but NOT in this array were delivered as the product.
--
-- Lets the admin's "Already Delivered" total reflect actual cost (80% × value
-- for cash redemptions, 100% × value for product redemptions).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rewards_redeemed_cash_levels INT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.rewards_redeemed_cash_levels IS
  'Subset of rewards_redeemed_levels indicating which tiers the affiliate took as the 80%% cash alternative. Levels in rewards_redeemed_levels but absent here were physically delivered.';
