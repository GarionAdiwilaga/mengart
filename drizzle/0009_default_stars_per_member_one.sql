-- Migration: 0009_default_stars_per_member_one.sql
-- Description: Update default stars_per_member to 1 for challenges and challenge_voting_rounds (Blueprint 2.2.1)

ALTER TABLE "challenges" ALTER COLUMN "stars_per_member" SET DEFAULT 1;
ALTER TABLE "challenge_voting_rounds" ALTER COLUMN "stars_per_member" SET DEFAULT 1;
