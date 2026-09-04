-- Migration 0015: Prune GIF from media_type Enum (Blueprint 2.2.2 §6.1 & §24)

-- 1. Drop default constraints on dependent columns
ALTER TABLE "artworks" ALTER COLUMN "media_type" DROP DEFAULT;
ALTER TABLE "artwork_versions" ALTER COLUMN "media_type" DROP DEFAULT;

-- 2. Create replacement enum type without 'gif'
CREATE TYPE "media_type_new" AS ENUM('image', 'video');

-- 3. Remap columns to new enum, remapping any legacy 'gif' values to 'image'
ALTER TABLE "artworks" ALTER COLUMN "media_type" TYPE "media_type_new" USING (
  CASE WHEN "media_type"::text = 'gif' THEN 'image'::"media_type_new" ELSE "media_type"::text::"media_type_new" END
);

ALTER TABLE "artwork_versions" ALTER COLUMN "media_type" TYPE "media_type_new" USING (
  CASE WHEN "media_type"::text = 'gif' THEN 'image'::"media_type_new" ELSE "media_type"::text::"media_type_new" END
);

-- 4. Drop legacy enum and rename new enum
DROP TYPE "media_type";
ALTER TYPE "media_type_new" RENAME TO "media_type";

-- 5. Restore default constraints
ALTER TABLE "artworks" ALTER COLUMN "media_type" SET DEFAULT 'image';
ALTER TABLE "artwork_versions" ALTER COLUMN "media_type" SET DEFAULT 'image';
