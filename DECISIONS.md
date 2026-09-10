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
### Blueprint 2.2.2 Gate D: Direct Invitation Codes, OAuth Invariant Hardening & Profile Privacy
**Decision:** Applied authoritative architectural corrections to Gate D under Blueprint 2.2.2:
1. **Direct Discord-Style Plaintext Invitation Codes:** Stored invitation codes directly as unique plaintext text column `membership_invites.code` (`uniq_membership_invites_code` unique index). Completely dropped legacy `token_hash` and `token_prefix`. Default generated codes use an unbiased CSPRNG (`crypto.randomInt(0, 62)`) producing strictly 8 alphanumeric characters from `[A-Za-z0-9]`. Custom vanity codes are normalized to lowercase, restricted to `[a-z0-9-]`, with a maximum length of 25 characters and reserved keyword collision guards.
2. **Admin-Only Invitation Management & Bearer Code Visibility:** Only Administrators (`requireAdmin()`) can create, list, view, copy, or revoke invitation codes. The UI displays the actual stored bearer code and provides one-click copy actions for both the raw code and the direct `/invite/<code>` link. Moderators are denied invite administration.
3. **Hardened Google OAuth Identity Resolution:** `resolveGoogleSignInIdentity` strictly verifies `profile.email_verified === true` (rejecting `false`, `undefined`, `null`, or missing claims with `EmailUnverified`), normalizes emails to lowercase, binds Google IDs to existing verified accounts, and fails closed on identity collisions (`AccountCollision`) and deleted accounts (`AccountDeleted`).
4. **OAuth Continuation Clean URLs & Cookie Clearing:** Removed illegal Server Component cookie mutations. `initiateInviteGoogleLoginAction` Server Action sets HttpOnly cookie `mengart_pending_invite` (TTL 15m, SameSite=Lax, Path=/). OAuth `callbackUrl` is strictly clean `/api/auth/redeem-callback` with zero query tokens. `/api/auth/redeem-callback` reads exclusively from the cookie, executes `redeemInviteService`, and deletes the cookie across all terminal paths (dashboard redirect, already-active pass-through, error, and onboarding).
5. **Preserved Profile Privacy Across Suspension:** `updateUserStatusAction` strictly updates `users.membershipStatus` while leaving `profiles.profileStatus` unchanged (`active_hidden` remains `active_hidden` across suspension and reactivation).
6. **Live Staff Authorization Enforcement:** Replaced role-only session checks with live database assertions (`requireModerator()`, `requireAdmin()`) in `historicalBackfill.ts`, `admin/layout.tsx`, `admin/users/page.tsx`, and `api/admin/diagnostics/route.ts`. Suspended staff members retain their role in the database but are immediately denied all active staff operations.
**Business Rule:** Plaintext codes are unique in the database and visible to Admins. Onboarding codes are carried exclusively via HttpOnly cookies without URL query token leaks. Profile privacy is preserved across suspension cycles.
**Reason:** Authoritative product requirement under Blueprint 2.2.2 for Gate D.

### Blueprint 2.2.2 Gate D: Elimination of Moderation Suspension Bypass, Deterministic Lookup & Legacy Token Revocation
**Decision:** Applied final focused corrections and QA hardening to Gate D under Blueprint 2.2.2:
1. **Canonical Membership & Role Domain Services (`updateUserMembershipStatusService`, `updateUserRoleService`):** Extracted unified domain services in `src/lib/services/userService.ts` where actor identity and active staff permissions (`assertAdminActor`, `assertModeratorOrAdminActor`) are strictly loaded and verified directly inside database transactions (never trusting caller-supplied authorization state). Enforces transition matrix (`NULL -> ACTIVE` blocked outside `redeemInviteService`, `NULL -> SUSPENDED` blocked, `DELETED` terminal), role authority boundaries (Moderators restricted to ordinary members, cannot suspend Moderators/Admins, cannot delete users), Last-Active-Admin invariant via `pg_advisory_xact_lock(4281729)`, and profile privacy preservation.
2. **Canonical Moderation Enforcement Service (`resolveReportService`):** Extracted domain service in `src/lib/services/moderationService.ts` verifying active staff permissions inside transactions and delegating user suspensions strictly through `updateUserMembershipStatusService`.
3. **Guarded Invitation Administration Services (`createMembershipInvite`, `revokeInviteService`, `listMembershipInvitesService`):** Enforces active Administrator checks inside transactions at the domain layer, strictly denying Moderators and unauthorized users from administering invitations.
4. **Deterministic Invitation Code Resolution (`findInviteByCode`):** Implemented exact-match-first resolver that queries exact `membership_invites.code` match first, and only falls back to lowercase if exact match is absent, preventing multi-row ambiguity when mixed-case and lowercase codes coexist.
5. **Deterministic Unique Surrogate Codes in Migration 0011:** Updated `0011_gate_d_auth_roles_membership.sql` to assign deterministic unique surrogate codes via ordered `row_number()` CTE (`'legacy-revoked-' || lpad(ni.rn::text, 8, '0')`), preserving redemption history without creating active 32-character hash-derived bearer credentials or collision risks.
6. **Exhaustive QA-Hardened 22-Scenario Test Suite:** Validated status transitions, suspension/reactivation profile privacy, immediate staff suspension authority loss, isolated sole active admin protection (Scenario A), concurrent 2-admin removal resulting in exactly 1 active admin (Scenario B), revoke-vs-redeem race final state, domain-guarded moderator invite administration denial, moderation report enforcement wiring via `resolveReportService`, all 8 OAuth continuation terminal outcomes with explicit continuation-cookie deletion verification, and clean master media ACL enforcement.
7. **Atomic Admin-Mandatory Invite Creation:** `createMembershipInvite` strictly requires `createdByUserId: string` and executes atomically within a transaction with unconditional in-transaction ACTIVE Admin verification, eliminating any bypass or `createdBy = NULL` invitations.
8. **Serialized Report Resolution:** `resolveReportService` acquires `FOR UPDATE` lock on the target report inside transaction and validates `status === 'pending'`, eliminating race conditions and ensuring deterministic winner-take-all enforcement.
9. **Active-Only Master Key Metadata Exposure:** `src/app/api/artworks/route.ts` exposes `masterStorageKey` strictly to ACTIVE artwork owners or ACTIVE platform admins, returning `null` for suspended/deleted admins and owners.
10. **Strict Moderation Enforcement & Target Compatibility Invariants:** `resolveReportService` strictly rejects any enforcement action (`suspend_user` or `takedown_artwork`) on dismissed reports (`resolution === 'dismissed'`), ensuring complete transaction rollback with report remaining pending and target unchanged. Enforces strict fail-closed `targetType` compatibility (`suspend_user` permitted only on `report.targetType === 'user'`, `takedown_artwork` permitted only on `report.targetType === 'artwork'`). The UI (`ReportResolutionModal.tsx`) clears `enforceAction` on dismissal and restricts action buttons to their compatible target types.
**Business Rule:** All status mutations must flow through canonical domain services with in-transaction actor verification. Dismissed reports can never apply enforcement actions. Enforcement actions must strictly match report target types. Invitations resolve deterministically. Legacy hash-only tokens are revoked fail-closed with deterministic surrogate codes. Master keys are never disclosed to non-ACTIVE staff.
## 2026-08-31

### Pre-Production Database Reset Policy
**Decision:** Until Mengart receives real authoritative production/user data, existing development/QA database rows are disposable while migration and source history are strictly preserved. Migrations 0000–0011 remain immutable in version control. Forward migration 0012 introduces canonical Gate E schema conversions and asserts that disposable development/QA `challenge_submissions` rows are 0 before conversion, failing closed with clear reset instructions if dirty fixtures exist. Destructive fixture cleanup is kept out of migration SQL. After production launch, this pre-production reset policy expires and all future migrations must preserve production data.
**Business Rule:** Non-production development/QA databases can be dropped and rebuilt from migrations (`npm run db:reset && npm run db:migrate`) and freshly re-seeded. Migration SQL must remain deterministic and never fabricate fake relationships.
**Reason:** Clarified with product ownership that all existing database rows prior to Gate E were disposable test fixtures; eliminated unnecessary legacy test data reconciliation complexity in migration 0012.

### Gate E: Submission & Portfolio Architecture Simplification
**Decision:** Simplified challenge submissions to point directly to canonical artwork versions, eliminating `challenge_submission_versions` and the `current_version_id` indirection:
1. **Canonical Submissions Schema:** `challenge_submissions` directly owns `(artwork_id, artwork_version_id, title, description, software_used)` with `ON DELETE RESTRICT` on `artworks.id` and `artwork_versions.id` to guarantee immutable contest history. Unique index `uniq_challenge_submission_user` strictly enforces one active submission per member per challenge.
2. **Dropped Challenge Submission Versions:** Dropped `challenge_submission_versions` table without cascade.
3. **Dual Upload Paths:**
   - *Ordinary Portfolio Upload:* Atomically creates `artworks` + `artwork_versions` + `portfolio_entries` (`isVisible = true`, `systemCaption = null`, `customCaption = null`).
   - *Direct Challenge Upload:* Atomically creates `artworks` + `artwork_versions` + `challenge_submissions` with 0 `portfolio_entries` before finish.
4. **Deterministic Caption Resolver & Automatic Portfolio Promotion:**
   - All 6 FINISHED paths (`finalizeVotingRoundService` vote_only, `finalizeVotingRoundService` vote_and_jury community winner, `publishJuryChallengeResultsService`, `republishChallengeResultsService`, `showcase_only` deadline finish, and single valid submission auto-finish) trigger `autoAddChallengeSubmissionsToPortfolioService` to auto-add entries with award captions (`Juara Favorit Komunitas — <Title>`, `Penghargaan Juri: <Category> — <Title>`, or `Peserta Challenge — <Title>`).
   - `RESULTS_REVOKED` reverts achievement captions to participant fallback text, and republishing restores award captions.
   - `effectiveCaption` resolves `custom_caption ?? system_caption ?? null`.
5. **PostgreSQL-Safe Slug Retry & Two-Phase Media Lifecycle:**
   - `createArtworkWithUniqueSlug` uses `INSERT ... ON CONFLICT (slug) DO NOTHING RETURNING ...` with a bounded 5-attempt retry loop to avoid aborted PostgreSQL transaction states.
   - Initial submission and replacement stage/promote media before transactions and execute `cleanupPromotedMedia` on transaction failure.
   - Pre-deadline replacement swaps `artwork_version_id` while preserving `artwork.slug` and recording an audit log.
6. **Additive Artwork Spoiler Flag:** Added `artworks.is_spoiler` boolean (`NOT NULL DEFAULT false`) serialized across all 8 surfaces with zero impact on ACL, voting, or Stars.
**Business Rule:** Deleting an artwork cannot delete a challenge submission (`ON DELETE RESTRICT`). Challenge submissions are hidden from portfolios until finish, then auto-added. Artists can toggle visibility and customize captions. Artwork slugs are immutable upon version replacement.
**Reason:** Fulfills authoritative Blueprint 2.2.2 requirements and QA directives for Gate E.

