# Permanent Project Decisions

## 2026-08-25

### Baseline Specification Adoption
**Decision:** Adopt `Art_Community_App_Implementation_Blueprint_2.1.md` as the authoritative product requirement and agent baseline.
**Business Rule:** Target scale is ~100 active community members, low admin overhead, strict server-side authorization, immutable submission history, dual media variants (`master_clean` vs `public_watermarked`), UTC timestamps formatted in `Asia/Makassar` (WITA). Payments, escrow, WhatsApp bots, and AI detection are explicitly out of scope.
**Reason:** Documented in project baseline blueprint v2.1.0.

### Confirmed Technology Stack (Option A)
**Decision:** Confirmed **Option A: Next.js 15 (App Router, React 19, TypeScript)** as the fullstack web architecture.
- **Backend & Frontend:** Next.js 15 Fullstack (Server Components + Server Actions / Route Handlers)
- **Database & ORM:** PostgreSQL + Drizzle ORM
- **Queue & Async Worker:** BullMQ + Redis + `sharp` / `ffmpeg`
- **Styling & Components:** Tailwind CSS v4 + `shadcn/ui` + Lucide Icons
- **Auth:** NextAuth.js / Auth.js with Google OAuth 2.0 + custom hashed invite redemption middleware
**Business Rule:** Strict TypeScript throughout codebase; all API endpoints enforce server-side validation (Zod).
**Reason:** Selected by user for integrated SSR Open Graph metadata, unified TypeScript DX, and streamlined Docker deployment.

### Resource Capacity Update
**Decision:** Updated hardware resource assumptions to reflect 15 GiB total RAM (~14 GiB idle available). Media worker concurrency can be increased beyond 1 worker process, and image/video operations (Sharp/FFmpeg) can execute with parallel threads safely without risk of OOM.
**Business Rule:** Utilize available memory for faster media processing queues and thumbnail generation.
**Reason:** Clarified hardware environment with user.

### Cloudflare ZeroTrust & Reverse Proxy Compatibility
**Decision:** Ensure application architecture seamlessly supports Cloudflare Tunnel (`cloudflared`) and Nginx reverse proxy publishing.
**Business Rule:** Trust `X-Forwarded-Proto`, `CF-Connecting-IP`, and `X-Forwarded-For` proxy headers. Enforce `SameSite=Lax` / `Secure` HTTP-only session cookies and maintain absolute protocol-relative asset URLs.
**Reason:** Production deployment will be published via Cloudflare ZeroTrust behind a reverse proxy.

### Phase Sequence Refinements (Approved)
**Decision:** Adopt the 8-phase delivery sequence with two user-approved structural refinements:
1. **Canonical Artwork & Versioning in Phase 1 & 2:** Ensure `artwork_versions` and entity relationships (Artwork -> Artwork Version -> Submission) are established upfront in DB migrations to avoid breaking schema changes in Phase 3.
2. **Notification Core in Phase 2:** Build the in-app notification engine (`notifications` table + event triggers) during Phase 2 so Phase 3 (Challenges) and Phase 4 (Voting/Jury) can immediately trigger disqualification, Star refund, and assignment notifications.
**Business Rule:** No breaking schema refactors across mid-stage phases.
**Reason:** Clean cross-cutting integration for notifications and versioning across submission and voting lifecycle; explicitly approved by user.

## 2026-08-26

### Frontend Design System & Theme Direction
**Decision:** Adopt **Concept 1: "Studio Atelier / Warm Obsidian & Gallery Amber"** as the core visual design language.
- **Palette:** Warm obsidian dark canvas (`#0e1015`), layered charcoal surfaces, amber/gold accent glow (`#f59e0b` for Stars/badges), 1px subtle glass hairlines (`border-white/10`).
- **Typography:** *Syne* (expressive display headings), *Plus Jakarta Sans* (crisp, modern body), *JetBrains Mono* (software tags, WITA timestamps, metadata).
- **Component System:** Tailwind CSS v4 CSS-first design tokens + `shadcn/ui` + Lucide Icons.
**Business Rule:** Artwork is the hero; UI chrome must remain restrained, atmospheric, and high-craft.
**Reason:** Selected by user to give the digital art community a distinctive, atelier-grade gallery feel.

### Challenge Candidate Display & Voting Fairness Architecture
**Decision:** Implement an anti-bias candidate presentation system for challenge galleries (handling 8 to 20+ submissions without scroll fatigue or positional unfairness):
1. **Per-Voter Deterministic Randomization:** Candidate grid order is randomized per voter session so no single submission is perpetually stuck at the bottom or top of the page.
2. **Dual Discovery Views:**
   - *Balanced Atelier Grid:* Responsive multi-column grid with equal-weight cards, quick jump index, and remaining stars sticky capsule.
   - *Focus/Comparison Deck:* Fullscreen swipeable/keyboard-navigable slide deck allowing members to evaluate candidates one-by-one with full detail and side-by-side comparison.
3. **Ballot Review Dock:** A sticky drawer/bar summarizing spent and remaining Stars, highlighting unviewed/unvoted candidates before submission.
**Business Rule:** Every candidate must have equal visual prominence and discovery fairness during voting rounds.
### Studio Atelier Style Guide & Design Token Standards
**Decision:** Adopt `studio-atelier-frontend-style-guide.md` as the authoritative frontend design specification.
- **Palette & Tokens:** CSS-first tokens in `src/app/globals.css` with exact values: `canvas` (`#0E1015`), `canvas-elevated` (`#13161D`), `surface-1` (`#191C23`), `surface-2` (`#20232C`), `surface-3` (`#292D37`), `text-primary` (`#F6F2E9`), `amber-500` (`#F59E0B`), `border-subtle` (`rgba(255,255,255,0.10)`).
- **One-Amber Rule:** Amber is restricted to primary actions, Stars, active stages, and awards. No decorative amber clutter.
- **Component Baseline:** shadcn/ui with New York style as structural base, customized to Studio Atelier design tokens.
**Business Rule:** Artwork fidelity must never be altered (no color tints or decorative overlays on images).
**Reason:** Documented in style guide baseline.

