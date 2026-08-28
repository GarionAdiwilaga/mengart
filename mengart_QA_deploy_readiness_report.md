# Mengart Project QA & Deploy Readiness Report

**Project:** Mengart  
**Artifact:** QA Result / Agent Handoff  
**Review Scope:** Architecture, backend/business logic, authorization, data integrity, media pipeline, frontend UI/UX, accessibility, testing, and production deploy readiness  
**Overall Verdict:** **NO-GO for production**  
**Estimated Readiness:** **4.5–5/10**

---

## 1. Executive Summary

Mengart is a fairly mature full-stack art community platform rather than a frontend-only prototype. It already includes authentication, role-based access control, artwork/portfolio management, challenge submissions, community voting, jury scoring, moderation, commissions, notifications, audit logging, and a media-processing architecture.

The visual design direction is strong and should be retained. The main release blockers are not aesthetics; they are authorization gaps, incomplete challenge/voting rules, video/media delivery issues, accessibility weaknesses, insufficient automated testing, and missing production infrastructure.

### Production Decision

**Status: NO-GO**

Do not deploy Mengart publicly until the P0 findings in this report are resolved and verified.

---

## 2. Current QA Scorecard

| Area | Score | Status |
|---|---:|---|
| Architecture / code organization | 7.5/10 | Good foundation |
| Feature completeness | 7/10 | Mostly implemented |
| Business-rule correctness | 5/10 | Critical gaps |
| Authentication / authorization | 4/10 | Blockers |
| Data integrity | 5/10 | Voting/jury risks |
| Media architecture | 5/10 | Video blocker |
| Frontend visual design | 7.5/10 | Good |
| UI consistency | 6.5/10 | Needs cleanup |
| Mobile UX | 6/10 | Needs fixes |
| Accessibility | 3.5/10 | Not release-ready |
| Frontend performance | 5.5/10 | Needs work |
| SEO / indexing controls | 3/10 | Incomplete |
| Automated testing | 3/10 | Insufficient |
| DevOps / deployment | 2.5/10 | Incomplete |
| Observability / backups | 2/10 | Incomplete |

---

## 3. Project Understanding

### 3.1 Product Type

Mengart is an invite-only digital art community / private atelier platform with public and authenticated member experiences.

### 3.2 Major Functional Areas

- Public gallery
- Artwork detail
- Artist directory
- Artist profiles
- Commissions
- Challenges
- Challenge results
- Invite-based registration
- Email/password login
- Google authentication
- Email verification
- Password reset
- Member dashboard
- Portfolio management
- Artwork uploads
- Commission management
- Challenge submission workflow
- Community voting
- Jury scoring
- Notifications
- Moderation/admin tooling
- Reports
- Audit logs
- Historical imports
- Media derivative generation
- Watermarking
- Worker/queue architecture

### 3.3 Detected Technology Stack

- Next.js 16.3.3
- React 19
- TypeScript
- Tailwind CSS v4
- Auth.js / NextAuth v5 beta
- PostgreSQL
- Drizzle ORM
- Redis
- BullMQ
- Sharp
- FFmpeg integration
- Framer Motion
- Zustand
- TanStack Query
- Zod
- Radix-based UI components

### 3.4 Important Documentation Drift

Some project documentation still refers to Next.js 15, while the actual repository uses Next.js 16.3.3.

Documentation should be aligned with the real implementation before release.

---

# 4. Positive Findings

The following architectural decisions are worth keeping.

## 4.1 Master/Public Media Separation

The media concept is structurally good:

```text
Uploaded file
    ↓
Clean master
    ↓
Public derivative
    ↓
Thumbnail / poster
```

This is preferable to exposing uploaded originals directly.

## 4.2 Server-Side Role Guards Exist

Authentication and moderator/admin guards exist server-side. The problem is not the absence of authorization architecture, but incomplete enforcement in some critical actions.

## 4.3 Database Model Is Reasonably Mature

The schema separates important concepts such as:

- users
- profiles
- artworks
- artwork versions
- challenges
- submissions
- ballots
- ballot stars
- jury scores
- challenge results
- notifications
- audit logs