### Gate E: Final Closure Corrections & Media Security Hardening
**Decision:** Applied 6 final closure corrections to complete Gate E:
1. **P0 Elimination of Shell-Command Injection:** Replaced `exec` / shell string interpolation in `stageAndPromoteMedia` with `execFile` (`child_process`) using explicit argument arrays and `shell: false`. Decoupled storage extensions completely from untrusted client filenames, deriving extensions strictly from validated internal media types and magic bytes (`.png`, `.jpg`, `.webp`, `.gif`, `.mp4`). Tested across hazardous filenames containing `$(...)`, backticks, quotes, semicolon, and shell metacharacters.
2. **Elimination of Video Duration Cap:** Removed artificial 60-second video duration check per Blueprint 2.2.2. Video upload policy strictly enforces $\le 50$MB MP4 container without duration limits.
3. **Superseded Media and Version Row Cleanup:** In `replaceChallengeSubmissionMediaService`, captured obsolete version keys, deleted the obsolete version row from `artwork_versions` inside the transaction, and deleted obsolete disk files (`cleanupPromotedMedia(oldMedia)`) strictly post-commit. On aborted transactions/rollbacks, existing media remains authoritative while newly staged media is cleaned.
4. **Exhaustive Partial-File Cleanup:** In `stageAndPromoteMedia`, registered all potential attempt paths (`masterPath`, `publicPath`, `thumbPath`, `posterTempPath`) in an attempt tracking list and cleaned all attempted files via `Promise.allSettled` in the catch handler upon any processing failure, ensuring zero partial/orphan files remain on disk.
5. **Strict Owner-Only Presentation Mutations:** Restricted `updateArtworkService` and `toggleArtworkSpoilerService` strictly to active owners (`artwork.userId === actor.id`), removing Admin bypass for artist presentation mutations. Active Admins cannot alter another creator's title, description, audience, or spoiler flag. Dedicated moderation and soft-deletion services remain available for staff actions.
6. **Elimination of Vault Selection & Obsolete Controls:** Removed "Pilih dari Vault" modal UI and obsolete `existingArtworkVersionId` plumbing, keeping canonical direct challenge upload only. Removed obsolete `allowRevisions` checkbox from challenge administration form.
**Business Rule:** Media tools must never execute via shell strings. Video limits are size-based ($\le 50$MB) with no duration cap. Superseded challenge media and DB versions are pruned on replacement. Artists strictly own artwork presentation metadata. Direct challenge upload is the sole canonical submission path.
**Reason:** Fulfills all 6 final QA closure directives for Gate E.

### Gate E: Challenge Revision Spoiler State Preservation
**Decision:** Preserved challenge submission spoiler state across revision modals and server actions:
1. **Modal Initial State:** Added `initialSpoiler?: boolean` to `ChallengeSubmissionModalProps` and initialized `isSpoiler` state with `initialSpoiler ?? false`. In `/challenges/[slug]/page.tsx`, passed `initialSpoiler={userSubmission.isSpoiler}` for revision modals.
2. **Defensive Server-Side Parsing:** In `submitArtworkToChallengeAction`, parsed `isSpoiler` as optional (`formData.get("isSpoiler") === null ? undefined : ...`). When `undefined` is passed to `replaceChallengeSubmissionMediaService`, the existing backing artwork `is_spoiler` value is preserved. Explicit `true` or `false` updates the state accordingly.
3. **Dead State Cleanup:** Removed unused internal `allowRevisions` state from `ChallengeCreateForm.tsx`.
**Business Rule:** Revisions must not unintentionally clear existing artwork presentation flags (such as `is_spoiler`).
**Reason:** Addressed final Gate E QA review finding for spoiler state preservation on revisions.

## 2026-09-02

### Gate F: Single Authoritative Media Validation & Processing Engine
**Decision:** Established `src/lib/services/mediaValidation.ts` as the single authoritative media validation, content sniffing, and transformation engine for Mengart Atelier. All synchronous entry points (`stageAndPromoteMedia`, `createArtworkUploadAction`, `submitArtworkToChallengeAction`) and asynchronous worker pipelines (`processArtworkMediaJob`, `mediaWorker.ts`) strictly consume this unified engine. Eliminated all duplicate/divergent validation logic, worker-specific formats, and route-specific MIME rules.
**Business Rule:** Accepted formats are strictly JPEG, PNG, WebP ($\le 25$MB) and MP4 H.264/AAC or silent ($\le 50$MB, no duration limit). All other formats (GIF, WebM, SVG, scripts, executables, audio-only) are rejected fail-closed regardless of extension or client MIME. Single public video derivative (`libx264`, `yuv420p`, `faststart`) and WebP thumbnail are generated non-empty.
**Reason:** Prevents validation and security drift between synchronous upload processing and background worker queues under Blueprint 2.2.2.

### Gate F: MP4-Only Video Container Policy
**Decision:** Restricted video container input strictly to MP4 container formats (`isom`, `iso2`, `mp41`, `mp42`, `avc1`, `dash`, `m4v`). Deep inspection via `ffprobe` (`execFile`, `shell: false`) strictly validates container format, video codec (`h264`/`avc1`), and audio codec (`aac` or silent). Explicitly rejects `.mov` (QuickTime `qt  ` brand), `.webm`, `.mkv`, and `.avi` even if codecs are technically compatible.
**Business Rule:** Video input is restricted to MP4 containers with H.264 video codec and AAC or no audio stream.
**Reason:** Blueprint 2.2.2 container standardization and predictable web streaming playback.