### UI Language & Terminology Standards
**Decision:** Default user interface language is natural Bahasa Indonesia, actively incorporating standard English terms widely used in the digital art community:
- Commission Hub: `Commission`, `Open for Commission`, `Waitlist`, `Slots`, `Do / Don't`
- Challenge & Voting: `Challenge`, `Submission`, `Voting`, `Stars`, `Jury`, `Hall of Fame`
- Artwork & Gallery: `Artwork`, `Portfolio`, `Gallery`, `Master Quality`, `Watermarked Preview`, `Lightbox`, `Focus Mode`
- Technical & System: `Software`, `GIF`, `Video`, `WITA`, `Dashboard`, `Login`
- **Date & Time Display:** Absolute WITA timestamps (`Asia/Makassar` / UTC+8), e.g., `18 Agu 2026, 23.59 WITA`.
**Business Rule:** Blend natural Indonesian phrasing with familiar art ecosystem terminology to avoid awkward literal translations.
**Reason:** Clarified by user and aligned with community expectations.

### Discord-style Short & Custom Vanity Invitation Codes
**Decision:** Transition default invitation tokens from 64-character random hex strings to human-friendly 8-character base58/alphanumeric short codes (e.g. `a7K9xQ2v`, `SVcqWf3G`), and allow administrators/moderators to optionally specify custom vanity invite codes (e.g. `komorebi`, `atelier-vip-2026`, `batch-2`).
**Business Rule:** 
- Default generated tokens are 8 characters long, avoiding ambiguous characters (0, O, 1, l, I).
- Custom vanity codes must be between 3 and 32 characters, matching `/^[a-zA-Z0-9_-]+$/`, and must be unique among active/unexpired invitations.
- Tokens continue to be hashed with SHA-256 (`tokenHash`) for database storage so raw custom/short tokens remain secure.
- Invitation URLs and manual code inputs support both short codes and custom vanity codes seamlessly (e.g., `/invite/komorebi` or `/invite/a7K9xQ2v`).
**Reason:** User requested short and customizable invitation codes like Discord for clean sharing and memorable vanity links.

### Email/Password Auth, Automatic Google Merging & Invitation Code Parsing
**Decision:** 
1. Support dual authentication: Google OAuth 2.0 and manual Email/Password (`CredentialsProvider`).
2. Automatic Account Merging: When a user registers with email/password and later signs in via Google using the same email, NextAuth will automatically link their `googleId` to their existing account without duplicating records or losing their portfolio.
3. Email Verification: Password-based registrations require email verification before active login. Google OAuth registrations automatically satisfy email verification.
4. Flexible Invitation Entry: On `/invite` and `/login`, allow manual entry of invitation tokens or full invitation URLs (intelligently regex-extracting token from URLs).
**Business Rule:** Preserve invite-only access across all registration methods while preventing fragmented multiple accounts for the same creator.
**Reason:** Requested by user for flexibility and account consolidation.

## 2026-08-27

### Frontend Architecture Modernization (React Query, Zustand & Framer Motion)
**Decision:** Upgrade and unify the frontend architecture using **React 19 + TypeScript**, **Zustand** (modular client UI stores: `useModalStore`, `useLightboxStore`, `useVotingStore`, `useGalleryFilterStore`), **TanStack React Query** (`@tanstack/react-query` for asynchronous server state, mutations, and caching), **Radix UI Primitives & shadcn/ui**, **Tailwind CSS v4** (Studio Atelier design tokens), and **Framer Motion** (`framer-motion` for fluid micro-interactions, layout transitions, and pan/zoom physics).
**Business Rule:**
- Universal persistent `AppHeader` across all views with global search shortcut (`Cmd+K`), notification drawer, quick upload CTA, and avatar dropdown with dedicated Studio vs Admin Switcher.
- Clear separation between **Member Artist Studio** (`/me/*`) and **System Admin Command Center** (`/admin/*`).
- Contextual admin overlays (`ArtworkAdminMenu`) accessible on every artwork card for instant spotlight curation or moderation takedowns without leaving gallery views.
- Full invite codes with 1-click copy buttons, redemption logs drawer, and status filters.
**Reason:** User requested architectural stack modernization and a complete UX overhaul from MVP into a mature, production-ready atelier platform.

### Mobile-First & Touch-First Design System
**Decision:** Adopt `/mobile-design` guidelines across the entire application:
- Implement a thumb-first `MobileBottomNav` with safe-area inset handling (`pb-[max(0.375rem,env(safe-area-inset-bottom))]`) and floating center upload FAB.
- Enforce minimum touch target sizes (`≥ 44px`) across all filter pills, interactive chips, copy buttons, and zoom controls.
- Prevent iOS Safari auto-zoom by configuring form inputs with `text-base sm:text-xs` / `text-base sm:text-sm`.
- Convert wide admin tables (`UserManagementTable`, `InviteManagerTable`) into stacked touch-friendly card views on mobile viewports (`< md`).
**Business Rule:** Complete accessibility and one-handed thumb ergonomics on mobile screens without requiring horizontal scrolling for primary workflows.
**Reason:** Explicit user requirement to ensure the atelier platform is fully mobile-friendly.