## 4.4 Voting Uses Transactions

Ballot mutation uses transactional logic rather than independent writes.

## 4.5 Audit Logging Exists

Administrative and moderation-related actions have audit logging support.

## 4.6 UI Has a Strong Design Identity

The current visual system should be retained rather than redesigned.

Notable strengths:

- dark atelier aesthetic
- amber accent
- artwork-first presentation
- consistent card language
- understandable dashboard hierarchy
- responsive layout thinking
- clear product identity

---

# 5. Severity Definitions

| Severity | Meaning |
|---|---|
| **P0** | Production blocker. Security, data integrity, broken core flow, or severe deployment issue. |
| **P1** | High priority. Should be fixed before general release unless explicitly accepted. |
| **P2** | Important quality issue. Can follow after release blockers are resolved. |
| **P3** | Polish / optimization / lower-risk UX improvement. |

---

# 6. P0 — Critical Production Blockers

## QA-P0-001 — Artwork Privacy / Visibility Can Be Bypassed

**Area:** Authorization / Privacy  
**Severity:** P0  
**Status:** Open

### Observed

Artwork detail retrieval does not consistently enforce all visibility/audience rules before rendering.

Affected concepts include:

- PUBLIC
- MEMBERS_ONLY
- UNLISTED
- PRIVATE
- publication state
- profile visibility

The artwork detail logic may construct a master media URL for authenticated members without validating whether the specific viewer is authorized to access that artwork.

### Risk

Private or restricted artwork may become accessible to unauthorized authenticated users.

### Required Fix

Create centralized authorization policy helpers, for example:

```ts
canViewArtwork(viewer, artwork, owner)
canAccessArtworkMaster(viewer, artwork, owner)
canViewProfile(viewer, profile, user)
```

All artwork pages, media endpoints, API/server actions, and derived links must use the same policy.

### Acceptance Criteria

- Guest cannot access private/member-only artwork unless explicitly allowed.
- Member cannot access another member's private artwork unless allowed.
- Owner can access own restricted content.
- Moderator/admin rules are explicit.
- Direct URL access is blocked server-side.
- Access decision is identical across page rendering and media endpoints.

---

## QA-P0-002 — Master Media Authorization Is Too Broad

**Area:** Media Security  
**Severity:** P0  
**Status:** Open

### Observed

The master-media endpoint primarily checks whether the caller is authenticated and has active membership.

It does not sufficiently validate whether the caller has access to the specific artwork represented by the requested storage key.

### Risk

Knowledge of a master storage key may effectively become the authorization mechanism.

### Required Fix

Resolve the media key back to the artwork/version and run the centralized artwork-access policy before serving bytes.

### Acceptance Criteria

- Master key alone never grants access.
- Unauthorized member receives 403/404.
- Owner receives access.
- Admin/mod access follows explicit policy.
- Challenge-jury access is explicitly defined if required.

---

## QA-P0-003 — Jury Score Submission Is Not Properly Enforced Server-Side

**Area:** Authorization / Challenge Integrity  
**Severity:** P0  
**Status:** Open

### Observed

`submitJuryScoreAction()` calculates whether the caller is moderator/admin but does not appear to enforce that result.

The action also does not reliably enforce an active jury assignment for the challenge before persisting a score.

### Risk

An authenticated member may potentially submit jury scores through direct server-action calls even if the UI hides the jury interface.

### Required Fix

Server-side authorization must require one of:

- admin
- moderator with appropriate permission
- explicitly assigned jury member for that challenge

### Acceptance Criteria

- Normal member direct-call attempt fails.
- Unassigned jury direct-call attempt fails.
- Assigned jury succeeds.
- Moderator/admin behavior matches documented rules.
- Tests call the action directly, not only through UI navigation.

---

## QA-P0-004 — Jury Scores Are Not Fully Integrated Into Final Results

**Area:** Business Logic / Data Integrity  
**Severity:** P0  
**Status:** Open

### Observed

Challenge finalization appears to calculate community stars and ranking, but does not fully integrate jury scoring into the final result model.

