-- Migration: 0008_round_ballot_uniqueness_and_tie_pending.sql
-- Description: Gate B / Phase 2 - Add tie_pending enum, migrate ballot uniqueness to (voting_round_id, user_id),
-- reconcile legacy rank-1 community winners to community_vote_winner, and enforce partial unique indexes.

-- 1. Add tie_pending to challenge_status enum
ALTER TYPE "challenge_status" ADD VALUE IF NOT EXISTS 'tie_pending';

-- 2. Add columns to challenge_results
ALTER TABLE "challenge_results" 
  ADD COLUMN IF NOT EXISTS "resolution_method" text,
  ADD COLUMN IF NOT EXISTS "source_voting_round_id" uuid REFERENCES "public"."challenge_voting_rounds"("id") ON DELETE SET NULL;

-- 3. Fail-Closed Validation Block for Existing Ballots, Rounds, and Results
DO $$
DECLARE
  orphans_count integer;
  mismatch_count integer;
  round_type_mismatch_count integer;
  dup_main_count integer;
  dup_tb_count integer;
  dup_open_count integer;
  dup_rank1_count integer;
BEGIN
  -- A. Link any unlinked legacy ballots to matching voting rounds
  UPDATE "challenge_ballots" b
  SET "voting_round_id" = r.id
  FROM "challenge_voting_rounds" r
  WHERE b."voting_round_id" IS NULL
    AND b."challenge_id" = r."challenge_id"
    AND b."round_type"::text = r."round_type"::text;

  -- Purge any orphaned ballots where no voting round exists
  DELETE FROM "challenge_ballots" WHERE "voting_round_id" IS NULL;

  -- B. Check for orphan voting_round_id (does not exist in challenge_voting_rounds)
  SELECT count(*) INTO orphans_count 
  FROM "challenge_ballots" b
  LEFT JOIN "challenge_voting_rounds" r ON b.voting_round_id = r.id
  WHERE r.id IS NULL;
  IF orphans_count > 0 THEN
    RAISE EXCEPTION 'Legacy ballot reconciliation required: % orphan voting_round_id detected in challenge_ballots', orphans_count;
  END IF;

  -- C. Check for ballot challenge_id != voting_round challenge_id
  SELECT count(*) INTO mismatch_count 
  FROM "challenge_ballots" b
  JOIN "challenge_voting_rounds" r ON b.voting_round_id = r.id
  WHERE b.challenge_id <> r.challenge_id;
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Legacy ballot reconciliation required: % ballot challenge_id does not match voting_round challenge_id', mismatch_count;
  END IF;

  -- D. Check for ballot round_type != voting_round round_type
  SELECT count(*) INTO round_type_mismatch_count
  FROM "challenge_ballots" b
  JOIN "challenge_voting_rounds" r ON b.voting_round_id = r.id
  WHERE b.round_type::text <> r.round_type::text;
  IF round_type_mismatch_count > 0 THEN
    RAISE EXCEPTION 'Legacy ballot reconciliation required: % ballot round_type contradicts authoritative voting round', round_type_mismatch_count;
  END IF;

  -- E. Check for duplicate main rounds per challenge
  SELECT count(*) INTO dup_main_count FROM (
    SELECT challenge_id FROM "challenge_voting_rounds"
    WHERE round_type = 'main'
    GROUP BY challenge_id HAVING count(*) > 1
  ) sub;
  IF dup_main_count > 0 THEN
    RAISE EXCEPTION 'Legacy voting round reconciliation required: % challenge(s) have duplicate main voting rounds', dup_main_count;
  END IF;

  -- F. Check for duplicate tiebreak rounds per challenge
  SELECT count(*) INTO dup_tb_count FROM (
    SELECT challenge_id FROM "challenge_voting_rounds"
    WHERE round_type = 'tiebreak'
    GROUP BY challenge_id HAVING count(*) > 1
  ) sub;
  IF dup_tb_count > 0 THEN
    RAISE EXCEPTION 'Legacy voting round reconciliation required: % challenge(s) have duplicate tiebreak voting rounds', dup_tb_count;
  END IF;

  -- G. Check for multiple OPEN voting rounds per challenge
  SELECT count(*) INTO dup_open_count FROM (
    SELECT challenge_id FROM "challenge_voting_rounds"
    WHERE status = 'open'
    GROUP BY challenge_id HAVING count(*) > 1
  ) sub;
  IF dup_open_count > 0 THEN
    RAISE EXCEPTION 'Legacy voting round reconciliation required: % challenge(s) have multiple OPEN voting rounds', dup_open_count;
  END IF;

  -- H. Check for multiple legacy rank-1 community results per challenge
  SELECT count(*) INTO dup_rank1_count FROM (
    SELECT challenge_id FROM "challenge_results"
    WHERE award_type = 'community_rank' AND final_rank = 1
    GROUP BY challenge_id HAVING count(*) > 1
  ) sub;
  IF dup_rank1_count > 0 THEN
    RAISE EXCEPTION 'Legacy result reconciliation required: Multiple rank-1 community results detected for % challenge(s)', dup_rank1_count;
  END IF;

  -- I. Reconcile legacy rank-1 Community Winners to canonical 'community_vote_winner'
  UPDATE "challenge_results"
  SET award_type = 'community_vote_winner'
  WHERE award_type = 'community_rank' AND final_rank = 1;

END $$;

-- 4. Drop legacy composite unique constraint on ballots
DROP INDEX IF EXISTS "uniq_challenge_user_ballot";

-- 5. Alter voting_round_id column to NOT NULL
ALTER TABLE "challenge_ballots" ALTER COLUMN "voting_round_id" SET NOT NULL;

-- 6. Add unique constraint on (voting_round_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ballot_round_user" ON "challenge_ballots" ("voting_round_id", "user_id");

-- 7. Add partial unique index for official community winner (max 1 per challenge)
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_challenge_community_winner" 
  ON "challenge_results" ("challenge_id") 
  WHERE ("award_type" = 'community_vote_winner');

-- 8. Add partial unique indexes on challenge_voting_rounds
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_challenge_main_round" 
  ON "challenge_voting_rounds" ("challenge_id") 
  WHERE ("round_type" = 'main');

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_challenge_tiebreak_round" 
  ON "challenge_voting_rounds" ("challenge_id") 
  WHERE ("round_type" = 'tiebreak');

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_challenge_open_round" 
  ON "challenge_voting_rounds" ("challenge_id") 
  WHERE ("status" = 'open');