### Phase 6: Historical Backfill & 9:16 Story Card Media Automation
**Decision:** Build a dedicated administrative historical backfill action (`importHistoricalChallengeAction`) and high-density 9:16 Canvas Story Card Generator (`StoryCardGenerator.tsx`):
- **Historical Backfill Importer:** Allows admins/moderators to register past offline/Discord challenges into the official Hall of Fame with authoritatively finished lifecycle status, custom past dates, participant artwork versions, Star vote tallies, and Jury Choice Awards with transactional database consistency and audit logging.
- **9:16 Story Card Generator (1080 × 1920 px):** Dual-mode high-DPI canvas exporter (Announcement Mode vs Results & Podium Mode) allowing 1-click PNG downloads formatted specifically for Instagram Stories and WhatsApp Status sharing.
**Business Rule:** Historical challenges must integrate seamlessly with live challenge queries, winner slots, and Hall of Fame views while maintaining immutable provenance in audit logs.
**Reason:** Preserves community art heritage and automates social media distribution.


## 2026-08-28

### QA Re-Analysis & TDD-First Remediation Mandate
**Decision:** Perform comprehensive QA re-analysis before proceeding with Phase 7. Confirmed all 9 P0 blockers from the previous QA report remain open. Build passes (exit 0). Readiness score: 5.5–6/10.
**Business Rule:** All P0 fixes MUST be preceded by a failing automated test before implementation. Existing `npx tsx` integration scripts are NOT sufficient — they bypass server action authorization by writing directly to the DB.
**Reason:** P0-003 jury authorization bug confirmed in source: `isModOrAdmin` computed but never enforced. P0-007 video MIME bug confirmed: video stored with `.webp` extension. P0-008 challenge lifecycle bypass confirmed: created as `submission_open` not `draft`.

### Release Gate 1, 2, & 3 Production Hardening & Remediation Complete
**Decision:** Fully implement and verify all 15 QA remediation requirements across backend security, data integrity, media delivery, frontend accessibility, and production infrastructure:
1. **Centralized Policy Engine (`src/lib/policy.ts`):** `canViewArtwork`, `canAccessMasterMedia`, `canViewProfile`, `canSubmitChallengeEntry`, `canVoteInChallenge`, `canSubmitJuryScore`, `canFinalizeChallenge` uniformly enforced across all page and API routes.
2. **Master Media ACL Matrix:** Master unwatermarked clean media is strictly restricted to Owner and Admin (and assigned Jury during active scoring). Unassigned members and guests receive 403 Forbidden.
3. **Server-Side Jury Integrity:** `isChallengeJury` real DB query + anti-self scoring enforcement in `submitJuryScoreAction`.
4. **Deterministic Challenge Finalization & Cutoff Tiebreaks:** Deterministic sorting (`stars DESC` -> `earliestSubmission ASC` -> `submissionId ASC`), jury score integration, and winner slots roll-down without duplicate champion slots.
5. **Video Streaming & Transcoding Pipeline:** Preserves video `.mp4` key, strips metadata, and serves HTTP 206 Partial Content Range chunks (`Accept-Ranges: bytes`, `Content-Range`) via Node streams without whole-file memory buffering.
6. **Soft-Delete Architecture:** `deleteArtworkAction` applies `deletedAt` soft deletion, protecting foreign keys and historical submissions.
7. **Production Rate Limiting:** Sliding-window rate limiting in `src/lib/rateLimit.ts` protecting auth, upload, voting, critiques, and reports.
8. **Frontend A11y & SEO:** `<video>` preview for video uploads, `aria-*` dialog attributes, explicit `id`/`htmlFor` labels, `@media (prefers-reduced-motion: reduce)`, accessible skip link (`#main-content`), and page-level `robots: { index: false, follow: false }` metadata.
9. **DevOps & Infrastructure:** Standalone multi-stage `Dockerfile`, complete `docker-compose.yml` (web, worker, postgres, redis), non-leaking `/api/health/liveness` and `/api/health/readiness` probes, `/api/admin/diagnostics`, automated encrypted `scripts/backup.sh` & `scripts/restore.sh`, and `DEPLOYMENT.md`.
**Business Rule:** Zero deployment without passing all Gate 1 security policies and build checks.
**Reason:** Fulfills all user and QA auditor requirements to achieve production deploy readiness.

