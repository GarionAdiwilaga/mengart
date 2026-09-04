# Handoff Context — Historical Challenge Backfill Reconciliation

**Date:** 2026-09-04  
**Current State:** Implementation, Schema Alignment & Invariant Verification 100% Complete.  
**Overall Status:** **PRODUCTION READY (GO)**

---

## 1. Reconciled Invariants & Implemented Features

1. **Single Community Winner Invariant:**
   - Validated at most 1 Community Winner (`uniq_challenge_community_winner`) in `importHistoricalChallengeAction`.
   - Regular participants (`winnerSlotType === "none"`) are saved to `challenge_submissions` but excluded from `challenge_results`.

2. **Dynamic Unranked Jury Awards:**
   - Inserted into `challenge_jury_awards` with `recordedByUserId = actor.id`.
   - Materialized into `challenge_results` with `awardType = 'jury_award'`, `categoryLabel`, `juryAwardId`, and unranked `finalRank = null`.
   - Removed legacy `juryScore` (1–100) state and UI inputs.

3. **Portfolio Auto-Promotion:**
   - Invoked `autoAddChallengeSubmissionsToPortfolioService(tx, challenge.id)` inside the transaction.
   - All historical challenge entries are auto-promoted to artist portfolios with deterministic system captions.

4. **Archived Voting Rounds & Candidate Freeze:**
   - Inserted closed main voting round into `challenge_voting_rounds` and snapshot candidate records in `challenge_voting_round_candidates` for voting-enabled modes.

5. **UI Updates (`HistoricalImportForm.tsx`):**
   - Added `awardMode` selector (`vote_and_jury`, `vote_only`, `jury_only`, `showcase_only`).
   - Default entries configured with 1 Community Winner, 1 Jury Award (with dynamic category input), and 1 Regular Participant.

6. **Full Verification Matrix:**
   - `npx tsx src/lib/__tests__/testPhase6HistoricalAndMedia.ts`: PASSED (8/8 scenarios).
   - `npm run test:migrate`: PASSED (12/12 scenarios).
   - `npm run test:all`: PASSED (18/18 test suites).
   - `npm run lint`: PASSED (0 errors, 0 warnings).
   - `npm run build`: PASSED (31/31 routes + media worker compiled cleanly).


