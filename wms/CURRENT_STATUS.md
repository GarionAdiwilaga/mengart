# Current Status

## Phase
Phase 3 — Challenge Submission Engine (COMPLETED)
Phase 4 — Stars & Jury Workflow (NEXT)

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
  - Challenge schema: `challenges`, `challenge_kit_files`, `challenge_winner_slots`, `challenge_jury_assignments`, `challenge_submissions`, `challenge_submission_versions`.
  - Authoritative lifecycle calculator & deadline locks in WITA (`src/lib/challenges.ts`).
  - Member artwork submission action with versioning & revisions (`src/app/actions/challenges.ts`).
  - Challenge kit streaming endpoint (`/api/challenges/kit/[fileKey]`).
  - Public challenge directory (`/challenges`) with active countdowns and category tabs.
  - Challenge detail view (`/challenges/[slug]`) with stage timeline, rules card, challenge kit download, artist's submission card, and fair anti-bias candidate grid.
  - Admin challenge manager (`/admin/challenges`, `/admin/challenges/new`) with lifecycle transition buttons.
  - Automated integration tests verified (`src/lib/__tests__/testPhase3Challenges.ts`).
  - Production build verified with Turbopack (`npm run build`) passing across 24 routes with 0 errors/warnings.

## Current Branch
`main`

## Current Focus
- Starting **Phase 4 — Stars & Jury Workflow**:
  - Ballot schema: `challenge_ballots`, `challenge_ballot_stars`, `challenge_jury_votes`, `challenge_results`.
  - Anonymous ballot allocation with atomic Stars deduction & validation (no self-voting, editable until voting closes).
  - Anti-bias candidate discovery views (Balanced Atelier Grid & Focus/Comparison Deck).
  - Real-time remaining Stars drawer / Ballot Review Dock.
  - Quorum verification & tiebreak round triggers.
  - Jury scoring & winner assignment.

## Next Task
- Define Phase 4 voting schema in `src/db/schema/ballots.ts`.
- Implement Ballot voting server actions and voting interface with candidate slide deck.

## Blockers
- None.