### Blueprint 2.1 Exact Lifecycle State Machine, Frozen Candidates, and Shared Jury Slots
**Decision:** Fully align the challenge and voting architecture with exact Blueprint 2.1 specifications:
1. **Strict Legal Transition Matrix:** Direct status skips are strictly forbidden (`draft -> scheduled -> submission_open -> submission_locked -> voting_open -> tiebreak_open / jury_selection_open / review -> finished`). Normal publication passes through `submission_locked` and `review`.
2. **Paused & Resume Flow:** Active challenges can enter `paused`, preserving `pausedPreviousStatus` and disabling member actions until admin/moderator review and resumption.
3. **Explicit Database Voting Rounds Model:** Implemented `challenge_voting_rounds` and `challenge_voting_round_candidates` tables. When a round opens, eligible candidate submissions are frozen into the round table.
4. **Shared Jury Slot Assignments with Optimistic Concurrency:** Implemented `challenge_jury_slot_assignments` table with integer `version` field for optimistic concurrency (`409 Conflict` detection). Finalization enforces complete jury slot assignment and prohibits the Community #1 Champion from taking a jury award slot. `challengeResults.finalRank` is nullable for jury awards.
5. **Database Row Locks (`.for("update")`):** Parent rows (`challenges` and `challenge_voting_rounds`) are locked during ballot submissions, jury slot assignments, and finalization to prevent race conditions.
6. **Authenticated AES-256 + HMAC-SHA256 Encrypted Backups:** `scripts/backup.sh` and `scripts/restore.sh` authenticate integrity with HMAC-SHA256 signatures, decrypt AES-256-CBC archives, and perform post-restoration database table record counts and storage file checks.
7. **Fail-Closed Public Media Route:** `/api/media/public/[key]` strictly checks artwork ACL and returns 404 for unknown/unregistered keys.
8. **Independent Worker Bundle:** Bundled via `esbuild` to `dist/worker.mjs` with runtime external dependencies and dynamic concurrency control.
### Blueprint 2.1 Release Gate A: Database Migration Reproducibility, Lifecycle Authority & Two-Stage Finalization
**Decision:** 
1. Codify all Blueprint 2.1 schemas into explicit committed Drizzle migration `drizzle/0007_perfect_sunspot.sql`, and verify with automated two-way migration tests (`scripts/verifyMigrations.ts`) testing fresh empty database migration and legacy upgrade with data backfill.
2. Establish persisted database status as the single authoritative source of truth (`getEffectiveChallengeStatus`). Remove clock-only status synthesizing to prevent unmaterialized operational states.
3. Implement configuration-aware state machine matrix supporting `vote_and_jury`, `vote_only`, `jury_only`, and `showcase_only` modes.
4. Require comprehensive deadline viability validations upon resuming paused challenges, rejecting resumes where deadlines elapsed without explicit extensions.
5. Add `results_revoked` status to `challenge_status` enum, with legal transition `finished -> results_revoked -> review -> finished`, results visibility suppression, and audit logging.
6. Decouple finalization into two distinct production services: `computeChallengeResultsService` (computes tallies and transitions to `review`) and `publishChallengeResultsService` (reviews, triggers notifications, and transitions `review -> finished`).
**Business Rule:** Production deployments must never use `db:push`. State transitions must enforce mode-aware paths, viable deadlines, and explicit moderator review before final publication.
### Phase 1 Remediation Corrections & Production Migration Hardening
**Decision:**
1. Embedded authoritative data backfills directly in PostgreSQL migration `drizzle/0007_perfect_sunspot.sql` (voting rounds, candidate snapshots, ballot linkages, and deterministic `award_type` classification from winner slot type).
2. Upgraded migration verification `scripts/verifyMigrations.ts` to exercise real Drizzle migrator (`migrate()`) across a genuine 0006 journal database.
3. Added 4 strict migration invariant assertions (deterministic award_type, round existence, candidate freezing, ballot linkage integrity).
4. Protected lifecycle transitions: blocked direct transitions to `finished` and `results_revoked` via generic `transitionChallengeStatusService` (only executable via `publishChallengeResultsService` and `revokeChallengeResultsService` respectively).
5. Enforced results revocation governance before recomputing finished challenges (`computeChallengeResultsService` rejects `status === "finished"`).
6. Preserved immutable previous results snapshots in `audit_logs.metadata` during result revocation and recomputation.
7. Separated public result retrieval (`getChallengeResultsData` filters `isPublished = true` and `status === "finished"`) from moderator review retrieval (`getModeratorReviewResultsData`), suppressing winner podiums and Story Cards during `results_revoked` and displaying official Atelier notices.
8. Made `ChallengeTransitionButtons` award-mode aware and removed the invalid `draft -> submission_open` bypass.
9. Added idempotent `materializeScheduledTransitionsService` for automated scheduled state progression.
10. Transaction-safe winner notifications: collected in service transaction and dispatched post-commit.
**Business Rule:** Real migration paths must automatically backfill legacy data with strict invariant guarantees. Results visibility is strictly gated by publication status and moderator authority.
**Reason:** Resolves all 15 targeted Phase 1 correction gaps identified during independent QA review.

## 2026-08-28

### Phase 1 Correction Pass 2: Migration Scoping, Scheduler Idempotency, and Review Protection
**Decision:** 
1. **Scoped Migration Backfill (`0007_perfect_sunspot.sql`):** Filtered voting round backfill to challenges with existing legacy ballots, existing results, or active/concluded voting lifecycle states. Challenges in `draft`, `scheduled`, `submission_open`, `submission_locked` (without ballots) or modes `jury_only` / `showcase_only` do NOT receive premature voting rounds or prematurely frozen candidates. Future challenges freeze candidates only upon entering `voting_open`.
2. **Preserved Legacy Ballot Round Semantics:** `round_type = 'main'` ballots are linked to a backfilled `main` round (seq 1), and `round_type = 'tiebreak'` ballots are linked to a distinct `tiebreak` round (seq 2).
3. **Deterministic Award Type Classification & Orphan Purge:** Classified `award_type` strictly from authoritative winner slots (`slot_type = 'jury_award' -> 'jury_award'`, otherwise `'community_rank'`), classified unassigned rows with valid `final_rank` as `'community_rank'`, and deleted invalid legacy orphan rows where `winner_slot_id IS NULL AND final_rank IS NULL`.
4. **Protected REVIEW Entry:** Generic `transitionChallengeStatusService(..., "review")` strictly blocks direct entry for `vote_only`, `vote_and_jury`, and `jury_only` modes, requiring `computeChallengeResultsService`. Preserved direct `submission_locked -> review` path for `showcase_only`.
5. **Scheduler Execution Mechanism & Concurrency Idempotency:** Added protected cron endpoint (`/api/cron/materialize-challenges`), CLI script runner (`npm run cron:materialize`), documented in `DEPLOYMENT.md`, and implemented conditional database updates (`WHERE id = ch.id AND status = expectedOldStatus RETURNING id`) to ensure zero duplicate state mutations or audit log entries during concurrent scheduler executions.
**Business Rule:** Scheduled state progression must be atomic and concurrency-idempotent. Result-producing challenges must compute tallies before entering review.
**Reason:** Addressed all 9 independent QA audit requirements for Phase 1 Release Gate A.

### Phase 2 Architecture Mandate: Ballot Uniqueness Index Migration
**Decision:** The pre-0007 composite unique index `(challenge_id, user_id, round_type)` on `challenge_ballots` is fundamentally incompatible with multiple sequential tiebreak rounds. Phase 2 must explicitly drop/reconcile this unique constraint and replace it with an authoritative per-round uniqueness model `(voting_round_id, user_id)` before supporting multiple round sequences.
**Business Rule:** A member may cast exactly 1 ballot per specific `voting_round_id`.
**Reason:** Ensures support for arbitrary sequential tiebreak rounds without index collision.

