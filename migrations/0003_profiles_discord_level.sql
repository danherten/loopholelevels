-- 0003_profiles_discord_level.sql
-- Adds discord_level to profiles to track which level the user's Discord
-- role currently reflects, per last admin acknowledgement.
--
-- NULL = never acknowledged → row appears in the admin's "Discord role
-- updates" checklist with their current calculated level.
-- < current calculated level → user has levelled up since the last role
-- update on Discord, so they appear in the checklist for the admin to
-- bump their role and tick them off.
-- = current calculated level → up to date, hidden from the checklist.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS discord_level INT;

COMMENT ON COLUMN profiles.discord_level IS
  'Level reflected on this user''s Discord role per last admin acknowledgement. NULL = never acknowledged. < current level = role needs updating.';
