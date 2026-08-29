# Current Status

## Active Remediation Roadmap (Independent QA Audit 28-Aug-2026)
- **Phase 1: Release Gate A (Database Migrations & Lifecycle State Engine):** **RANK #1 TIEBREAK INTEGRITY & MIGRATION RECONCILIATION COMPLETE**
  - Migration 0007 (`drizzle/0007_perfect_sunspot.sql`):
    - Reconstructs active legacy tiebreak candidates strictly from submissions tied for **Community rank #1** (maximum Star score).
    - Fails closed if candidate count $\le 1$ (e.g. unique #1 with tie below #1, or inconsistent status).
    - Validates that historical tiebreak ballot submissions are a strict subset of the first-place tied set ($A, B, C$); fails closed if referencing non-first-place submission ($D$).
    - Validates active tiebreak timing window (`starts_at < deadline` and `deadline > now()`); fails closed on missing/expired deadlines.
    - Zero unsafe fallbacks (no arbitrary freezing of all submissions).
    - Authoritative award-mode scoping (zero voting rounds for finished `jury_only` and `showcase_only` with results).
    - Deterministic `award_type` backfill and purge of malformed orphan results.
  - Comprehensive Migration Test Suite (`scripts/verifyMigrations.ts`):
    - Tested Scenarios 1 to 4 (Fresh DB, 7-Invariant Upgrade, Fail-closed non-first-place tiebreak ballot, Fail-closed tie below #1 in tiebreak_open).
    - Validated 3-way tiebreak candidate set reconstruction with partial voting (A, B, C frozen; D excluded).
    - Validated pre-migration malformed row purge by migration 0007 itself.
    - Validated production `transitionChallengeStatusService` for post-migration round creation and candidate freeze.
  - Protected Lifecycle & Scheduler:
    - Fail-closed `/api/cron/materialize-challenges` (503 when unset, 401 when invalid, 200 when valid).
    - Concurrency-idempotent and transactional scheduler state mutations and audit logging.
  - Architectural mandates recorded for Phase 2 and Phase 3:
    - Phase 2: Community tiebreak for rank #1 only, lower-rank ties preserved without rounds, replace ballot unique constraint with `(voting_round_id, user_id)`.
    - Phase 3: Winner of community vote excluded from jury categories, judge categories independent, no synthetic community ranks for jury winners.
- **Phase 2: Release Gate B (Voting & Tie Resolution — Blueprint 2.2.1):** **COMPLETED, FULLY COMPATIBLE & 100% VERIFIED**
  - Single Voting Result Authority:
    - `computeChallengeResultsService`: Deactivated legacy tiebreak creation and podium cutoff branches. Strictly rejects live voting states (`submission_locked`, `voting_open`, `tie_pending`, `tiebreak_open`). Preserves authoritative `community_vote_winner` rows.
    - `finalizeVotingRoundService` + `TIE_PENDING` + `resolveTieManuallyService` / `startTiebreakService`: Sole authorities for Community voting results and tiebreak generation.
  - Scheduler-Authoritative Submission Locking:
    - Removed manual "Kunci Submisi" action from admin UI; rejected direct generic transitions to `submission_locked`.
    - Submission locking, candidate freezing, and single-submission auto winner logic are exclusively scheduler-driven when `submissionDeadline` is reached.
  - Aligned Mutation Operating Windows (`src/lib/services/votingService.ts`):
    - `resetBallotService` and `castOrUpdateBallotService` enforce identical operating windows: round status `open`, matching challenge status, `now >= startsAt`, and strict rejection at or after deadline (`now >= deadline`).
  - Migration 0008 (`drizzle/0008_round_ballot_uniqueness_and_tie_pending.sql`):
    - Added `tie_pending` to `challenge_status` enum, `resolution_method` (text) and `source_voting_round_id` (uuid FK) to `challenge_results`.
    - Backfilled legacy `community_rank` rows with `final_rank = 1` to canonical `community_vote_winner`.
    - Dropped legacy `uniq_challenge_user_ballot`, set `voting_round_id` NOT NULL on `challenge_ballots`, added `uniq_ballot_round_user (voting_round_id, user_id)`.
    - Added partial unique indexes: `uniq_challenge_community_winner` (max 1 Community Winner per challenge), `uniq_challenge_main_round`, `uniq_challenge_tiebreak_round`, `uniq_challenge_open_round`.
    - Fail-Closed Reconciliation: Preserved audit history by removing destructive DELETE; unreconciled orphan ballots abort migration with `RAISE EXCEPTION`.
  - Production Domain Services (`src/lib/services/votingService.ts`):
    - `computeAuthoritativeRoundTally`: Separated zero-vote handling between Main (0 winners) and Tiebreak (tied set retained for manual resolve).
    - `getAuthoritativeVotingRoundData`: Loads latest/open round, frozen candidates, user allocations, and applies deterministic voter shuffle without leaking voter identities.
    - `castOrUpdateBallotService`: Operates on `votingRoundId`, validates active user membership status (`membershipStatus === "active"` and `!deletedAt`), enforces strict Star allocation rules ($A \ge 0$, integer, finite, no duplicates, max allowance check), anti-self voting, and candidate whitelist.
    - `finalizeVotingRoundService`: Enforces exact operational state matching (`voting_open` for main, `tiebreak_open` for tiebreak), requires `now >= round.deadline`, idempotent return for closed rounds, rejection for non-open rounds, inserts `community_vote_winner` for unique max, transitions to `tie_pending` on ties or 0-vote tiebreaks, and transitions to `finished` or `jury_selection_open`.
    - `startTiebreakService`: Enforces single tiebreak round limit, starts tiebreak (seq 2, 1 Star/member, +24h editable deadline, frozen tied candidates snapshot).
    - `resolveTieManuallyService`: Moderator manual tiebreak resolve with $\ge 5$ char reason and audit log, picking strictly from authoritative tied candidates.
  - Quorum Removal & Star Default Configuration:
    - Removed quorum input, state, and serialization from `ChallengeCreateForm.tsx` and `createOrUpdateChallengeAction`. Neutral DB default preserved for backward compatibility.
    - Changed configurable Star default from 3 to 1 in `ChallengeCreateForm.tsx`, `createOrUpdateChallengeAction`, Drizzle schema (`challenges` & `challengeVotingRounds`), and migration `0008` column defaults.
    - Main voting round inherits challenge's configured Star allowance (default 1, or explicit custom values like 3). Single tiebreak round strictly enforces `starsPerMember = 1`.
  - UI & Components:
    - Cleaned `ChallengeTransitionButtons.tsx`: Removed manual "Hitung Hasil" and "Buka Voting" during voting states; removed "Kunci Submisi"; cleaned obsolete podium tiebreak text.
    - Cleaned `ChallengeCreateForm.tsx`: Removed quorum requirement UI input and state, set default stars allocation to 1.
    - Server actions and `VotingWorkspace.tsx` operate strictly on `{ votingRoundId, votes }` and `{ votingRoundId }`.
    - `TiePendingAdminPanel.tsx` with modal workflows for starting tiebreak and manual winner resolution.
    - `voting/page.tsx` and `results/page.tsx` updated for single Community Winner card under Blueprint 2.2.1.
  - Test Suite (`src/lib/__tests__/testPhase2VotingAndTiebreak.ts` & `scripts/verifyMigrations.ts`):
    - Verified all 20 test scenarios under isolated PostgreSQL database: single Community Winner, zero-vote transitions, main tie $\rightarrow$ `tie_pending` $\rightarrow$ tiebreak $\rightarrow$ tiebreak winner, tiebreak 0-votes $\rightarrow$ manual resolve with audit, membership status auth, malformed negative Star bypass prevention, reset ballot, voter anonymity, per-round ballot uniqueness, finalize checks, scheduler system actor null check, mode-specific branching, concurrency tests, protected lifecycle bypass rejections, negative compute on live voting rejection, negative manual submission lock rejection, mutation operating window boundary validations, quorum removal verification, and Star defaults/inheritance/tiebreak 1-star enforcement.
    - Migration Scenario 5 verified fail-closed unreconciled ballot exception.
    - All test suites passing in `npm run test:all`, `npm run test:migrate`, `npm run lint` (0 errors), and `npm run build` (clean compilation).
- **Phase 3: Release Gate C (Simplified Jury & Result Model):** READY FOR IMPLEMENTATION
- **Phase 4: Release Gate D (Authentication, Invitations & Roles):** PENDING REVIEW
- **Phase 5: Release Gate E (Radix Modal A11y & Playwright E2E Testing):** PENDING REVIEW
- **Phase 6: Release Gate F (Media Processing, Watermarking & Rate Limiting):** PENDING REVIEW
- **Phase 7: Release Gate G (Community, Showcase & Story Cards):** PENDING REVIEW
- **Phase 8: Release Gate H (Disaster Recovery & Runtime Concurrency):** PENDING REVIEW

## Addressed QA IDs in Phase 1 & Phase 2 (Gate A & B PASS)
- **QA-P0-001** (Database migration reproducibility & authoritative production backfill): RESOLVED & VERIFIED
- **QA-P0-002** (Per-round ballot uniqueness & multi-round tiebreak support): RESOLVED & VERIFIED
- **QA-P0-006** (Persisted lifecycle state authority & scheduler materializer): RESOLVED & VERIFIED
- **QA-P0-007** (Mode-aware state machine paths & button actions): RESOLVED & VERIFIED
- **QA-P0-008** (Two-stage finalization via REVIEW without auto-publish bypass): RESOLVED & VERIFIED
- **QA-P1-007** (Pause/resume deadline validation with round deadlines): RESOLVED & VERIFIED
- **QA-P1-008** (RESULTS_REVOKED status, notice banner, snapshot audit & flow): RESOLVED & VERIFIED

## Current Branch
`main`

## Current Focus
- Gate B / Phase 2 (Voting & Tie Resolution) completed and verified. Ready for independent QA review.

## Blockers
- Overall status remains NO-GO until Gates B–H pass independent QA.