### Phase 1 Final Targeted Corrections: Scoping Hardening, Tiebreak Reconstruction, Fail-Closed Cron, and Transactional Schedulers
**Decision:**
1. **Award-Mode Scoping for Migration 0007:** Scoped voting round creation to require actual ballots OR voting-enabled award modes (`COALESCE(c.award_mode, 'vote_and_jury') NOT IN ('jury_only', 'showcase_only')`). Finished `jury_only` and `showcase_only` challenges with results and zero ballots receive 0 voting rounds.
2. **Active Tiebreak Candidate Reconstruction:** When migrating `tiebreak_open` challenges with 0 or partial ballots, the candidate set is reconstructed from tied submissions in main round ballots (or all submissions if 0 main ballots exist), preventing empty or incomplete candidate snapshots.
3. **Fail-Closed `/api/cron/materialize-challenges` Endpoint:** Unset/missing `CRON_SECRET` returns `503 Service Unavailable` (endpoint disabled). Invalid secret returns `401 Unauthorized`. Valid secret returns `200 OK`. `CRON_SECRET` documented in `.env.example` and `DEPLOYMENT.md`.
4. **Transactional Scheduler Transitions:** In `materializeScheduledTransitionsService`, each conditional update (`UPDATE ... WHERE status = :expectedStatus RETURNING id`) and its corresponding audit log (`INSERT INTO audit_logs`) are wrapped in a single database transaction (`dbOrTx.transaction()`), ensuring state mutation and audit logging commit atomically.
5. **Production Service Validation in Migration Suite:** `scripts/verifyMigrations.ts` exercises the actual production `transitionChallengeStatusService` to transition legacy `submission_open -> submission_locked -> voting_open` and confirms candidate snapshot freezing for both pre- and post-migration submissions.
6. **Purge of Malformed Orphan Results:** Explicitly verified cleanup of legacy stub rows where both `winner_slot_id IS NULL AND final_rank IS NULL`, documenting that legitimate results strictly require either a winner slot or a positive rank.
7. **Phase 2 Ballot Index Mandate:** Reconfirmed that Phase 2 must explicitly drop/reconcile the legacy unique constraint `(challenge_id, user_id, round_type)` on `challenge_ballots` and replace it with per-round uniqueness `(voting_round_id, user_id)`.
**Business Rule:** Production security endpoints must fail closed. Database migrations must never fabricate voting rounds for non-voting modes or leave active rounds empty.
**Reason:** Addressed final independent QA review findings for Phase 1 Release Gate A.

## 2026-08-29

