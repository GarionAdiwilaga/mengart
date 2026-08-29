# Agent Prompt — Gate B / Phase 2 Against Blueprint 2.2.1

Phase 1 / Gate A has passed independent QA.

**Approved baseline commit:**
`15459ecfdb2e4bf2f22b16464b383ddf55e08c1c`

The product specification has now been re-baselined.

Use these attached documents as authoritative references:

1. `Art_Community_App_Implementation_Blueprint_2.2.1.md`
2. `Mengart_Blueprint_2.2.1_Remediation_Plan.md`

Blueprint 2.2.1 supersedes Blueprint 2.2.0 and 2.1 for target product behavior.
The previous QA findings remain engineering/risk references, but any old acceptance criterion that conflicts with Blueprint 2.2.1 must be reframed around the new product rules.

Do **not** edit or rewrite approved migration `0007_perfect_sunspot.sql`.
Use forward-only migration(s).

Proceed with **Gate B / Phase 2 only: Voting & Tie Resolution**.
Do not begin Gate C.
Overall project status remains **NO-GO**.

---

## A. Authoritative Community Voting Result Model

Community voting has exactly one official product result:

```text
Community Vote Winner = zero or one submission
```

There is no official/public #2, #3, podium, runner-up, or generalized lower Community ranking.

Raw per-candidate Star totals must still be preserved for:

- live voting display;
- audit/history;
- tie detection;
- moderator/admin integrity review.

Do not rewrite historical Star totals after manual/tiebreak resolution.

Main result logic:

```text
if total valid Stars == 0:
    no Community Winner
else:
    find highest positive Star total

    if exactly one candidate has that total:
        Community Winner resolved

    if multiple candidates share that total:
        TIE_PENDING
```

Ties at any lower Star total have no product significance.

---

## B. Phase 2 Forward Migration

Create `0008_*.sql` or the next available forward migration.

Required migration work:

1. Add `tie_pending` to the authoritative challenge lifecycle enum/schema.
2. Replace/reconcile old ballot uniqueness `(challenge_id, user_id, round_type)` with authoritative `(voting_round_id, user_id)`.
3. Before new constraint, verify/backfill existing ballots and fail safely if unreconciled null/orphan `voting_round_id` records remain.
4. Remove the old uniqueness constraint; do not keep both active.
5. Enforce maximum one main round per challenge where cleanly expressible.
6. Enforce maximum one tiebreak round per challenge where cleanly expressible.
7. Enforce maximum one OPEN voting round per challenge where cleanly expressible.
8. Quorum is deprecated/removed from active behavior. Legacy columns may remain only for compatibility if dropping them adds unnecessary migration risk.

Do not modify migration 0007.

---

## C. Voting Services

Use/extract production domain services so actions, scheduler, and tests call the same logic.

At minimum provide/refactor responsibilities equivalent to:

- `getAuthoritativeVotingRoundData(...)`
- `castOrUpdateBallotService(...)`
- `resetBallotService(...)`
- `finalizeVotingRoundService(...)`
- `startTiebreakService(...)`
- `resolveTieManuallyService(...)`

Do not reproduce production logic manually inside tests.

---

## D. Authoritative Voting Reads

Voting UI/data must derive from persisted active round state.

Return:

- `votingRoundId`;
- round type;
- round status;
- startsAt/deadline;
- Stars/member;
- frozen candidate set;
- artwork/title;
- artist display name/avatar where available;
- candidate live Star total;
- current user's allocations;
- remaining Stars.

Voting is **not artist-blind**.
Artist identity is visible.
Voter identity is secret from ordinary members and ordinary jury participants.
Moderator/Admin audit access may see voter identities only on authorized audit surfaces.

All candidate eligibility must come from `challenge_voting_round_candidates`.

---

## E. Ballot Rules

Any `ACTIVE` member may vote regardless of role, including Member, Moderator, Admin, or assigned Jury.

Self-voting is prohibited.

`stars_per_member`:

- configurable per challenge;
- default = 1;
- user may spend zero, some, or all Stars;
- if allowance >1, Stars may stack on one candidate.

Tiebreak Stars/member = exactly 1 for Gate B.

Ballots are editable/resettable only while the authoritative round is OPEN and within its persisted time window.

Server must derive challenge/round rules from the locked voting-round row and must reject:

- non-active users;
- self-vote;
- candidates outside current frozen set;
- candidates from another round;
- over-allocation;
- closed/expired/not-started rounds;
- mismatched challenge state.

One ballot per `(votingRoundId, userId)`.
The same user may have one main ballot and one tiebreak ballot because those are different round IDs.

---

## F. Main Round Opening

For `vote_only` and `vote_and_jury` with at least 2 valid submissions:

at configured voting start:

- create/open exactly one main round idempotently;
- freeze exact eligible candidates;
- set deadline from configured voting deadline;
- transition challenge to `VOTING_OPEN`.

Concurrent scheduler executions must not create duplicate rounds/snapshots.

