# Current Status

## Phase
Phase 2.5 — Dual Auth & Account Merging (COMPLETED)
Phase 3 — Challenge Submission Engine (NEXT)

## Last Completed
- **Phase 0 Setup**: Next.js 15, React 19, TypeScript, Tailwind CSS v4 `@theme` (Studio Atelier), Docker Compose (PostgreSQL 16 on port 5433, Redis 7 on port 6379), Drizzle ORM.
- **Phase 1 Foundation**:
  - Full PostgreSQL Drizzle schema implemented and migrated.
  - Discord-style SHA-256 hashed single/multi-use invitation engine (`src/lib/invites.ts`).
  - Protected clean master storage streaming endpoint (`/api/media/master/[key]`).
- **Phase 2 Artist & Gallery Platform**:
  - Commission schema, service cards, and Do/Don't scope rules editor.
  - Async media processing pipeline with Sharp & BullMQ: EXIF/ICC metadata stripping, master clean storage, public watermarked derivative generation (custom SVG watermark), WebP thumbnailing, and video/GIF poster extraction.
  - Public gallery (`/gallery`), Lightbox (`/artworks/[slug]`), Artist directory (`/artists`), Artist showcase (`/artists/[slug]`), and Commission directory (`/commissions`).
- **Phase 2.5 Email/Password Auth, Account Merging & Email Verification**:
  - `bcryptjs` password hashing & Credentials authentication in NextAuth.
  - Automatic Google account merging on matching email (zero duplicate accounts).
  - Email verification token engine (`email_verification_tokens`) and verification view (`/verify-email`).
  - Password reset flow (`/forgot-password`, `/reset-password/[token]`).
  - Flexible invitation entry (`/invite`) with intelligent token/URL regex parsing.
  - Dual registration tabs on `/invite/[token]` (Google OAuth & Email/Password).
  - Full automated integration test suite verified (`src/lib/__tests__/testAuthAndMerging.ts`).
  - Production build verified with Turbopack (`npm run build`) passing across 21 routes with 0 errors/warnings.

## Current Branch
`main`

## Current Focus
- Starting **Phase 3 — Challenge Submission Engine**:
  - Challenge schema: `challenges`, `challenge_stages`, `challenge_rules`, `challenge_winner_slots`, `challenge_submissions`, `challenge_jury_assignments`.
  - Challenge lifecycle: Draft -> Scheduled -> Submission Open -> Submission Closed -> Voting -> Finished.
  - Member artwork submission action linking locked `ArtworkVersion`.
  - Submission revisions before deadline & strict read-only lock after deadline.
  - Admin challenge management CRUD & deadline scheduler.

## Next Task
- Define Phase 3 Challenge schema in `src/db/schema/challenges.ts` and apply migration.
- Build Challenge views (`/challenges`, `/challenges/[slug]`), submission modal, and admin challenge editor.

## Blockers
- None.
