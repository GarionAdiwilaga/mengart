# Agent Prompt — Gate D Final Correction Against Blueprint 2.2.2

**Authoritative product specification:** `Art_Community_App_Implementation_Blueprint_2.2.2.md`  
**Authoritative remediation plan:** `Mengart_Blueprint_2.2.2_Remediation_Plan.md`  
**Approved Gate C baseline:** `94ab50040bf226039fc5c1a1f464faf9d95236a5`  
**Current unapproved Gate D implementation commit:** `5496c2f5e7b3fda1806d6054b6401652bd3abb1a`

> **Scope:** Correct Gate D only. Do not begin Gate E. Do not modify migrations `0000` through `0010`. Gate A, Gate B, and Gate C are formally closed and must remain behaviorally intact.

---

## A. Authoritative Gate D Status

Gate D is currently **HOLD** after independent QA.

The existing Gate D implementation is not discarded. Preserve its accepted architecture:

- Google-only OAuth;
- `PENDING_INVITE` as derived onboarding state (`membership_status IS NULL`);
- persistent membership enum exactly `active | suspended | deleted`;
- safe normalized-email migration/collision defense;
- removal of Credentials/bcrypt/password-reset/email-verification runtime paths;
- Admin-only invitation administration;
- deterministic user-row then invite-row redemption locking;
- ACTIVE replay consumes zero invite usage;
- SUSPENDED/DELETED cannot redeem to reactivate;
- serialized last-active-Admin invariant;
- Gate A master-media ACL layering;
- Gate B and Gate C behavior/tests.

Correct only the invitation redesign and unresolved Gate D QA blockers below.

---

## B. Blueprint 2.2.2 Invitation Model — Direct Discord-Style Codes

Blueprint 2.2.2 supersedes the Blueprint 2.2.1 hash-only invitation rule.

### B1. Direct code storage

Invitation records store the actual bearer code directly.

Target conceptual fields:

```text
membership_invites
- id
- code              UNIQUE NOT NULL
- label             nullable
- created_by
- created_at
- expires_at        nullable
- max_uses          nullable
- uses_count
- revoked_at        nullable
- revoked_by        nullable
```

Remove Gate D-only hash/prefix assumptions:

```text
token_hash
token_prefix
hashInviteToken()
hash-only lookup
128-bit raw-token minimum requirement
```

Do not add encryption infrastructure for invite recovery.

### B2. Default generated code

If Admin does not supply a custom code:

- generate exactly **8 characters**;
- alphabet exactly `A-Z`, `a-z`, `0-9`;
- use a CSPRNG;
- use unbiased character selection;
- do not use `Math.random()`;
- do not use `randomByte % 62` naïvely;
- do not derive code from user ID, timestamp, DB ID, email, or resource ID;
- retry if uniqueness collision occurs.

Examples:

```text
a7Kp3mQx
X2vN8cLa
p9RM4zTs
```

### B3. Custom code

ACTIVE Admin may optionally specify a custom code.

Processing order:

```text
1. normalize
2. validate characters
3. validate length
4. reject reserved/routing-conflicting values if applicable
5. check uniqueness
6. store
```

Rules:

- normalize to lowercase;
- allowed characters: letters, numbers, hyphen (`-`);
- maximum length: **25**;
- uniqueness applies to normalized stored value.

Example:

```text
Mengart2026 -> mengart2026
```

Custom codes are intentionally easier to guess than generated codes. This is accepted product behavior; expiration, max-use limits, and revocation are operational controls.

### B4. Admin list/view/copy

ACTIVE Admin must be able to list invitation records and retrieve the real stored code after creation.

Admin UI must support at minimum:

```text
Copy Code
Copy Link
Revoke
```

Display:

- code;
- label;
- uses/max uses;
- expiry;
- creator;
- created time;
- status.

Status must distinguish at minimum:

```text
ACTIVE
EXPIRED
EXHAUSTED
REVOKED
```

Moderator must not create, revoke, list secret invite credentials as an administrator, or otherwise administer invitation codes.

### B5. Do not unnecessarily duplicate bearer codes

Direct DB storage is intentional, but do not put codes into generic:

- application logs;
- audit reason strings;
- audit metadata;
- diagnostics;
- analytics;
- exception messages.

Audit invitation actions by invite ID and non-secret label/metadata.

---

## C. Migration 0011 Correction

Gate D has not passed independent QA, therefore correct the existing unapproved Gate D migration:

```text
drizzle/0011_gate_d_auth_roles_membership.sql
```

Do **not** create `0012` merely for this correction.

Migrations `0000–0010` are immutable.

### C1. Preserve accepted membership migration

Final membership enum:

```text
active
suspended
deleted
```

`users.membership_status`:

- nullable;
- no default;
- legacy `revoked -> suspended`;
- `deleted_at IS NOT NULL -> deleted`;
- `NULL` represents derived PENDING_INVITE onboarding state.

Preserve case-insensitive email collision failure, normalization, and normalized uniqueness.

Preserve removal of legacy password hash and verification/reset token tables.

### C2. Direct invite code schema

Update the Gate D invite migration/schema to store direct `code` rather than Gate D `token_hash` / `token_prefix` fields.

Code must be unique at DB level.

Migration/schema verification must assert the final invite columns and uniqueness constraint/index.

---

## D. OAuth Continuation — Fix the Current Runtime/Security Bugs

The submitted Gate D implementation has two blockers:

1. a Server Component attempts `cookies().set()`;
2. the raw invite is copied into `callbackUrl` query parameters.

Both must be removed.

### D1. Required flow

```text
/invite/<code>
    ↓
server-rendered landing page validates/displays invite
    ↓
user clicks Continue with Google
    ↓
Server Action / Route Handler revalidates code
    ↓
sets HttpOnly mengart_pending_invite cookie
    ↓
starts Google OAuth with clean callback URL
    ↓
/api/auth/redeem-callback
    ↓
authenticated session + continuation cookie
    ↓
redeemInviteService
    ↓
clear cookie
    ↓
/dashboard on success
/onboarding on failure/no invite
```

### D2. Cookie

`mengart_pending_invite`:

- HttpOnly;
- SameSite=Lax;
- Secure in production;
- Path=/;
- host-only/no Domain;
- Max-Age approximately 900 seconds.

The code may be present in this HttpOnly continuation cookie because direct plaintext bearer-code storage is now authoritative. It must still not be copied into the OAuth callback URL.

### D3. Prohibited callback fallback

Remove all forms of:

```text
/api/auth/redeem-callback?token=<code>
searchParams.get("token")
```

The production continuation handler must use server-side continuation state only.

### D4. Actual production path test

The integration test must exercise the real production continuation handler/path, not only call `redeemInviteService` directly.

---

## E. Google Identity Fail-Closed Rules

Preserve the approved identity-resolution model, but correct the current verification check.

Require literal:

```ts
profile.email_verified === true
```

Anything else rejects:

```text
false
undefined
null
missing claim
```

Production-path tests must cover:

- verified true succeeds/continues;
- false rejected;
- missing claim rejected;
- legacy normalized-email account binding;
- existing non-null different Google ID rejected;
- Google ID / email resolving to different users rejected;
- DELETED account rejected.

Do not reproduce these `if` statements manually inside tests. Invoke the production identity-resolution helper/callback path.

---

## F. Membership Transition Matrix — Enforce Server-Side

The authoritative transitions are:

```text
NULL/PENDING -> ACTIVE
redeemInviteService ONLY

NULL/PENDING -> SUSPENDED
REJECT

NULL/PENDING -> DELETED
ACTIVE Admin only + required reason

ACTIVE -> SUSPENDED
authorized Moderator for ordinary Member, or Admin

SUSPENDED -> ACTIVE
authorized Moderator for ordinary Member, or Admin

ACTIVE/SUSPENDED -> DELETED
Admin only + reason

DELETED -> any other state
REJECT in Gate D
```

Generic Admin status mutation must not bypass invitation admission.

Tests must invoke the actual production status service/action.

---

## G. Preserve Profile Privacy Across Suspension

Do not overwrite member-selected visibility with a destructive suspension/reactivation transform.

In particular, never produce:

```text
active_hidden
-> suspended
-> active_public
```