Potentially incomplete cases include:

- jury-only awards
- mixed community + jury awards
- required jury slots
- jury conflict resolution
- incomplete jury review
- final result consistency

### Risk

A challenge can be marked finished while jury-based result requirements are incomplete or ignored.

### Required Fix

Define and implement a deterministic finalization algorithm that consumes:

- community result
- jury result
- configured winner slots
- tie rules
- challenge mode

### Acceptance Criteria

- All award modes are covered by tests.
- Jury-only challenge finalizes correctly.
- Mixed challenge finalizes correctly.
- Missing required jury result blocks finalization.
- Result output is deterministic and immutable once published unless explicitly reopened by admin workflow.

---

## QA-P0-005 — Tiebreak Support Is Incomplete

**Area:** Business Logic  
**Severity:** P0  
**Status:** Open

### Observed

The schema supports both `main` and `tiebreak` round types, but application logic frequently hard-codes `main`.

Final ranking may also assign sequential placement to equal-star submissions without a documented deterministic tiebreak rule.

### Risk

Equal scores can produce arbitrary winners based on database ordering.

### Required Fix

Implement an explicit tie policy and fully wire the tiebreak round through:

- ballot creation
- candidate eligibility
- voting UI
- server action
- finalization

### Acceptance Criteria

- Ties are detected deterministically.
- Tiebreak round is created only when needed.
- Main and tiebreak ballots are isolated.
- Final ranking is reproducible.

---

## QA-P0-006 — Ballot Candidate Validation Is Incomplete

**Area:** Data Integrity / Voting  
**Severity:** P0  
**Status:** Open

### Observed

Submission IDs used in a ballot are validated as real submissions, but the system does not sufficiently prove that every selected submission belongs to the current challenge and is eligible for the current round.

### Risk

A crafted request may reference a submission from another challenge or an ineligible state.

### Required Fix

Before ballot persistence, validate for every candidate:

```text
submission.challengeId == current challenge
submission is eligible
submission belongs to current round
submission is not self-vote
submission is not excluded/disqualified
```

### Acceptance Criteria

- Cross-challenge submission IDs are rejected.
- Ineligible candidates are rejected.
- Self-voting remains blocked.
- Transaction remains atomic.

---

## QA-P0-007 — Public Video Media Pipeline Is Broken

**Area:** Media / Frontend Delivery  
**Severity:** P0  
**Status:** Open

### Observed

Video files may be copied into a public derivative path with a `.webp` extension while retaining MP4 bytes.

The public route then determines MIME type from the extension.

This can result in:

```http
Content-Type: image/webp
```

for MP4 bytes.

Additional gaps:

- no proper reduced public video derivative
- no reliable metadata stripping
- incomplete watermark behavior
- missing duration population
- no HTTP Range support
- whole-file memory reads for media serving

### Risk

Video playback can fail, consume excessive memory, and behave poorly under concurrent load.

### Required Fix

Create a dedicated video media pipeline:

```text
master video
    ↓
ffmpeg transcode
    ↓
public mp4/webm
    ↓
poster thumbnail
    ↓
stream via Range requests
```

### Acceptance Criteria

- MIME matches actual file type.
- Browser playback works.
- Range requests return 206.
- No full-file memory buffering for large videos.
- Public derivative is distinct from master.
- Metadata policy is enforced.
- Worker failures are recoverable and observable.

---

## QA-P0-008 — Challenge Scheduling / State Transitions Are Unsafe

**Area:** Business Logic  
**Severity:** P0  
**Status:** Open

### Observed

A challenge may be created with an active submission status even when its submission start time is in the future.

Status transitions also appear too permissive relative to a controlled lifecycle.

### Risk

Challenges may accept submissions before scheduled opening or enter invalid workflow states.

### Required Fix

Implement an explicit challenge state machine:

```text
DRAFT
  ↓
SCHEDULED
  ↓
SUBMISSION_OPEN
  ↓
SUBMISSION_CLOSED
  ↓
VOTING_OPEN
  ↓
TIEBREAK / JURY_REVIEW
  ↓
RESULTS_READY
  ↓
FINISHED
```

