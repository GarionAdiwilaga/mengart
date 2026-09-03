# Mengart Blueprint 2.2.2 — Re-Baselined Production Remediation Plan

**Product baseline:** Art Community App Implementation Blueprint 2.2.2  
**Approved historical Gate A commit:** `15459ecfdb2e4bf2f22b16464b383ddf55e08c1c`  
**Overall production status:** **NO-GO** until Gates E–H and final independent audit pass. Gates A–D are independently closed PASS.  
**Purpose:** Re-baseline the remediation program after product simplification without discarding verified engineering work from Gate A or the Independent Final QA audit.

**Current independently approved lineage:**

```text
Gate A — PASS ✅
Gate B — PASS ✅
Gate C — PASS ✅
Gate D — PASS ✅
Gate E–H — pending
Overall Production Status — NO-GO
```

**Approved Gate D baseline:** `46ccdca661de9240ff364ee63d9f5ccb5ca242bc`  
**Gate E planning authority:** Blueprint 2.2.2 plus the approved additive Artwork Spoiler Presentation decision. The spoiler feature does not change Blueprint version or audience/media-ACL semantics.

---

## 1. How to Treat the Previous QA and Gate A Approval

The previous Independent Final QA remains an engineering reference. It identified 27 findings (17 P0 and 10 P1) and established the technical risks that motivated the remediation program.

The final Gate A review also remains valid evidence that commit `15459ecfdb2e4bf2f22b16464b383ddf55e08c1c` has a reproducible migration baseline and corrected core migration/lifecycle integrity for the requirements that existed at review time.

Blueprint 2.2.2 changes **target product behavior**, not historical facts. Therefore:

1. **Do not rewrite approved migrations retroactively.** Migration `0007_perfect_sunspot.sql` remains immutable.
2. **Keep engineering findings that still apply** (authorization, round identity, frozen candidates, concurrency, watermarking, accessibility, backup/restore, etc.).
3. **Reframe findings whose old acceptance criterion encoded Blueprint 2.1 behavior.** The QA risk remains useful, but the fix must follow Blueprint 2.2.2.
4. **Mark fully removed product concepts as superseded**, not failed.
5. **Use forward-only migrations and compatibility adapters** when old structures remain in historical data.

### Gate A status

**Gate A remains PASS as a historical technical baseline.**

What remains authoritative from Gate A:

- explicit reproducible migrations;
- fresh + upgrade migration verification;
- persisted database state as lifecycle authority;
- voting-round identity and candidate snapshots;
- scheduler/cron execution and concurrency safety;
- fail-closed migration reconciliation;
- audit logging foundation;
- result-revocation foundation;
- transactional service architecture.

What is now transitional/superseded product behavior:

- `PAUSED` as an active product state;
- resume-deadline workflow;
- mandatory generic `REVIEW` publication stage;
- generalized sequential tiebreak assumptions;
- predefined jury-slot live workflow;
- any old Community podium/rank semantics beyond determining the Community Winner.

These transitional structures may remain in schema/history until their appropriate forward cleanup gate. New live behavior must not depend on them unless required only for historical compatibility.

---

## 2. Revised Community Voting Result Model

Blueprint 2.2.2 removes official #2/#3/lower Community placements.

Community voting has exactly one official result concept:

```text
Community Vote Winner = zero or one submission
```

Raw Star totals remain available for live display and audit.

### Main round result logic

```text
Total valid Stars across round = 0
    → no Community Vote Winner

Otherwise:
    find maximum positive Star total

    one submission has maximum
        → Community Winner resolved

    multiple submissions share maximum
        → TIE_PENDING
```

Ties below the maximum do not matter to product logic.

Example:

```text
A = 30
B = 20
C = 20
D = 10
```

Official result:

```text
Community Vote Winner: A
```

B/C/D have no official product rank.

### Manual/tiebreak resolution

If A and B both have 30 Stars and staff selects B through Manual Resolve, the system stores:

```text
Community Winner: B
Resolution: manual_main_tie
Original Star totals:
A = 30
B = 30
```

It must **not** rewrite the historical vote as `#1 B / #2 A`.

Recommended resolution method values:

- `automatic_single_submission`
- `unique_main_vote`
- `manual_main_tie`
- `tiebreak_vote`
- `manual_tiebreak_tie`

---

## 3. Legacy QA Finding Reclassification

The following matrix preserves the Independent Final QA IDs but updates their meaning against Blueprint 2.2.2.

| QA ID | New status | Revised gate | Blueprint 2.2.2 interpretation |
|---|---|---|---|
| QA-P0-001 | **KEEP / Gate A PASS** | A | Reproducible migration history remains mandatory. |
| QA-P0-002 | **REFRAME** | B | Tiebreak must commit transactionally **when staff explicitly starts it**; ties no longer auto-create a round. |
| QA-P0-003 | **KEEP** | B | Voting frontend must be authoritative-round aware. |
| QA-P0-004 | **KEEP** | B | Round-aware loader remains authoritative; stale unrounded reads must not drive live voting. |
| QA-P0-005 | **KEEP** | B | Frozen candidate validation remains mandatory. |
| QA-P0-006 | **KEEP / Gate A foundation** | A/B/C | Persisted lifecycle state remains authoritative, but legal states are adapted forward to simplified lifecycle. |
| QA-P0-007 | **REFRAME** | B/C | Mode-aware transitions remain required; old `REVIEW`/pause paths are superseded. |
| QA-P0-008 | **SUPERSEDED acceptance criterion** | B/C | Mandatory `compute -> REVIEW -> publish` is removed. Replace with mode-specific automatic/manual publication rules. |
| QA-P0-009 | **KEEP, simplify fix** | C | Numeric jury scoring must leave active workflow; replace with Jury Recorder + dynamic awards, not shared slots. |
| QA-P0-010 | **KEEP, simplify fix** | C | Community Winner exclusion is enforced when recording a dynamic Jury Award in mixed mode. |
| QA-P0-011 | **KEEP, revised semantics** | C | Persist only actual winners/awards; no empty slots and no lower Community winner rows. |
| QA-P0-012 | **KEEP** | C | No synthetic jury ranks / `#null`; Community result UI highlights only Community Winner. |
| QA-P0-013 | **KEEP** | H (plus B/C service tests) | Concurrency tests must hit production services; shared-slot-specific test is replaced by current services. |
| QA-P0-014 | **SUPERSEDED duration rule** | F | >60s rejection is removed because there is no duration limit. Keep strict corruption/container/codec/size validation. |
| QA-P0-015 | **KEEP** | F | Public video watermarking remains mandatory. |
| QA-P0-016 | **KEEP** | H | Production backup secrets must fail closed; no unsafe fallback keys. |
| QA-P0-017 | **KEEP** | H | Off-server backup must be verifiably real. |
| QA-P1-001 | **KEEP, auth target changed** | D/F | Rate limiting remains required; credentials/password-reset boundaries disappear, Google/invite and write actions remain protected. |
| QA-P1-002 | **KEEP, revised media policy** | F | Strict accepted codecs/containers remain; target is JPEG/PNG/WebP and MP4 H.264/AAC(or silent). |
| QA-P1-003 | **KEEP** | F | Consolidate media execution path; avoid parallel sync/worker pipelines. |
| QA-P1-004 | **KEEP** | G | Accessible dialog/overlay primitives remain required. |
| QA-P1-005 | **KEEP** | G | App-wide labels/errors/touch targets remain required. |
| QA-P1-006 | **KEEP, roles updated** | G | Playwright + axe remains required; personas become Anonymous, Pending Invite, Member, Moderator, Admin, Jury Recorder. |
| QA-P1-007 | **SUPERSEDED** | — | Pause/resume feature is removed from target product. Legacy enum/data may remain inert. |
| QA-P1-008 | **KEEP, transition revised** | C/H | Result revocation remains required, but correction need not route through old generic REVIEW behavior. |
| QA-P1-009 | **KEEP** | H | Remote backup metadata/checksum verification remains required. |
| QA-P1-010 | **KEEP** | H | Restore must verify actual DB/media consistency against manifest. |

### Rule for using the old QA report

