# Handoff Context — Independent QA Certification: Gate G PASS & Directives for Gate H

**Date:** 2026-09-04  
**Approved Baseline:** Gate G Passed Independent QA  
**Current Phase:** Release Gate G Officially Closed — **INDEPENDENT QA PASS**  
**Next Phase:** Release Gate H (Disaster Recovery & Runtime Concurrency) — **UNLOCKED**  
**Overall Status:** **NO-GO** (Until Gate H and Post-Gate-H Legacy Cleanup pass independent QA).

---

## Gate G Deliverables Implemented & Verified

### 1. Database Schema & Migration 0013
- Created [`src/db/schema/settings.ts`](file:///home/garion/Projects/Mengart/src/db/schema/settings.ts) defining `site_settings` table (`key` PK, `value`, `updated_at`, `updated_by`).
- Updated [`src/db/schema/critiques.ts`](file:///home/garion/Projects/Mengart/src/db/schema/critiques.ts) with `is_edited`, `is_hidden`, `hidden_by`, `hidden_reason`, `deleted_by`, `deletion_reason`.
- Updated [`src/db/schema/spotlight.ts`](file:///home/garion/Projects/Mengart/src/db/schema/spotlight.ts) with `deleted_at`, `deleted_by`, `deletion_reason` and recreated unique constraint as partial index `uniq_monthly_spotlight_active_period` on `(year, month) WHERE deleted_at IS NULL`.
- Generated forward migration [`drizzle/0013_gate_g_community_comments_settings.sql`](file:///home/garion/Projects/Mengart/drizzle/0013_gate_g_community_comments_settings.sql) and registered it in `_journal.json`.
- Added Scenario 10 in [`scripts/verifyMigrations.ts`](file:///home/garion/Projects/Mengart/scripts/verifyMigrations.ts) verifying forward upgrade and partial index behavior.

### 2. Simple Comments & Social Badge (Blueprint 2.2.2 §7.5)
- **Unified Comments:** Single flat/threaded stream without aspect splits. `critique_aspect` retains `"general"` for backward compatibility (per Pre-Production Legacy Deprecation Policy).
- **Social Badge Only:** `critique_welcome` / `critiqueMode` acts as a social indicator ("Kritik Dipersilakan" or "Showcase") and does not block commenting on public artworks.
- **Permissions & Actions:** Guest read-only, active member write/reply, active author edit with `(diedit)` badge, author soft-delete, staff hide/restore with mandatory reason ($\ge 5$ chars) and audit logging (`comment.hide`, `comment.restore`).
- **Path Revalidation:** Explicitly revalidates `/artworks/[slug]`, `/gallery`, `/`.

### 3. Manual Featured Artist with History (Blueprint 2.2.2 §15)
- **Strict Manual Admin Curation:** Only Administrators can set/delete Featured Artists via Server Actions. Zero automated cron or reminder jobs.
- **Soft-Deletion & Partial Indexing:** Admin soft-deletion records reason and unpublishes without violating uniqueness for replacement spotlights.
- **Historical Archive:** `getCuratedSpotlightHistory` retrieves all active historical spotlights.

### 4. Discovery Homepage Alignment (Blueprint 2.2.2 §14)
- **8 Required Sections:**
  1. Hero & Value Pillars
  2. Recent Public Artworks Grid (public WebP/MP4 derivatives, spoiler blur)
  3. Current/Upcoming Visible Challenge Showcase
  4. Latest Challenge Result Winner Highlight
  5. Current Featured Artist Spotlight Card
  6. Member Artists Open for Commission (with quick badges)
  7. Admin-Editable "About Community" section (with `EditAboutModal`)
  8. Layout Footer with explicit WITA timezone notice
- **Removed Activity Feed:** Public activity feed removed per Blueprint 2.2.2 §24 #24.

### 5. 9:16 Canvas Story Card Generator (Blueprint 2.2.2 §16)
- Client-side Canvas rendering producing $1080 \times 1920$ px PNG.
- **Results Mode:** Unranked award labels (`Juara Favorit Komunitas`, `Penghargaan Juri: <Category>`) with zero numeric ranks (`#null`, `#2`, `#3`).
- **Announcement Mode:** WITA formatted submission deadline (`Asia/Makassar` / UTC+8).
- **Sharing:** Web Share API integration with download fallback.

### 6. OBS-001 Bug Fix
- `createOrUpdateChallengeAction` defaults `allowRevisions` to `true` when omitted from form submissions.

---

## Full Verification Matrix Status
- `npm run test:migrate`: **PASSED (10/10 scenarios)**
- `npx tsx src/lib/__tests__/testGateGCommunityAndStoryCard.ts`: **PASSED (16/16 scenarios)**
- `npm run test:all`: **PASSED (15/15 test suites)**
- `npm run lint`: **PASSED (0 warnings, 0 errors)**
- `npm run build`: **PASSED (31/31 routes compiled)**
- `npm run test:e2e`: **PASSED (6/6 Playwright user journeys)**

---

## Directive for Next Step
- **HARD STOP:** Standing by for Independent QA cumulative review of Gate G. Do NOT start Gate H.
