# Current Status

## Phase
Phase 4 — Stars & Jury Workflow (COMPLETED)
Phase 5 — Community & Administration (NEXT)

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
- **Phase 2.5 Dual Auth & Account Merging**:
  - `bcryptjs` password hashing & Credentials authentication in NextAuth.
  - Automatic Google account merging on matching email (zero duplicate accounts).
  - Email verification token engine (`email_verification_tokens`) and verification view (`/verify-email`).
  - Flexible invitation entry (`/invite`) with URL extraction.
- **Phase 3 Challenge Submission Engine**:
  - Challenge schema, authoritative lifecycle calculator & deadline locks in WITA (`src/lib/challenges.ts`).
  - Member artwork submission action with versioning & revisions (`src/app/actions/challenges.ts`).
  - Challenge kit streaming endpoint (`/api/challenges/kit/[fileKey]`).
  - Public challenge directory (`/challenges`) and detail view (`/challenges/[slug]`).
  - Admin challenge manager (`/admin/challenges`, `/admin/challenges/new`).
- **Phase 4 Stars & Jury Workflow**:
  - Ballot schema: `challenge_ballots`, `challenge_ballot_stars`, `challenge_jury_scores`, `challenge_results`.
  - Deterministic seeded pseudo-random candidate shuffle per voter to eliminate top-of-page discovery bias (`src/lib/voting.ts`).
  - Self-voting prevention and atomic Star ballot allocations (`src/app/actions/voting.ts`).
  - Dual-mode voting workspace (`VotingWorkspace.tsx`): **Balanced Atelier Grid** (4:3 uniform cards) & **Focus / Comparison Slide Deck** (keyboard arrows, thumbnail jump ribbon, side-by-side mode).
  - Sticky **Ballot Review Dock** with live remaining Stars countdown and quick submission.
  - Jury evaluation portal (`/challenges/[slug]/jury`) with slot nominations and critique notes.
  - Challenge results finalization action and Hall of Fame presentation (`/challenges/[slug]/results`).
  - All automated integration tests verified (`src/lib/__tests__/testPhase4Voting.ts`).
  - Production build verified with Turbopack (`npm run build`) passing across 27 routes with 0 errors/warnings.

## Current Branch
`main`

## Current Focus
- Starting **Phase 5 — Community & Administration**:
  - Constructive critique comments on artworks with markdown / process feedback.
  - Moderation queue for reporting / moderating artworks and comments.
  - Activity feed & community spotlight.
  - Audit log viewer for administrative actions.

## Next Task
- Define Phase 5 critique & moderation schema in `src/db/schema/critiques.ts`.
- Implement critique comments component on Artwork Lightbox (`/artworks/[slug]`).
- Implement Admin Moderation Queue (`/admin/moderation`).

## Blockers
- None.