### Acceptance Criteria

- Illegal transitions fail.
- Time-gated actions are checked server-side.
- Submission API rejects submissions before opening.
- Voting API rejects votes outside voting window.
- Admin transitions are logged.

---

## QA-P0-009 — Production Infrastructure Is Incomplete

**Area:** DevOps  
**Severity:** P0  
**Status:** Open

### Observed

Current Docker Compose provisions PostgreSQL and Redis only.

Missing production deployment pieces include:

- Next.js application image/service
- media worker
- scheduler
- reverse proxy
- TLS termination
- health/readiness checks
- backup process
- monitoring

### Risk

Repository cannot currently be treated as a complete reproducible production deployment.

### Required Fix

Provide a production deployment topology for all runtime services.

### Suggested Topology

```text
Internet
   │
Cloudflare / Reverse Proxy
   │
   ├── Next.js Web
   ├── PostgreSQL
   ├── Redis
   ├── BullMQ Media Worker
   └── Scheduler
          │
          └── Media Storage
```

### Acceptance Criteria

- Reproducible deployment from clean host.
- Health checks for web, worker, database, Redis.
- Restart policies.
- Graceful worker shutdown.
- TLS enabled.
- Secrets externalized.
- Backup/restore documented.

---

# 7. P1 — High Priority Security / Platform Findings

## QA-P1-001 — Missing Rate Limiting

### Affected Areas

- login
- password reset
- verification resend
- invite validation
- registration
- comments
- reports
- uploads
- voting

### Recommendation

Use Redis-backed rate limiting.

Example policy:

```text
/login
5 attempts / 10 min / IP + identity

/password-reset
3 / hour / email
10 / hour / IP

/invite-validation
20 / 10 min / IP

/upload
quota + concurrency

/comments
burst + sustained throttling
```

---

## QA-P1-002 — Security Headers Not Defined

Add at deployment or application layer:

- Content-Security-Policy
- Strict-Transport-Security
- Referrer-Policy
- Permissions-Policy
- X-Content-Type-Options
- frame-ancestors / clickjacking protection

---

## QA-P1-003 — Public Profile Visibility Does Not Fully Account for Membership State

### Risk

A profile could remain publicly discoverable after its user becomes suspended/revoked if only the profile status is checked.

### Recommendation

Public discovery should combine:

```text
profile visibility
+
user membership state
+
moderation state
```

---

## QA-P1-004 — WhatsApp Consent Is Not Enforced Everywhere

### Observed

Some commission/order WhatsApp links may rely on presence of a phone number without consistently checking consent.

### Required Rule

```text
Public WhatsApp CTA allowed
ONLY IF
waConsentGiven == true
```

This must be universal.

---

## QA-P1-005 — Artwork Hard Delete Risks Historical Integrity

### Observed

Artwork deletion appears capable of physically deleting database records.

### Risk

Historical challenge references, versions, and result integrity may be lost through cascading relationships.

### Recommendation

Use soft deletion:

```text
deletedAt
publicationStatus = hidden/deleted
```

Preserve immutable challenge snapshots.

---

# 8. Frontend UI/UX QA

## 8.1 Frontend Summary

### Visual Design

**Rating: ~7.5/10**

The current design language is good and should remain.

### Production UX / Accessibility

**Rating: ~5/10**

The main issues are interaction semantics, accessibility, mobile ergonomics, consistency, and state handling.

---

## QA-UX-P1-001 — Custom Modals Lack Proper Dialog Semantics

**Severity:** P1

### Observed

Multiple modal-like components exist, but static inspection found little/no consistent use of:

```text
role="dialog"
aria-modal="true"
```

Likely affected surfaces:

- command palette
- quick upload
- detailed upload
- notifications
- report artwork
- lightbox

### Required Fix

Create a reusable accessible Dialog/Drawer primitive with:

- `role="dialog"`
- `aria-modal`
- accessible title
- focus trap
- initial focus
- Escape close
- focus restoration
- body scroll locking
- background inertness

---

## QA-UX-P1-002 — Form Label Association Is Inconsistent