The scheduler may automatically open/close voting rounds, but must **never automatically start a tiebreak**.

---

## G. Main Round Completion

Automatically finalize at the persisted main-round deadline using the same production finalization service.

Close the main round exactly once.

### Zero valid Stars

`vote_only`:

- no Community Winner;
- automatically `FINISHED`.

`vote_and_jury`:

- no Community Winner;
- automatically `JURY_SELECTION_OPEN`;
- all otherwise eligible submissions remain available for later jury selection.

Zero Stars must **not** create `TIE_PENDING`.

### Unique highest positive total

Persist official Community Winner.

`vote_only` → automatically `FINISHED`.

`vote_and_jury` → automatically `JURY_SELECTION_OPEN` and record Community Winner for later Gate C exclusion.

### Highest positive total shared by 2+ candidates

- close main round;
- transition challenge to `TIE_PENDING`;
- authoritative tied set = only candidates sharing the highest positive main-round total;
- do **not** create a tiebreak automatically.

Structured outcome may be similar to:

```text
{ outcome: "tie_pending", sourceVotingRoundId, tiedSubmissionIds }
```

Lower ties do nothing.

---

## H. TIE_PENDING

Ordinary members see:

```text
Voting Ended — First-Place Tie Awaiting Resolution
```

No ballot is open in `TIE_PENDING`.

After a MAIN-round tie, Admin/Moderator gets exactly:

1. `Manual Resolve`
2. `Start Tiebreak`

The server must derive the tied set; never trust a client-submitted candidate list.

After the single tiebreak has already been used and remains unresolved, `Start Tiebreak` must be unavailable in UI and rejected by backend.

---

## I. Manual Resolve

Admin or Moderator may manually select the Community Winner from the current authoritative tie set.

Requirements:

- challenge is `TIE_PENDING`;
- source round is closed;
- winner belongs to current maximum-tied set;
- reason is mandatory;
- actor/reason/source round/winner/timestamp are audited.

Manual resolution selects the official Community Winner but **does not rewrite the source Star totals** and does not manufacture #2/#3 ordering.

Resolution method should be stored or derivable, e.g.:

- `manual_main_tie`
- `manual_tiebreak_tie`

Then:

`vote_only` → `FINISHED`

`vote_and_jury` → `JURY_SELECTION_OPEN`

---

## J. Start the Single Optional Tiebreak

From `TIE_PENDING` originating from MAIN voting, Admin/Moderator may choose Start Tiebreak.

Before confirmation show:

- authoritative tied candidates;
- suggested deadline = `now + 24h`;
- editable deadline.

If not overridden, persist +24h.
If overridden, require a valid future timestamp and persist exactly that deadline.

Starting tiebreak must transactionally:

- verify challenge is still `TIE_PENDING`;
- verify source is the main round;
- verify no tiebreak exists already;
- create exactly one tiebreak round;
- freeze exactly the main highest-total tied candidates;
- set Stars/member = 1;
- `startsAt = now`;
- persist deadline;
- transition challenge to `TIEBREAK_OPEN`;
- commit and return success.

Concurrent Start Tiebreak requests must create at most one round.

There is no Tiebreak #2.

---

## K. Tiebreak Completion

Finalize automatically at the tiebreak round's own persisted deadline.

Do not use the original main voting deadline.

If one candidate has unique highest positive tiebreak Star total:

- official Community Winner = that candidate;
- resolution method = tiebreak vote;
- `vote_only` → `FINISHED`;
- `vote_and_jury` → `JURY_SELECTION_OPEN`.

If:

- no valid tiebreak Stars were cast, OR
- multiple candidates still share the highest positive tiebreak total,

then:

- close tiebreak;
- transition to `TIE_PENDING`;
- derive/preserve current tied candidate set;
- only Manual Resolve is allowed.

If zero tiebreak Stars were cast, the unresolved set is the entire frozen tiebreak candidate set.

---

## L. Zero / Single Submission Branches

At submission lock:

### zero valid submissions

→ `CANCELLED`

No reopening flow.

### `vote_only` + exactly one valid submission

- automatic Community Winner;
- resolution = `automatic_single_submission`;
- skip voting;
- → `FINISHED`.

### `vote_and_jury` + exactly one valid submission

- automatic Community Winner;
- no remaining eligible jury candidate;
- skip voting/jury;
- → `FINISHED`.

Detailed `jury_only` and `showcase_only` implementation remains Gate C/E scope unless a minimal lifecycle compatibility change is required.

---

## M. Frontend

Refactor `VotingWorkspace` and voting page to be round-aware.

Support:

- main vote;
- one tiebreak.

Show:

- artwork/title;
- artist identity;
- live Star totals;
- own allocations;
- remaining Stars;
- round deadline;
- clear Main Vote / First-Place Tiebreak context.

Remove active quorum UI.

Add `TIE_PENDING` surfaces:

### Member

waiting state only.

### Admin/Moderator after main tie