The old QA report remains a **risk and evidence catalog**, not a frozen product specification. When an old QA acceptance criterion conflicts with Blueprint 2.2.2, preserve the underlying safety/integrity concern and rewrite the acceptance criterion around the new product flow.

---

## 4. Revised Release Gates

### Gate A — Database/Lifecycle Foundation

**Status: PASS**  
**Approved baseline:** `15459ecfdb2e4bf2f22b16464b383ddf55e08c1c`

Do not reopen Gate A broadly.

Forward work may adapt live behavior through new migrations/services, but must preserve:

- migration reproducibility;
- upgrade safety;
- round/candidate integrity;
- scheduler idempotency;
- cron authentication;
- audit history.

Regression against these foundations is a Gate B+ blocker.

---

### Gate B — Voting & Tie Resolution

#### Product scope

- Any ACTIVE member may vote regardless of role.
- Artist identity visible; voter identity hidden from ordinary users.
- Live Star totals visible.
- `stars_per_member` configurable; default 1.
- Stars may stack when allowance >1.
- One main round + maximum one optional tiebreak.
- No quorum.
- No official lower Community ranks.
- `TIE_PENDING` persisted state.
- Main maximum tie → staff chooses Manual Resolve or Start Tiebreak.
- Tiebreak default deadline +24h, editable before open.
- Zero-vote/still-tied tiebreak → Manual Resolve only.
- Vote-only unique/no-vote outcomes auto-finish.
- Mixed voting hands off automatically to jury phase when needed.

#### Required forward migration

Create `0008_*.sql` or next available forward migration.

At minimum:

- add `tie_pending` lifecycle enum value;
- replace legacy ballot uniqueness with `(voting_round_id, user_id)`;
- reconcile/null-check round IDs before constraint;
- enforce maximum one main + one tiebreak where cleanly expressible;
- enforce maximum one open voting round per challenge where cleanly expressible;
- leave obsolete quorum columns only as deprecated compatibility fields if safe removal is not worth migration risk.

Do not edit 0007.

#### Result representation

Persist/derive:

- raw finalized Star totals per candidate/round;
- optional official Community Winner (0/1);
- winner resolution method/source;
- manual resolution actor/reason/time when applicable.

Do **not** build a final podium/ranking table as a product requirement.

#### Gate B acceptance

- unique highest positive total resolves winner;
- zero total resolves no winner, not tie pending;
- only maximum tie enters `TIE_PENDING`;
- lower ties ignored;
- tiebreak never auto-opens;
- one tiebreak maximum;
- manual resolution only selects current tied set;
- no historical Star totals rewritten by manual resolution;
- tests call production services;
- Phase A regression suite remains green except assertions explicitly superseded by v2.2.2.

**Stop for independent QA.**

---

### Gate C — Simplified Jury & Result Model

#### Product scope

- Multiple displayed jurors.
- Exactly one Jury Recorder.
- Deliberation happens outside application.
- No numeric jury scoring/rubric.
- No predefined jury slot count.
- No predefined categories.
- Recorder selects submission + optional free-text category.
- Blank category = `Jury Winner`.
- Duplicate category/artwork: warn, do not hard-block.
- Mixed mode excludes only resolved Community Winner.
- No Community lower-rank concepts.
- Jury phase has no deadline.
- `jury_only` requires ≥1 award to publish or must cancel.
- mixed may publish Community Winner only if jury records no awards.
- every jury-enabled publication is manual.

#### Schema direction

Introduce/normalize a dynamic `challenge_jury_awards` concept.

Legacy `challenge_winner_slots`, shared assignment tables, and numeric score tables may remain read-only/deprecated for historical compatibility until safely migrated.

#### Result UI

Show only actual outcomes:

- Community Vote Winner (if any);
- Jury Awards (if any);
- optional category labels;
- no `#2`, `#3`, synthetic rank, empty slot, or `#null`.

**Stop for independent QA.**

---

### Gate D — Authentication, Invitations, Membership & Roles

#### Current status

**PASS ✅ — independently closed.**

Approved Gate D baseline: `46ccdca661de9240ff364ee63d9f5ccb5ca242bc`. Do not amend Gate D behavior during Gate E except through an explicitly reviewed forward correction for a genuinely new defect.

#### Product scope