**Severity:** P1

### Observed

Many labels are present, but very few use explicit `htmlFor`.

Some wrapping labels may be valid, but many fields need inspection.

### Required Fix

Use either:

```tsx
<label htmlFor="title">Title</label>
<input id="title" />
```

or valid wrapping labels.

### Acceptance Criteria

- Clicking label focuses field.
- Screen reader announces correct label.
- Automated accessibility scan passes.

---

## QA-UX-P1-003 — Icon-Only Buttons Need Accessible Names

**Severity:** P1

Examples:

- close
- hamburger
- zoom
- notification actions
- modal controls

Use:

```tsx
<button aria-label="Close lightbox">
  <X />
</button>
```

Do not rely only on `title`.

---

## QA-UX-P1-004 — Reduced Motion Support Is Missing

**Severity:** P1

Framer Motion is heavily used but there is no strong reduced-motion path.

### Required Fix

Support:

```css
@media (prefers-reduced-motion: reduce)
```

and/or Framer Motion `useReducedMotion()`.

---

## QA-UX-P1-005 — Mobile Touch Targets Are Inconsistent

**Severity:** P1

Some controls appear around 38–40px even though the project targets ~44px minimum.

### Required Fix

Interactive hit area should generally be at least:

```text
44 × 44 px
```

The icon itself may remain smaller.

---

## QA-UX-P1-006 — Mobile Navigation Is Overcrowded

**Severity:** P1

Authenticated mobile navigation effectively contains roughly six primary destinations/actions.

This can become crowded on smaller devices.

### Recommendation

Target around five main slots, for example:

```text
Gallery
Challenge
Upload
Activity
Studio/Profile
```

Move secondary destinations elsewhere.

---

## QA-UX-P1-007 — Quick Upload Video Preview Bug

**Severity:** P1

Quick Upload appears to accept video while preview behavior is image-oriented.

An MP4 Blob URL may be placed into an image element.

### Required Fix

Preview based on detected media type:

```tsx
image -> <img>
video -> <video>
```

---

## QA-UX-P1-008 — Two Upload Experiences Have Drifted Apart

**Severity:** P1

The project has separate upload implementations with inconsistent behavior.

Potential differences include:

- accepted formats
- validation
- preview
- visibility
- critique mode
- available fields

### Recommendation

Create a shared upload form/core:

```text
ArtworkUploadForm
├── quick mode
└── detailed mode
```

Reuse shared schema, validation, preview, and submission logic.

---

## QA-UX-P2-001 — Drag-and-Drop Affordance May Be Fake

**Severity:** P2

UI text suggests drag-and-drop, but matching drag/drop event handling was not evident.

Either implement it or remove the promise from the copy.

---

## QA-UX-P2-002 — Command Palette Overpromises Search

**Severity:** P2

The UI suggests searching artworks/artists/challenges but implementation primarily behaves like quick navigation over predefined commands.

### Recommendation

Either:

1. implement real global search, or
2. rename to "Quick Navigation".

Also make commands role-aware.

---

## QA-UX-P1-009 — Lightbox Accessibility and Keyboard UX Need Hardening

**Severity:** P1

Issues include:

- no standard dialog semantics
- icon-only controls
- touch targets below target size
- focus management concerns
- incomplete keyboard support
- video accessibility concerns

The lightbox should be treated as a core product component.

---

## QA-UX-P2-003 — Responsive Media Delivery Is Weak

**Severity:** P2

The project uses raw `<img>` heavily and does not appear to use `next/image`.

Custom media delivery is valid, but responsive image behavior should still provide:

- `srcset`
- `sizes`
- thumbnail use
- lazy loading
- device-appropriate derivative sizes

---

## QA-UX-P2-004 — Gallery Pagination / Infinite Loading Is Incomplete

**Severity:** P2

A fixed backend limit is insufficient for long-term growth.

Recommendation:

```text
initial 24 items
    ↓
IntersectionObserver
    ↓
cursor
    ↓
next 24
```

---

## QA-UX-P2-005 — Search Should Be Debounced

**Severity:** P2

Use approximately:

```text
250–350 ms
```

before firing gallery/search requests.

---

## QA-UX-P1-010 — Route-Level Loading/Error/404 UX Missing

**Severity:** P1

No strong evidence of route-level:

- `loading.tsx`
- `error.tsx`
- `not-found.tsx`

### Recommendation

Provide Mengart-styled states for:

- database/network failure
- missing artwork
- missing artist
- deleted content
- expired challenge

---

## QA-UX-P1-011 — Contrast Needs Browser-Level Audit

**Severity:** P1

Potentially risky patterns include:

- zinc-500 / zinc-600
- very small metadata text
- dark surfaces
- low-contrast helper text
- placeholders
- disabled states

Run real computed contrast testing before declaring WCAG AA compliance.

---

## QA-UX-P2-006 — Skip Navigation Link Missing

**Severity:** P2

Add a keyboard-accessible skip link to the main content.

---

# 9. SEO / Indexing QA

## QA-P1-SEO-001 — Indexing Controls Are Incomplete

**Severity:** P1

Missing or incomplete evidence for:

- `robots.ts`
- `sitemap.ts`
- canonical URLs
- artwork dynamic metadata
- artist dynamic metadata
- private route `noindex`

### Required Indexing Model

```text
PUBLIC content
→ index where appropriate

/member
/admin
/dashboard
/auth
/private artwork
/members-only content
→ noindex
```

---

# 10. Testing QA

## 10.1 Current Assessment

Existing scripts/tests are not enough to prove production safety.

Some tests appear to manipulate database state directly instead of calling the actual server actions as hostile users.

This can allow authorization bugs to pass while "feature tests" remain green.

## 10.2 Missing Standard Test Infrastructure

No strong evidence was found for:

- Playwright
- Cypress
- Vitest/Jest test setup
- axe automated accessibility tests

---

# 11. Required Automated Test Matrix

## 11.1 Authorization Matrix

| Flow | Guest | Member | Jury | Moderator | Admin |
|---|---:|---:|---:|---:|---:|
| Public gallery | PASS | PASS | PASS | PASS | PASS |
| Members-only artwork | DENY | PASS | PASS | PASS | PASS |
| Private artwork | DENY | DENY* | DENY* | policy | policy |
| Master media | DENY | policy | policy | policy | policy |
| Upload artwork | DENY | PASS | PASS | PASS | PASS |
| Self-vote | N/A | DENY | DENY | DENY | DENY |
| Vote eligible other artist | N/A | PASS | PASS | PASS | PASS |
| Submit jury score | DENY | DENY | PASS assigned only | policy | PASS |
| Admin route | DENY | DENY | DENY | conditional | PASS |

`*` Except owner or explicitly authorized viewer.

Important: test direct server/API/action calls, not just hidden buttons.

---

# 12. Required Concurrency Tests

## QA-TEST-P0-001 — Concurrent Ballot Updates

Run 20+ simultaneous ballot edits.

Verify:

- allowance cannot be exceeded
- no duplicate ballot
- no lost update
- no partial delete
- final state is valid

## QA-TEST-P0-002 — Concurrent Jury Updates

Two simultaneous jury writes must not silently overwrite each other.

Use:

- optimistic versioning, or
- transaction/locking strategy

## QA-TEST-P0-003 — Concurrent Challenge Finalization

Two moderators finalizing simultaneously must produce exactly one valid immutable result set.

---

# 13. Build Verification Status

## Current Result

**Fresh build: NOT VERIFIED**

Reason:

The repository did not include installed dependencies, which is normal.

A fresh dependency installation was attempted, but it did not complete within the available execution window. The resulting partially installed `node_modules` caused TypeScript to report missing packages.

This is not evidence of source-code failure.

Therefore:

```text
Fresh production build = NOT VERIFIED
```

Do not treat this as either PASS or FAIL.

---

# 14. Tooling / Lint Finding

## QA-P1-DEV-001 — Lint Script Is Stale for Current Next.js

Current script:

```json
"lint": "next lint"
```

For the current Next.js generation, use ESLint directly and provide a proper ESLint config.