- tied candidates;
- Manual Resolve;
- Start Tiebreak;
- tiebreak dialog prefilled with +24h deadline, editable;
- manual dialog with winner selection + required reason.

### Admin/Moderator after tiebreak remains unresolved

- Manual Resolve only.

Backend must enforce everything even if UI is bypassed.

---

## N. Result Data Semantics for Gate B

Do not build a podium/ranking product model.

Preserve/derive:

- raw finalized candidate Star totals per round;
- official Community Winner (nullable, maximum one);
- resolution method/source;
- manual resolution audit metadata.

Public/result UX should highlight only the Community Winner.

Lower candidates may still be sorted by Stars for operational display if useful, but that order is not an official result and must not be persisted/rendered as #2/#3 awards.

Do not implement Gate C jury award data model yet beyond minimal compatible lifecycle handoff.

---

## O. Required Tests

Tests must call production services.

### Migration

- fresh DB through new migration;
- upgrade approved 0007 → new migration;
- old ballot unique constraint removed;
- `(voting_round_id, user_id)` enforced;
- orphan/null round IDs fail safely;
- one main maximum;
- one tiebreak maximum;
- one OPEN voting round maximum.

### Ballot integrity

- ACTIVE Member/Moderator/Admin/Jury can vote;
- SUSPENDED/DELETED/Pending Invite rejected;
- self-vote rejected;
- non-frozen/other-round candidate rejected;
- over-allocation rejected;
- Star stacking works when allowance >1;
- same voter may have main + tiebreak ballot;
- only one ballot per voter per same round;
- edit/reset only while open;
- expired/closed round rejects mutation;
- ordinary payload does not expose voter identities.

### Main completion

- zero Stars + vote_only → FINISHED/no winner;
- zero Stars + mixed → JURY_SELECTION_OPEN/no winner;
- unique highest positive + vote_only → auto FINISHED;
- unique highest positive + mixed → JURY_SELECTION_OPEN;
- lower tie ignored;
- two-way highest tie → TIE_PENDING;
- three-way highest tie → TIE_PENDING;
- tie does not auto-create tiebreak.

### Manual resolution

- Admin allowed;
- Moderator allowed;
- ordinary Member rejected;
- reason required;
- candidate outside current tie rejected;
- official winner persisted;
- original Star totals unchanged;
- correct next state by mode;
- audit record written.

### Tiebreak

- +24h default;
- valid future override;
- invalid/expired override rejected;
- exact main tied set frozen;
- Stars/member = 1;
- concurrent start creates one tiebreak;
- second tiebreak rejected;
- unique tiebreak max resolves;
- tied tiebreak → TIE_PENDING/manual only;
- zero-vote tiebreak → TIE_PENDING/manual only;
- manual post-tiebreak winner limited to current unresolved set.

### Scheduler/idempotency

- automatic main open;
- duplicate open job safe;
- automatic main close/finalization;
- duplicate close job safe;
- automatic tiebreak close/finalization;
- scheduler never starts tiebreak.

### Single/zero submission

- zero submissions → CANCELLED;
- vote_only one → automatic winner + FINISHED;
- mixed one → automatic winner + FINISHED, jury skipped.

---

## P. Documentation / Regression

Add Blueprint 2.2.1 and re-baselined remediation plan to repository.

Update:

- `CURRENT_STATUS.md`
- `HANDOFF.md`
- `DECISIONS.md`

Document:

- Gate A remains historical PASS;
- Blueprint 2.2.1 is current product authority;
- old QA remains risk/evidence reference;
- old acceptance criteria superseded by 2.2.1 are explicitly marked;
- overall status remains NO-GO.

Run:

- migration verification;
- Gate A regression suite;
- new Gate B suite (`npm run test:phase2` or equivalent);
- `npm run test:all`;
- `npm run lint`;
- `npm run build`.

If a Gate A test asserts a Blueprint 2.1 feature that Blueprint 2.2.1 explicitly removed, update the assertion and document the supersession. Do not weaken unrelated migration/security/integrity tests.

---

## Q. STOP / Independent QA Handoff

Implement **Gate B only**.

Do not begin dynamic jury awards, Google-only auth migration, simplified submission replacement, media simplification, comments/homepage/Featured Artist/Story Card work, accessibility overhaul, or disaster recovery.

At completion STOP for independent QA.

Completion report must include:

- Base Commit: `15459ecfdb2e4bf2f22b16464b383ddf55e08c1c`
- Completed Commit
- Specification: Blueprint 2.2.1
- migration details
- services changed
- lifecycle changes
- frontend changes
- test evidence
- legacy structures retained/deprecated
- known deferred work
- explicit overall status: `NO-GO`

Generate exactly one patch:

```bash
git format-patch \
  --stdout \
  --binary \
  --full-index \
  15459ecfdb2e4bf2f22b16464b383ddf55e08c1c..PHASE2_SHA \
  > phase2.patch
```

Return/upload only `phase2.patch` plus the textual completion report.

Do not begin Gate C until independent QA approves Gate B.