- Google OAuth only.
- `PENDING_INVITE` remains an onboarding/access gate derived from `membership_status IS NULL`; persistent membership states remain exactly `ACTIVE`, `SUSPENDED`, `DELETED`.
- Direct Google login without an invite routes to manual invite-code onboarding.
- Direct invite links use `/invite/<code>` and preserve the code across Google OAuth through a short-lived HttpOnly server-side continuation mechanism.
- The OAuth callback URL itself must not contain the invite code as a query parameter.
- Default generated invite codes are exactly 8 cryptographically random alphanumeric characters (`A-Z`, `a-z`, `0-9`) using unbiased generation.
- ACTIVE Admin may optionally create a custom code; normalize to lowercase, allow letters/numbers/hyphens, maximum 25 characters, require uniqueness.
- Invitation records store the actual code directly; hash-only storage is no longer required.
- ACTIVE Admin can list/view/copy existing codes and links and revoke them.
- Invite metadata includes optional label, optional expiry, optional max uses (`NULL` unlimited), used count, creator, timestamps, revocation metadata, and redemption history.
- Invite redemption remains transactional: lock onboarding user first, invite row second, revalidate state/expiry/revocation/usage, consume once, activate, create/reconcile profile, record redemption/audit, commit atomically.
- ACTIVE replay consumes zero uses; SUSPENDED/DELETED cannot reactivate through an invite.
- Remove active password/SMTP/email-verification/password-reset/account-merging workflows after safe migration review.
- Last-active-Admin invariant must remain serialized.
- Membership transition matrix must reject `NULL -> SUSPENDED`, generic `NULL -> ACTIVE`, and all `DELETED -> *` transitions.
- Suspension/reactivation must preserve profile visibility rather than forcing public visibility.
- All ordinary member/staff writes require live ACTIVE membership, including historical/admin paths discovered in independent QA.
- Clean master media requires `ACTIVE membership AND existing Gate A ACL`; ownership alone does not bypass suspension/pending/deletion.

#### Roles

**Admin:** system administrator, invitation administrator, full platform/system access subject to ACTIVE status and last-Admin invariant.  
**Moderator:** community operations only; no invitation administration, role ownership, system/deployment/security configuration authority.  
**Jury:** challenge display assignment.  
**Jury Recorder:** one challenge-specific juror allowed to record jury results.

#### Gate D closure acceptance

- Migration `0011` is part of the independently approved Gate D lineage; migrations `0000–0010` remain immutable.
- Direct invite code schema replaces Gate D hash/prefix fields.
- OAuth continuation uses a legal Next.js Server Action/Route Handler cookie mutation path.
- No raw invite code appears in OAuth callback query parameters.
- Google `email_verified` must be exactly `true`.
- Generated and custom invite rules have production-path tests.
- Admin invite list returns/copies real existing codes; Moderator administration is rejected.
- Production-path tests replace simulated authorization condition tests.
- Revoke-vs-redeem and last-Admin tests exercise real concurrency.
- Gate D is independently closed PASS at `46ccdca661de9240ff364ee63d9f5ccb5ca242bc`.

**Gate D closed. Proceed to Gate E plan/review only.**

---

### Gate E — Submission & Portfolio Simplification

#### Product scope

- One active submission/member/challenge.
- Direct upload to challenge.
- Before deadline, replacing media replaces the current submission asset.
- No product-level immutable submission media-version history.
- New upload must succeed before old media is queued for deletion.
- Preserve lightweight audit metadata for replacement.
- Zero valid submissions at deadline → auto-cancel.
- Finished valid submissions → auto-add to portfolio.
- Cancelled/disqualified submissions → no auto-add.
- Portfolio entry may be hidden later without deleting challenge history.
- Additive artwork spoiler domain support: one artwork-level `isSpoiler` boolean, default false. Spoiler is presentation metadata only and must not change audience, publication state, media ACL, ownership, challenge eligibility, voting, or jury semantics.
- Gate E owns spoiler schema/domain/API propagation and authoring metadata; Gate G owns final reveal/cover/lightbox/accessibility/E2E presentation behavior.
- Do not expose challenge-uploaded artwork in the normal gallery/artist portfolio before the intended portfolio-add lifecycle merely because the backing artwork record is published. Portfolio inclusion/visibility and challenge display must be reconciled explicitly.
- Legacy submission-version records may be retained as compatibility/history, but new live behavior must not depend on immutable submission media-version history. Destructive legacy-data purge remains deferred until after Gate H/final cleanup audit.