Example:

```json
"lint": "eslint ."
```

with:

```text
eslint.config.mjs
```

---

# 15. Deploy Readiness Checklist

| Requirement | Status |
|---|---|
| Security-patched Next.js | PASS |
| Fresh production build verified | NOT VERIFIED |
| Database migrations | PRESENT |
| Authentication | PARTIAL |
| Authorization | FAIL |
| Artwork visibility ACL | FAIL |
| Master media ACL | FAIL |
| Voting correctness | FAIL |
| Jury authorization | FAIL |
| Jury result finalization | FAIL |
| Tiebreak flow | FAIL |
| Video media pipeline | FAIL |
| Image media pipeline | PARTIAL |
| Background worker | DEVELOPMENT-READY |
| Scheduler | FAIL / NOT EVIDENCED |
| Rate limiting | FAIL |
| Security headers | FAIL |
| Input validation consistency | PARTIAL |
| Accessibility | FAIL |
| Mobile device QA | NOT VERIFIED |
| E2E test suite | FAIL |
| Concurrency tests | FAIL |
| Media load test | FAIL |
| App Docker image | FAIL / NOT EVIDENCED |
| Reverse proxy | FAIL / NOT EVIDENCED |
| HTTPS production config | FAIL / NOT EVIDENCED |
| Health/readiness route | FAIL / NOT EVIDENCED |
| Structured logs | FAIL / NOT EVIDENCED |
| Error tracking | FAIL / NOT EVIDENCED |
| Metrics | FAIL / NOT EVIDENCED |
| Database backup | FAIL / NOT EVIDENCED |
| Off-server backup | FAIL / NOT EVIDENCED |
| Restore rehearsal | FAIL / NOT EVIDENCED |
| SEO controls | FAIL |
| Staging environment | NOT EVIDENCED |
| Production runbook | FAIL / NOT EVIDENCED |

---

# 16. Recommended Remediation Order

## Release Gate 1 — P0 Correctness & Security

Do these first:

1. Centralize artwork/profile/media authorization.
2. Fix master media access control.
3. Enforce jury assignment server-side.
4. Fix ballot candidate validation.
5. Complete jury result integration.
6. Complete deterministic tiebreak handling.
7. Implement legal challenge state transitions.
8. Fix video processing and Range streaming.
9. Add rate limiting.
10. Replace standard artwork hard-delete with soft-delete.
11. Enforce WhatsApp consent everywhere.

**Do not deploy publicly before Gate 1 passes.**

---

## Release Gate 2 — Frontend QA

After P0 correctness:

1. Introduce reusable accessible Dialog/Drawer primitive.
2. Fix all form label associations.
3. Add accessible names to icon-only controls.
4. Add reduced-motion support.
5. Standardize touch targets to >=44px.
6. Unify upload implementations.
7. Fix video preview.
8. Implement real drag/drop or remove the wording.
9. Correct command palette behavior.
10. Simplify mobile navigation.
11. Improve lightbox keyboard/focus UX.
12. Add responsive media delivery.
13. Add cursor pagination/infinite loading.
14. Debounce search.
15. Add route loading/error/not-found states.
16. Run full contrast audit.
17. Add complete SEO/indexing rules.

---

## Release Gate 3 — Deployment & Operations

Implement:

- production Dockerfile
- web service
- worker service
- scheduler service
- Redis
- PostgreSQL
- reverse proxy
- HTTPS
- production secrets
- health checks
- startup/readiness checks
- structured logging
- error tracking
- worker failure alerts
- disk alerts
- database monitoring
- scheduled backups
- off-server backups
- documented restore process
- staging environment
- deployment runbook
- rollback procedure

---

# 17. Recommended Testing Architecture

```text
Unit Tests
├── artwork visibility policy
├── profile visibility policy
├── media access policy
├── voting arithmetic
├── tiebreak logic
├── jury authorization
├── challenge state machine
└── validation schemas

Integration Tests
├── database transactions
├── auth and RBAC
├── media ACL
├── ballot persistence
├── jury scoring
└── challenge finalization

Playwright E2E
├── guest
├── member
├── assigned jury
├── moderator
└── admin

Accessibility
├── axe
├── keyboard-only navigation
├── focus order
├── dialog focus trap
├── form labels
└── reduced motion

Load / Concurrency
├── gallery
├── uploads
├── media worker
├── video streaming
├── ballot update
└── challenge finalization
```