Membership state and profile visibility are separate Blueprint concepts.

Preferred Gate D implementation:

- keep the underlying profile visibility/status unchanged when membership is suspended/reactivated;
- public directory/media eligibility already requires ACTIVE membership;
- after reactivation, prior public/hidden/incomplete preference remains.

Add regression coverage:

```text
hidden profile
-> suspend
-> reactivate
-> remains hidden
```

---

## H. Finish the ACTIVE Staff Authorization Audit

The current implementation still contains role-only paths.

Correct at minimum:

```text
src/app/actions/historicalBackfill.ts
src/app/admin/layout.tsx
src/app/admin/users/page.tsx
src/app/api/admin/diagnostics/route.ts
```

Use fresh DB-backed authorization:

```text
requireModerator()
requireAdmin()
```

as appropriate.

Search the remaining production tree for equivalent role-only Admin/Moderator actions/routes and close them.

A SUSPENDED Admin/Moderator keeps their stored role but must immediately lose staff authority.

---

## I. Master Clean Media — Preserve Gate A ACL

Authoritative rule:

```text
ACTIVE membership
AND
existing Gate A master-media ACL
```

Ownership does not bypass membership state.

Reject:

- Anonymous;
- PENDING_INVITE / NULL;
- SUSPENDED;
- DELETED.

Then, for ACTIVE users, evaluate the existing Gate A owner/audience/jury/staff authorization as applicable.

Add a production-path regression for at least:

```text
SUSPENDED artwork owner -> GET master media -> 403
```

Do not replace or weaken Gate A ACL logic.

---

## J. Revoke-vs-Redeem and Redemption Concurrency

Direct code lookup does not change the accepted lock order.

Redemption:

```text
1. lock target user row FOR UPDATE
2. validate current membership
3. lock invite row FOR UPDATE by code
4. re-read/revalidate invite
5. increment usage if valid
6. activate user/create profile/write redemption/audit
7. commit
```

Revoke must lock the same invitation row before updating revocation state.

Expected race semantics:

### Revocation commits first

- redemption wakes;
- sees revoked;
- fails;
- zero usage consumed.

### Redemption commits first

- valid redemption completes once;
- revocation commits afterward;
- subsequent redemptions fail.

Add real concurrency tests with controlled overlap/`Promise.allSettled` or equivalent. Do not claim concurrency from sequential calls.

Also retain:

- same pending user + two invites concurrently -> only one activation/invite consumption;
- max_uses=1 + two pending users concurrently -> exactly one redemption succeeds;
- ACTIVE replay -> zero additional usage.

---

## K. Last-Active-Admin Invariant

Preserve the dedicated transaction advisory lock architecture.

Production role/status/delete services that can remove an ACTIVE Admin must all acquire the same lock before evaluating the invariant.

Test actual production operations concurrently:

- demotion;
- suspension;
- deletion.

The application must never reach zero ACTIVE Admins.

Direct deletion/demotion/suspension of the sole ACTIVE Admin must fail.

---

## L. Admin Invite UI Cleanup

Replace stale hash/high-entropy-only text and old unused fields with the Blueprint 2.2.2 UI.

Admin creation UI should allow:

- generated code (default);
- optional custom code;
- optional label;
- optional expiry;
- optional max uses (`NULL` unlimited).

Remove stale assumptions such as:

- hash-only/nonrecoverable code;
- code visible only at creation;
- 128-bit-only token wording.

Admin list must show the actual existing code and copy controls.

---

## M. Required Gate D Tests

The dedicated Gate D test suite may contain more than the previous 22 scenarios.

At minimum include production-path tests for:

### Invitation generation/customization

- default generated code is exactly 8 chars;
- generated alphabet only `A-Z/a-z/0-9`;
- CSPRNG/unbiased generator implementation is used (unit/static assertion as appropriate);
- reasonable generated sample has no collisions;
- custom normalization to lowercase;
- allowed custom characters;
- custom max length 25;
- invalid custom character rejected;
- duplicate normalized custom code rejected;
- Admin can list/retrieve/copy existing raw code;
- Moderator invite administration denied.

### Redemption

