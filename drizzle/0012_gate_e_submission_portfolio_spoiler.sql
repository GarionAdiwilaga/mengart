-- Migration 0012: Gate E Submission & Portfolio Simplification + Additive Artwork Spoiler

-- 1. Add is_spoiler to artworks
ALTER TABLE "artworks" ADD COLUMN "is_spoiler" boolean DEFAULT false NOT NULL;

-- 2. Add system_caption to portfolio_entries
ALTER TABLE "portfolio_entries" ADD COLUMN "system_caption" text;

-- 3. Fail-Closed Check: Under Pre-Production Reset Policy, challenge_submissions must be clean (0 rows) before schema migration
DO $$
DECLARE
  sub_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO sub_count FROM "challenge_submissions";
  IF sub_count > 0 THEN
    RAISE EXCEPTION 'Migration 0012 Fail-Closed: Found % legacy challenge_submissions rows. Under the Pre-Production Reset Policy, please reset your non-production database (npm run db:reset && npm run db:migrate).', sub_count;
  END IF;
END $$;

-- 4. Add canonical columns to challenge_submissions
ALTER TABLE "challenge_submissions" 
  ADD COLUMN "artwork_id" uuid NOT NULL REFERENCES "artworks"("id") ON DELETE RESTRICT,
  ADD COLUMN "artwork_version_id" uuid NOT NULL REFERENCES "artwork_versions"("id") ON DELETE RESTRICT,
  ADD COLUMN "title" text NOT NULL,
  ADD COLUMN "description" text,
  ADD COLUMN "software_used" text;

-- 5. Drop legacy current_version_id column from challenge_submissions
ALTER TABLE "challenge_submissions" DROP COLUMN IF EXISTS "current_version_id";

-- 6. Drop obsolete table challenge_submission_versions cleanly without CASCADE
DROP TABLE "challenge_submission_versions";

-- 7. Add Unique Index on (challenge_id, user_id)
CREATE UNIQUE INDEX "uniq_challenge_submission_user" ON "challenge_submissions" ("challenge_id", "user_id");