---

# 18. Suggested Frontend Device Matrix

At minimum test:

## Mobile

- 320px width
- 360px width
- 375px width
- 390px width
- 430px width

## Tablet

- 768px
- 820px
- 1024px

## Desktop

- 1280px
- 1440px
- 1920px

## Interaction Modes

- mouse
- touch
- keyboard-only
- reduced-motion preference
- 200% browser zoom

---

# 19. Suggested Browser Matrix

At minimum:

- Chrome latest
- Edge latest
- Firefox latest
- Safari latest
- iOS Safari
- Android Chrome

---

# 20. Next Agent Instructions

The next agent should **not restart the architecture or redesign the product**.

The preferred workflow is:

## Step 1 — Reproduce and Confirm P0 Findings

For every P0 item:

1. identify exact file/function
2. reproduce the issue
3. document expected behavior
4. patch minimally
5. add automated regression test
6. re-run typecheck/build/test

## Step 2 — Fix Authorization Before UI Polish

Prioritize:

```text
artwork ACL
media ACL
jury ACL
ballot validation
result integrity
```

before visual improvements.

## Step 3 — Centralize Policy

Avoid repeated ad-hoc checks.

Recommended policy layer:

```ts
canViewArtwork()
canEditArtwork()
canDeleteArtwork()
canAccessMasterMedia()
canViewProfile()
canSubmitChallengeEntry()
canVote()
canSubmitJuryScore()
canFinalizeChallenge()
```

## Step 4 — Add Regression Tests for Every Security Fix

Every authorization bug fixed without a regression test should be considered incomplete.

## Step 5 — Perform Frontend QA After P0 Backend Fixes

Use actual browser automation and live viewport testing, not static inspection only.

## Step 6 — Only Then Perform Deploy Readiness

A successful build alone is not sufficient.

Production deploy should only be marked READY when:

- all P0 items closed
- P1 risks accepted or fixed
- browser E2E passes
- accessibility gate passes
- concurrency tests pass
- video streaming works
- backups tested
- rollback documented
- staging deployment succeeds

---

# 21. Production Go/No-Go Criteria

## NO-GO if any of these remain

- unauthorized private artwork access
- unauthorized master media access
- unauthorized jury scoring
- cross-challenge voting accepted
- nondeterministic tie result
- broken video playback/streaming
- invalid challenge scheduling
- no production backup strategy
- no tested deployment path

## GO Candidate When

```text
P0 findings = 0 open
P1 findings = fixed or explicitly accepted
production build = PASS
E2E = PASS
accessibility = acceptable release baseline
concurrency = PASS
video/media load test = PASS
backup restore = PASS
staging deployment = PASS
rollback = documented and tested
```

---

# 22. Final QA Verdict

Mengart should **not be rewritten**.

The architecture and current visual direction are both worth preserving.

However, the current application should **not be deployed publicly yet** because several high-risk boundaries are incomplete:

- private artwork authorization
- original/master media access
- jury authorization
- challenge result integrity
- tie handling
- ballot validation
- video media delivery
- challenge state enforcement
- production infrastructure
- accessibility
- automated testing

### Final Status

**Architecture:** Keep  
**Visual Design:** Keep  
**Frontend:** Refine and harden  
**Backend:** Fix authorization and challenge integrity  
**Deployment:** Not ready  
**Production Decision:** **NO-GO**

---

## Handoff Priority Summary

```text
P0 SECURITY / DATA INTEGRITY
    ↓
P0 MEDIA / CHALLENGE LOGIC
    ↓
P1 ACCESSIBILITY / FRONTEND UX
    ↓
E2E + CONCURRENCY TESTING
    ↓
DEPLOYMENT INFRASTRUCTURE
    ↓
STAGING
    ↓
PRODUCTION
```