### Authoritative Winner & Tiebreak Rules (Phase 1 Alignment & Phase 2/3 Mandates)
**Decision:**
1. **Community Tiebreak Scope (Rank #1 Only):**
   - For `vote_only` and `vote_and_jury` challenges, a tiebreak round is created **ONLY when first place (Rank #1) is tied**.
   - Ties for #2, #3, or lower Community ranks do **NOT** trigger a tiebreak. Normal lower ranks are preserved.
   - For `jury_only`, there is no Community voting winner; judges select one winner per configured judge category/slot.
2. **Phase 1 Migration Alignment (`drizzle/0007_perfect_sunspot.sql`):**
   - The candidate set for an active legacy `tiebreak_open` challenge is reconstructed strictly from the submissions tied for **Community rank #1** (maximum Star total from main ballots).
   - If candidate count $\le 1$ (e.g. unique #1 like $A=30, B=20, C=20$, or no main ballots), the migration fails closed and raises an exception requiring explicit manual reconciliation.
   - Submissions referenced in historical tiebreak ballots are validated as a strict subset of the authoritative first-place tied set ($A, B, C$). If a historical ballot references an untied/non-first-place submission ($D$), migration fails closed and raises a reconciliation exception.
   - Active tiebreak timing is strictly validated (`starts_at < deadline` and `deadline > now()`); missing or expired deadlines fail closed.
   - Verified in `scripts/verifyMigrations.ts` across Scenarios 1 to 4 (including fresh database, 7 invariant upgrades, and fail-closed reconciliation tests).
3. **Phase 2 & Phase 3 Architecture Mandates:**
   - **Phase 2 Mandates:**
     - Live Community tiebreak generation applies only to ties for rank #1.
     - Lower-rank ties never trigger another round. Normal ranking is preserved.
     - Multiple sequential tiebreak rounds occur only if first place remains tied after a tiebreak round.
     - Per-round ballot uniqueness `(voting_round_id, user_id)` must replace the legacy `(challenge_id, user_id, round_type)` constraint on `challenge_ballots`.
   - **Phase 3 Mandates:**
     - In `vote_and_jury`, the resolved Community/Vote Winner is excluded from all judge winner categories.
     - `jury_only` uses only configured judge winner categories.
     - Judge winners do not receive synthetic Community numeric ranks.
**Business Rule:** Only first-place ties trigger tiebreak rounds. Migration must never promote untied candidates or fabricate deadlines.
**Reason:** Authoritative product-rule alignment across all challenge award modes.

### Blueprint 2.2.1 Gate B / Phase 2: Voting & Tie Resolution Architecture
**Decision:** Fully implement and verify Gate B (Phase 2: Voting & Tie Resolution) under Blueprint 2.2.1:
1. **Canonical Community Winner Award Type:** Transitioned official Community Winner from legacy `community_rank` to `community_vote_winner` with at most 1 winner per challenge (`uniq_challenge_community_winner` partial unique index). No official #2, #3 podium ranks exist in Blueprint 2.2.1. Lower legacy ranks are preserved for historical record only.
2. **Authoritative Mutation Identity (`votingRoundId`):** All ballot mutations (`castOrUpdateBallotService`, `resetBallotService`, `finalizeVotingRoundService`) operate on `votingRoundId` as primary identity, locking `challenge_voting_rounds` and parent `challenges` `FOR UPDATE` and deriving challenge metadata, allowed stars, and active status server-side.
3. **Separated Zero-Vote Logic:**
   - Main round with 0 total stars transitions `vote_only` -> `finished` and `vote_and_jury` -> `jury_selection_open` with 0 winners.
   - Tiebreak round with 0 total stars transitions to `tie_pending` with all frozen tiebreak candidates remaining the tied set, requiring manual curator resolution.
4. **Positive Tie Handling & Tie Pending State:**
   - Main round tie at first place transitions challenge to `tie_pending` (does not automatically spawn a tiebreak round).
   - Staff/Moderator may either trigger an explicit tiebreak round (`startTiebreakService`, seq 2, 1 Star/member, +24h editable deadline, frozen tied candidates) or manually pick a winner (`resolveTieManuallyService` with >= 5 char reason and audit log).
   - Enforced single tiebreak round limit: attempting to start a 2nd tiebreak is rejected.
5. **Mode-Specific Submission Lock Branching:** Scheduler materializer branches on submission deadline: 0 subs -> `cancelled`; 1 sub -> auto winner -> `finished` (vote_only, vote_and_jury, showcase_only) or `jury_selection_open` (jury_only); 2+ subs -> freezes candidate snapshot -> `submission_locked` -> `voting_open`.
6. **Protected Lifecycle Transitions:** Blocked direct public transitions into/out of voting result states via `transitionChallengeStatusService`; voting operations utilize `internalTransitionChallengeStatus`.
7. **Migration 0008 Data Integrity:** Backfilled legacy `community_rank` rows where `final_rank = 1` to `community_vote_winner`, dropped legacy `uniq_challenge_user_ballot`, made `voting_round_id` NOT NULL on `challenge_ballots`, added `uniq_ballot_round_user (voting_round_id, user_id)` and 4 partial unique indexes (`uniq_challenge_community_winner`, `uniq_challenge_main_round`, `uniq_challenge_tiebreak_round`, `uniq_challenge_open_round`).
**Business Rule:** A challenge has at most 1 official Community Winner (`awardType = 'community_vote_winner'`). All live round operations lock parent records and validate deadlines before closing.
**Reason:** Strict compliance with Blueprint 2.2.1 and Gate B / Phase 2 specifications.

### Blueprint 2.2.1 Gate B / Phase 2: Voting & Tie Resolution Targeted Corrections
**Decision:** Applied 8 targeted integrity corrections to Gate B / Phase 2 under Blueprint 2.2.1:
1. **Migration 0008 Fail-Closed Reconciliation:** Removed destructive `DELETE FROM challenge_ballots WHERE voting_round_id IS NULL`. Replaced with deterministic 1-to-1 round matching reconciliation. If any orphan ballots remain with `voting_round_id IS NULL`, migration aborts with `RAISE EXCEPTION` to preserve audit history.
2. **Strict User Membership Status Validation:** `castOrUpdateBallotService` and `resetBallotService` query `users.membershipStatus === 'active'` and `!users.deletedAt`. Non-active or deleted users are rejected.
3. **Star Allocation Structure & Boundary Validation:** Validated every allocation: non-empty string `submissionId`, finite non-negative integer stars ($A \ge 0$), duplicate `submissionId` rejection, and total allowance check ($A = -100, B = 103$ strictly rejected).
4. **Scheduler System Context with NULL Actor:** Automated scheduler transitions use `{ userId: null, role: 'system' }`, producing valid `actor_id = NULL` in `audit_logs` (UUID column).
5. **Exact Operational State in Finalization:** In `finalizeVotingRoundService`:
   - `round.status === 'closed'` $\rightarrow$ idempotent return.
   - `round.status !== 'open'` $\rightarrow$ reject.
   - Requires exact matching challenge status (`voting_open` for main, `tiebreak_open` for tiebreak).
   - Requires persisted deadline and `now >= round.deadline`.
6. **Inert PAUSED & Scheduler-Authoritative Voting Opening:** Removed `'paused'` from active legal transitions and actions. Blocked manual transition into `'voting_open'` via `transitionChallengeStatusService` (opening is exclusively scheduler-driven when `votingStartsAt` is reached).
7. **Clean Mutation Signatures:** Server actions and `VotingWorkspace` accept strictly `{ votingRoundId, votes }` and `{ votingRoundId }`.
8. **Comprehensive 15-Scenario Test Matrix:** Validated single winner, zero votes, tiebreak flow, tiebreak 0-vote manual resolve, membership auth, malformed negative star bypass rejection, reset ballot, voter anonymity, per-round ballot uniqueness, finalize checks, scheduler system actor null check, mode-specific branching, concurrency tests (manual vs manual, manual vs tiebreak start), and generic lifecycle bypass rejections.
**Business Rule:** All mutations enforce active membership and allocation bounds. Database migrations fail closed without deleting unreconciled ballots.
**Reason:** Addressed independent QA review findings for Gate B / Phase 2.

### Blueprint 2.2.1 Gate B / Phase 2: Final Compatibility Cleanup & Voting Authority Consolidation
**Decision:** Fully unified voting and lifecycle result authority under Blueprint 2.2.1:
1. **Single Voting Authority:** Deactivated legacy result-computation and tiebreak-creation branches from `computeChallengeResultsService`. The service strictly rejects live voting/tie states (`submission_locked`, `voting_open`, `tie_pending`, `tiebreak_open`). All live Community voting results and tiebreak rounds are solely managed by `finalizeVotingRoundService`, `TIE_PENDING`, `startTiebreakService`, and `resolveTieManuallyService`. Existing `community_vote_winner` rows are preserved as authoritative.
2. **Removed Reachable Legacy UI Voting Actions:** Removed manual "Hitung Hasil" action and obsolete podium tiebreak notices from `voting_open` and `tiebreak_open` views in `ChallengeTransitionButtons.tsx`.
3. **Scheduler-Authoritative Submission Locking:** Removed manual "Kunci Submisi" action and rejected direct generic transitions to `submission_locked`. Submission locking and candidate snapshot freezing are exclusively scheduler-driven when `submissionDeadline` is reached.
4. **Aligned Mutation Operating Windows:** Aligned `resetBallotService` with `castOrUpdateBallotService` to require round status `'open'`, matching challenge status, `now >= startsAt`, and strict rejection at or after deadline (`now >= deadline`).
**Business Rule:** `finalizeVotingRoundService` and scheduler materialization are the exclusive authorities for voting results and submission locking.
**Reason:** Final compatibility cleanup requested by independent QA review.

## 2026-08-30

### Blueprint 2.2.1 Gate B / Phase 2: Migration Immutability & Forward Migration 0009
**Decision:** Preserved historical migration immutability by reverting `0008` to its exact pre-correction state and creating dedicated forward migration `drizzle/0009_default_stars_per_member_one.sql`:
1. **Migration 0008 Restoration:** Restored `0008_round_ballot_uniqueness_and_tie_pending.sql` to its exact commit state at `e6b8707e944a74f4183226012723b4ea97759e8a` with 0 modified statements.
2. **Forward Migration 0009:** Created `0009_default_stars_per_member_one.sql` executing `ALTER COLUMN stars_per_member SET DEFAULT 1` for `challenges` and `challenge_voting_rounds`. Registered in `_journal.json`.
3. **Upgrade Path Test Coverage:** Added Scenario 6 to `scripts/verifyMigrations.ts` verifying upgrade from pre-correction 0008 (defaults = 3, existing rows = 3) to 0009 (defaults = 1, existing rows preserved at 3, new DEFAULT rows = 1).
**Business Rule:** Committed migrations are strictly immutable; schema default alterations must proceed via forward migrations.
**Reason:** Prevent migration checksum/drift failure on existing databases that already ran migration 0008.

### Blueprint 2.2.1 Gate C / Phase 3: Simplified Jury & Result Model Architecture
**Decision:** Implement the simplified Jury & Results architecture under Blueprint 2.2.1:
1. **Dynamic Jury Awards Model (`challenge_jury_awards`):** Replaced legacy predefined winner slots, numeric 1–100 scoring, and rubrics with dynamic free-text category awards (`id`, `challenge_id`, `submission_id`, `category_label`, `recorded_by_user_id`, `created_at`, `updated_at`). Blank category label defaults to `"Jury Winner"`.
2. **Jury Panel & Designated Recorder:** Displayed panel (`challenge_jury_assignments`) with exactly one designated Jury Recorder (`is_recorder = true`, enforced by partial unique index and domain service `validateJuryPhaseReadinessService`). Ordinary jurors have read-only workspace access; Recorder has draft award write authority during `JURY_SELECTION_OPEN`.
3. **Community Winner Exclusion in Mixed Mode:** In `vote_and_jury` mode, the resolved Community Vote Winner is strictly excluded from receiving any Jury Award.
4. **Direct Manual Publication & Protected Cancellation:** Direct transition `JURY_SELECTION_OPEN -> FINISHED` via `publishJuryChallengeResultsService`, explicitly marking existing `community_vote_winner` as `is_published = true` and materializing Jury Awards. Dedicated `cancelJuryChallengeService` requires staff reason and prevents empty published results.
5. **Separated Governance Correction Authority (`RESULTS_REVOKED`):** In `RESULTS_REVOKED`, Admin/Moderator hold exclusive governance authority to correct/reconcile awards or replace/clear Community Winner (`correctCommunityWinnerService` with actual raw Star lookup). `republishChallengeResultsService` reconciles active awards and suppresses deleted awards.
6. **Forward Migration 0010:** Created `drizzle/0010_simplified_jury_awards_and_recorder.sql` adding `challenge_jury_assignments.is_recorder`, `challenge_jury_awards`, partial unique index `uniq_challenge_result_jury_award`, and deterministic backfill of legacy results without inventing recorders.
**Business Rule:** Deliberation occurs outside app; app records agreed awards. At most 1 Jury Recorder per challenge. Community Winner excluded from jury awards in mixed mode. All mutations locked and audited.
**Reason:** Authoritative product requirement under Blueprint 2.2.1.

### Blueprint 2.2.1 Gate C / Phase 3: Focused Corrections & Invariant Hardening
**Decision:** Applied 11 focused architectural and operational corrections to Gate C / Phase 3 under Blueprint 2.2.1:
1. **QA Patch Discipline:** Standardized export of full Gate B→Gate C git format-patch artifacts (`git format-patch --stdout --binary --full-index dc9d81aa4bb53efbdd8a6602ca897a4b04383da4..CORRECTED_GATE_C_SHA > gatec.patch`) starting with `From <SHA>` mail envelope headers.
2. **Migrated `ChallengeTransitionButtons`:** Removed manual `computeChallengeResultsAction` / `Hitung Hasil` from `jury_selection_open`, removed manual generic "Buka Sesi Juri", and linked directly to `/challenges/[slug]/jury` for active jury sessions and result corrections. Generic cancel restricted to early pre-voting stages.
3. **Winner-Only Results Page:** Updated `/challenges/[slug]/results` to render exclusively official winners (at most 1 Community Vote Winner and zero or more unranked Jury Awards with `categoryLabel` and fallback to "Jury Winner"), removing review stage publication flows.
4. **Blocked Generic Entry to `JURY_SELECTION_OPEN`:** Generic `transitionChallengeStatusService(..., "jury_selection_open")` is strictly rejected; entry is reserved for the automated scheduler and Gate B finalization services after readiness verification.
5. **Readiness-First Publication Guard:** `publishJuryChallengeResultsService` strictly enforces `if (!readiness.ready) throw` prior to actor authorization checks, preventing Admins/Moderators from bypassing the single-recorder operational invariant.
6. **Enforced Zero-Award Cancellation Invariant:** `cancelJuryChallengeService` queries current Jury Awards and enforces: 0 awards $\rightarrow$ cancel allowed, $\ge 1$ awards $\rightarrow$ cancel rejected with guidance to publish or delete awards first.
7. **Main-Round Raw Community Star Authority (`getAuthoritativeMainRoundStarsService`):** Raw Community Stars are queried strictly from main rounds (`round_type = 'main'`), preventing tiebreak allocations from inflating main Star scores in workspace candidate displays or governance winner replacements.
8. **Strengthened Publish / Republish Invariant Validation:** Revalidates every current Jury Award (valid candidate, submitted status, mixed-mode Community Winner exclusion) and validates `vote_only` mode republishing (positive main round votes require a community winner).
9. **Lifecycle-Aware Jury Workspace Permissions:** In `JURY_SELECTION_OPEN`: Recorder $\rightarrow$ edit, Admin $\rightarrow$ override/edit, Moderator $\rightarrow$ read-only unless designated Recorder. In `RESULTS_REVOKED`: Admin/Moderator $\rightarrow$ governance correction, former Recorder alone $\rightarrow$ read-only.
10. **4 Production-Path Concurrency Tests:** Added multi-transaction test coverage for: (1) simultaneous Recorder reassignment, (2) Jury Award write vs publication race, (3) publication vs result revocation race, and (4) result correction vs republish race.
11. **Expanded Migration Scenario 7:** Verified `ON DELETE SET NULL` on recorder deletion, partial unique index `uniq_challenge_result_jury_award` duplicate rejection, and multiple distinct Jury Awards for the same artwork.
**Business Rule:** Panel readiness is required before publication. Main round stars are isolated from tiebreak rounds. Cancellation is restricted to zero-award states.
**Reason:** Addressed independent QA review findings for Gate C / Phase 3 final focused corrections.

### Blueprint 2.2.1 Gate D: Authentication, Invitations, Membership & Roles
**Decision:** Implemented the authoritative authentication, invitation-gated onboarding, membership transition matrix, and RBAC architecture under Blueprint 2.2.1:
1. **Google-Only OAuth Authentication:** Migrated NextAuth configuration in `src/auth.ts` to exclusive Google OAuth 2.0. Completely eliminated active email/password credential providers, bcrypt password hashing, and SMTP email verification / password reset workflows. Dropped `password_hash` column and legacy token tables (`email_verification_tokens`, `password_reset_tokens`) without cascade.
2. **PENDING_INVITE Separation from Persistent Membership:** Persistent membership status in PostgreSQL enum `membership_status` is strictly `active | suspended | deleted` (3 values, with `revoked` eliminated). The column is nullable with NO default constraint. `membership_status IS NULL` represents an authenticated Google account in onboarding awaiting invitation redemption (`PENDING_INVITE` derived state).
3. **High-Entropy Cryptographic Invitations & Admin-Only Management:** Invitations use $\ge 16$-byte Base58 tokens ($>100$ bits entropy, e.g. `M9qZb4Rt8vWxK2pYn5sD6fGh`) stored as SHA-256 hashes (`token_hash`) with a 4-character plaintext prefix (`token_prefix`) for identification. Creation and revocation are strictly restricted to `requireAdmin()`.
4. **Deterministic Two-Phase Locking Redemption:** `redeemInviteService` acquires row-level locks deterministically: `users` FOR UPDATE by `user.id` first, followed by `membership_invites` FOR UPDATE by `token_hash`. Enforces the membership transition matrix: `NULL -> ACTIVE` only (invite consumed, redemption logged); `ACTIVE -> ACTIVE` idempotent pass-through (zero usage consumed); `SUSPENDED` and `DELETED` strictly rejected (cannot reactivate via invite).
5. **Master Clean-Media Authorization Invariant:** Authoritative rule strictly requires `membershipStatus === 'active'` (refreshed live from PostgreSQL) AND independent passage of the Gate A media ACL (`canAccessMasterMedia`). Suspended artwork owners, anonymous viewers, and pending accounts receive HTTP 403 Forbidden on `/api/media/master/[key]`.
6. **Last-Active-Admin Invariant Protection:** Demotion, suspension, or deletion of administrators acquires a dedicated transaction-level advisory lock (`pg_advisory_xact_lock(4281729)`) prior to counting active Admins, ensuring serialization across concurrent staff mutations and guaranteeing the system never drops to 0 active Administrators.
7. **Production Post-Auth Continuation Flow:** Onboarding invite landing page (`/invite/[token]`) sets HttpOnly cookie `mengart_pending_invite` (TTL 15m) and initiates Google OAuth. Dedicated production handler `/api/auth/redeem-callback` resolves the authenticated session, executes `redeemInviteService`, clears the cookie, and navigates the user to `/dashboard` on success or `/onboarding` with actionable feedback on error.
8. **Forward Migration 0011 & Scenario 8 Verification:** Created `drizzle/0011_gate_d_auth_roles_membership.sql`. Verified in Scenario 8 that case-insensitive legacy email duplicate collisions fail closed (`RAISE EXCEPTION`), legacy emails normalize to lowercase, `uniq_users_lower_email` index is enforced, legacy `deleted_at` maps to `deleted`, and `revoked` maps to `suspended`.
**Business Rule:** Only Google-verified accounts with valid invitation redemption can obtain `ACTIVE` status. Direct `NULL -> ACTIVE` transitions outside `redeemInviteService` are prohibited. Suspended artwork owners cannot access clean master media.
**Reason:** Authoritative product requirement under Blueprint 2.2.1 for Gate D.


