-- Phase 9: Post-Gate-H Comprehensive Legacy Cleanup (Blueprint 2.2.2)

-- 1. Drop Deprecated Columns from Active Tables
ALTER TABLE "challenges" DROP COLUMN IF EXISTS "quorum_requirement";
ALTER TABLE "challenges" DROP COLUMN IF EXISTS "allow_revisions";
ALTER TABLE "challenge_voting_rounds" DROP COLUMN IF EXISTS "round_sequence";
ALTER TABLE "critique_comments" DROP COLUMN IF EXISTS "critique_aspect";
ALTER TABLE "challenge_results" DROP COLUMN IF EXISTS "winner_slot_id";

-- 2. Drop Deprecated Enum Types
DROP TYPE IF EXISTS "critique_aspect";

-- 3. Drop Deprecated Tables & Associated Types
DROP TABLE IF EXISTS "challenge_jury_scores" CASCADE;
DROP TABLE IF EXISTS "challenge_jury_slot_assignments" CASCADE;
DROP TABLE IF EXISTS "challenge_winner_slots" CASCADE;
DROP TYPE IF EXISTS "slot_type";