### Gate F: Tiered Rate Limiting & Trusted Proxy IP Extraction
**Decision:** Implemented sliding-window rate limiting across all 14 public write mutation boundaries in Server Actions, with tiered degradation on Redis outages:
1. **Security-Critical (Fail-Closed):** `invite_login:${ip}` (10/60s), `onboarding_redeem:${userId}` (5/60s), `invite_create:${adminId}` (20/60s), `artwork_upload:${userId}` (10/60s), `challenge_submit:${userId}` (10/60s), `vote:${userId}` (20/60s), and `report_create:${userId}` (5/60s). Fails closed safely if Redis is down in production.
2. **Low-Risk / Operational (Fail-Open with Logging):** `profile_update:${userId}` (10/60s), `commission_save:${userId}` (10/60s), `portfolio_mutate:${userId}` (20/60s), `artwork_mutate:${userId}` (20/60s), `critique_post:${userId}` (15/60s), `report_resolve:${staffId}` (30/60s), and `jury_action:${staffId}` (30/60s). Allows requests with degraded logging if Redis is down in production to avoid full application outage.
3. **Trusted Proxy IP Protection:** Client IP extraction (`getClientIpFromHeaders`) only trusts forwarded headers (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`) when `TRUSTED_PROXY=true` in the environment. Otherwise defaults to direct socket IP (`127.0.0.1`), preventing spoofing attacks against IP rate limits.
**Business Rule:** Public mutations enforce rate limits early at action/API boundary; domain services enforce transactional database locks and invariants. Redis outages must never become total application outages for low-risk user profile/commission edits.
**Reason:** Authoritative rate limiting and denial-of-service protection under Blueprint 2.2.2.

### Gate F Amendment: Public Media Derivative Watermark Removal
**Decision:** Removed SVG watermark overlay generation from the public media derivative pipeline (`generateMediaDerivatives`). Public derivatives remain separate from master files, resolution-limited ($\le 1920$px WebP for images, H.264 MP4 for videos), optimized, and access-controlled via ACLs. Clean master media protection and ACL rules remain unchanged.
**Business Rule:** Mengart is an invite-only community platform. Public derivatives are resolution-limited and access-controlled without watermark overlays.
**Reason:** Controlled Gate F amendment under Blueprint 2.2.2 as specified in `Gate_F_Revision_Plan_Remove_Watermark_v1.1.md`.

## 2026-09-04

### Independent QA Certification: Gate E & Gate F (Watermark Removal Amendment v1.1)
**Decision:** Grant formal independent QA PASS to Gate E (Submission & Portfolio Simplification) and Gate F (Media Pipeline, MP4 Video Container, Watermark Removal Amendment v1.1, and Comprehensive Rate Limiting) under Blueprint 2.2.2.
**Business Rule:** Production deployment status remains NO-GO until Gates G and H complete and pass independent QA. Gate G is now unlocked for implementation.
**Reason:** Strict verification of patch application against baseline `f6b4d547789478e51588e1150e0f9db38181c810`, exhaustive cumulative source inspection, 100% test pass rate across all 9 migration scenarios, 28 Gate F scenarios, 62 Gate E scenarios, 22 Gate D scenarios, 63 Gate C scenarios, 20 Gate B scenarios, clean ESLint (0 errors), and successful production Next.js/worker build.

### Comprehensive Pre-Production Legacy Deprecation & Cleanup Policy
**Decision:** All deprecated schemas, legacy compatibility columns/tables (such as `quorum_requirement`, `allow_revisions`, `challenge_winner_slots`, `challenge_jury_slot_assignments`, `challenge_jury_scores`), legacy aliases, and transitional code branches will be systematically pruned in a dedicated cleanup phase strictly scheduled after all feature gates (Gates G and H) have passed independent QA.
**Business Rule:** Do not perform mid-stage destructive legacy refactorings during active feature gates (Gate G / Gate H) to prevent destabilizing active migration test harnesses. The codebase will launch into public production with zero legacy artifacts or deprecated debt.
**Reason:** The application is in pre-production development; the user explicitly directed that the final release must carry zero legacy debt, scheduled cleanly after all functional gates achieve independent QA pass.

### Gate G: Unified Simple Comments & Critique Welcome Social Flag
**Decision:** Simplified the commenting architecture into a single unified comment stream without technical aspect splits:
1. **Social Indicator Only:** The `critique_welcome` / `critiqueMode` attribute is treated purely as a visual badge ("Kritik Dipersilakan" or "Showcase") and does not block commenting on public artworks.
2. **Author Actions:** Active comment authors can edit their comments (setting `isEdited = true`, `updatedAt = new Date()`, displaying an explicit `(diedit)` indicator) or soft-delete them (`deletedAt = new Date()`, `deletedBy = user.id`, `deletionReason = 'Dihapus oleh penulis'`).
3. **Staff Moderation:** Moderators/Admins can hide comments with a mandatory $\ge 5$ character reason (`isHidden = true`, `hiddenBy = user.id`, `hiddenReason`, recorded in `audit_logs` as `comment.hide`), or restore them (`comment.restore`).
4. **Cache Invalidation:** Actions explicitly revalidate affected paths (`/artworks/[slug]`, `/gallery`, `/`).
**Business Rule:** Guests have read-only access to comments; active members can post/reply/edit/delete; staff have hide/restore moderation authority with audit trails.
**Reason:** Documented in Blueprint 2.2.2 §7.5.

### Gate G: Manual Featured Artist with Soft-Deletion & Partial Indexing
**Decision:** Replaced automated spotlight processes with strict manual Administrator curation:
1. **Manual Admin Curation:** Only Administrators can curate Featured Artists (`monthly_spotlights`). Automated background crons and reminder notifications are eliminated.
2. **Soft-Deletion & Partial Indexing:** Added `deleted_at`, `deleted_by`, and `deletion_reason` to `monthly_spotlights`. Created a partial unique index `uniq_monthly_spotlight_active_period` on `(year, month) WHERE deleted_at IS NULL`, allowing replacement spotlights to be created after an errant record is soft-deleted.
3. **Historical Archive:** `getCuratedSpotlightHistory` retrieves all published, non-deleted historical spotlights.
**Business Rule:** Featured Artist is manually curated by administrators with soft-delete safety; duplicate active spotlights for the same period are rejected fail-closed.
**Reason:** Documented in Blueprint 2.2.2 §15.

### Gate G: 9:16 Story Card Generator Standards
**Decision:** Implemented client-side Canvas 9:16 Story Card Generator ($1080 \times 1920$ px PNG export):
1. **Results Mode:** Renders Challenge Title, Winner Artwork, Artist Display Name, and Award Label (`Juara Favorit Komunitas`, `Penghargaan Juri: <Category>`). Strictly prohibits numeric ranks (`#null`, `#2`, `#3`).
2. **Announcement Mode:** Renders Challenge Title, Theme Banner, and Submission Deadline in absolute WITA (`Asia/Makassar` / UTC+8).
3. **Sharing:** Integrated Web Share API (`navigator.share`) with graceful fallback to direct PNG download.
4. **Client-Side Processing:** Rendering executes entirely on the client without backend render queues or storage overhead.
**Business Rule:** Story cards must export at $1080 \times 1920$ px with unranked result badges and absolute WITA deadlines.
**Reason:** Documented in Blueprint 2.2.2 §16.

### Gate G: OBS-001 allowRevisions Default Fix
**Decision:** Fixed OBS-001 in `createOrUpdateChallengeAction` so `allowRevisions` defaults to `true` when omitted from form data, matching the database schema default.
**Business Rule:** Challenge creation/edit forms default `allowRevisions` to `true` unless explicitly unchecked.
**Reason:** Prevents accidental disabling of challenge revisions when the field is omitted from form submissions.

### Gate H: Disaster Recovery, Runtime Concurrency & Production Rehearsal
**Decision:** Implemented and verified production-readiness, disaster recovery, and concurrency resilience under Blueprint 2.2.2 §26:
1. **Production Configuration & Secret Invariant:** All critical environment secrets (`DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `CRON_SECRET`) fail closed without insecure default fallbacks in production. Missing `CRON_SECRET` returns 503 (disabled), and unauthorized cron requests return 401.
2. **Security & Production Headers:** Enforced `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, and Content Security Policy (CSP).
3. **Anti-Spoofing Trusted Proxy IP Protection:** Client IP extraction ignores forwarded headers (`CF-Connecting-IP`, `X-Forwarded-For`) unless `TRUSTED_PROXY=true` is set.
4. **Runtime Concurrency & Memory Clamping:** Verified that 20 simultaneous write requests under sliding-window rate limit are strictly clamped (10 accepted, 10 rejected with 429), Sharp image transforms under high concurrency maintain clamped memory without leak or OOM, and database pool connection handles high concurrent transactional queries.
5. **DR & Replay Idempotency:** Verified that data backfills and upsert replay scripts execute with complete idempotency and zero constraint violations.
**Business Rule:** Zero insecure default fallbacks in production; fail closed on missing critical configuration.
**Reason:** Blueprint 2.2.2 §26 production rehearsal and operational hardening.

### Independent QA Certification: Gate H (Disaster Recovery & Runtime Concurrency)
**Decision:** Grant formal independent QA PASS to Release Gate H under Blueprint 2.2.2 §26.
**Business Rule:** Release Gate H is formally closed. Phase 9 (Post-Gate-H Comprehensive Legacy Cleanup & Final Production Hardening) is unlocked. Production deployment status remains NO-GO until Phase 9 legacy cleanup passes Independent QA for final production release sign-off.
**Reason:** 100% verification across all 10 migration scenarios, 6/6 Gate H concurrency & DR scenarios, 16/16 Gate G scenarios, 16/16 repository test suites, clean ESLint (0 errors), clean Next.js 16.3.3 + worker production build (31/31 routes), and 6/6 Playwright E2E user journeys.

### Phase 9: Post-Gate-H Comprehensive Legacy Cleanup & Schema Pruning
**Decision:** Executed forward migration `0014_phase_9_legacy_cleanup.sql` and pruned all legacy database columns, types, and tables to launch Mengart with zero technical debt:
1. **Pruned Columns:** Dropped `challenges.quorum_requirement`, `challenges.allow_revisions`, `challenge_voting_rounds.round_sequence`, `critique_comments.critique_aspect`, and `challenge_results.winner_slot_id`.
2. **Pruned Types:** Dropped `critique_aspect` and `slot_type` enum types from PostgreSQL.
3. **Pruned Tables:** Dropped `challenge_jury_scores` CASCADE, `challenge_jury_slot_assignments` CASCADE, and `challenge_winner_slots` CASCADE.
4. **Backend Code Pruning:**
   - Removed `allowRevisions` logic in `src/app/actions/challenges.ts` and `challengeService.ts`.
   - Removed `quorumRequirement`, `roundSequence`, and podium slot references in `challengeService.ts` and `votingService.ts`.
   - Removed `critiqueAspect` across comment creation and views.
   - Removed `generateWatermarkedDerivatives` alias in `mediaValidation.ts` in favor of canonical `generateMediaDerivatives`.
   - Removed unused legacy component `JuryEvaluationForm.tsx` and legacy MIME fallback mappings.
**Business Rule:** Mengart operates with zero legacy debt, fully aligned with Blueprint 2.2.2 dynamic jury awards and unified comment models.
**Reason:** Post-Gate-H cleanup directive per `phase_9_legacy_cleanup_instructions.md`.

### Final Independent QA Certification: Production Sign-Off (Gates A–H & Phase 9 Clean)
**Decision:** Grant formal independent QA PASS and final production deployment sign-off to Mengart codebase at SHA `395cea4327d445a2b06402f0a6b49358540c8714`.
**Business Rule:** Overall production deployment status is updated from NO-GO to GO. All 8 release gates (Gates A through H) and Phase 9 (Comprehensive Legacy Cleanup) have achieved 100% verification with zero legacy debt, zero lint errors, 18/18 passing test suites, 11/11 passing migration scenarios, 6/6 passing Playwright E2E user journeys, and clean production builds.
**Reason:** Strict verification against Blueprint 2.2.2 and the Pre-Production Legacy Deprecation Policy.

### Pruning GIF & WebM from PostgreSQL Enum, Frontend Pickers & Gallery Filters
**Decision:** Forward migration `0015_prune_gif_media_type.sql` alters the PostgreSQL enum `media_type` to strictly `['image', 'video']`, dropping `'gif'`. All frontend file upload pickers (`QuickUploadModal.tsx`, `ChallengeSubmissionModal.tsx`, `UploadArtworkModal.tsx`) strictly accept `image/png,image/jpeg,image/webp,video/mp4` and update user-facing labels to PNG, JPG, WebP (≤ 25MB) and Video MP4 (≤ 50MB). The gallery filter `{ key: "gif", label: "GIF" }` and all TypeScript `"gif"` union members are completely eliminated.
**Business Rule:** Mengart strictly accepts only static images (JPEG, PNG, WebP ≤ 25MB) and MP4 video (H.264/AAC or silent ≤ 50MB). GIF, WebM, SVG, and other containers/codecs are rejected fail-closed.
**Reason:** Strict adherence to Blueprint 2.2.2 §6.1 and §24 Items 20 & 21.

### Purging Watermark Residual Comments and Policies
**Decision:** All legacy comments in database schema (`artworks.ts`), policy engines (`policy.ts`), and test suites referencing "watermarked" are aligned to "clean public derivative" and "original master media".
**Business Rule:** Public derivatives are resolution-limited WebP/MP4 files with zero watermark overlays. Master media access remains governed by Gate A/Gate D ACLs.
**Reason:** Fulfills the Watermark Removal Amendment v1.1 under Blueprint 2.2.2 without semantic drift.

### Artwork Spoiler Viewing Experience Completion
**Decision:** Completed the viewing experience for `is_spoiler` in `ArtworkCard.tsx` and `ArtworkLightbox.tsx`:
1. `ArtworkCard`: Unrevealed spoiler artworks render with a heavy blur filter (`blur-xl`), generic unrevealed alt text ("Konten spoiler tersembunyi"), a spoiler overlay badge, and an explicit "Buka Konten / Reveal" button. Clicking reveal reveals the thumbnail for the active session without navigating. A top "SPOILER" badge indicates flagged content.
2. `ArtworkLightbox`: Unrevealed spoiler artworks render with a heavy blur filter (`blur-2xl`), a spoiler warning card, and a "Tampilkan Karya (Buka Spoiler)" button.
3. `/artworks/[slug]/page.tsx`: Passes `isSpoiler={artwork.isSpoiler}` to `ArtworkLightbox`.
**Business Rule:** An artwork's spoiler state initially obscures visual presentation until the viewer intentionally reveals it. The spoiler flag does not alter audience, publication status, media ACL, voting eligibility, or Star tallies.
**Reason:** Completes the Gate G viewing experience mandate from `GateE_Additive_Decision_Spoiler.md`.

### Affirmation of Discord-Style Bearer Invites
**Decision:** Confirmed 100% adherence to Blueprint 2.2.2 §4.4: 8-character CSPRNG alphanumeric default codes (`[A-Za-z0-9]`), lowercase custom vanity codes ≤ 25 characters (`[a-z0-9-]`), direct unique bearer code storage, ACTIVE Admin-only management with real code visibility and one-click copy, deterministic exact-first lookup, two-phase locking redemption, and clean cookie continuation.
**Business Rule:** Invitations are direct bearer credentials administered strictly by active Admins and redeemed atomically.
**Reason:** Authoritative product invariant under Blueprint 2.2.2 §4.4.

### Historical Challenge Backfill Reconciliation with Blueprint 2.2.2
**Decision:** Reconcile `importHistoricalChallengeAction` and `HistoricalImportForm.tsx` with canonical Blueprint 2.2.2 database schema invariants:
1. **Single Community Winner:** At most one entry can have `winnerSlotType === "community_vote_winner"`, matching partial unique index `uniq_challenge_community_winner`. Multiple entries throw a pre-flight validation error.
2. **Exclusion of Non-Winners from Results:** Regular participant submissions (`winnerSlotType === "none"`) are saved to `challenge_submissions` but strictly omitted from `challenge_results`.
3. **Dynamic Unranked Jury Awards:** Jury awards are strictly unranked (`finalRank = null`), populated into `challenge_jury_awards`, and linked to `challenge_results.juryAwardId` and `recordedByUserId`. Obsolete numeric 1-100 jury scores are removed.
4. **Portfolio Auto-Promotion:** Invocations of `importHistoricalChallengeAction` trigger `autoAddChallengeSubmissionsToPortfolioService(tx, challenge.id)` so historical submissions are automatically reflected in artist portfolios with canonical captions.
5. **Archived Voting Rounds:** Voting-enabled historical challenges automatically create an archived closed main round in `challenge_voting_rounds` and freeze candidates in `challenge_voting_round_candidates`.
**Business Rule:** Historical challenges must maintain exact parity with live finished challenges across winner uniqueness, jury models, voting round structures, and portfolio auto-promotion.
**Reason:** Resolves schema and runtime constraint violations between historical import action and Blueprint 2.2.2.

### System-Wide Feature Hardening & Polish Reconciliations
**Decision:** Applied 6 hardening and polish remediations across platform domains:
1. **Homepage Public Artwork Query Hardening (`src/app/page.tsx`):** Joined `users` and `portfolioEntries` with `users.membershipStatus = 'active'` and `portfolioEntries.isVisible = true` to prevent leaking unpromoted challenge submissions or suspended user artworks into the homepage grid.
2. **Creator Vault Soft-Deletion Filter (`src/app/me/portfolio/page.tsx`):** Added `isNull(artworks.deletedAt)` to the portfolio manager query so soft-deleted artworks are not rendered in the artist's active management view.
3. **Challenges Directory State Completeness (`src/app/challenges/page.tsx`):** Added `tie_pending` and `paused` to the "active" tab, and `results_revoked` to the "completed" tab so challenges never disappear from the public directory.
4. **WhatsApp Referral Privacy Consent Guard (`src/app/commissions/page.tsx`):** Added `service.artistWhatsappEnabled` guard before rendering direct WhatsApp order referral links, honoring `profiles.waConsentGiven`.
5. **Challenge Detail Candidate Spoiler Presentation (`src/app/challenges/[slug]/page.tsx`):** Enforced `blur-xl` and centered `SPOILER` badge overlay on candidate thumbnails when `sub.isSpoiler === true`.
6. **Residual Type Pruning:** Completely removed residual `"gif"` union members and normalized legacy `"general" | "detailed"` critique mode remnants to `"showcase_only" | "open_for_critique"`.
**Business Rule:** Public artwork showcases require visible portfolio entries and active membership. Creator vaults exclude soft-deleted items. Directory tabs capture all operational lifecycle states. WhatsApp links strictly require explicit artist consent. Spoiler artworks must visually obscure content until deliberately revealed.
**Reason:** Eliminates query leakage, preserves artist privacy, avoids UI 404 dead-ends, and achieves 100% type purity across the repository.

## 2026-09-04

### Development Multi-Role Impersonation & Quick-Login Provider
**Decision:** Added a non-production `Credentials` provider and 1-click test login toolbar on `/login` to simulate Admin (`admin@mengart.local`), Moderator (`moderator@mengart.local`), Member (`member@mengart.local`), and Unverified/Pending Invite (`pending@mengart.local`) accounts without requiring Google OAuth credentials.
**Business Rule:** Dev credentials authorization is strictly disabled in production (`process.env.NODE_ENV === 'production'`) and only operates on seeded development accounts.
**Reason:** Enables fast manual QA and multi-role testing of admin tools, moderation queues, voting flows, and onboarding without needing external OAuth credentials.

## 2026-09-07

### Frontend Overhaul Blueprint v0.3 Adoption (Mobile-First, Atomic Design, Flow Continuity & Contract Repair)
**Decision:** Formally adopt `Mengart frontend overhaul blueprint v0.3` as the authoritative frontend design, state architecture, and engineering execution specification:
1. **Primary Navigation Architecture:** Standardize on 4 persistent destinations across mobile and desktop: **Beranda · Challenge · Galeri · Studio** (with Studio pointing to the signed-in creator's public profile preview with management shortcuts). Commissions are placed as a discovery sub-section in Galeri/Artist profiles and managed inside Studio.
2. **Gallery Provenance Separation:** Provide two distinct gallery tabs: **"Karya bebas"** (independent member uploads) and **"Karya challenge"** (challenge contest submissions), derived from canonical submission relationships.
3. **Challenge Voting Mechanics:**
   - Two-column phone overview with uncropped aspect-ratio preservation; tap opens full detail view.
   - Voting controls accessible in both overview and detail. Inspection is not mandatory.
   - Public aggregate Star totals visible before voting; voter identities remain 100% private.
   - Immediate server save on Star allocation/removal.
   - Explicit confirmation required when moving the default assigned single Star from artwork A to artwork B (*"Pindahkan Star dari karya A ke karya B?"*).
4. **Past Challenge Presentation:** Render the original theme and brief first, followed by published results and winner showcase, then participant entries.
5. **Submission Text Recovery:** Restore unsubmitted text fields (title & description) locally after browser closure; media files must be deliberately re-selected. No client-persisted files, tokens, or private URLs.
6. **Backend Contract & Security Repair Prerequisites (Phase 2):** Resolve vulnerabilities A01–A08 prior to releasing redesigned UI screens:
   - A01: Secure `getChallengeVotingData` by deriving viewer identity strictly server-side.
   - A02: Strip `masterStorageKey` from public home/gallery queries.
   - A03: Enforce active membership and public profile status on artist and challenge lookups.
   - A04: Replace no-op admin takedown with real transactional service and audit logging.
   - A05: Implement canonical `disqualifyChallengeCandidateService` with Star refund.
   - A06: Eliminate suspended account redirect loop with a dedicated terminal `/account-suspended` view.
   - A07: Unify artwork upload schema and harmonize `caption` vs `description`.
   - A08: Canonical WITA datetime input converter eliminating browser timezone shifts.
**Business Rule:** User-authorized operations must flow through verified server actions and domain services. Never present decorative features without server backing. All public UI copy strictly adheres to natural, creator-respectful Bahasa Indonesia (*Atelier Vernacular*).
**Reason:** Resolves UI page detachment, broken translated phrasing, mobile touch deficiencies, and contract/security gaps identified during the 7-Sept-2026 comprehensive repository audit.

### Grill-Me Interaction & Engineering Resolutions
**Decision:** Resolved 8 concrete execution details through interactive design-tree grilling:
1. **Direct Staff Takedown (A04):** Implemented direct staff takedown action requiring mandatory reason ($\ge 5$ chars), producing committed database mutation and audit log without requiring a prior member report.
2. **Suspended Account State (A06):** Created dedicated terminal `/account-suspended` route with explanatory message and Sign Out action, eliminating the redirect loop on `/dashboard`.
3. **Focused Screen Mobile Navigation:** `MobileBottomNav` is hidden on both `/challenges/[slug]/voting` and `/artworks/[slug]`, replaced by contextual thumb-zone action bars.
4. **Gallery Separation Architecture:** Implemented top segmented pill bar `[ Karya Bebas | Karya Challenge ]` synced with URL parameters `?tab=bebas` and `?tab=challenge`.
5. **Submission Recovery Presentation:** Text fields auto-populate upon form opening, accompanied by an informative banner (*"Teks dipulihkan. Pilih kembali berkas karya untuk melanjutkan."*) and a *"Buang draf"* action.
6. **Multi-Star Budget Movement:** Direct informative toast/banner guidance when full budget is allocated (*"Semua {maxStars} Star sudah kamu gunakan. Kurangi alokasi dari karya lain terlebih dahulu sebelum memilih karya ini."*).
7. **Creator Studio Landing:** `/dashboard` opens the artist's public profile preview with an owner sub-navigation bar `[ Pratinjau | Portofolio | Layanan Komisi | Edit Profil ]`.
8. **Command Palette & Search Scoping:** `⌘K` palette acts as "Pintasan Cepat" (shortcuts, navigation, quick actions), while in-depth content searches live directly on discovery pages.
**Business Rule:** These 8 decisions govern Phase 2 through Phase 6 implementations.
**Reason:** Fully aligned during user interview and blueprint grilling.

### Terminologi UI: Penggantian Istilah "Kritik" Menjadi "Komentar"
**Decision:** Mengganti istilah "Kritik" / "Kritik Terbuka" menjadi "Komentar" / "Komentar Terbuka" di seluruh antarmuka pengguna (misal: "Beri Komentar", "Komentar (12)", filter "Komentar Terbuka").
**Business Rule:** Skema database dan enum backend tetap kompatibel (`critique_mode`), namun seluruh layer presentasi pengguna, label tombol, badge, placeholder form, dan notifikasi menyajikan kata "Komentar" yang ramah dan inklusif.
**Reason:** Istilah "Kritik" terkesan kaku, mengintimidasi, dan menimbulkan tekanan psikologis bahwa respon harus berupa kritik analitis. "Komentar" menciptakan ruang interaksi, apresiasi, dan diskusi karya yang hangat dan alami bagi seluruh anggota komunitas.

## 2026-09-08

### Phase 2: Security & Backend Contract Repairs Execution Complete (A01–A08)
**Decision:** Fully executed and verified all 8 critical security, authorization, and contract remediations:
1. **A01 (Voting Read Auth):** `getChallengeVotingData` derives identity strictly from server-authenticated session (`requireAuth()`), blocking unauthorized 3rd-party user ballot requests.
2. **A02 (Master Key Leakage):** Stripped `masterStorageKey` from public home queries and restricted to authorized owners/admins.
3. **A03 (Public Entity Filters):** Joined `users` and enforced active membership (`membershipStatus === 'active'`, `!deletedAt`) and active public profile status (`profileStatus === 'active_public'`) across artist profiles (`/artists/[slug]`) and commissions (`/commissions`). Enforced `isNull(challenges.deletedAt)` and `isVisible === true` on `getChallengeBySlug` with staff preview allowances.
4. **A04 (Direct Staff Takedown):** Replaced mock toast with transactional `takedownArtworkDirectService` setting `publicationStatus: 'hidden'`, requiring $\ge 5$ character reason and writing immutable audit log `artwork.takedown`. Wired `ArtworkAdminMenu.tsx`.
5. **A05 (Disqualify Candidate & Star Refund):** Implemented `disqualifyChallengeCandidateService` and `disqualifyChallengeCandidateAction` executing transactional status transition to `disqualified`, snapshot removal, automated Star refund deduction from ballots, voter notification (`star_returned`), candidate moderation notification, and audit log.
6. **A06 (Suspended Account Terminal Route):** Created `/account-suspended` view and updated `requireAuth` in `src/lib/rbac.ts` to redirect suspended users to `/account-suspended`, breaking the infinite redirect loop on `/dashboard`.
7. **A07 (Upload Description Harmonization):** Updated `createArtworkUploadAction` to accept either `description` or `caption`. Aligned `QuickUploadModal.tsx` and `UploadArtworkModal.tsx` to pass both, added `isSpoiler` toggle, and updated UI terminology from "Kritik" to "Komentar".
8. **A08 (WITA Timezone Helpers):** Created `src/lib/presentation/witaTime.ts` (`toWitaDatetimeLocalValue`, `parseWitaDatetimeLocalInput`, `formatWitaDate`) and integrated into `ChallengeCreateForm.tsx` to eliminate browser timezone offset shifts.
**Business Rule:** All mutations flow through verified server actions and domain services with live active membership checks. Public queries never expose suspended, deleted, or invisible entities.
**Reason:** Prerequisite engineering master plan milestone to ensure backend integrity before deploying redesigned frontend components. Verified via 19 test suites and 100% build pass.

### Phase 3: Atomic Design Foundations & Navigation Shells Complete
**Decision:** Built and verified the complete atomic component hierarchy and layout shell system:
1. **Atoms (`src/components/ui/atoms/`):**
   - `AtelierButton`: Standardized atelier styling (`primary-amber`, `surface`, `ghost`, `danger`, `outline-amber`), 44px min touch height on touchscreens, accessible focus rings.
   - `AtelierBadge`: Semantic badge variants (`amber`, `success`, `danger`, `muted`, `default`) with sentence-case typography.
   - `SegmentedPill`: Keyboard-navigable accessible tab control with 44px touch targets.
   - `AtelierInput` & `AtelierTextarea`: Clean input fields enforcing `text-base sm:text-sm` to prevent iOS Safari viewport auto-zoom.
   - `TimestampWITA`: Standardized tabular numerals in `JetBrains Mono` for absolute WITA timestamps.
   - `StatusDot`: Semantic status indicator with subtle pulse animations.
2. **Molecules (`src/components/ui/molecules/`):**
   - `ArtworkMediaFrame`: Uncropped aspect-ratio container with image/video rendering and additive spoiler presentation (`blur-2xl`, safe alt, interactive reveal/hide).
   - `MetadataRow`: Compact artist info row with avatar, display name, software badges, and absolute timestamp.
   - `StarAllocationCounter`: Sticky thumb allocation counter displaying remaining budget, exhaustion feedback, and immediate server-save states.
   - `SubmissionRecoveryBanner`: Recovery notification with 1-click "Buang draf" action.
   - `FilterPills`: Pan-scroll horizontal chip filter with no scrollbar clutter.
   - `ConfirmModal`: Radix-based accessible confirmation dialog for single-star movement and draft clearing.
3. **Layout Shells & Reconfigured Navigation:**
   - `CommunityShell`: Persistent header with 4-item `MobileBottomNav` (`Beranda`, `Challenge`, `Galeri`, `Studio`).
   - `StudioShell`: Creator studio layout with owner sub-nav rail `[ Pratinjau | Portofolio | Layanan Komisi | Edit Profil ]`.
   - `FocusedTaskShell`: Immersive full-focus shell for voting and artwork detail views with top back navigation and mobile bottom thumb action bar, hiding `MobileBottomNav`.
   - Updated `AppHeader`, `MobileBottomNav`, `UserDropdown`, and `GlobalCommandPalette` to adopt 4 persistent destinations and Atelier Vernacular copy.
**Business Rule:** Minimum touch target size $\ge 44$px for all interactive elements. Forms enforce zoom prevention.
**Reason:** Eliminates mobile friction, standardizes design tokens across all views, and fulfills Blueprint v0.3 Phase 3.

### Phase 4: Challenge & Voting Journey Rebuild Complete
**Decision:** Rebuilt the complete challenge directory, challenge details, submission workflow, and voting experience:
1. **Submission Text Recovery (`ChallengeSubmissionModal.tsx`):** Unsubmitted challenge submission text (`title`, `description`) is saved locally per challenge (`mengart_sub_draft:${challengeId}`). Upon modal opening, saved draft text is automatically restored with an informative banner and a "Buang draf" action. Media files must be selected fresh by the creator.
2. **Voting Fairness & Dual Mobile Workflow (`VotingWorkspace.tsx`):**
   - Implemented a 2-column mobile card overview preserving uncropped aspect ratios.
   - Public aggregate star totals are displayed upfront for transparency.
   - Direct voting controls on cards with immediate optimistic UI and background server save (`castOrUpdateBallotAction`).
   - Single-star movement confirmation dialog (`ConfirmModal`) preventing accidental vote shifts when moving the default 1-Star budget.
   - Multi-star budget exhaustion guidance banner when allocation ceiling is reached.
   - Fullscreen focus inspection dialog allowing deep evaluation without mandatory modal gating.
3. **Immersive Voting Shell (`challenges/[slug]/voting/page.tsx`):** Wrapped in `FocusedTaskShell` with breadcrumb navigation and sticky mobile thumb dock featuring `StarAllocationCounter`.
4. **Challenge Presentation Flow Alignment (`challenges/[slug]/page.tsx`):**
   - Active challenges display brief, deadline countdown, rules, and participant gallery.
   - Concluded challenges display theme brief first, followed by official published results and winner showcase, followed by participant entries archive.
5. **Challenge Directory Polish (`challenges/page.tsx`):** Integrated `CommunityShell`, status filter tabs, and Atelier cards with absolute WITA deadlines.
**Business Rule:** Public Star counts are visible; individual voter identities remain strictly confidential. Voting allocations are persisted immediately. Concluded challenges highlight winners first.
**Reason:** Fulfills Blueprint v0.3 Phase 4 requirements and Grill-Me decisions #3, #4, #5, #6.

### Phase 5: Connected Discovery (Gallery & Artwork Detail Rebuild) Complete
**Decision:** Rebuilt public artwork discovery and artwork detail presentation with complete provenance and Atelier Vernacular:
1. **Gallery Provenance & Backward Compatible Filtering (`src/app/api/artworks/route.ts`):**
   - Extended API route with `tab` (`bebas` | `challenge`) and `sort` (`latest` | `oldest`) query parameter handling.
   - Left-joined `challengeSubmissions` and `challenges` to enrich artworks with `challengeTitle`, `challengeSlug`, and `effectiveCaption` (`custom_caption ?? system_caption`).
   - Maintained 100% backward compatibility: when `tab` is omitted, all visible portfolio artworks are returned (preserving Gate E and Phase 4 test suite expectations).
2. **Synchronized Filter Store & URL Parameters (`src/stores/useGalleryFilterStore.ts`, `src/hooks/useArtworks.ts`):**
   - Synced segmented tab state with URL query parameters `?tab=bebas` and `?tab=challenge`.
3. **Atelier Gallery Grid (`src/components/gallery/GalleryGrid.tsx`):**
   - Top segmented pill `[ Karya Bebas | Karya Challenge ]`.
   - Filter chips for media types (`Semua`, `Gambar`, `Video`), sorting, and "Komentar Terbuka".
   - Contextual discovery banner linking to open commissions (`/commissions`).
4. **Artwork Card Provenance & Atelier Copy (`src/components/gallery/ArtworkCard.tsx`):**
   - Replaced all "Kritik Terbuka" text with "Komentar Terbuka".
   - Rendered challenge provenance badge (`Challenge: [Title]`) linking to challenge page.
5. **Immersive Artwork Detail Screen (`src/app/artworks/[slug]/page.tsx`):**
   - Wrapped in `FocusedTaskShell` with contextual back navigation (`/gallery`), right-side report/profile actions, and bottom thumb action bar.
   - Preserved uncropped aspect ratio media presentation with spoiler reveal, software tags, and absolute WITA timestamp.
6. **Mobile Thumb Action Bar (`src/components/artworks/ArtworkFocusedBottomBar.tsx`):**
   - Sticky bottom bar featuring artist identity pill, comment count button with smooth scroll to `#comments`, and Web Share API trigger with clipboard fallback.
7. **Inclusive Commenting Experience (`src/components/artworks/CritiqueSection.tsx`):**
   - Fully replaced "Kritik" with "Komentar" (e.g. "Beri Komentar", "Komentar (N)", appreciative placeholder copy).
   - Preserved author edit `(diedit)`, soft-deletion, and staff hide/restore moderation workflows.
8. **Artist Directory Polish (`src/app/artists/page.tsx`, `src/app/artists/[slug]/page.tsx`):**
   - Wrapped in `CommunityShell` with Atelier typography and active membership filtering.
**Business Rule:** Independent uploads and challenge submissions are distinctly browsable. Social commenting uses "Komentar". Artwork detail view prioritizes mobile thumb navigation.
**Reason:** Fulfills Blueprint v0.3 Phase 5 and user-mandated terminology invariants.

### Phase 6: Creator Studio (Public Profile, Portfolio & Commissions) Complete
**Decision:** Rebuilt creator dashboard and management experiences into a cohesive "Studio Atelier":
1. **Public Profile Preview Landing (`src/app/dashboard/page.tsx`):**
   - Wrapped in `StudioShell` with owner sub-navigation rail `[ Pratinjau | Portofolio | Layanan Komisi | Edit Profil ]`.
   - "Pratinjau" mode displays how visitors see the artist's profile, including bio, specialties, software tags, commission status, public portfolio grid with visibility indicators, commission packages with turnaround days (`minTurnaroundDays` - `maxTurnaroundDays`), and scope rules (`commissionScopeRules` with Do and Don't lists).
2. **Portfolio Manager Rebuild (`src/app/me/portfolio/page.tsx`):**
   - Wrapped in `StudioShell`.
   - Integrated quick upload modal trigger, custom caption inline editing, visibility toggle (`isVisible`), and soft-deletion.
3. **Commission Packages & Rules Manager (`src/app/me/commissions/page.tsx`):**
   - Wrapped in `StudioShell`.
   - Provided service package creation, editing, turnaround days, price ranges, and Do/Don't scope rules management.
4. **Creator Profile Settings (`src/app/me/profile/page.tsx`):**
   - Wrapped in `StudioShell`.
   - Direct link to preview public profile (`/dashboard` or `/artists/[slug]`), avatar/banner uploads, specialties, and software chips.
**Business Rule:** Studio provides the artist with a unified hub matching the public presentation view while exposing quick editing capabilities.
**Reason:** Fulfills Blueprint v0.3 Phase 6 requirements and Grill-Me Decision #7.

### Phase 7: Commission Hub Polish & Discovery Flow Complete
**Decision:** Rebuilt and polished the public commission directory and service cards:
1. **Community Shell Integration (`src/app/commissions/page.tsx`):** Wrapped in `CommunityShell`, adopting standard header navigation, persistent mobile bottom navigation, and Atelier design tokens.
2. **Atelier Vernacular Copy:** Replaced disjointed copy with natural Indonesian phrasing (*"Kolektif Komisi Kreator"*, *"Jelajahi tawaran layanan ilustrasi dan seni visual dari para kreator terverifikasi di Mengart Atelier"*).
3. **Mobile-First Input & Touch Targets:** Enforced `text-base sm:text-xs` on search inputs and `min-h-[44px]` on all interactive buttons to avoid iOS auto-zoom and thumb navigation strain.
4. **Waitlist & Slot Availability:** Displayed slot status (`waitlistCurrentSlots` / `waitlistMaxSlots`) on waitlist cards and "Terbuka" on open status cards.
5. **WhatsApp Privacy Protection:** Directly verified `waConsentGiven` (`profiles.waConsentGiven`) and valid WhatsApp numbers before generating direct WhatsApp click-to-chat links; gracefully fell back to the artist profile when consent is absent.
6. **Service Modal Polish (`src/components/commissions/CommissionServiceModal.tsx`):** Updated all form inputs to enforce `text-base sm:text-xs` for iOS auto-zoom prevention.
**Business Rule:** Commission discovery strictly respects artist contact privacy preferences and provides clear pricing and delivery estimates.
**Reason:** Fulfills Blueprint v0.3 Phase 7 requirements.

### Phase 8: Cross-Device Verification, Playwright E2E & Final Release Audit Complete
**Decision:** Executed comprehensive cross-device validation, mobile viewport accessibility audit, and automated Playwright E2E regression:
1. **E2E Test Suite (`e2e/frontend-overhaul-v03.spec.ts`):**
   - Verified 4 persistent navigation destinations (**Beranda · Challenge · Galeri · Studio**) with $\ge 44$px touch targets on mobile viewports.
   - Verified gallery provenance tabs switching (`[ Karya Bebas | Karya Challenge ]`) and URL synchronization.
   - Verified strict vernacular invariant: verified "Komentar Terbuka" chip and verified zero instances of legacy "Kritik" buttons on public interfaces.
   - Verified mobile font-size bounds ($\ge 16$px on mobile viewports) to eliminate iOS Safari auto-zoom.
   - Verified unauthenticated `/dashboard` access redirects to `/login`.
2. **Full Regression Validation:**
   - 20/20 Playwright E2E tests passed cleanly across both mobile and desktop browser projects.
   - 19/19 backend, security, and invariant test suites in `npm run test:all` passed cleanly (100%).
   - Clean ESLint run (`npm run lint`: 0 errors, 0 warnings).
   - Production Next.js Turbopack build (`npm run build`: 32/32 routes + worker bundle compiled cleanly).
**Business Rule:** All redesigned screens adhere to Studio Atelier design tokens, $\ge 44$px touch targets, iOS auto-zoom prevention, and natural Indonesian terminology.
**Reason:** Fulfills Blueprint v0.3 Phase 8 requirements and closes the Frontend UI/UX Overhaul.

## 2026-09-09

### Historical Backfill Authorization Boundary & Service Decoupling (R01)
**Decision:** Fully decoupled `importHistoricalChallengeAction` from caller-controlled identity overrides. The exported Server Action accepts strictly `HistoricalChallengeInput` and internally derives identity via `await requireModerator()`. The underlying service was extracted to `src/lib/services/historicalBackfillService.ts` without `"use server"`, enforcing live database credential queries (`membershipStatus === 'active'`, `role IN ('admin', 'moderator')`, `!deletedAt`).
**Business Rule:** Privileged server actions must never accept client-supplied actor overrides. Dependency injection is strictly reserved for internal server-only services and tests.
**Reason:** Eliminates P0 security finding QA-P0-021 where malicious clients could supply arbitrary actor IDs to write historical challenges.

### Serialized Voting Queue, Reconciliation & Multi-Star Steppers (R02, R03)
**Decision:** Implemented a serialized FIFO promise queue with `.catch()` error barriers in `VotingWorkspace.tsx`. Separated internal state into `confirmedAllocationsRef`, `pendingAllocations`, and `failedIntentRef`. On transient network failures, state rolls back to confirmed and stores failed intent for explicit retry; on timeout or uncertainty, it triggers `reconcileBallotAction` before unlocking. For `starsPerMember > 1`, direct stepper buttons (`-` / `+`) allow budget stacking up to allowance.
**Business Rule:** Stored ballots in PostgreSQL must deterministically reflect the user's latest accepted voting intent with zero race-condition write tearing.
**Reason:** Eliminates P1 voting race conditions and stale response overwrites during rapid voting.

### Scoped Draft Storage Lifecycle & Dialog Height Clamping (R04, R06)
**Decision:** Standardized submission draft storage under scoped key `mengart_sub_draft:v1:${userId}:${challengeId}` via centralized `draftStorage.ts`, permanently purging legacy unscoped keys on initialization. Draft storage is cleared upon deliberate discard, successful submission, and user logout/account switch. `AccessibleDialog.tsx` now merges custom `className` properties via `cn(...)` and enforces `max-h-[min(90vh,calc(100dvh-2rem))] overflow-y-auto`.
**Business Rule:** Draft state must never cross user account boundaries or challenge boundaries. Modals must remain scrollable and reachable across small mobile viewports (375×667 and 320px).
**Reason:** Resolves P1 draft leakage and modal truncation findings.

### Monotonic Database Locking & Disqualification Phase Matrix (R05, R07)
**Decision:** Standardized row-level lock ordering across all mutation services to strictly:
$$\text{challengeVotingRounds (1)} \longrightarrow \text{challenges (2)} \longrightarrow \text{challengeSubmissions (3)} \longrightarrow \text{challengeBallots (4)}$$
Implemented the full lifecycle phase matrix in `disqualifyChallengeCandidateService`: preserves closed-round snapshots and governed history; only refunds and voids open-round ballots; handles single-candidate/zero-candidate transitions cleanly; records `voidedAllocations` in audit log. Updated `/api/artworks` with live staff check, safe origin discriminator `origin: "challenge" | "independent"`, and redaction of hidden/deleted challenge titles to `null` without reclassifying provenance.
**Business Rule:** Candidate disqualification is prohibited on finished challenges without explicit result revocation. Redacted challenge entries remain classified as `origin: "challenge"`. Monotonic locking order is mandatory across all transactions.
**Reason:** Mathematically prevents database deadlocks and maintains audit integrity under concurrent voting, finalization, and moderation.

### Navigation Continuity, Activity-First Beranda & Dual-Dimension Touch Targets (R08, R09, R10, R12)
**Decision:** 
1. Created `getSafeReturnUrl` in `src/lib/navigation/returnUrl.ts` rejecting backslashes, protocol-relative paths (`//`, `/\`), external schemes, and redirect loops.
2. Synchronously reset spoiler concealment and paused video playback in `ArtworkMediaFrame` on artwork identity changes.
3. Reworked Beranda layout to be activity-first (Compact Header $\rightarrow$ Current Challenge in 1st mobile viewport $\rightarrow$ Past Winners $\rightarrow$ General Artworks $\rightarrow$ Spotlight $\rightarrow$ Commissions $\rightarrow$ About) and adopted natural neutral vocabulary ("Lihat karya", "Beri Star", "Komunitas seni visual", strictly "Komentar").
4. Enforced $\ge 44 \times 44$px in both dimensions on all buttons, tabs, and steppers, with `overflow-x: hidden` clamped to `100vw`.
**Business Rule:** External redirect manipulation is blocked. Primary interactive controls must meet WCAG 2.2 Level AA touch target requirements ($\ge 44 \times 44$px).
### Voting Lifecycle, Generation Tracking & Uncertainty Barriers (R02, R03, R12)
**Decision:** Implemented explicit generation tracking (`currentGen = "${userId || 'anon'}:${votingRoundId}"`) in `VotingWorkspace.tsx`. Switching accounts or voting rounds immediately invalidates queued mutations, clears in-flight counters, and resets state to the incoming target round. Added an uncertainty lock barrier on network/500/timeout errors that halts subsequent mutations until authoritative state is verified. Server-side refreshes received while the queue is busy are buffered and reconciled after the queue drains, preventing older refreshed snapshots from clobbering newer acknowledged mutations. Rebuilt the 320px mobile candidate card stepper into a 2-row layout (Row 1: centered Star rating; Row 2: two-column grid with $\ge 50\times 44$px touch targets), dismiss buttons with 44px tap targets, and stopped keyboard event propagation on spoiler toggle buttons.
**Business Rule:** Voting mutations must never execute across account/round generations; uncertain network mutations block write pipelines until reconciled; mobile steppers must never clip or violate $44\times 44$px touch bounds.
**Reason:** Resolves Round 2 QA findings on queue lifecycle, optimistic race conditions, and 320px layout clipping.

### Moderation State-Transition Rules, Pending Rounds & Staff Triggers (R05)
**Decision:** Enhanced `disqualifyChallengeCandidateService` to:
1. Include pending rounds (`inArray(challengeVotingRounds.status, ["open", "pending"])`) and strictly revalidate round status after acquiring monotonic locks ($1 \rightarrow 2 \rightarrow 3 \rightarrow 4$).
2. Automatically remove disqualified candidates from `challengeVotingRoundCandidates` when in `submission_locked` phase with a pending round.
3. Automatically resolve ties in `tiebreak_open` and `tie_pending` by deriving remaining eligible candidates from the original tied set; when 1 candidate remains, crown them `community_vote_winner` and advance challenge to `finished` or `jury_selection_open`.
4. Capture audit snapshots (`jury_award.revoked_by_disqualification` / `challenge_result.revoked_by_disqualification`) when awards or results are revoked.
5. Added `CandidateStaffDisqualifyButton.tsx` and wired direct staff moderation triggers on candidate cards in both active and archive challenge views.
**Business Rule:** Disqualifications must never mutate closed rounds, must purge pending round eligibility before voting opens, and must automatically resolve single remaining tied candidates without human deadlock.
**Reason:** Resolves Round 2 QA findings regarding race conditions between round finalization and candidate disqualification.

### Shared Public Artwork Provenance & Beranda Protection (R07)
**Decision:** Created centralized presentation helper `src/lib/presentation/provenance.ts` (`projectPublicArtworkProvenance`, `sanitizeSystemCaption`) shared across `/api/artworks` and Beranda (`src/app/page.tsx`). System captions that reference private/unlisted challenge titles are replaced with safe neutral text ("Peserta Challenge", "Juara Favorit Komunitas", "Penghargaan Juri: [Category]") while strictly preserving artist `customCaption` and `origin: "challenge"`. Filtered Beranda active challenge and Hall of Fame queries with `eq(challenges.isVisible, true)`.
**Business Rule:** Non-staff public views must never leak hidden challenge titles via system captions or homepage queries, while preserving true challenge origin.
**Reason:** Resolves Round 2 QA finding on provenance leakage and caption sanitization.

### Draft Storage Invalidation & Deadline Enforcement (R04)
**Decision:** Hardened `draftStorage.ts` by wrapping `window.localStorage` in a safe accessor that catches all browser `SecurityError` exceptions (e.g. sandboxed iframes, private browsing with storage disabled). In `ChallengeSubmissionModal.tsx`, added `submissionDeadline` check that immediately discards and ignores local drafts if the submission deadline has passed, and cancelled pending autosave timers on modal unmount, discard, and user switch.
**Business Rule:** Draft submissions must never restore after a challenge deadline has passed, and localStorage access must never throw uncaught exceptions.
**Reason:** Eliminates draft restoration after submission deadline and sandbox storage crashes.

### Navigation Return Context Propagation (R09)
**Decision:** Wired `from` parameter propagation across all caller components: `ArtworkCard.tsx` accepts `from?: string` and formats links with `?from=${encodeURIComponent(from)}`; `GalleryGrid.tsx` passes `currentPathWithQuery` to preserve tab/search state; `src/app/artists/[slug]/page.tsx` passes `/artists/${artist.slug}`; and `src/app/challenges/[slug]/page.tsx` passes `/challenges/${challenge.slug}`. `FocusedTaskShell` uses `getSafeReturnUrl(from, "/gallery")` with contextual labels ("Galeri", "Beranda", "Profil", "Challenge").
**Business Rule:** Users returning from artwork detail pages must be guided back to their exact referring context without losing filter/search state.
**Reason:** Closes the caller return journey and completes R09 acceptance criteria.

## 2026-09-10

### Open Redirect Normalization & Same-Origin Sink Assertion (Finding 1 / R09)
**Decision:** Removed URL character allowlists that rejected valid query characters (such as `+` used by `URLSearchParams` for spaces). Enforced normalized-path validation (`url.pathname.replace(/\/+/g, "/")`) to prevent dot-segment protocol-relative bypasses (`//`, `/\\`, `/gallery/..//example.invalid`, `/a/%2e%2e//example.invalid`), and asserted same-origin target at the `redeem-callback` redirect sink (`createSafeRedirectUrl`).
**Business Rule:** Relative return URLs must preserve legitimate query parameters (including spaces encoded as `+` or `%20` and UTF-8 characters) while preventing protocol-relative and dot-segment external redirects.
**Reason:** Resolves Round 3 QA Finding 1 without breaking valid query search filters.

### Voting Recovery, Uncertainty Settle & Monotonic Sequence (Finding 2 / R02)
**Decision:** When mutation execution encounters network uncertainty (timeout/500/network error), pending counts immediately settle to zero, the latest unacknowledged voting intent is stored in `failedIntentRef`, and subsequent mutations are halted until authoritative state is reconciled via `handleReconcile`. Explicit replay action ("Coba simpan ulang") is revealed only AFTER reconciliation settles. Guarded `handleReconcile` across success, error, and finally paths with generation and unmount checks. Introduced monotonic sequence counters (`seqRef`, `latestConfirmedSeqRef`) to eliminate in-epoch race conditions from out-of-order network responses.
**Business Rule:** Pending voting states must never dangle under network uncertainty; user retry requires authoritative reconciliation first; older responses in an epoch cannot overwrite newer confirmed mutations.
**Reason:** Resolves Round 3 QA Finding 2 and completes the voting recovery contract.

### Disqualification Phase Matrix, Authentic Scores & Jury Rollback (Finding 3 / R05)
**Decision:** Updated `disqualifyChallengeCandidateService` to look up authentic winner Stars and `sourceVotingRoundId` using phase-specific authoritative closed rounds (checking tiebreak first, then main round) with inner joins to `challengeBallots`. Enforced row-level locked submission eligibility checks (`submissionStatus === 'submitted'`) during tiebreak and manual resolutions. Required `validateJuryPhaseReadinessService` before transitioning to `jury_selection_open` in `vote_and_jury` challenges, rolling back the transaction if zero jurors are configured.
**Business Rule:** Candidate disqualification must never attribute fabricated scores or round IDs; remaining tied candidates must be currently eligible under lock; unready jury panels must abort transition and roll back state changes.
**Reason:** Resolves Round 3 QA Finding 3.

### Authoritative Structured Artwork Provenance & Safe Fallback (Finding 4 / R07)
**Decision:** Removed caption string regex parsing and hyphen splitting heuristics. Populated authoritative structured metadata (`awardType`, `categoryLabel`) via scalar subqueries in `/api/artworks` and Beranda (`page.tsx`). Implemented `buildAuthoritativeSystemCaption` using structured fields with a safe neutral fallback ("Peserta Challenge") for legacy records or unlisted challenges, completely avoiding category label truncation.
**Business Rule:** Public artwork provenance and system captions must be derived from structured award metadata, not parsed from text strings; private challenges must be redacted without truncating valid categories.
**Reason:** Resolves Round 3 QA Finding 4.

### Draft Lifecycle, Epoch Invalidation & Logout Scoping (Finding 5 / R04)
**Decision:** Added explicit invalidation timestamps (`markDraftInvalidated`, `isDraftInvalidated`, `markGlobalDraftInvalidated`) in `draftStorage.ts` to prevent race conditions during debounce autosaves and invalidate drafts even before storage keys exist. Enforced draft cleanup across all logout paths (`UserDropdown`, `account-suspended`, `onboarding`). Scoped cleanup strictly to the departing user's keys to preserve drafts during modal dismiss or submission failures. Added cross-tab `storage` event listeners and deadline re-checks.
**Business Rule:** Submission drafts must never survive user logout or account switches, and debounce autosaves must never resurrect invalidated drafts.
**Reason:** Resolves Round 3 QA Finding 5.

### Gallery Context URL Synchronization & Focus Restoration (Finding 6 / R09)
**Decision:** Synchronized all gallery filter states (`tab`, `search`, `media`, `sort`, `critique`) to URL search parameters using non-scrolling router replacement (`router.replace(..., { scroll: false })`). Hydrated store state on mount and on browser Back/Forward (`popstate`). Stored composite context `{ url, artworkId, scrollY, timestamp }` in `sessionStorage` on card navigation, restored scroll position after artworks render, and focused the referring card element with `{ preventScroll: true }`.
**Business Rule:** Navigating to an artwork and returning via browser Back or breadcrumb must restore exact filter state, scroll position, and keyboard focus without jarring page jumps.
**Reason:** Resolves Round 3 QA Finding 6.

### Authentic Verification Gate & Environment Transparency (Finding 7 / R11)
**Decision:** Hardened `testPhase2SecurityAndContracts.ts` to verify exported Server Actions (`importHistoricalChallengeAction`) against live database caller sessions across anonymous, member, suspended, deleted, and demoted roles with 0 uncommitted writes on failure and verified positive writes on success. Replaced mocked concurrency tests with real multi-transaction PostgreSQL tests. Transparently documented WebKit host OS library limitation (`libavif16` missing on Linux host) while maintaining 100% pass rate across Desktop Chrome and Mobile Chrome (50 passed). Maintained PR in DRAFT.
**Business Rule:** Verification gates must test exported boundaries with real database transactions and report platform capabilities honestly without synthetic substitution.
**Reason:** Resolves Round 3 QA Finding 7 and aligns with strict verification-before-completion standards.

### Generational Draft Storage Contract & Reentrant Synchronization (F1 / R04)
**Decision:** Upgraded draft storage to monotonic integer generation counters (`mengart:draft-generation:${userId}:${challengeId}`) with cross-tab reentrant locking (`withDraftLock`). Draft invalidation never deletes the generation marker key; instead, it monotonically increments it, rendering delayed autosaves and wall-clock rollbacks mathematically impossible to resurrect stale drafts. Eliminated unscoped mass draft purging on logout, preserving unaffected users' drafts on shared computers.
**Business Rule:** Draft invalidation markers must be monotonic, persistent, and strictly scoped by `userId` and `challengeId`. Logout operations must never delete drafts of other users or unrelated challenges.
**Reason:** Resolves Round 4 QA Finding 1 (P1/R04).

### Decoupled Voting Intent Recovery & Monotonic Sequence Ordering (F2 / R02)
**Decision:** Decoupled the unacknowledged voting intent banner and explicit retry button ("Coba simpan ulang") from error banner states in `VotingWorkspace.tsx`. When reconciliation succeeds and server state settles, the unsaved intent recovery banner remains visible and operable if `hasUnsavedIntent` is true and `isUncertain` is cleared. Assigned monotonic sequence identifiers (`reconcileSeq`) to reconciliation cycles to discard delayed out-of-order server responses that arrive after newer confirmed mutations. Bound `isUncertainRef` and reset reconciliation states upon account or generation switches.
**Business Rule:** Unsaved voting intents blocked by network uncertainty must remain recoverable through explicit user action even after server state settles. Stale delayed reconciliation reads must never overwrite newer user mutations.
**Reason:** Resolves Round 4 QA Finding 2 (P1/R02).

### Zero-Seam Production Authorization Architecture (F3 / R01 & R11)
**Decision:** Completely eliminated global test authorization seams (`__testSessionUserOverride` and `__setTestSessionUser`) from production RBAC (`src/lib/rbac.ts`). Exported Server Actions (`importHistoricalChallengeAction`) enforce native `auth()` request-boundary authentication, gracefully falling back to unauthenticated rejection when invoked outside request contexts. Domain services verify actor privileges directly against live PostgreSQL rows with row-level role and membership status assertions.
**Business Rule:** Production authorization modules must contain zero global test overrides or mock seams. Server Action request boundaries and service-layer database constraints must be independently and authentically validated.
**Reason:** Resolves Round 4 QA Finding 3 (P1/R01 & R11).

### Tiebreak Resolution Portfolio Auto-Materialization (F4 / R05)
**Decision:** Updated `disqualifyChallengeCandidateService` in `src/lib/services/challengeService.ts` to invoke `autoAddChallengeSubmissionsToPortfolioService(tx, challenge.id)` on all state transitions advancing to `finished` (including single-survivor tiebreak resolution and 0-survivor terminations). Crowned winners immediately receive materialized `portfolio_entries` rows with deterministic system captions.
**Business Rule:** Every challenge transitioning to `finished` status must execute portfolio auto-materialization within the same database transaction.
**Reason:** Resolves Round 4 QA Finding 4 (P2/R05).

### Canonical Query Gallery Restoration & Target Verification (F5 / R09)
**Decision:** Hardened `GalleryGrid.tsx` context restoration: canonical query string comparison (`isMatchingGalleryUrl`) rejects pathname-only matches, a 15-minute expiration timestamp protects against stale context, and target element existence (`document.getElementById`) is verified prior to consuming context and scrolling/focusing with `{ preventScroll: true }`.
**Business Rule:** Gallery navigation state must only restore when the exact canonical query matches, within valid time windows, and when the referring DOM card exists.
**Reason:** Resolves Round 4 QA Finding 5 (P2/R09).

### Targeted Regression Suite & Comprehensive Verification Gate (F6 / R11)
**Decision:** Created dedicated regression test suites (`testDraftStorageGenerations.ts` for generational contracts and `testTiebreakPortfolioMaterialization.ts` for database portfolio materialization), integrated both into `npm run test:all`, and verified 100% pass across 22 backend suites (0 failures), 0 ESLint errors/warnings, 0 TypeScript errors, clean Next.js Turbopack build, and 50/50 Playwright E2E tests passing. Maintained transparent disclosure of Linux host OS `libavif16` WebKit limitation.
**Business Rule:** Verification claims must be backed by authentic command executions, zero mock bypasses, and explicit reproduction suites for all reported defects.
**Reason:** Resolves Round 4 QA Finding 6 (P2/R11).

### Actual Logout Invalidation, Autosave Cancellation & Identity Transition (G1 / R04)
**Decision:** Wired `invalidateActiveDraftOnLogout(departingUserId)` directly into production sign-out entry points (`UserDropdown.tsx` and `SignOutButton.tsx`) before invoking `signOut` or `logoutAction()`. The modal registers active draft context (`setActiveDraftContext(userId, challengeId)`) and registers in-flight autosave timer IDs (`registerPendingDraftAutosave`). On logout or transition from authenticated to anonymous (`prevUserIdRef.current && prevUserIdRef.current !== userId`), the active challenge draft is purged, pending autosave timers are cancelled, and the generation counter is monotonically incremented, while preserving all unrelated drafts of other challenges or other users on shared devices without mass/global purging.
**Business Rule:** Actual sign-out and authenticated-to-anonymous transitions must invalidate the active submission draft, abort in-flight autosaves, and advance the generation marker while strictly isolating other drafts.
**Reason:** Resolves Round 5 QA Finding G1 (P1 / R04).

### Lock Contention Guard, Atomic Interleaving & Web Locks API Serialization (G2 / R04)
**Decision:** Hardened `withDraftLock`: When storage lock acquisition fails, it immediately returns `null` and strictly DOES NOT execute the critical section. Upgraded `withDraftLockAsync` to leverage `navigator.locks.request` (Web Locks API) with automatic fallback to localStorage mutex locking. In `_internalIncrementDraftGeneration`, re-reads the live storage generation marker immediately before write and calculates `Math.max(readGen + 1, validLatest + 1)`, guaranteeing monotonic advances ($1 \rightarrow 3$) even under interleaved concurrent writes.
**Business Rule:** Critical sections requiring draft lock must never execute if lock acquisition fails; storage interleaving must never suffer lost updates; asynchronous operations must utilize Web Locks API where supported.
**Reason:** Resolves Round 5 QA Finding G2 (P1 / R04).

### Authoritative Render-Time Query Filter Derivation & Gallery Context Protection (G3 / R09)
**Decision:** In `GalleryGrid.tsx`, derived query filters (`authoritativeTab`, `urlSearch`, `authoritativeMedia`, `authoritativeSort`, `authoritativeCritique`) authoritatively from `searchParams` directly during render, passing them immediately to `useArtworksQuery`. This guarantees that the React Query key includes `tab: "challenge"` on the very first render, eliminating the race condition with cached `bebas` data. In the context restoration `useEffect`, verified `authoritativeTab === targetTab` and `!isLoading && !isFetching` before inspecting DOM card presence, preventing default-filter cached queries from prematurely consuming or discarding the return context. Bound all UI controls (SegmentedPill, filter chips, empty states) directly to authoritative filter values.
**Business Rule:** Data fetching queries and context restoration logic must derive filter identity authoritatively from URL `searchParams` on render, never lagging behind client store hydration.
**Reason:** Resolves Round 5 QA Finding G3 (P2 / R09).

### Zero-Seam Authenticated Request Testing & Monotonic PostgreSQL Concurrency Verification (G4 / R11)
**Decision:** Replaced mocked server action tests with genuine authenticated exported Server Action tests in `testPhase2SecurityAndContracts.ts` (Scenario 6) by bundling `historicalBackfill.ts` via test-level `esbuild` stubbing `@/auth` without adding mock seams or global test overrides to production code. Proved that unauthenticated callers and payload injections are rejected with zero DB writes, member/suspended/deleted staff are rejected by live PostgreSQL constraints, and active staff are accepted with live DB insertion and audit logging. Enhanced PostgreSQL concurrency test (Subscenario 7E) to fixture an active challenge with an open voting round, 4 candidates, cast ballot stars, and 2 concurrent candidate disqualifications under monotonic row locks (`challengeVotingRounds` $\rightarrow$ `challenges` $\rightarrow$ `challengeSubmissions` $\rightarrow$ `challengeBallots`), confirming candidate snapshot deletion, star voiding, and audit log commits. Accurately documented all 22 test suites in `npm run test:all` and transparently disclosed Linux host OS `libavif.so.16` WebKit limitation while maintaining 50/50 passing on Chrome.
**Business Rule:** Testing must verify exported server action boundaries with authentic session contexts without production test hooks; PostgreSQL concurrency tests must reflect live voting rounds and ballot locks; test counts and platform limitations must be documented with absolute precision.
**Reason:** Resolves Round 5 QA Finding G4 (P2 / R11).

### Dual-Layer Cross-Tab Web Lock Coordination & Fail-Closed Contention Policies (Finding H1 / R04)
**Decision:** Unified `withDraftLockAsync` to enforce a dual-layer lock: process-level coordination across tabs via `navigator.locks.request` (Web Locks API) that simultaneously acquires the underlying `localStorage` mutex key `mengart:draft-lock:${userId}:${challengeId}` throughout the critical section. Eliminated unlocked fallback mutations in `incrementDraftGeneration` and `incrementDraftGenerationAsync`, ensuring both fail-closed and return `null` without mutating storage under lock contention. Hardened `invalidateActiveDraftOnLogout` so that if lock acquisition fails during logout, active draft context in `sessionStorage` is preserved (not silently discarded) and the operation returns `false` to prompt retry.
**Business Rule:** Draft operations across tabs must coordinate through Web Locks with synchronized storage-level mutexes. Lock contention must fail closed without rogue mutations, and logout draft invalidation failures must not discard active context.
**Reason:** Resolves Round 6 QA Finding H1 (P1 / R04).

### Form Text Retention, Identity Decoupling & Immediate Draft Flush on Close (Finding H2 / R04)
**Decision:** In `ChallengeSubmissionModal.tsx`, decoupled dialog open/close state (`isOpen`) from the identity reset effect. Scoped the form reset effect strictly to actual identity and initial property changes (`[userId, challengeId, initialTitle, ...]`). Tracked latest form state in `latestValuesRef` and implemented `flushPendingDraft()`, which triggers immediately when the modal is closed (via ESC, backdrop click, Close 'X', or 'Batal' button) or unmounted. This immediately commits in-flight edits to `localStorage` before debounce timers expire, preventing text loss. Re-opening the modal retains active in-memory form values, while explicit discard or successful submission cleanly clears storage and resets fields.
**Business Rule:** Closing an active submission modal without discarding must never discard user text, and debounced drafts must flush synchronously to persistent storage upon modal close or unmount.
**Reason:** Resolves Round 6 QA Finding H2 (P2 / R04).

### Exported Action Integration Labeling & Committed Ballot Invariant Assertions (Finding H3 / R11)
**Decision:** Accurately re-labeled Scenario 6 in `testPhase2SecurityAndContracts.ts` as an exported server action integration test with mocked session resolution and live PostgreSQL service verification, honestly distinguishing it from full HTTP session authentication. In Subscenario 7E (PostgreSQL concurrency), added strict assertions for final committed ballot state: verifying `finalBallot1.starsAllocated === 0`, zero remaining rows in `challengeBallotStars` for the voter's ballot, and 2 committed `star_returned` notifications. Maintained transparent reporting of the exact 22 backend test suites and host OS WebKit limitation. Kept PR in DRAFT.
**Business Rule:** Test suite descriptions must reflect their exact execution boundary and mocking level; PostgreSQL concurrency tests must assert committed balances and notification delivery; PR remains in DRAFT until all rounds pass.
**Reason:** Resolves Round 6 QA Finding H3 (P2 / R11).

## 2026-09-11

### Asynchronous Draft Lock Yielding & Contention Backoff (QA-02)
**Decision:** Updated `withDraftLockAsync` in `src/lib/utils/draftStorage.ts` to expand the acquisition window to 250ms with 25 attempts, introducing an explicit asynchronous delay (`await new Promise((resolve) => setTimeout(resolve, 10))`) between attempts instead of a synchronous tight loop. Added retry backoff (50ms) to `invalidateActiveDraftOnLogout` and a 100ms backoff retry on contention for debounced autosave in `ChallengeSubmissionModal.tsx`.
**Business Rule:** Storage lock acquisition must yield execution across attempts to allow concurrent processes or tabs to release the lock, and contention recovery must include bounded asynchronous retries before failing.
**Reason:** Resolves QA-02 where a synchronous tight while-loop exhausted all retry attempts in <0.2ms without giving concurrent tabs or processes CPU time to release locks.

### Immediate Synchronous Draft Flush on Teardown & Visibility Changes (QA-03)
**Decision:** Upgraded `flushPendingDraft` in `ChallengeSubmissionModal.tsx` to execute synchronous `saveSubmissionDraft` immediately, guaranteeing persistent `localStorage` writes in the current call tick prior to unmount or navigation. Added `pagehide` and `visibilitychange` window event listeners to trigger immediate draft flushing whenever the user switches tabs, closes the browser, or navigates away. Added Playwright E2E Test 13 in `e2e/frontend-overhaul-v03.spec.ts` verifying draft survival across modal closure and immediate page reload.
**Business Rule:** In-flight draft state must be flushed synchronously to persistent storage prior to any modal teardown, page visibility loss, or window unload event.
**Reason:** Resolves QA-03 where unawaited microtasks or asynchronous writes risked being dropped during browser teardown or immediate navigation.

### Web Locks Fallback & Storage Quota Fault-Tolerance (QA-04)
**Decision:** Hardened and verified `draftStorage.ts` behavior when Web Locks API is absent, throwing DOMExceptions, or delayed across concurrent tabs, and ensured storage `QuotaExceededError` / `SecurityError` conditions fail closed safely (returning `false`) without crashing the application. Added Tests 16–19 to `src/lib/__tests__/testDraftStorageGenerations.ts`.
**Business Rule:** Storage systems must provide graceful fallback to localStorage mutexes when Web Locks API is unavailable or throws, and must fail closed without throwing unhandled exceptions when storage quotas are exceeded.
**Reason:** Resolves QA-04 by validating edge cases in cross-tab mutex coordination and browser storage limits.

### PostgreSQL Refund Idempotency & Transaction Rollback Integrity (QA-05)
**Decision:** Enhanced `testPhase2SecurityAndContracts.ts` with Subscenarios 7F and 7G: verifying repeat disqualification idempotency (asserting rejection with `"Submisi telah didiskualifikasi sebelumnya."`, zero additional notifications, and zero star leakage) and verifying crash-after-debit rollback (asserting that any mid-transaction crash cleanly rolls back ballot star debits, restores allocation rows, and leaves zero orphan notifications).
**Business Rule:** Candidate disqualification must be strictly idempotent with zero duplicate refund notifications on repeat invocations, and any database failure mid-operation must cleanly rollback all ballot debits and notifications atomically.
**Reason:** Resolves QA-05 by providing authentic PostgreSQL verification of transaction rollback safety and repeat execution idempotency.

### Pull Request Draft Status Lifted to Ready for Review
**Decision:** Lifted the Pull Request DRAFT status and officially marked the Frontend UI/UX Overhaul (Blueprint v0.3) branch as **READY FOR PR / READY FOR REVIEW**.
**Business Rule:** PR draft status may only be lifted after 100% resolution and closure of all QA findings (R01–R12, Amendments 1–6, Findings 1–7, F1–F6, G1–G4, H1–H3, QA-01–QA-05) and zero-defect execution of all 5 verification release gates (`tsc`, `lint`, `test:all`, `playwright`, `build`).
**Reason:** All functional, regression, security, concurrency, and cross-device requirements have been authoritatively validated by QA with clean automated evidence.