- valid pending redemption -> ACTIVE;
- ACTIVE replay -> no use consumed;
- SUSPENDED redemption rejected;
- DELETED redemption rejected;
- expired rejected;
- revoked rejected;
- exhausted rejected;
- unlimited invite works;
- max-use enforcement;
- same-user concurrent dual invite;
- last-slot concurrency;
- revoke-vs-redeem both lock orders.

### OAuth/identity

- actual invite landing -> server action/route -> cookie -> Google/post-auth continuation handler;
- clean callback URL contains no invite query parameter;
- continuation cookie cleared on success/failure/ACTIVE/SUSPENDED/DELETED terminal outcomes;
- `email_verified === true` only;
- missing/false email verification rejected;
- identity collision cases rejected;
- legacy verified account reuse works.

### Membership/RBAC/privacy

- direct `NULL -> ACTIVE` Admin bypass rejected;
- `NULL -> SUSPENDED` rejected;
- Pending -> DELETED Admin path as designed;
- Moderator cannot target Moderator/Admin status;
- SUSPENDED staff denied production actions;
- hidden profile stays hidden after suspend/reactivate;
- last-active-Admin actual operation/concurrency tests;
- SUSPENDED owner clean-master request rejected.

### Legacy/static regression

- no Credentials provider;
- no production bcrypt auth path;
- no `password_hash` active schema/query;
- no membership `revoked` state;
- invitation revocation remains supported;
- no Gate D `token_hash`/`token_prefix` invite storage remains;
- no OAuth callback query-token fallback remains.

Do not write tests that simply reproduce the expected `if` condition instead of invoking production services/actions/handlers.

---

## N. Migration Verification

`npm run test:migrate` must cover all prior migration scenarios plus Gate D `0010 -> 0011` behavior.

Verify:

- migrations `0000–0010` unchanged;
- email case-insensitive collision fails before normalization;
- successful email normalization and normalized uniqueness;
- membership enum exactly active/suspended/deleted;
- membership_status nullable/no default;
- revoked membership reconciled;
- deleted_at rows reconciled;
- password_hash removed;
- reset/verification token tables removed;
- invitation direct `code` field exists;
- direct code uniqueness enforced;
- obsolete Gate D hash/prefix fields are absent if they were introduced only by the unapproved Gate D migration lineage.

---

## O. Documentation

Add/update repository authoritative documents:

```text
Art_Community_App_Implementation_Blueprint_2.2.2.md
Mengart_Blueprint_2.2.2_Remediation_Plan.md
implementation_plan_gate_d.md
DECISIONS.md
CURRENT_STATUS.md
HANDOFF.md
```

Blueprint 2.2.2 supersedes 2.2.1 for invitation-code semantics.

Do not record Gate D as PASS before independent QA.

Use:

```text
Gate A — PASS
Gate B — PASS
Gate C — PASS
Gate D — IMPLEMENTED / PENDING INDEPENDENT QA
Gate E–H — pending
Overall Production Status — NO-GO
```

---

## P. Verification Commands

Run exactly and report exact results:

```bash
npm run test:migrate
npx tsx src/lib/__tests__/testPhase4AuthAndInvites.ts
npx tsx src/lib/__tests__/testPhase2VotingAndTiebreak.ts
npx tsx src/lib/__tests__/testPhase3SimplifiedJury.ts
npm run test:all
npm run lint
npm run build
```

Gate B and Gate C regression suites must remain green.

---

## Q. Independent QA Patch Handoff

After all correction work and verification pass:

1. Commit all Gate D correction changes.
2. Report the corrected SHA.
3. Generate exactly one **incremental** format-patch from the current unapproved Gate D implementation commit:

```bash
git format-patch \
  --stdout \
  --binary \
  --full-index \
  5496c2f5e7b3fda1806d6054b6401652bd3abb1a..CORRECTED_GATE_D_SHA \
  > gated_final_correction.patch
```

Return only:

- corrected SHA;
- concise implementation/correction walkthrough;
- exact migration/test/lint/build outputs;
- `gated_final_correction.patch`.

Do not send a repository ZIP or alternate diff unless independent QA explicitly requests it.

**STOP after Gate D. Do not begin Gate E until independent Gate D QA returns PASS.**
