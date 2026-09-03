# Agent Prompt — Gate E PLAN MODE ONLY

## Mengart Blueprint 2.2.2 — Submission & Portfolio Simplification + Additive Artwork Spoiler

You are preparing the implementation plan for the next independently gated remediation phase of Mengart Atelier.

**MODE: PLAN ONLY. DO NOT IMPLEMENT.**

Do not edit source code, migrations, tests, package files, or repository status files in this step. Inspect the repository and return an implementation plan for independent QA review.

---

## 1. Authoritative baseline and gate status

Start from the independently approved Gate D baseline:

```text
46ccdca661de9240ff364ee63d9f5ccb5ca242bc
```

Current status:

```text
Gate A — PASS ✅
Gate B — PASS ✅
Gate C — PASS ✅
Gate D — PASS ✅
Gate E — PLAN MODE
Gate F–H — pending
Overall Production Status — NO-GO
```

Blueprint authority remains:

```text
Art_Community_App_Implementation_Blueprint_2.2.2.md
```

Do NOT create Blueprint 2.2.3.

An additive product decision has been approved for an Artwork Spoiler Presentation feature. It does not change Blueprint audience/privacy/media-ACL semantics. Treat `GateE_Additive_Decision_Spoiler.md` as supplemental Gate E planning authority.

Do not reopen or redesign Gates A–D.

---

## 2. Gate E authoritative product scope

Plan implementation for all of the following:

1. One canonical submission per member per challenge, with at most one active submission.
2. Direct upload to a challenge; an artwork does not need to exist in the member portfolio before submission.
3. Before the submission deadline, replacing media replaces the current submission asset.
4. No new product-level immutable submission media-version history.
5. New media must validate/process successfully before the current submission is switched away from the old media.
6. Only after a successful swap may obsolete media be queued for cleanup/removal.
7. Preserve lightweight audit metadata for submission/media replacement.
8. Zero valid submissions at deadline → auto-cancel.
9. Finished valid submissions → automatically add to the artist portfolio.
10. Cancelled/disqualified submissions → no automatic portfolio addition.
11. Artist may later hide a portfolio entry without deleting or rewriting challenge history/results.
12. Add artwork-level spoiler metadata without changing privacy, audience, challenge, voting, jury, or media authorization rules.

Hard stop after Gate E implementation in the future. Gate F and Gate G are not part of this plan except where an interface contract must be documented.

---

## 3. Additive Artwork Spoiler decision

Plan a simple canonical field, conceptually:

```text
artworks.is_spoiler BOOLEAN NOT NULL DEFAULT FALSE
```

The exact Drizzle naming may follow repository conventions, but there must be one artwork-level source of truth.

Authoritative semantics:

```text
Spoiler != audience
Spoiler != publication state
Spoiler != authorization
Spoiler != media ACL
Spoiler != ownership
Spoiler != challenge eligibility
```

Gate E must plan:

- forward migration for the spoiler field;
- ordinary artwork upload/create support;
- artwork edit/toggle support for the owner while ACTIVE;
- direct challenge-upload propagation;
- query/API serialization wherever artwork cards/detail/challenge candidate data need the flag;
- tests proving spoiler changes do not alter audience/publication/ACL or challenge eligibility;
- repository `DECISIONS.md` / `HANDOFF.md` traceability.

Gate G, not Gate E, owns final visual/presentation completion:

- spoiler cover/blur;
- Reveal control;
- title concealment policy;
- lightbox reveal state;
- keyboard/touch/accessibility behavior;
- safe screen-reader text;
- E2E UX;
- SEO/metadata review.

Do not build a new security endpoint such as `/reveal-spoiler` for authorization. Spoiler is presentation metadata.

Do not introduce viewer spoiler-preference tables or spoiler levels in Gate E.

---

## 4. Existing repository conflicts that the plan MUST inspect and resolve

Do not blindly follow these observations; verify them against the actual baseline tree and cite exact files/functions in the implementation plan.

### A. Submission uniqueness

Current `challenge_submissions` does not appear to have a database uniqueness constraint on `(challenge_id, user_id)`.

The plan must define the final database invariant and migration behavior for any legacy duplicates.

Prefer a simple canonical row per member/challenge unless repository evidence requires a more careful compatibility strategy.

Do not silently delete ambiguous historical submissions during migration.

### B. Immutable submission-version history conflicts with Blueprint 2.2.2

Current live code uses `challenge_submission_versions` and appends a new immutable row on each revision.

Blueprint 2.2.2 no longer requires product-level immutable submission media-version history.

The plan must explain:

- where current submission title/description/software/media pointers will live;
- how existing historical `challenge_submission_versions` rows are preserved for compatibility/audit if needed;
- how new live writes stop depending on that historical version table;
- whether old compatibility structures remain until final post-Gate-H cleanup.

Do not perform broad destructive legacy-data cleanup in Gate E.

### C. Current revision flow creates new artwork records

Verify `submitArtworkToChallengeAction` behavior.

Current revisions appear to create a new canonical `artworks` row for each newly uploaded revision rather than replacing the current submission asset safely.

The Gate E plan must define one stable canonical submission/artwork identity and a safe media-swap sequence.

Required invariant:

```text
old current media remains authoritative
        ↓
new upload staged + validated/processed successfully
        ↓
transaction re-locks/revalidates challenge + submission + deadline
        ↓
swap current media pointer
        ↓
audit replacement
        ↓
commit
        ↓
queue obsolete physical media cleanup
```

A failed new upload/processing operation must leave the old submission intact.

Do not solve this by keeping user-facing immutable versions forever.

### D. Challenge artwork leakage into normal gallery/portfolio

Current direct challenge upload appears to create a backing artwork as `published/public` before the challenge has finished.

Current public gallery and artist profile queries also appear to query published artworks directly instead of treating `portfolio_entries.is_visible` as the portfolio inclusion boundary.

The plan must explicitly prevent a challenge submission from appearing in the normal public gallery/artist portfolio merely because its backing artwork exists.

Challenge-specific surfaces may still display authorized submissions according to challenge lifecycle.

The plan must define the relationship among:

```text
artwork existence/publication
audience
challenge submission visibility
portfolio entry existence
portfolio_entries.is_visible
normal gallery inclusion
artist profile portfolio inclusion
```

Do not overload `audience` or spoiler state to solve portfolio inclusion.

### E. Auto-add to portfolio must cover every authoritative FINISHED path

Gate B/C already contain multiple authoritative challenge-finalization paths, including scheduler/voting/jury/tie-resolution/result publication paths.

The plan must inventory every production path that can make a challenge `finished` and define one idempotent portfolio-finalization service/side effect so Gate E does not fork Gate B/C result logic.

Desired conceptual behavior:

```text
challenge becomes FINISHED
        ↓
find valid submitted, non-disqualified final submissions
        ↓
ensure portfolio entry exists exactly once
        ↓
generate default caption/achievement text on first auto-add
```

Suggested default text from Blueprint:

```text
winner (Community or Jury): Challenge Winner — <Challenge Name>
other valid finisher:        Challenge Participant — <Challenge Name>
```

If a portfolio entry already exists, the operation must be idempotent and must not overwrite artist-customized presentation unnecessarily.

`RESULTS_REVOKED` / republish must not create duplicate portfolio entries.

Do not change Gate B Community Winner or Gate C jury-award semantics.

### F. Portfolio hiding

Existing schema already has `portfolio_entries.is_visible`.

The plan must define the production owner action/UI/query changes needed so an ACTIVE artist can hide/show their portfolio presentation while challenge history remains untouched.

A portfolio hide action must not:

- delete the artwork;
- delete the challenge submission;
- alter frozen voting candidates;
- alter results;
- remove jury/community winner history.

### G. Gate F media boundary

Current upload code may still contain media-format/validation behavior that Blueprint assigns to Gate F.

Do NOT turn Gate E into the full media-hardening phase.

Gate E may refactor the submission replacement orchestration needed for safe swaps, but codec/container validation, watermark reliability, range streaming, global rate-limit completion, and broader media-policy hardening remain Gate F.

Document the interface Gate F will inherit.

---

## 5. Migration planning requirements

Gate D migration `0011` is approved and immutable.

Any Gate E schema change must be forward-only, beginning with a new migration such as:

```text
0012_<gate_e_descriptive_name>.sql
```

Do not edit migrations `0000–0011`.

The plan must include an upgrade scenario from the approved Gate D database state and must address at minimum:

- duplicate submission reconciliation/preflight;
- canonical current submission metadata/media pointer backfill;
- historical `challenge_submission_versions` compatibility;
- portfolio-entry uniqueness/idempotency;
- spoiler default false on existing artworks;
- no deletion of challenge/result/audit history;
- fresh migration reproducibility.

If legacy data is ambiguous, prefer fail-closed migration/preflight and explicit reconciliation over silent destructive guesses.

Broad unused historical-data purge is deferred until after Gate H/final cleanup audit.

---

## 6. Authorization and concurrency requirements

All touched write paths must preserve Gate D invariants:

- ACTIVE membership required for ordinary artist writes;
- owner or appropriate ACTIVE staff authorization;
- suspended/deleted/pending users cannot upload, replace, or edit spoiler/portfolio visibility;
- Admin/Moderator authority must use live server-side guards where applicable.

Submission replacement must be race-safe.

Plan explicit locking/revalidation for at least:

```text
same member concurrent first submissions
same member concurrent replacements
replacement racing submission deadline/scheduler lock
replacement failure after staging but before swap
portfolio auto-add invoked concurrently from duplicate finalization/retry
portfolio hide/show racing auto-add
```

Database constraints must backstop application checks.

---

## 7. Test plan requirements

The Gate E plan must propose a dedicated production-path suite. It may create a new file such as:

```text
src/lib/__tests__/testGateESubmissionAndPortfolio.ts
```

but choose naming consistent with the repository.

At minimum plan tests for:

### Submission identity

- first direct submission succeeds;
- second concurrent first submission cannot create a duplicate canonical submission;
- one member/challenge canonical row remains;
- disqualification/restore history remains attached to that canonical submission.

### Safe replacement

- replacement before deadline succeeds;
- replacement after deadline fails;
- failed processing leaves old current media intact;
- successful swap changes current media only after new media succeeds;
- obsolete media cleanup is queued only after successful swap/commit;
- no new live immutable submission-version row is required;
- lightweight replacement audit exists.

### Challenge lifecycle

- zero valid submissions → cancelled;
- finished valid submission → portfolio entry auto-created once;
- disqualified submission → no auto-add;
- cancelled challenge → no auto-add;
- winner/participant default caption semantics;
- repeated finalization/republication → no duplicate portfolio entries;
- Gate B and Gate C result semantics unchanged.

### Portfolio visibility

- owner hide/show succeeds while ACTIVE;
- suspended/deleted/pending owner denied;
- hiding portfolio entry does not change challenge submission/results;
- normal gallery/artist profile respects portfolio inclusion/visibility;
- challenge-specific surface can still resolve the underlying submission where authorized.

### Spoiler

- existing rows default false after migration;
- ordinary upload can set true/false;
- challenge direct upload can set true/false;
- owner can toggle metadata while ACTIVE;
- unauthorized/non-ACTIVE toggle denied;
- spoiler toggle does not change audience;
- spoiler toggle does not change publication status;
- spoiler toggle does not change media storage keys/versions;
- spoiler does not change voting candidate eligibility, Star behavior, jury eligibility, or results.

### Migration

- fresh install through new migration;
- Gate D (`0011`) → Gate E upgrade;
- seeded legacy submission/version data reconciles safely;
- ambiguous duplicate state fails closed or follows the explicitly approved reconciliation algorithm;
- historical result/redemption/audit data remains intact.

Regression commands in the eventual implementation phase must include at minimum:

```bash
npm run test:migrate
npx tsx src/lib/__tests__/testPhase2VotingAndTiebreak.ts
npx tsx src/lib/__tests__/testPhase3SimplifiedJury.ts
npx tsx src/lib/__tests__/testPhase4AuthAndInvites.ts
<new Gate E test command>
npm run test:all
npm run lint
npm run build
```

---

## 8. Plan deliverable format

Return one implementation-plan artifact:

```text
implementation_plan_gate_e.md
```

The plan must contain:

1. Baseline and scope statement.
2. Verified current-state findings with exact files/functions/tables.
3. Proposed target data model.
4. Migration `0012` strategy and legacy reconciliation.
5. Canonical submission creation/replacement service design.
6. Portfolio auto-add/finalization design and every FINISHED call site to integrate.
7. Portfolio visibility/query semantics.
8. Artwork spoiler data/domain integration and Gate G handoff contract.
9. Authorization and concurrency design.
10. Exact files expected to change.
11. Test matrix with production-path coverage.
12. Regression commands.
13. Documentation updates (`DECISIONS.md`, `CURRENT_STATUS.md`, `HANDOFF.md`, remediation/plan references).
14. Risks and rollback/compatibility notes.
15. Explicit non-goals / Gate F and Gate G boundaries.

Do not merely repeat this prompt. Inspect the actual repository and make the plan implementation-specific.

If you discover a contradiction with Blueprint 2.2.2 or an unresolved choice that materially changes product behavior, flag it in the plan rather than silently choosing a new product rule.

---

## 9. Hard stop

**PLAN ONLY.**

Do not create migration `0012` yet.
Do not edit application code.
Do not mark Gate E PASS.
Do not begin Gate F/G work.

Return `implementation_plan_gate_e.md` for independent QA review and STOP.