**Stop for independent QA.**

---

### Gate F — Media & Rate Limiting

#### Authoritative input policy

```text
Static image: JPEG / PNG / WebP ≤ 25 MB
Video: MP4, H.264 video, AAC audio or silent ≤ 50 MB
Video duration: no product limit
GIF/WebM: rejected
```

#### Output policy

- clean member-quality media: uploaded dimensions/quality, metadata stripped, no watermark;
- public derivative: watermark applied and safe public delivery;
- no unnecessary member resize/transcode solely for variant creation.

#### Required fixes

- strict MIME/content/container/codec validation;
- reliable public video watermarking;
- range streaming where appropriate;
- consolidate media execution path;
- comprehensive rate limiting on Google/invite/auth-sensitive paths and all write actions;
- fail-closed public/master media authorization.

**Stop for independent QA.**

---

### Gate G — Community UX, Story Card, Accessibility & E2E

#### Product simplifications

- one comment type;
- `critique welcome` flag only;
- guests may read public comments, ACTIVE members may write;
- remove generalized activity feed;
- guest homepage contains recent artwork, current challenge, latest winner, Featured Artist, admin-editable About Community;
- Featured Artist manually curated, history retained, Admin can edit/remove erroneous history entries;
- no monthly spotlight scheduler/reminder;
- fixed 1080×1920 client-side Story Card PNG;
- result card highlights Community Winner or selected Jury Award only;
- Web Share API when supported, Download fallback;
- no server-side story-card archive/job requirement.

#### Accessibility/E2E

- accessible dialogs/forms/navigation/lightbox/voting/jury surfaces;
- visible focus, correct labels/error announcements, reduced-motion support, practical touch targets;
- Playwright + axe for Anonymous, Pending Invite, Member, Moderator, Admin, Jury Recorder;
- end-to-end challenge paths for vote-only, jury-only, mixed, tie/manual resolve, single tiebreak.

**Stop for independent QA.**

---

### Gate H — Production Concurrency, Operations & Disaster Recovery

- real production-service concurrency tests;
- scheduler idempotency/recovery;
- media worker failure/retry behavior;
- backup encryption/HMAC secrets mandatory in production;
- verified off-server transfer and remote checksum;
- restore database/media consistency against manifest;
- production/staging configuration validation;
- deploy rehearsal and rollback documentation;
- final container/runtime verification.

**Stop for independent QA, then perform final full-system audit.**

---

## 5. Patch-Only Independent QA Workflow

Every gate after A uses the last independently approved commit as its base.

Approved bases remain gate-specific. Current lineage:

```text
Gate B approved base: 15459ecfdb2e4bf2f22b16464b383ddf55e08c1c
Gate C approved baseline after closure: 94ab50040bf226039fc5c1a1f464faf9d95236a5
Gate D approved baseline after closure: 46ccdca661de9240ff364ee63d9f5ccb5ca242bc
```

At completion:

```bash
git format-patch \
  --stdout \
  --binary \
  --full-index \
  APPROVED_BASE_SHA..NEW_GATE_SHA \
  > gateX.patch
```

Return exactly:

- normal textual completion report;
- one `.patch` artifact.

Do not send a repository ZIP, separate diff, or changed-file list unless independent QA explicitly requests it.

---

## 6. Final Go/No-Go Rule

Blueprint 2.2.2 is the product authority.

The earlier QA and Gate A results remain engineering evidence, but no old acceptance criterion may force a removed Blueprint 2.1 feature back into the product.

Production remains **NO-GO** until:

1. Gates D–H pass independent QA (Gates A–C are already closed PASS);
2. all retained P0/P1 safety/integrity risks are closed under their revised acceptance criteria;
3. the complete application passes a final independent audit against Blueprint 2.2.2;
4. deployment and disaster-recovery rehearsal pass.

