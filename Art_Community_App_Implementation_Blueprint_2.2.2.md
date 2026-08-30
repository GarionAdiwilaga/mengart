# Art Community Information System & Portfolio Platform

## Software Requirements Specification and Simplified Agent Implementation Blueprint

**Document version:** 2.2.2  
**Status:** Authoritative product baseline  
**Supersedes:** Blueprint 2.2.1, Blueprint 2.2.0, and Blueprint 2.1.0 for product rules described here  
**Target scale:** Fewer than 100 active community members  
**Community timezone:** `Asia/Makassar` (WITA / UTC+8)  
**Primary design goal:** Keep the product understandable, low-maintenance, and auditable without building enterprise-scale workflow machinery.

**2.2.1 revision retained:** Community voting has exactly one official result concept: the Community Vote Winner. Lower-place public ranks/highlights (#2/#3/etc.) are removed. Raw Star totals remain available for live display and audit, but manual/tiebreak resolution never manufactures lower-rank ordering.

**2.2.2 revision:** Invitations now use Discord-style bearer codes stored directly in the invitation record so an ACTIVE Admin can list, view, copy, and revoke existing invitations after creation. Default codes are cryptographically generated 8-character alphanumeric strings. Admins may optionally create normalized custom codes up to 25 characters using letters, numbers, and hyphens. Hash-only invite storage is no longer an authoritative product requirement.

---

# 1. Purpose

Build a responsive web application for a private digital-art community that replaces fragmented WhatsApp and Google Drive workflows with:

1. A public community showcase and member portfolio directory.
2. Artist commission profiles with external ordering/contact links.
3. Invitation-only Google authentication.
4. Challenge submission, Community Star voting, optional jury awards, and public results.
5. Public watermarked media and clean member media.
6. Historical challenge import, Featured Artist history, challenge history, and simple 9:16 Story Card generation.
7. Community moderation and auditable administrative actions.

The application is intentionally optimized for a small trusted community. Simpler operational rules are preferred over generalized workflow engines.

---

# 2. Product Principles

1. **Small-community first.** Do not introduce internet-scale architecture where a straightforward relational workflow is sufficient.
2. **Low-maintenance administration.** Automate predictable deadlines, but keep exceptional decisions understandable and visible to staff.
3. **Server-side authorization.** Every protected action and media request is authorized on the backend.
4. **Audit important decisions.** Invitations, moderation, voting resolution, challenge transitions, jury decisions, result revocation, and staff overrides must be auditable.
5. **UTC storage, WITA display.** Store timestamps in UTC and display community-facing times in `Asia/Makassar`.
6. **Visibility is separate from state.** Content visibility, lifecycle state, and soft deletion are distinct concepts.
7. **Avoid unnecessary media variants.** Keep one clean member version and one generated public watermarked derivative.
8. **Preserve product intent over legacy implementation.** Existing tables or services do not become product requirements merely because they already exist.
9. **No payments, escrow, WhatsApp bots, automatic AI-art detection, or internal commission-order workflow.**

---

# 3. Users, Roles, and Membership State

## 3.1 User types

| User type | Meaning |
| --- | --- |
| Anonymous | No authenticated session. |
| Pending Invite | Authenticated with Google for the first time but has not redeemed a valid community invitation. |
| Member | Active community member. |
| Moderator | Member trusted with non-system community operations and moderation. |
| Admin | System administrator with full access. The intended deployment may have only one Admin. |
| Challenge Jury | Challenge-specific display assignment. Jury is not a global role. |
| Jury Recorder | Exactly one assigned jury member for a jury-enabled challenge who records the jury's final offline decision. |

`Pending Invite` is an onboarding gate, not a normal long-term membership state.

## 3.2 Membership states

The persistent membership lifecycle is intentionally simple:

```text
ACTIVE
SUSPENDED
DELETED
```

- `ACTIVE`: normal access according to global role and challenge-specific permissions.
- `SUSPENDED`: cannot upload, comment, vote, edit commission listings, or perform ordinary member actions.
- `DELETED`: soft-deleted membership/account. Challenge history may retain locked public result snapshots according to policy.

There is no separate `REVOKED` membership state.

## 3.3 Role boundaries

### Member

May:

- Manage own profile and commission information.
- Upload/manage own portfolio artwork.
- Submit one entry per challenge.
- Edit/replace that submission before the submission deadline.
- Vote in Community voting when ACTIVE.
- Read/post comments according to visibility rules.
- View clean member media when authorized.

### Moderator

Moderator is a **community-operations role**, not a system-administrator role.

May:

- Create and manage challenges.
- Assign/display challenge jury members and choose the Jury Recorder.
- Moderate artwork, comments, reports, and challenge submissions.
- Disqualify/restore submissions with reasons.
- Suspend/reactivate members when community moderation requires it.
- Resolve first-place voting ties manually.
- Start the single allowed tiebreak round.
- Cancel challenges where permitted.
- Revoke/correct published challenge results with audit reasons.
- Manage ordinary community-facing challenge/result operations.

Must not:

- Change system/deployment secrets.
- Change Admin role ownership.
- Access backup/restore infrastructure.
- Change storage/infrastructure configuration.
- Change security-sensitive deployment configuration.

### Admin

Admin has every Moderator capability plus:

- System settings.
- Site-wide configuration.
- Role management.
- Invitation administration.
- Media/watermark/upload settings.
- Taxonomy/content administration.
- Full moderation override.
- Operational/system administration.

### Challenge Jury

- Multiple jury members may be displayed for one challenge.
- Jury deliberation happens outside the website.
- Ordinary assigned jury members are display/read participants only.
- Exactly one assigned jury member is the **Jury Recorder**.
- The Jury Recorder records the final agreed winners/categories.
- Admin may override jury records before publication.

All authorization must be enforced on the backend.

---

# 4. Authentication and Discord-Style Invitations

## 4.1 Authentication method

**Google OAuth is the only authentication method.**

The product does not require:

- Email/password registration.
- Password hashes.
- Password-reset email.
- Email verification mail.
- SMTP infrastructure.
- Automatic Google/password account merging.

## 4.2 First-login flow

```text
Google Login
    ↓
Known ACTIVE/SUSPENDED account?
    ├─ YES → normal signed-in flow according to status
    └─ NO  → create/reuse PENDING_INVITE onboarding account
                  ↓
            Invitation required
                  ↓
            Valid invitation redeemed
                  ↓
                ACTIVE
```

A pending account is heavily restricted. It may access only onboarding, invite redemption, account/logout basics, and required legal/consent surfaces.

## 4.3 Invite-link flow

Example:

```text
/invite/<code>
    ↓
validate invitation landing state
    ↓
not authenticated
    ↓
user chooses Continue with Google
    ↓
server action / route handler revalidates invite
    ↓
store pending invite code in short-lived HttpOnly OAuth-continuation state
    ↓
Google Login
    ↓
authenticated post-OAuth continuation route
    ↓
revalidate invite transactionally
    ↓
redeem automatically
    ↓
clear continuation state
    ↓
ACTIVE
```

The invite code must not be placed in the OAuth callback query string. Use a short-lived HttpOnly cookie or equivalent server-side continuation state with `SameSite=Lax`, `Path=/`, host-only scope, production `Secure`, and a short TTL (approximately 15 minutes). Cookie mutation must occur in a Server Action/Server Function or Route Handler, not during Server Component rendering.

Although invitation codes are intentionally stored directly in the database and visible to authorized Admins, they must not be unnecessarily copied into generic application logs, audit metadata, diagnostics, analytics, exception text, or OAuth callback URLs.

If a user signs in with Google directly without an invitation link, the onboarding screen allows manual invitation-code entry.

## 4.4 Invitation model

Invitations intentionally resemble Discord server invites and use direct bearer codes.

Each invitation contains:

- `code`: the actual URL-safe bearer code, stored directly and uniquely.
- Optional human-readable label.
- Optional expiry timestamp.
- Optional maximum-use count; `NULL` means unlimited.
- Used count and redemption history.
- Creator and creation timestamp.
- Optional revocation timestamp and actor.

### 4.4.1 Default generated codes

When an Admin does not request a custom code, the system generates a code with these rules:

- Exactly **8 characters**.
- Allowed alphabet: `A-Z`, `a-z`, `0-9`.
- Generated with a cryptographically secure random-number generator.
- Character selection must be unbiased; do not use `Math.random()` or naïve modulo mapping such as `randomByte % 62`.
- Codes must not be derived from user IDs, timestamps, database IDs, email addresses, server/resource IDs, or other predictable internal values.
- A uniqueness collision causes regeneration/retry.

Examples:

```text
a7Kp3mQx
X2vN8cLa
p9RM4zTs
```

### 4.4.2 Custom codes

An ACTIVE Admin may optionally request a custom invite code.

Custom-code rules:

1. Normalize to lowercase before uniqueness validation/storage.
2. Allowed characters are letters, numbers, and hyphens (`-`).
3. Maximum length is **25 characters**.
4. The normalized code must be unique.
5. Reserved or routing-conflicting values may be rejected by the application.

Example:

```text
Mengart2026
    ↓
mengart2026
    ↓
https://<host>/invite/mengart2026
```

Custom codes are intentionally easier to guess than generated codes. This is an accepted product tradeoff because Admins may independently revoke them, apply expiration, and apply usage limits.

### 4.4.3 Administration and visibility

Invitation administration is **ACTIVE Admin only**.

The Admin invitation-management surface may list and return the real code so an Admin can:

- view an existing code;
- copy the code;
- copy the full invitation link;
- inspect label, creator, creation time, expiry, uses/max uses, and status;
- revoke an invitation.

At minimum, invitation status should distinguish `ACTIVE`, `EXPIRED`, `EXHAUSTED`, and `REVOKED`.

Moderators and ordinary Members do not administer invitation credentials unless a future Blueprint revision explicitly grants that permission.

### 4.4.4 Redemption rules

- Lookup is by the direct normalized/stored code.
- Revalidate existence, revocation, expiry, and usage limit at redemption time.
- Enforce usage limits transactionally.
- Lock the target onboarding user first and the invitation row second in a deterministic order for redemption.
- Do not create partial ACTIVE memberships after failed redemption.
- `PENDING_INVITE` / `membership_status IS NULL` may become ACTIVE only through successful invitation redemption.
- An already ACTIVE user does not consume another invite merely by opening/replaying an invite link.
- SUSPENDED and DELETED users cannot use invitations to reactivate themselves.
- Revocation and redemption serialize on the invitation row; whichever valid transaction commits first determines the resulting state without lost updates.

---

# 5. Artist Profiles and Commission Hub

## 5.1 Profile content

Profiles may contain:

- Public slug.
- Display name/artist alias.
- Avatar.
- Optional banner.
- Short biography.
- Optional location/timezone and languages.
- Specialties.
- Common software.
- Contribution/achievement badges.
- Social and portfolio links.
- Contact visibility preferences.
- Commission status.

Real names are not required.

## 5.2 Profile visibility

A profile may be:

- Public.
- Hidden by the member.
- Hidden/suspended through moderation.
- Soft-deleted with the account.

Only complete, ACTIVE, public profiles with at least one visible portfolio artwork appear in the public Artist Directory.

## 5.3 Commission status

- `OPEN`
- `CLOSED`
- `WAITLIST`

Waitlist may contain current/max slots when provided.

## 5.4 Commission services

Artists may create service cards containing:

- Title/category.
- Thumbnail/example artwork.
- Description.
- Pricing type: fixed, starting-from, range, or contact-for-quote.
- Currency and relevant price range.
- Estimated turnaround.
- Included revisions.
- Personal/commercial-use notes.
- Optional add-ons.
- Terms summary.
- Order destination: WhatsApp or supported external/custom link.

The platform is a **directory/referral gateway only**. It does not create internal orders, payments, escrow, delivery tracking, refunds, or disputes.

## 5.5 WhatsApp consent

Artists explicitly choose one of:

- Public WhatsApp.
- Members-only WhatsApp.
- No WhatsApp display.
- External commission platform instead.

Do not imply a public `wa.me` number is technically hidden.

---

# 6. Media Policy and Storage

## 6.1 Authoritative accepted upload policy

### Static image

- JPEG
- PNG
- WebP
- Maximum: **25 MB**

### Video

- MP4 container only
- H.264 video codec
- AAC audio or silent
- Maximum: **50 MB**
- **No duration limit**

### Explicitly excluded

- GIF uploads
- WebM uploads
- SVG uploads
- Unsupported/mislabeled containers/codecs

The byte limits are authoritative. There is no product-level video-duration cap.

## 6.2 Validation

- Detect actual MIME/container from file content.
- Validate static-image dimensions against safe decoder limits.
- Validate MP4 container and H.264/AAC compatibility.
- Reject corrupted or malicious files.
- Protect image decoding from decompression bombs.
- Generate random internal storage keys.
- Record checksum, byte size, dimensions, duration where available, and processing state.

## 6.3 Minimal two-variant model

The product intentionally avoids many derivatives.

### `member_clean`

- Same accepted resolution/quality as uploaded.
- No watermark.
- Metadata stripped for privacy where practical.
- Private/authenticated delivery only.
- Used for authorized full-view member access.

### `public_watermarked`

- Generated once from the accepted source.
- May be resized/compressed to one web-appropriate public maximum while applying the watermark in the same processing path.
- Community watermark applied.
- Metadata stripped.
- Used for anonymous visitors and lightweight grid/display surfaces.

For video, the public watermarked derivative may require one FFmpeg encode to apply the overlay. Do not create additional video renditions unless later approved.

## 6.4 Gallery loading rule

To avoid loading 25–50 MB originals in grids:

- Gallery/list cards use the public web derivative even for logged-in members.
- Opening an authorized full-viewer may request `member_clean`.

No public master URL is exposed.

## 6.5 Media replacement

When media is replaced:

1. Validate/store the new file successfully.
2. Update the current record.
3. Queue the previous file for cleanup/removal.
4. Keep lightweight audit metadata that media was replaced.

The product does **not** require a user-facing immutable media-version history.

---

# 7. Gallery, Artwork, Portfolio, and Comments

## 7.1 Public gallery

- Responsive grid/masonry layout.
- Filters for media type, category/medium, software, artist, challenge, and critique-welcome status.
- Public watermarked derivatives for guests.
- Clean member media only after authenticated authorization in the full viewer.
- Static-image zoom/pan where useful.
- Native video playback for supported MP4.

## 7.2 Artwork audience

Suggested audience states remain:

- `PUBLIC`
- `MEMBERS_ONLY`
- `UNLISTED`
- `PRIVATE`

Audience affects discoverability and media authorization, not ownership.

## 7.3 Portfolio model

A member may upload ordinary portfolio artwork directly.

Challenge submissions are **not required to exist as portfolio artworks before submission**.

When a successful challenge reaches `FINISHED`:

- The final submitted work is automatically added to the member's portfolio.
- Default description/achievement text is generated from challenge outcome, for example:
  - `Challenge Winner — <Challenge Name>` for Community/Jury winners.
  - `Challenge Participant — <Challenge Name>` for non-winning finished entries.
- The artist may later edit/hide the portfolio presentation without altering the challenge result/history.

Cancelled or disqualified submissions are not automatically added to the portfolio.

## 7.4 Challenge submission media replacement

Before the submission deadline, a member may replace their challenge file. The previous file is replaced/cleaned up after the new file succeeds.

There is no product requirement for immutable submission-version history.

Challenge audit may still record timestamps such as `submission media replaced`.

## 7.5 Comments

There is **one comment type**.

Rules:

- Guests may read comments on public artwork.
- Only ACTIVE members may post.
- Flat comments are sufficient; nested threads are not required.
- Authors may edit with an `edited` marker.
- Authors may soft-delete their own comments.
- Moderators/Admin may hide/restore comments with reasons.
- Rate-limit repeated posting.
- Sanitize comment content.
- No comment attachments.

Artwork may have a boolean/flag:

```text
Critique Welcome
```

This is a social signal/badge only. It does not create a separate technical-comment permission system.

---

# 8. Challenge Configuration

## 8.1 Base configuration

A challenge includes:

- Title and slug.
- Banner.
- Rules/prompt.
- Submission start.
- Submission deadline.
- Optional challenge-kit files.
- Visibility.
- Award mode.
- Voting start/deadline when voting is used.
- Stars per member when voting is used.
- Assigned jury display list when jury is used.
- Exactly one Jury Recorder when jury is used.

## 8.2 Award modes

Use four explicit product modes:

```text
showcase_only
vote_only
jury_only
vote_and_jury
```

### `showcase_only`

No Community winner and no jury winner workflow. Challenge is participation/showcase only.

### `vote_only`

Community voting produces at most one official Community Vote Winner: the submission with the unique highest positive Star total, or the submission selected through the approved first-place tie-resolution flow.

The product does **not** publish or highlight official #2/#3/lower Community ranks.

### `jury_only`

No Community voting winner. Jury Recorder records one or more final Jury Awards.

### `vote_and_jury`

Community voting resolves at most one Community Vote Winner first. Then jury awards are recorded from the remaining eligible submissions.

## 8.3 One submission per member

A member may have at most **one active submission per challenge**.

The member may edit metadata or replace the media before the submission deadline.

## 8.4 Challenge kit

Admin/Moderator may attach optional downloadable challenge-kit files such as ZIP/PSD/PNG/CLIP.

Kit limits are separate from participant artwork limits.

---

# 9. Simplified Challenge Lifecycle

## 9.1 Target states

```text
DRAFT
→ SCHEDULED
→ SUBMISSION_OPEN
→ SUBMISSION_LOCKED
   ├─ FINISHED
   ├─ VOTING_OPEN
   ├─ JURY_SELECTION_OPEN
   └─ CANCELLED

VOTING_OPEN
   ├─ FINISHED
   ├─ JURY_SELECTION_OPEN
   └─ TIE_PENDING

TIE_PENDING
   ├─ FINISHED
   ├─ JURY_SELECTION_OPEN
   └─ TIEBREAK_OPEN      (only if no tiebreak has yet been used)

TIEBREAK_OPEN
   ├─ FINISHED
   ├─ JURY_SELECTION_OPEN
   └─ TIE_PENDING        (manual resolution only after the single tiebreak)

JURY_SELECTION_OPEN
   ├─ FINISHED
   └─ CANCELLED

FINISHED
   └─ RESULTS_REVOKED    (exceptional governance flow)

RESULTS_REVOKED
   ├─ FINISHED
   └─ CANCELLED          (when correction cannot validly produce results)
```

## 9.2 Removed lifecycle concepts

The target product does **not** require:

- `PAUSED`
- Resume-deadline machinery
- Reopening a cancelled challenge
- A generic mandatory `REVIEW` stage before every publication

If a cancelled challenge must be run again, create a new challenge instead of reopening the old one.

## 9.3 Automatic schedule transitions

- `SCHEDULED → SUBMISSION_OPEN` at configured submission start.
- `SUBMISSION_OPEN → SUBMISSION_LOCKED` at submission deadline.
- If there are no valid submissions at lock: automatically `CANCELLED`.
- For voting modes with enough submissions, `VOTING_OPEN` begins automatically at configured voting start.
- Voting closes automatically at its deadline; result processing follows the mode rules below.

All scheduler jobs must be idempotent.

## 9.4 Submission-lock branching

### Zero valid submissions

```text
→ CANCELLED
```

### `showcase_only`

At submission lock:

```text
→ FINISHED
```

Participant works are then eligible for automatic portfolio addition.

### `jury_only`

With one or more valid submissions:

```text
→ JURY_SELECTION_OPEN
```

### `vote_only`

- Exactly one valid submission: automatic Community Vote Winner → `FINISHED`.
- Two or more: open Community voting at configured voting start.

### `vote_and_jury`

- Exactly one valid submission: automatic Community Vote Winner; there are no remaining jury candidates → `FINISHED`.
- Two or more: open Community voting at configured voting start.

---

# 10. Community Star Voting

## 10.1 Visibility model

Voting is **not artist-blind**.

Voting members may see:

- Artwork.
- Artwork title.
- Artist display name.
- Artist avatar when available.
- Live total Stars.
- Their own allocations.
- Remaining Stars.

Voter identity is secret from ordinary members and ordinary jury participants.

Moderator/Admin may access voter identity/ballot audit information where required for moderation/integrity.

## 10.2 Voting eligibility

Any `ACTIVE` member may vote regardless of whether they are:

- ordinary Member,
- Moderator,
- Admin,
- assigned Jury,
- or a participant in the challenge.

Self-voting is prohibited.

## 10.3 Stars

- `stars_per_member` is configurable per challenge.
- Default: **1 Star**.
- A voter may use zero, some, or all available Stars.
- If allowance >1, multiple Stars may be stacked on one eligible submission.
- Ballot remains editable while the round is open.
- Show a non-blocking reminder when unused Stars remain.

## 10.4 No quorum

**Quorum is removed from the product.**

Voting closes at deadline regardless of participation count.

There is no quorum-exception workflow.

## 10.5 Voting rounds

The product supports at most:

1. One `main` voting round.
2. One optional `tiebreak` voting round.

There is no unlimited sequential tiebreak loop.

Each round stores its own:

- ID.
- Type (`main` or `tiebreak`).
- Status.
- Start time.
- Deadline.
- Stars per member.
- Frozen candidate set.

A ballot is unique per voter and voting-round ID.

## 10.6 Frozen candidate integrity

When a round opens:

- Snapshot the exact eligible candidate IDs.
- Voting reads/mutations use only that snapshot.
- A candidate from the challenge but not frozen into the round is not eligible for that round.

## 10.7 Main-vote winner determination

After main voting closes:

- Count valid active Stars for every frozen candidate.
- Preserve raw final Star totals for audit and optional display.
- Do **not** persist or publish an official full ranking.
- Determine only whether there is a unique highest **positive** Star total.

Examples:

```text
A 30 Stars
B 20 Stars
C 20 Stars
D 10 Stars
```

Official result:

```text
Community Vote Winner: A
```

B/C/D have no official rank that matters to product logic.

If the highest positive total is shared by multiple submissions, only those submissions enter first-place tie resolution. Lower-place ties are irrelevant.

If every candidate has 0 valid Stars, there is no Community Vote Winner and the round does **not** enter `TIE_PENDING`.

## 10.8 No votes

If the main round receives zero valid ballots/Stars:

- There is **no Community Vote Winner**.

Then:

- `vote_only` → `FINISHED` with no Community Vote Winner.
- `vote_and_jury` → `JURY_SELECTION_OPEN`; all otherwise eligible submissions remain available to the jury because no Community Winner exists to exclude.

## 10.9 Unique first place

If exactly one submission has the highest positive Star total when voting closes:

### `vote_only`

Automatically finalize/publish Community result:

```text
→ FINISHED
```

No extra moderator review click is required.

### `vote_and_jury`

Persist Community Vote Winner, exclude that submission from jury eligibility, then automatically:

```text
→ JURY_SELECTION_OPEN
```

## 10.10 First-place tie

Only a tie for the **highest positive Star total** triggers tie-resolution workflow.

Ties among any lower Star totals have no product significance and never create a tiebreak.

When main voting closes with multiple submissions tied at #1:

```text
→ TIE_PENDING
```

Do **not** automatically open a tiebreak.

The UI must clearly show:

```text
Voting Ended — First-Place Tie Awaiting Resolution
```

Admin or Moderator chooses one of:

1. **Manual Resolve**
2. **Start Tiebreak**

## 10.11 Manual resolution from main tie

Admin/Moderator may immediately resolve the tie manually.

Requirements:

- Selected winner must be one of the submissions tied for #1.
- Staff must enter a resolution reason.
- Record actor, selected submission, source round, reason, and timestamp in audit history.

After resolution:

- `vote_only` → `FINISHED`.
- `vote_and_jury` → `JURY_SELECTION_OPEN` with the resolved Community Winner excluded.

## 10.12 Single tiebreak round

If staff choose **Start Tiebreak**:

- Candidate set = only submissions tied for the highest positive Star total in the main round.
- Previous main ballots become immutable.
- Tiebreak Stars per member may default to 1.
- Suggested deadline = **24 hours from tiebreak creation**.
- Before opening the round, Admin/Moderator may manually override the suggested deadline.
- Once opened, the persisted round deadline is authoritative.

There is only **one** allowed tiebreak round.

## 10.13 Tiebreak completion

If the tiebreak produces one submission with the unique highest positive Star total among its frozen candidates:

- that submission becomes the Community Vote Winner;
- `vote_only` → `FINISHED`;
- `vote_and_jury` → `JURY_SELECTION_OPEN`.

If the tiebreak has zero valid Stars or still has multiple submissions tied at the highest positive Star total:

```text
→ TIE_PENDING
```

but **Start Tiebreak is no longer available**.

Manual resolution is mandatory:

- choose only among the still-tied tiebreak candidates;
- require reason;
- audit actor/source/timestamp.

## 10.14 Disqualification while voting is open

If a candidate is disqualified during an open round:

- Preserve ballot records.
- Void that candidate's allocations.
- Exclude voided Stars from totals.
- Return affected Stars to voters.
- Notify affected voters that Stars are available again.
- Audit the moderation action.

Finished results are not silently changed; use `RESULTS_REVOKED` first.

---

# 11. Jury Workflow

## 11.1 Jury configuration

A jury-enabled challenge requires before `JURY_SELECTION_OPEN`:

- One or more displayed jury members.
- Exactly one displayed jury member designated as `Jury Recorder`.

The product does **not** configure a fixed number of jury winner slots in advance.

The product does **not** require predefined jury categories.

## 11.2 Deliberation model

Jury deliberation occurs outside the website.

The website is a final-decision recording surface, not a scoring/rubric collaboration platform.

Multiple jurors are displayed publicly/within the challenge so the jury panel is represented accurately.

Only the Jury Recorder records final jury awards. Admin may override before publication.

This intentionally removes multi-juror concurrent editing and optimistic assignment-conflict workflow from the product requirement.

## 11.3 Creating a jury award

For each agreed award, the Jury Recorder chooses:

1. Eligible submission.
2. Optional award/category label.

Examples:

```text
Artwork A — Best Lighting
Artwork B — Best Character Design
Artwork C — [blank]
```

Blank category displays as:

```text
Jury Winner
```

No empty/unoccupied jury slots are created or displayed.

## 11.4 Dynamic categories

Categories are created while the Jury Recorder records results.

Two awards may use the same category text if staff intentionally choose so, but the UI should warn when the entered category already exists in the same challenge.

Category text is descriptive, not a unique database key.

## 11.5 Winner policy

Intended community rule:

- One artwork should win at most one Jury Award in the same challenge.

This is a policy/operational rule, not a hard backend uniqueness requirement.

If the Recorder selects a submission that already has a Jury Award, the UI should warn clearly and request confirmation rather than making the database permanently reject it.

## 11.6 Vote-and-jury eligibility

When `vote_and_jury` is used:

- The resolved Community Vote Winner cannot receive a Jury Award.
- Every otherwise eligible non-Community-Winner submission remains eligible.
- If there was no Community Vote Winner because nobody voted, no submission is excluded on that basis.

Jury members may see Community Star totals while judging. No lower official Community ranks are required.

## 11.7 No jury deadline

There is no configured judging deadline.

`JURY_SELECTION_OPEN` remains open until authorized staff publish or cancel according to the mode rules.

## 11.8 Publishing jury results

### `jury_only`

At least one Jury Award is required to publish.

If the jury decides not to award any winner:

```text
→ CANCELLED
```

An empty `jury_only` result cannot be published.

### `vote_and_jury`

If one or more Jury Awards are recorded, Jury Recorder/Moderator/Admin may publish:

```text
→ FINISHED
```

If no Jury Award has been recorded:

- If a Community Vote Winner exists, Jury Recorder/Moderator/Admin may:
  - publish the Community Vote result only; or
  - cancel the challenge.
- If no Community Vote Winner exists either, the challenge must not publish an empty winner set; staff must record at least one Jury Award or cancel.

Publication is manual for every challenge that enters jury selection.

---

# 12. Result Semantics and Publication

## 12.1 Community result

Persist/display:

- Final raw Star totals for audit and optional result context.
- At most one official Community Vote Winner.
- Resolution method when needed: unique main-vote maximum, automatic single-submission winner, manual main-tie resolution, tiebreak, or manual post-tiebreak resolution.

Do **not** create official #2/#3/lower Community placements. A manual or tiebreak resolution selects the Community Winner without rewriting the original Star totals or inventing lower-place ordering.

## 12.2 Jury result

Each Jury Award contains:

- Challenge.
- Submission.
- Optional category label.
- Recorded by.
- Created/updated timestamp.

Jury Awards have **no numeric rank**.

## 12.3 Empty slots

Because jury slots are not predefined, there are no placeholder/unoccupied winning slots to render.

Only actual winner/award records appear in results.

## 12.4 Automatic vs manual publication

### Automatic publication

- `showcase_only` after successful submission close.
- `vote_only` with exactly one valid submission.
- `vote_only` after voting closes with a unique #1.
- `vote_only` after a tie is resolved to one winner.
- `vote_and_jury` with exactly one valid submission (automatic Community Winner, no remaining jury candidate).

### Manual publication

Any challenge that enters `JURY_SELECTION_OPEN`.

## 12.5 Results revocation

`RESULTS_REVOKED` remains available after `FINISHED` for incorrect voting, disqualification, or incorrect jury/manual resolution.

Requirements:

- Hide/suppress current official result publication as appropriate.
- Preserve previously published result snapshot in audit history.
- Require reason and actor.
- Allow authorized correction.
- Republish to `FINISHED` after correction.
- If no valid corrected result can exist, cancellation may be used with audit history preserved.

A generic mandatory `REVIEW` lifecycle state is not required by product behavior.

---

# 13. Historical Challenge Import

Admin/Moderator may create historical challenge records with past dates without replaying live workflow.

Historical import may include:

- Challenge metadata.
- Participant artwork.
- Member association when known.
- Community raw Star totals when known.
- Community Vote Winner when known.
- Jury Award records with free-text category labels.
- Displayed jury names/members when known.
- Original dates.
- Visibility.

Historical import may directly create a finished historical result after validation and audit.

Do not invent missing vote/jury data merely to satisfy current live-workflow fields.

---

# 14. Homepage and Public Discovery

## 14.1 Guest homepage

Recommended guest homepage sections:

1. Hero/community identity.
2. Recent public artworks.
3. Current/upcoming visible challenge.
4. Latest published challenge winner/result.
5. Current Featured Artist.
6. Artists open for commission.
7. **About Community** content editable by Admin.
8. Footer/legal/social links.

The homepage does **not** require a generalized public activity-event feed.

## 14.2 About Community administration

Admin-editable structured content is sufficient:

- Title/headline.
- About text.
- Community history/purpose.
- Official links.
- Optional section image/media.
- Section visibility/order where useful.

Do not build a general-purpose page builder.

---

# 15. Featured Artist

## 15.1 Manual selection

Featured Artist is selected manually by Admin.

There is:

- no automatic monthly scheduler,
- no day-1 reminder,
- no reminder notification workflow.

## 15.2 History

Preserve a public/admin-editable Featured Artist history.

A record may include:

- Artist.
- Period/month label.
- Curator/Admin.
- Description.
- Selected artworks.
- Publication date.
- Visibility.

If a spotlight was created by mistake, Admin may edit or remove it from public history.

Recommended implementation: soft-delete erroneous history internally so accidental removal remains recoverable/auditable while the bad record disappears publicly.

At most one current spotlight should be active for the same displayed period unless Admin intentionally corrects the previous record.

---

# 16. Simple 9:16 Story Card Generator

The feature remains in scope but is intentionally lightweight.

## 16.1 Output

- 1080 × 1920 image.
- PNG output.
- Fixed brand template(s), not a freeform design editor.

## 16.2 Recommended implementation

Use a client-side SVG or Canvas template.

For a result card, staff selects one published result/award and the template fills:

- Challenge title.
- Winner artwork.
- Artist display name.
- Award label (`Community Vote Winner`, `Jury Winner`, or jury category).
- Community branding.

For announcement card:

- Challenge title/banner.
- Submission deadline in WITA.
- Optional challenge-kit/template preview.

## 16.3 Sharing

Actions:

- `Download PNG`
- `Share`

Use Web Share API with file support where available. Fall back to Download when direct sharing is unavailable.

The initial product does **not** require:

- background story-card jobs,
- a generated-story-card database archive,
- a server-side rendering fallback,
- complex template editing.

For video artwork, client-side frame capture or a simple available preview may be used when generating a card; a dedicated media-poster pipeline is not required solely for Story Cards.

---

# 17. Notifications

Initial delivery channel is **in-app only**.

Useful events include:

- Comment received.
- Artwork/comment moderation action.
- Report resolution.
- Challenge submission status/disqualification.
- Stars returned after disqualification.
- Challenge deadline reminder where useful.
- `TIE_PENDING` staff attention notice.
- Jury Recorder assignment/change.
- Jury phase opened.
- Featured Artist selection.
- Account warning/suspension.

Removed notification concepts:

- Monthly Featured Artist reminder.
- Public activity-feed event generation.

Critical moderation/account notices cannot be suppressed. Ordinary notifications may use preferences.

---

# 18. Moderation

Members may report:

- Artwork.
- Comments.
- Profiles.
- Challenge submissions.
- Commission listings where applicable.

Moderator/Admin may:

- Hide/restore content.
- Soft-delete/restore content where policy permits.
- Warn/suspend/reactivate members.
- Disqualify/restore challenge submissions.
- Resolve reports.
- Record required moderation reasons.

Admin additionally handles system-level account deletion/role/system settings.

Every moderation action must be auditable.

---

# 19. Simplified Data Model Requirements

This section describes **product-level target entities**, not mandatory exact table names.

## 19.1 Identity

- `users`
  - Google identity/email
  - global role
  - onboarding state
  - membership state
  - timestamps/soft deletion
- `profiles`
- `membership_invites`
- `invite_redemptions`
- `external_links`

## 19.2 Portfolio/commission

- `artworks`
  - owner
  - title/description
  - audience/publication state
  - current clean media reference
  - optional source challenge/submission
- `portfolio_entries`
  - artwork
  - display order/pin/caption/visibility
- `commission_services`
- `commission_service_examples`
- `artist_scope_rules`
- taxonomy/tag tables

A mandatory immutable `artwork_versions` product workflow is **not required**.

## 19.3 Challenges and submissions

- `challenges`
  - status
  - visibility
  - schedule
  - award mode
  - Stars configuration
  - soft deletion
- `challenge_assets`
- `submissions`
  - challenge
  - member
  - title/description/software
  - current media reference
  - status/timestamps
- `submission_disqualifications`
- `challenge_judges`
  - challenge
  - displayed jury member
  - display order
  - `is_recorder`

Product invariants:

- At most one active submission per member per challenge.
- Exactly one Jury Recorder for a jury-enabled challenge before jury selection opens.

A mandatory `submission_versions` product workflow is **not required**.

## 19.4 Voting

- `challenge_voting_rounds`
  - challenge
  - type: main/tiebreak
  - status
  - Stars/member
  - starts_at
  - deadline
- `challenge_voting_round_candidates`
- `challenge_ballots`
  - one ballot per voter per round
- `challenge_ballot_allocations` / equivalent
- finalized per-candidate Star totals as needed for audit/live-result history
- manual vote-resolution metadata/audit

Target invariants:

- One main round maximum per challenge.
- One tiebreak round maximum per challenge.
- Ballot unique by `(voting_round_id, user_id)`.
- Allocations reference frozen candidates in that same round.
- Self-voting rejected.
- Sum of active Stars does not exceed round allowance.

A generalized unlimited `roundSequence` workflow is not required by product behavior, though a legacy/internal sequence field may remain during migration.

## 19.5 Jury awards

Target conceptual entity:

- `challenge_jury_awards`
  - challenge
  - submission
  - optional category text
  - recorded_by
  - timestamps

This replaces the **product requirement** for predefined `jury_winner_slots` and shared `challenge_jury_slot_assignments`.

Existing legacy slot tables may be migrated/deprecated rather than immediately deleted if required for safe historical compatibility.

Do not render empty jury slots.

## 19.6 Results

Final challenge publication must be able to represent:

- Community Vote Winner.
- Raw Community Star totals for display/audit; no official lower ranking required.
- Jury Awards with optional labels and no numeric rank.
- Manual first-place resolution metadata.
- Result publication/revocation history.

Only actual winners/awards are represented as winner records. Lower Community placements are not official product results.

## 19.7 Administration

- `comments`
- `reports`
- `moderation_actions`
- `notifications`
- `notification_preferences`
- `spotlights`
- `spotlight_artworks`
- `audit_logs`
- structured site/content settings

A generalized public `activity_logs`/activity-feed subsystem is not required.

---

# 20. Deployment and Operations

Recommended services:

- Reverse proxy with HTTPS/TLS.
- Web application/API.
- PostgreSQL.
- Redis/BullMQ or equivalent background queue if retained for media processing.
- One media worker initially.
- Lightweight scheduler for challenge time transitions.
- Private clean-media storage.
- Public watermarked derivative storage.
- Off-server backup process.

Not required:

- SMTP service.
- Password-reset email infrastructure.
- WhatsApp bot/API.
- Large-scale realtime infrastructure.
- Separate search engine.

Operational requirements:

- Dev/staging/production separation.
- Secrets outside source control.
- HTTPS in production.
- Structured logs without invite/OAuth secrets.
- Failed-job monitoring.
- Database/media backups off server.
- Tested restore procedure.
- Idempotent scheduler jobs.
- Disk usage monitoring.

---

# 21. SEO, Accessibility, and Performance

## 21.1 SEO

- Index only public pages.
- `noindex` protected/member/admin/private/unlisted surfaces.
- Canonical public URLs.
- Open Graph metadata for public artist/artwork/challenge pages.
- Public sitemap only.
- Stable/redirected public slugs where implemented.

## 21.2 Accessibility

- Keyboard-accessible navigation, menus, dialogs, voting, and lightbox.
- Visible focus states.
- Alternative text for artwork.
- Reduced-motion support.
- Video caption/description fields when members provide them.
- Adequate contrast.
- Status indicators not color-only.
- Correct labels and error announcements.
- Practical touch targets.

## 21.3 Performance

- Paginate/cursor-load galleries and histories.
- Lazy-load public media.
- Use public web derivatives in grids.
- Do not load clean 25–50 MB member media until requested in an authorized viewer.
- Cache safe public pages/derivatives.
- Avoid loading complete directory/history datasets in one response.

---

# 22. Challenge Acceptance Rules

## 22.1 Submission

- [ ] One active submission maximum per member per challenge.
- [ ] Submission/replacement rejected after deadline.
- [ ] Successful replacement cleans up the older media after the new file succeeds.
- [ ] Zero valid submissions at deadline auto-cancels the challenge.
- [ ] Cancelled/disqualified submissions do not auto-add to portfolio.
- [ ] Finished valid submissions auto-add to portfolio.

## 22.2 Voting

- [ ] Any ACTIVE member may vote regardless of role.
- [ ] Artist identity is visible; voter identity is secret to ordinary users.
- [ ] Live Star totals are visible.
- [ ] Default Star allowance is 1 and remains configurable.
- [ ] Stars may stack when allowance >1.
- [ ] Self-voting is rejected.
- [ ] No quorum logic exists.
- [ ] Ballot is unique per voter per round.
- [ ] Candidate must belong to frozen candidate set.
- [ ] Main round tie at #1 enters `TIE_PENDING`.
- [ ] Ties below the highest Star total are ignored by winner-resolution logic and never open tiebreak.
- [ ] Admin/Moderator may manually resolve a main #1 tie with reason.
- [ ] Admin/Moderator may alternatively start exactly one tiebreak.
- [ ] Tiebreak default deadline suggestion is +24h and may be overridden before opening.
- [ ] A still-tied tiebreak can only be resolved manually.
- [ ] Manual selection is restricted to the currently tied candidate set.
- [ ] No ballots means no Community Vote Winner.

## 22.3 Jury

- [ ] Multiple jury members may be displayed.
- [ ] Exactly one Jury Recorder records final decisions.
- [ ] Jury deliberation/scoring is outside the system.
- [ ] Jury categories are entered dynamically while recording winners.
- [ ] Blank category displays as `Jury Winner`.
- [ ] No predefined slot count is required.
- [ ] No empty jury slots are displayed.
- [ ] Duplicate category text is allowed with warning.
- [ ] Duplicate artwork award is warned, not hard-blocked.
- [ ] Community Vote Winner is excluded from jury in mixed mode.
- [ ] Every otherwise eligible submission except the Community Vote Winner remains jury-eligible.
- [ ] Jury may see Community Star totals; no lower official ranks are required.
- [ ] Jury selection has no deadline.

## 22.4 Publication

- [ ] Vote-only unique result auto-publishes at voting completion.
- [ ] Vote-only with one submission auto-publishes that submission as Community Winner.
- [ ] Vote-only with zero votes may finish with no Community Vote Winner.
- [ ] Vote-and-jury with one submission publishes that submission as Community Winner and skips jury.
- [ ] Mixed-mode jury phase opens automatically after Community voting/resolution when more eligible submissions remain.
- [ ] Jury-enabled result publication is manual.
- [ ] `jury_only` cannot publish with zero Jury Awards; staff must award or cancel.
- [ ] Mixed mode may publish Community Vote Winner only when the jury records no awards.
- [ ] Mixed mode with neither Community Winner nor Jury Award cannot publish an empty winner set; staff must add jury award(s) or cancel.
- [ ] Finished results remain immutable until explicitly revoked.

---

# 23. Non-Challenge Acceptance Rules

## Authentication

- [ ] Google is the only login provider.
- [ ] First-time Google login is restricted until invitation redemption.
- [ ] Invite-link continuation survives Google OAuth without placing the invite code in callback query parameters or generic logs.
- [ ] Invitation expiry/revocation/usage limit is revalidated transactionally.

## Media

- [ ] Only JPEG/PNG/WebP ≤25 MB and MP4 H.264/AAC(or silent) ≤50 MB are accepted.
- [ ] GIF/WebM/SVG are rejected.
- [ ] No video-duration limit is enforced.
- [ ] Guests receive watermarked derivatives.
- [ ] Authorized members may receive clean original-quality media.
- [ ] Public grids do not load clean master-sized media.

## Comments

- [ ] Guests may read public comments.
- [ ] Only ACTIVE members may post.
- [ ] `Critique Welcome` is a badge/flag, not a second comment type.

## Featured Artist

- [ ] Selection is manual.
- [ ] No monthly automation/reminder exists.
- [ ] History is preserved.
- [ ] Admin may correct/edit/remove erroneous history entries.

## Story Card

- [ ] Fixed 1080×1920 template creates PNG.
- [ ] Download works.
- [ ] Web Share is offered where supported, otherwise Download fallback.
- [ ] No server-side story-card job/archive is required for initial product.

---

# 24. Explicitly Removed or Superseded Blueprint 2.1 Features

The following are **not target product requirements** and must not be reintroduced unless explicitly approved later:

1. Email/password authentication.
2. SMTP/email-verification/password-reset infrastructure.
3. Automatic merging of password and Google accounts.
4. Long-lived Guest account role; use Pending Invite onboarding instead.
5. Voting quorum and quorum exception workflow.
6. Configurable `manual vs tiebreak` tie-strategy field before a tie exists.
7. Tiebreaks for lower Community ranks.
8. More than one tiebreak round.
9. Automatic tiebreak opening immediately after a tie.
10. Predefined jury winner-slot count.
11. Predefined jury categories as a challenge requirement.
12. Shared concurrent jury-slot editing by all jurors.
13. Jury numeric scoring/rubric calculations.
14. Hard database rule that one artwork can never receive two Jury Awards; use warning/policy instead.
15. `PAUSED` challenge state and resume-deadline machinery.
16. Reopening cancelled challenges.
17. Mandatory generic `REVIEW` state before every result publication.
18. Immutable challenge submission media-version history.
19. Mandatory artwork-version history as a product UX requirement.
20. GIF uploads.
21. WebM uploads.
22. Product-level video-duration limit.
23. Separate appreciation vs technical-critique comment types.
24. Generalized public activity-event feed.
25. Automated monthly Featured Artist reminder/scheduler.
26. Complex server/background Story Card generation/archive.
27. Large-scale realtime voting infrastructure.
28. Public/official Community #2/#3 or generalized lower-rank highlight system.

Legacy database structures corresponding to removed features may temporarily remain for migration compatibility, but new code must not treat them as active product requirements.

---

# 25. Implementation Guidance for Existing Repository

The repository has already completed earlier remediation work against Blueprint 2.1. Blueprint 2.2 changes the **target product behavior** and therefore some previously implemented structures may now be transitional.

Rules for future implementation agents:

1. Do not rewrite approved migrations retroactively merely to match new terminology. Introduce forward migrations.
2. Preserve existing data while deprecating obsolete structures.
3. Do not continue building generalized systems that Blueprint 2.2 explicitly removes.
4. Prefer migration adapters over destructive rewrites where historical data exists.
5. Keep voting-round candidate snapshots and per-round ballot identity; these remain useful and authoritative.
6. Limit live voting to one main round plus one optional tiebreak.
7. Introduce `TIE_PENDING` explicitly rather than disguising an unresolved closed vote as `VOTING_OPEN` or `REVIEW`.
8. Replace/deprecate jury-slot workflow with dynamic Jury Award records and one Jury Recorder.
9. Remove quorum from calculations/UI/configuration.
10. Remove email/password/SMTP flows after safe account-migration review.
11. Simplify submission replacement while safely cleaning prior media.
12. Keep public/media authorization fail-closed.
13. Keep audit trails even where product workflow is simplified.

---

# 26. Recommended Revised Remediation Sequence

This sequence supersedes the older Blueprint 2.1 six-gate remediation layout. The extra checkpoints deliberately keep major simplifications independently reviewable.

## Gate A — Database/Lifecycle Foundation

**Status: independently approved historical baseline.**

Keep the approved migration history, transactional foundations, scheduler/cron safety, audit foundations, voting-round identity, and frozen-candidate model. Product behavior later superseded by Blueprint 2.2.2 is adapted forward rather than retroactively rewriting Gate A migrations.

## Gate B — Voting and Tie Resolution

- Per-round authoritative ballots/candidates.
- Remove quorum from active behavior.
- Community voting produces at most one official Community Vote Winner.
- Preserve raw Star totals; no official #2/#3/lower ranking system.
- One main + maximum one tiebreak.
- Highest-positive-total-only tie detection.
- `TIE_PENDING`.
- Admin/Moderator Manual Resolve or Start Tiebreak.
- 24-hour default tiebreak deadline with pre-open override.
- Manual resolution after unresolved/zero-vote tiebreak.
- Automatic vote-only publication.
- Correct single-submission/no-vote cases.

## Gate C — Simplified Jury and Results

- Multiple displayed jurors.
- Exactly one Jury Recorder.
- Dynamic jury categories.
- No predefined slot count.
- No shared concurrent jury assignment workflow.
- Community Winner exclusion in mixed mode.
- Manual jury publication.
- Mixed mode may publish Community Winner only when jury records no awards.
- Winner-only result semantics; no synthetic lower Community ranks.
- Result revocation/correction.
- Deprecate legacy numeric jury scoring and slot-oriented live workflow.

## Gate D — Authentication, Invitations, Membership, and Roles

- Google-only authentication.
- `PENDING_INVITE` onboarding gate.
- Discord-style reusable direct invite code/link flow: generated 8-character alphanumeric codes plus optional Admin custom codes up to 25 characters; Admin can list/view/copy/revoke existing codes.
- Remove active email/password, SMTP verification, password reset, and account-merging workflows after safe migration review.
- Membership states: `ACTIVE`, `SUSPENDED`, `DELETED`.
- Admin = system administrator; Moderator = non-system community operations.
- Backend permission matrix aligned to simplified roles.

## Gate E — Submission and Portfolio Simplification

- One active submission per member per challenge.
- Direct challenge upload.
- Replace media before submission deadline instead of retaining product-level submission-version history.
- Safely clean replaced files after successful replacement.
- Finished valid challenge submissions auto-add to portfolio.
- Cancelled/disqualified submissions do not auto-add.
- Zero valid submissions auto-cancel.

## Gate F — Simplified Media and Rate Limits

- JPEG/PNG/WebP ≤25 MB.
- MP4 H.264/AAC (or silent) ≤50 MB.
- No product-level video duration limit.
- Remove active GIF/WebM upload paths.
- One clean member-quality media variant with metadata stripped.
- One public watermarked derivative.
- Reliable public video watermarking/streaming.
- Comprehensive write/auth rate limiting.
- Consolidate media processing paths.

## Gate G — Community UX, Story Card, Accessibility, and E2E

- Simple comments + `critique welcome` flag.
- Guest-readable/member-write comments.
- Homepage: recent artwork, current challenge, latest winner, Featured Artist, admin-editable About Community.
- Remove generalized activity feed.
- Manual Featured Artist with editable/removable history; no monthly scheduler/reminder.
- Fixed 1080×1920 client-side Story Card template with Download/Web Share fallback.
- Accessible dialogs/forms/navigation/voting/jury surfaces.
- Playwright + axe coverage for Anonymous, Pending Invite, Member, Moderator, Admin, Jury Recorder.

## Gate H — Production Concurrency, Operations, and Disaster Recovery

- Production-path concurrency testing.
- Scheduler reliability and idempotency.
- Media worker resilience.
- Backup secret hardening.
- Verified off-server backup transfer/checksum.
- Restore verification against database/media manifest.
- Production deployment checklist and rehearsal.

After Gate H, perform a final independent audit against **Blueprint 2.2.2**, not superseded Blueprint 2.1/2.2.0/2.2.1 rules.

---

# 27. Agent Implementation Instructions

When using this Blueprint as an implementation handoff:

1. Treat **v2.2.2 as the authoritative product rule baseline**.
2. Do not silently reintroduce superseded Blueprint 2.1 behavior.
3. Identify contradictions between existing code and v2.2 before implementation.
4. Prefer simpler behavior when it satisfies this specification.
5. Keep backend authorization and audit logging even when UI flows are simple.
6. Use forward-only migrations from the last independently approved database baseline.
7. Add automated tests for every lifecycle, voting, jury, invitation, and permission rule changed by v2.2.2.
8. Do not broaden a remediation phase into unrelated architecture without a documented dependency.
9. Stop at each release gate for independent QA.
10. Overall production status remains NO-GO until all release gates and final audit pass.

---

# 28. Canonical Quick Reference

## Authentication

```text
Google → Invitation Gate → ACTIVE Member
```

## Challenge submission

```text
One member → one submission → replace before deadline → final work auto-adds to portfolio when challenge finishes
```

## Vote-only

```text
0 submissions → CANCELLED
1 submission → auto Community Winner → FINISHED
2+ submissions → MAIN VOTE

MAIN VOTE:
0 votes → FINISHED, no Community Winner
unique highest positive total → auto FINISHED
highest positive total tied → TIE_PENDING
            ├─ Manual Resolve → FINISHED
            └─ Start single Tiebreak → unique #1 → FINISHED
                                      → tied #1 → Manual Resolve → FINISHED
```

## Vote + Jury

```text
0 submissions → CANCELLED
1 submission → auto Community Winner → FINISHED
2+ submissions → MAIN VOTE

MAIN VOTE:
0 votes → no Community Winner → JURY_SELECTION_OPEN
unique/resolved Community Winner → exclude from jury → JURY_SELECTION_OPEN

JURY:
Recorder adds dynamic awards → manual Publish → FINISHED
no awards + Community Winner → Publish Vote Result Only OR Cancel
no awards + no Community Winner → must add Jury Award OR Cancel
```

## Jury-only

```text
0 submissions → CANCELLED
1+ submissions → JURY_SELECTION_OPEN
jury records ≥1 award → manual Publish → FINISHED
jury records 0 awards → CANCELLED
```

## Tiebreak

```text
Only the highest positive Star total
Maximum one tiebreak
Default suggested deadline = +24h
Admin/Moderator may override deadline before opening
Further tie = manual resolution only
```

## Jury

```text
Multiple displayed jurors
Exactly one Jury Recorder
Deliberation outside website
Winner chosen → optional category text
blank category = "Jury Winner"
No predefined slots
No jury numeric rank
```

## Media

```text
JPEG / PNG / WebP ≤25 MB
MP4 H.264/AAC(or silent) ≤50 MB
No duration limit
Guest → public watermarked derivative
Authorized Member → clean original-quality media
```

---

**End of Blueprint 2.2.0**
