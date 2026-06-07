-- 0006_profiles_rewards_redeemed_levels.sql
-- Replaces the high-water-mark `rewards_delivered_level` (single INT) with
-- a per-level array `rewards_redeemed_levels` (INT[]). This lets the admin
-- mark individual tiers as redeemed in any order — e.g. dispatch the L3
-- speaker today but leave the L1 starter bundle for later.
--
-- Backfills the new array from the existing high-water mark so no data is
-- lost. The old column stays around as a fallback the client treats as
-- 'everything up to N is redeemed too'.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rewards_redeemed_levels INT[] DEFAULT '{}';

-- Backfill: for every profile whose old rewards_delivered_level is set,
-- populate the array with all levels 1..N.
UPDATE profiles
SET rewards_redeemed_levels = COALESCE(
  (SELECT ARRAY(SELECT generate_series(1, COALESCE(rewards_delivered_level, 0)))),
  '{}'
)
WHERE rewards_delivered_level IS NOT NULL
  AND rewards_delivered_level > 0
  AND (rewards_redeemed_levels IS NULL OR cardinality(rewards_redeemed_levels) = 0);

COMMENT ON COLUMN profiles.rewards_redeemed_levels IS
  'Array of reward tier levels the admin has marked as physically redeemed for this affiliate. Independent per level — admin can tick L3 without ticking L1. Replaces rewards_delivered_level (still present as a fallback).';
