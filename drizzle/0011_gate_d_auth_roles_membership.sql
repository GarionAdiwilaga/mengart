-- ============================================================================
-- GATE D FORWARD MIGRATION: AUTHENTICATION, INVITATIONS, MEMBERSHIP & ROLES
-- ============================================================================

-- 1. Email Normalization & Case-Insensitive Duplicate Detection
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT lower(trim("email")) AS norm_email, count(*) AS cnt
      FROM "users"
      GROUP BY lower(trim("email"))
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Legacy email reconciliation failed: duplicate case-insensitive email addresses detected in users table';
  END IF;
END $$;

UPDATE "users" SET "email" = lower(trim("email"));

DROP INDEX IF EXISTS "idx_users_email";
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_users_lower_email" ON "users" (lower("email"));

-- 2. Rename Old Enum & Create New 3-Value Membership Enum
ALTER TYPE "membership_status" RENAME TO "membership_status_old";
CREATE TYPE "membership_status" AS ENUM ('active', 'suspended', 'deleted');

-- 3. Drop Default and Drop NOT NULL (NULL represents PENDING_INVITE)
ALTER TABLE "users" ALTER COLUMN "membership_status" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "membership_status" DROP NOT NULL;

-- 4. Convert Column Type with In-Flight Status Reconciliation
ALTER TABLE "users" 
  ALTER COLUMN "membership_status" 
  TYPE "membership_status" 
  USING (
    CASE 
      WHEN "deleted_at" IS NOT NULL THEN 'deleted'::"membership_status"
      WHEN "membership_status"::text = 'revoked' THEN 'suspended'::"membership_status"
      ELSE "membership_status"::text::"membership_status"
    END
  );

-- 5. Drop Old Enum
DROP TYPE "membership_status_old";

-- 6. Explicitly Drop Deprecated Token Tables (fail-closed without CASCADE)
DROP TABLE IF EXISTS "email_verification_tokens";
DROP TABLE IF EXISTS "password_reset_tokens";

-- 7. Drop Deprecated password_hash Column Cleanly
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";

-- 8. Index on Membership Status
CREATE INDEX IF NOT EXISTS "idx_users_membership_status" ON "users" ("membership_status");

-- 9. Direct Invite Code Schema (Blueprint 2.2.2)
ALTER TABLE "membership_invites" ADD COLUMN IF NOT EXISTS "code" text;
-- Legacy hash-only records are unrecoverable; explicitly revoke them and assign deterministic unique surrogate codes
WITH numbered_invites AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at" ASC, "id" ASC) AS rn
  FROM "membership_invites"
  WHERE "code" IS NULL
)
UPDATE "membership_invites" mi
SET 
  "code" = 'legacy-revoked-' || lpad(ni.rn::text, 8, '0'),
  "revoked_at" = COALESCE(mi."revoked_at", NOW()),
  "revocation_reason" = COALESCE(mi."revocation_reason", 'Migrated legacy hash-only token — replaced by Blueprint 2.2.2 direct code')
FROM numbered_invites ni
WHERE mi."id" = ni."id";

ALTER TABLE "membership_invites" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "membership_invites" DROP CONSTRAINT IF EXISTS "membership_invites_token_hash_unique";
DROP INDEX IF EXISTS "idx_invites_token_hash";
ALTER TABLE "membership_invites" DROP COLUMN IF EXISTS "token_hash";
ALTER TABLE "membership_invites" DROP COLUMN IF EXISTS "token_prefix";
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_membership_invites_code" ON "membership_invites" ("code");
CREATE INDEX IF NOT EXISTS "idx_invites_code" ON "membership_invites" ("code");
