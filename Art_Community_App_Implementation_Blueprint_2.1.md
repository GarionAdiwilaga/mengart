# Art Community Information System & Portfolio Platform

## Software Requirements Specification and Agent Implementation Blueprint

**Document version:** 2.1.0  
**Status:** Implementation baseline  
**Target scale:** Fewer than 100 active community members  
**Community timezone:** `Asia/Makassar` (WITA / UTC+8)  
**Server:** Ubuntu 22.04 LTS, 6 CPU threads, 15 GiB RAM, approximately 106 GiB available storage

---

## 1. Purpose

Build a responsive web application for a digital-art community that replaces fragmented WhatsApp and Google Drive workflows with:

1. A public community showcase and member portfolio directory.
2. Artist commission profiles with external ordering links.
3. A challenge submission, anonymous-ballot voting, and jury-winner workflow.
4. Public watermarked media and private full-quality member media.
5. Historical challenge backfill, Hall of Fame, activity feed, artist spotlight, and 9:16 story-card generation.

This document is the primary implementation baseline for development agents. The application may be delivered in phases, but the final product must include all in-scope features.

---

## 2. Product Principles

- Optimize for a small community rather than internet-scale complexity.
- Keep administration low-maintenance.
- Use server-side authorization for every protected action and file.
- Preserve an auditable history for invitations, moderation, ballots, challenge transitions, and jury decisions.
- Store timestamps in UTC and display them in `Asia/Makassar`.
- Separate workflow state, content visibility, and soft deletion.
- Process expensive image, GIF, video, watermark, and poster tasks asynchronously.
- Do not implement payments, escrow, WhatsApp bots, or automatic AI-art detection.

---

## 3. User Types and Authorization

### 3.1 User types

| User type | Description |
| --- | --- |
| Anonymous | No account or authenticated session. |
| Member | Registered through a valid invitation and Google authentication. |
| Moderator | Member with community-management permissions. |
| Admin | Full system administrator. |
| Challenge Jury | A challenge-specific permission assigned to an active member, moderator, or admin. It is not a global role. |

There is no stored `guest` or `registered` role. A successful registration creates a member directly.

### 3.2 Core authorization rules

| Capability | Anonymous | Member | Moderator | Admin | Assigned Jury |
| --- | ---: | ---: | ---: | ---: | ---: |
| View public pages and watermarked media | Yes | Yes | Yes | Yes | Yes |
| View full-quality member media | No | Yes | Yes | Yes | Yes |
| Manage own profile and commission services | No | Yes | Yes | Yes | Yes |
| Submit and revise own challenge entry | No | Yes | Yes | Yes | Yes |
| Cast and edit Stars during voting | No | Yes | Yes | Yes | Yes |
| View voter identities | No | No | Yes | Yes | No, unless also moderator/admin |
| Create and manage challenges | No | No | Yes | Yes | No |
| Access a challenge jury menu | No | No | Only if assigned | Only if assigned or overriding | Yes |
| Assign jury winners | No | No | Only if assigned | Yes | Yes |
| Manage invitations and moderation | No | No | Yes | Yes | No |

All authorization must be enforced by the backend. Hiding a UI element is not authorization.

---

## 4. Authentication and Discord-Style Invitations

### 4.1 Registration flow

1. Visitor opens an invitation URL.
2. Server validates the invitation.
3. Visitor authenticates using Google OAuth 2.0.
4. Server validates the invitation again.
5. Server creates the member account and records the redemption in one transaction.
6. If the invitation expired, was revoked, or reached its usage limit during OAuth, account creation must fail safely.

### 4.2 Invitation properties

Each invitation includes:

- Cryptographically random high-entropy token.
- Stored token hash; the raw token is never stored.
- Optional label.
- Configurable expiry or no expiry.
- Configurable usage limit or unlimited use.
- Creator and creation timestamp.
- Revocation timestamp and revoking administrator.
- Redemption history.
- Derived status: active, expired, exhausted, or revoked.

Suggested expiry presets: 30 minutes, 1 hour, 6 hours, 12 hours, 1 day, 7 days, never, and custom.

Because the raw token is not stored, the full URL is shown only when the invitation is created. If it is lost, a new invitation must be generated.

### 4.3 Invitation security requirements

- Never write raw tokens to application, proxy, analytics, or error logs.
- Redact invitation query parameters from monitoring tools.
- Enforce usage limits transactionally.
- Retain redemption history after revocation.
- Allow immediate manual revocation.
- Do not create partial accounts after a failed redemption.

---

## 5. Artist Profiles and Commission Hub

### 5.1 Profile content

- Avatar.
- Display name or artist alias.
- Short biography.
- Contribution badges.
- Social and portfolio links, including Instagram, X, Pixiv, ArtStation, VGen, Artistree, Ko-fi, Trakteer, and extensible custom links.
- Configurable contact visibility.

### 5.2 Commission status

- Open for Commission.
- Closed.
- Waitlist with current and maximum slots.

### 5.3 Commission services

Artists can create modular service cards containing:

- Service title.
- Thumbnail.
- Pricing type: fixed, starting-from, or range.
- Currency and price value/range.
- Estimated minimum and maximum working days.
- Description.
- Direct WhatsApp order button with prefilled text.
- Optional external commission-platform link.

### 5.4 Scope rules

Artists can manage profile-wide Do and Don't rules. These should not be duplicated across every service card.

### 5.5 Portfolio

The profile portfolio combines:

- Independently uploaded gallery artwork.
- Challenge submissions.
- Community vote achievements.
- Jury-winner achievements.

---

## 6. Media Upload, Storage, and Public Protection

### 6.1 Accepted member artwork formats

| Media class | Formats | Maximum upload size |
| --- | --- | ---: |
| Static image | JPEG, PNG, WebP | 25 MB |
| Animated image | GIF | 50 MB |
| Video | MP4, WebM | 50 MB |

SVG is not accepted.

Initial recommended processing limits:

- Static image: maximum 3840 × 3840 pixels.
- Video: maximum 1920 × 1080 pixels and 120 seconds.
- GIF: configurable pixel and frame-count limits.

These limits must be administrator-configurable rather than hard-coded.

### 6.2 Validation

- Detect MIME type using file content, not only the extension.
- Validate static image dimensions.
- Validate GIF structure, dimensions, and frame count.
- Validate video container, codec, resolution, and duration.
- Reject corrupted or unsupported files.
- Protect image decoding from decompression bombs.
- Generate internal random storage keys.
- Strip metadata from every served media variant.
- Record checksums, byte size, dimensions, duration, and processing status.

### 6.3 Two served variants

1. `master_clean`
   - Full resolution or full accepted quality.
   - Metadata stripped.
   - Random internal filename.
   - Private.
   - Available only after backend authorization to active members, relevant jury, moderators, and admins.

2. `public_watermarked`
   - Reduced public resolution/bitrate.
   - Community watermark applied.
   - Metadata stripped.
   - Available to anonymous visitors.

If exact uploaded bytes are retained temporarily for processing, they must never be served and should be removed according to a documented retention policy.

### 6.4 Media processing

- Run thumbnail, watermark, GIF, video, and poster generation in a background queue.
- Initially use one media worker because of available server memory and rotational storage.
- Expose processing states: pending, processing, ready, and failed.
- Allow safe retry after failure.
- Never publish a master URL directly.
- Deep zoom applies to compatible static images only.
- GIF and video use suitable preview/player components.

Right-click and drag prevention may be added as a deterrent but must not be represented as security.

---

## 7. Gallery, Comments, and Moderation

### 7.1 Public gallery

- Responsive masonry/grid layout.
- Filters for tags, medium, software, artist, challenge, and media type.
- Reduced watermarked media for anonymous visitors.
- Full-quality clean media for authenticated members.
- Lightbox with zoom/pan for static images and media player support for GIF/video.

### 7.2 Feedback modes

- `showcase_only`: appreciation comments only.
- `open_for_critique`: appreciation and technical critique.

### 7.3 Moderation

Members can report artwork, comments, profiles, and submissions. Moderators/admins can:

- Hide and restore content.
- Delete softly and restore content.
- Warn, suspend, or revoke membership.
- Disqualify and restore challenge submissions.
- Record a required moderation reason.

Every moderation action must be auditable.

---

## 8. Challenge Configuration

### 8.1 Base configuration

- Title and slug.
- Banner.
- Rules and prompt.
- Submission start and deadline.
- Optional challenge kit files.
- Visibility flag.
- Award modes.
- Voting configuration.
- Jury winner slots and categories.
- Assigned jury members.

### 8.2 Award modes

A challenge supports two independent winning modes:

- `vote_enabled`
- `jury_enabled`

One or both may be enabled. If neither is enabled, the challenge must explicitly be marked `showcase_only`.

### 8.3 Challenge kit

Admin/moderator may attach multiple optional files such as ZIP, PSD, PNG, or CLIP. Challenge-kit upload rules and size limits are separate from member-artwork rules.

The download button is displayed only when at least one available asset exists.

### 8.4 Submission workflow

- Member creates a draft with title, description, software, and media.
- Member can submit, return to editing, and upload revisions before the deadline.
- Every replacement creates a submission version rather than overwriting history.
- The server clock is authoritative.
- At the deadline, new submissions and revisions are rejected transactionally.
- Soft-deleted or disqualified submissions are excluded from voting/jury candidate sets.

---

## 9. Challenge Lifecycle

### 9.1 Normal states

```text
DRAFT
→ SCHEDULED
→ SUBMISSION_OPEN
→ SUBMISSION_LOCKED
→ VOTING_OPEN (when enabled)
→ TIEBREAK_OPEN (when required)
→ JURY_SELECTION_OPEN (when enabled)
→ REVIEW
→ FINISHED
```

The route branches according to the enabled award modes.

### 9.2 Transitions

| From | To | Trigger and requirements |
| --- | --- | --- |
| `DRAFT` | `SCHEDULED` | Admin/moderator publishes after required configuration passes validation. |
| `SCHEDULED` | `SUBMISSION_OPEN` | Automatic at start time; admin/moderator may open early with confirmation and audit reason. |
| `SUBMISSION_OPEN` | `SUBMISSION_LOCKED` | Automatic at deadline or manual early lock with confirmation. |
| `SUBMISSION_LOCKED` | `VOTING_OPEN` | Voting enabled; freeze the eligible voting candidate set. |
| `SUBMISSION_LOCKED` | `JURY_SELECTION_OPEN` | Voting disabled and jury enabled. |
| `SUBMISSION_LOCKED` | `REVIEW` | Showcase-only challenge. |
| `VOTING_OPEN` | `TIEBREAK_OPEN` | A relevant rank is tied and tiebreak voting is selected. |
| `VOTING_OPEN` | `JURY_SELECTION_OPEN` | Voting finalized and jury mode enabled. |
| `VOTING_OPEN` | `REVIEW` | Voting finalized and jury mode disabled. |
| `TIEBREAK_OPEN` | `JURY_SELECTION_OPEN` | Tiebreak finalized and jury mode enabled. |
| `TIEBREAK_OPEN` | `REVIEW` | Tiebreak finalized and jury mode disabled. |
| `JURY_SELECTION_OPEN` | `REVIEW` | All required jury slots are filled. |
| `REVIEW` | `FINISHED` | Admin/moderator validates and publishes results. |

### 9.3 Exceptional states

#### `PAUSED`

- Available from scheduled, submission, voting, tiebreak, and jury-selection states.
- Store the previous operational state.
- Disable affected member actions.
- Preserve submissions, ballots, and jury assignments.
- Require explicit deadline review before resuming.
- May be visible or hidden.

#### `CANCELLED`

- Available from non-finished operational states.
- Requires a cancellation reason.
- Preserves all data and audit history.
- May be visible or hidden.
- Reopening requires an explicit audited administrative action.

#### `RESULTS_REVOKED`

- Available after `FINISHED`.
- Used when invalid voting, disqualification, or an incorrect jury assignment affects published results.
- Preserves previously published results in audit history.
- Returns the challenge to `REVIEW`.
- Requires re-finalization.

### 9.4 Visibility and deletion

`is_visible` is independent of challenge state.

Examples:

- `PAUSED + visible`: show a paused notice.
- `CANCELLED + visible`: show the cancellation announcement.
- `FINISHED + visible`: show in challenge history/Hall of Fame.
- Any state + hidden: accessible only to authorized administrators and relevant jury where applicable.

There is no `ARCHIVED` state. Soft deletion uses `deleted_at`, `deleted_by`, and optional `deletion_reason`.

---

## 10. Anonymous Ballot Voting with Stars

### 10.1 Visibility model

Candidate identity is visible. Voting members can see:

- Artwork.
- Artist display name.
- Artist avatar if enabled.
- Artwork title.
- Real-time total Stars.
- Their own allocations and remaining Stars.

Ordinary members and jury cannot see who voted for whom. Voter identity and ballot history are restricted to moderators/admins.

### 10.2 Challenge voting configuration

- Stars allocated per eligible member.
- Voting start and deadline.
- Quorum or no quorum.
- Tie strategy: manual or tiebreak round.
- Number of vote ranks to calculate/display.

### 10.3 Ballot rules

- A member may assign multiple Stars to one submission.
- A member may use zero, some, or all Stars.
- Self-voting is prohibited.
- Participation in the challenge is not required to vote.
- Members, moderators, admins, and assigned jury may vote.
- Ballots remain editable until the voting round closes.
- The system reminds a voter when unused Stars remain.
- Ballot updates must be transactional and safe under concurrent requests.

### 10.4 Quorum

Quorum is the number of unique eligible active members who cast at least one active Star.

When quorum is not met, mark the review with `quorum_not_met`. Admin/moderator may:

- Extend voting.
- Accept the result as an exception.
- Discard community-vote results.
- Cancel the result.

The decision and reason must be audited.

### 10.5 Disqualification and returned Stars

If a submission is disqualified while voting is open:

- Do not delete ballot records.
- Void its Star allocations.
- Exclude voided Stars from totals.
- Return the Stars to affected voters.
- Notify affected voters that Stars are available again.

If an account is revoked or confirmed as a duplicate/clone:

- Invalidate its Stars in active rounds.
- Recalculate current totals.
- Record the reason and responsible moderator.
- Do not silently change finished results; use `RESULTS_REVOKED` first.

### 10.6 Tiebreak

- Tiebreak is a separate voting round.
- Candidate set contains only relevant tied submissions.
- Previous ballots remain immutable.
- Tiebreak has its own deadline and Star allocation.
- A further tie is resolved outside the system by admin/moderator.
- Manual resolution and reason are stored in the audit log.

### 10.7 Vote results

- Calculate all ranks after valid Stars are finalized.
- `vote_rank = 1` is the Community Vote Winner.
- Ranks 2 and 3 are highlighted as runners-up.
- Ranks 2 and 3 are not counted as additional winners.

---

## 11. Jury Winner Selection

### 11.1 Configuration

When jury mode is enabled, challenge creation requires:

- Number of jury-winner slots.
- Optional category for each slot.
- At least one assigned jury member before jury selection opens.

A slot without a category represents a global Jury Winner. Jury winners have no rank.

### 11.2 Shared jury permission

Any assigned jury member may:

- Access the challenge jury menu.
- View eligible full-quality submissions.
- Fill any or all jury-winner slots.
- Change assignments before finalization.

Other jury members do not need to repeat or approve the selection.

### 11.3 Concurrency and audit

- Display who last changed each jury slot.
- Use optimistic locking/version checks.
- Never silently overwrite a concurrent edit.
- Audit assignment, replacement, and removal.
- Lock jury slots after the challenge becomes `FINISHED`.
- Admin may override before finalization.

### 11.4 Winner eligibility

- The Community Vote Winner (`vote_rank = 1`) cannot occupy a jury-winner slot in the same challenge.
- Vote ranks 2 and 3 remain eligible for jury selection.
- A submission may occupy only one jury-winner slot unless an administrator explicitly changes the challenge policy.
- If both voting and jury modes are enabled, jury selection opens only after voting is finalized.

Example: one Community Vote Winner plus two configured jury slots produces three winners total.

---

## 12. Historical Backfill

Admin/moderator can create a historical challenge with past dates and directly set it to `FINISHED` after validation.

The importer supports:

- Historical challenge metadata.
- Historical participant artwork.
- Member association.
- Historical community vote rank when known.
- Historical jury awards and categories.
- Original dates.
- Visibility flag.

Historical import bypasses live submission and voting but must still generate audit records.

---

## 13. Homepage and Administration Automation

### 13.1 Homepage

- Community landing page and biography.
- Recent activity feed.
- Featured Artist of the Month.
- Three selected featured artworks.
- Active/upcoming challenge summary.
- Commission-open artist discovery.

### 13.2 Monthly spotlight reminder

- Dashboard reminder activates on day 1 of each month in `Asia/Makassar`.
- Reminder remains visible until dismissed or the current spotlight is updated.
- No paid WhatsApp integration is required.

### 13.3 Activity feed

Eligible activities include:

- Published artwork.
- Commission status change.
- Challenge opening or result publication.
- Artist spotlight publication.

Private, hidden, soft-deleted, or moderation-sensitive activity must not appear.

---

## 14. 9:16 Story Card Generator

Generate 1080 × 1920 downloadable media.

### Announcement card

- Challenge banner.
- Challenge title.
- Submission deadline in WITA.
- Optional template preview.

### Result card

- Community Vote Winner.
- Vote-rank 2 and 3 highlights.
- Jury winners with optional categories.
- Artwork and artist names.

Generation may use client-side SVG/canvas when assets are ready and same-origin safe. A background/server fallback is recommended for GIF/video thumbnails or failed client-side export.

---

## 15. Data Model Overview

### 15.1 Identity and membership

- `users`: account, global role, membership status, timestamps, soft deletion.
- `profiles`: artist identity, biography, avatar, contact settings, commission status.
- `membership_invites`: token hash, prefix, expiry, usage limit, creator, revocation.
- `invite_redemptions`: invite, user, redemption time.
- `external_links`: profile, platform, label, URL, order.

### 15.2 Commission and portfolio

- `commission_services`: title, pricing type, currency, price range, duration range, thumbnail, description.
- `artist_scope_rules`: profile-level Do/Don't content.
- `artworks`: owner, title, description, visibility, critique mode, media type, publication state, soft deletion.
- `artwork_files`: variant, storage key, MIME, codec, size, dimensions, duration, checksum, processing state.
- `tags` and `artwork_tags`: normalized filtering.

### 15.3 Challenges and submissions

- `challenges`: lifecycle status, visibility, timezone, schedule, mode flags, quorum, Star settings, soft deletion.
- `challenge_assets`: optional downloadable kits.
- `challenge_judges`: challenge-specific jury assignments.
- `submissions`: challenge, member, artwork/title data, current version, status, timestamps, soft deletion.
- `submission_versions`: immutable revision history.
- `submission_disqualifications`: reason, actor, timestamps, restoration history.

### 15.4 Voting and results

- `voting_rounds`: primary/tiebreak type, candidate set, schedule, Star allowance, status.
- `vote_ballots`: one member ballot per round, version, last update.
- `vote_allocations`: ballot, submission, Star quantity, active/voided state, invalidation reason.
- `vote_results`: finalized total, vote rank, round, finalization timestamp.
- `jury_award_slots`: category, slot order, assigned submission, assigning jury, version, timestamps.

### 15.5 Community and administration

- `comments`: artwork/submission, author, type, body, visibility, soft deletion.
- `reports`: reporter, target type/id, reason, status.
- `moderation_actions`: target, action, reason, actor, timestamps.
- `spotlights`: artist, period, selected artworks, visibility.
- `activity_logs`: member-facing structured events.
- `audit_logs`: administrative/security event, actor, target, before/after metadata, timestamp.
- `generated_story_cards`: challenge, card type, file reference, generation status.

### 15.6 Required integrity rules

- An invite cannot exceed its usage limit.
- An account can redeem an invitation only as allowed by policy.
- A ballot is unique per voter and voting round.
- Star allocation sum cannot exceed the ballot allowance.
- Self-voting is prohibited.
- Allocations must reference candidates in the same voting round.
- Jury assignment requires active challenge-jury membership.
- The Community Vote Winner cannot occupy a jury slot.
- A jury slot has at most one assigned submission.
- A submission cannot occupy multiple jury slots by default.
- Finished results are immutable unless results are revoked.

---

## 16. Deployment Architecture and Constraints

The application must run on the available Ubuntu server.

### 16.1 Recommended services

- Reverse proxy with HTTPS/TLS.
- Web application and API service.
- PostgreSQL database.
- Background job worker.
- Scheduler for state transitions and reminders.
- Private master-media directory.
- Public derivative directory.
- Automated off-server backup process.

Docker Compose or system services may be selected during technical design. The SRS does not mandate a programming language or framework.

### 16.2 Resource guidance

- Current available RAM is approximately 4 GiB; avoid memory-heavy parallel processing.
- Start with one media worker and measure before increasing concurrency.
- Schedule heavy backfill processing outside peak hours.
- Use pagination and thumbnails for gallery pages.
- Use polling or lightweight server events for live Star totals; large-scale real-time infrastructure is unnecessary.
- Configure disk usage warnings before 75–80% capacity.
- Apply configurable per-member storage quotas.
- Keep database and media backups outside the server's physical disk.

### 16.3 Operational requirements

- Development, staging, and production configuration separation.
- Secrets outside source control.
- HTTPS only in production.
- Structured application logs without sensitive tokens.
- Error and failed-job monitoring.
- Database and media backup schedule.
- Documented restoration test.
- Idempotent scheduler jobs for challenge transitions.

---

## 17. Phased Delivery Plan

### Phase 0 — Specification and architecture

- Finalize technical stack and repository structure.
- Convert requirements into implementation issues and acceptance tests.
- Define environment, backup, and deployment conventions.

### Phase 1 — Foundation

- Google OAuth and hashed invitation registration.
- RBAC and challenge-specific jury authorization.
- Database foundation and migrations.
- Private/public media storage.
- Audit logging and soft deletion.
- Background worker and scheduler.

### Phase 2 — Artist and gallery platform

- Artist profiles.
- Commission services and external links.
- Portfolio.
- Static/GIF/video upload pipeline.
- Public watermarked gallery.
- Member full-quality viewer.
- Tags and filtering.

### Phase 3 — Challenge submission engine

- Challenge configuration.
- Award-mode configuration.
- Challenge assets.
- Draft, submit, and versioned revision workflow.
- Deadline lock.
- Pause, cancellation, visibility, and soft deletion.

### Phase 4 — Stars and jury workflow

- Anonymous ballots and editable Star allocations.
- Real-time anonymous totals.
- Quorum.
- Disqualification Star returns.
- Account-level invalidation.
- Tiebreak rounds.
- Jury access and winner slots.
- Combined vote/jury result validation.

### Phase 5 — Community and administration

- Appreciation and critique comments.
- Reports and moderation.
- Activity feed.
- Featured Artist of the Month.
- Monthly reminder.

### Phase 6 — Historical and media automation

- Historical backfill.
- Hall of Fame/history views.
- Announcement story-card generator.
- Result story-card generator.

### Phase 7 — Hardening and production deployment

- Security testing.
- Concurrency testing.
- Media-load testing.
- Accessibility and responsive QA.
- Backup restoration test.
- Production deployment and operational hand-off.

---

## 18. Validation and Acceptance Checklist

### Authentication and membership

- [ ] Raw invitation tokens cannot be reconstructed from the database.
- [ ] Expiration, revocation, and usage limits work under concurrent registration.
- [ ] Failed invitation redemption does not create a partial user.
- [ ] Revoked/suspended users immediately lose protected access.

### Media

- [ ] Unsupported, mislabeled, corrupted, and oversized files are rejected.
- [ ] Anonymous users cannot access master media by guessing URLs.
- [ ] Members receive only authorized master media.
- [ ] Metadata is stripped from every served variant.
- [ ] GIF/video processing stays within server memory limits.
- [ ] Failed jobs can be safely retried.

### Challenge lifecycle

- [ ] Scheduled transitions use server UTC timestamps and display WITA correctly.
- [ ] Deadline-boundary uploads cannot bypass locking.
- [ ] Pausing preserves previous state and requires deadline review on resume.
- [ ] Visibility changes do not change lifecycle state.
- [ ] Hidden finished challenges remain available to authorized administrators.
- [ ] Soft deletion is recoverable and independent of visibility.

### Voting

- [ ] Stars may be stacked on one submission.
- [ ] Ballots may be edited only during an open round.
- [ ] Concurrent ballot edits cannot exceed the Star allowance.
- [ ] Self-voting is rejected.
- [ ] Candidate artwork and artist names remain visible.
- [ ] Voter identities remain restricted to moderators/admins.
- [ ] Disqualification returns Stars and preserves audit evidence.
- [ ] Account invalidation recalculates active rounds only.
- [ ] Tiebreak rounds contain only tied candidates.

### Jury and results

- [ ] Any assigned jury member can fill all configured winner slots.
- [ ] Other jury members do not need to duplicate selections.
- [ ] Concurrent jury edits cannot silently overwrite each other.
- [ ] Category-less slots display as global Jury Winner.
- [ ] Jury winners have no rank.
- [ ] Vote rank 1 cannot receive a jury slot.
- [ ] Vote ranks 2 and 3 are highlighted but not counted as extra winners.
- [ ] Finished results are locked until explicitly revoked.

### Operations

- [ ] Scheduled jobs are idempotent.
- [ ] Disk usage and failed-job warnings are available.
- [ ] Database and media backups are stored off-server.
- [ ] A restoration test successfully reconstructs database/media consistency.

---

## 19. Out of Scope

- WhatsApp Business Cloud API.
- Headless WhatsApp bots.
- In-app payment gateway or escrow.
- Automatic AI-art detection.
- Mandatory layered WIP/proof files.
- AI prompt roulette.
- Judge scoring/rubric calculations; jury deliberation occurs outside the system.

---

## 20. Agent Implementation Instructions

When using this specification as an agent hand-off:

1. Do not silently change product rules.
2. Identify contradictions before implementation.
3. Implement phases in order unless dependencies justify a documented change.
4. Preserve server-side authorization even when the frontend hides controls.
5. Add database constraints and transactional validation for invitations, Stars, and winner assignment.
6. Add automated tests with every lifecycle or permission feature.
7. Keep generated media and master access behind the defined storage policy.
8. Treat the acceptance checklist as the minimum definition of done.

---

# Part II — Non-Challenge Product Structure

The challenge system is only one part of the product. This part defines the structure required for guest landing pages, artist profiles, portfolios, commissions, gallery discovery, comments, notifications, activity, spotlight curation, and their administration.

The most important rule in this part is that an artwork, artwork version, portfolio entry, and challenge submission are separate records with different responsibilities.

---

## 21. Site Information Architecture

### 21.1 Public routes

| Route | Purpose |
| --- | --- |
| `/` | Guest landing page. |
| `/gallery` | Public gallery using watermarked derivatives. |
| `/artworks/{slug}` | Public artwork detail page. |
| `/artists` | Artist directory. |
| `/artists/{slug}` | Public artist profile and portfolio. |
| `/commissions` | Directory of artists offering commissions. |
| `/challenges` | Visible active and finished challenges. |
| `/about` | Community profile, purpose, and social links. |
| `/login` | Google login for returning members. |

### 21.2 Member routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Member overview, recent activity, reminders, and challenge status. |
| `/me/profile` | Edit artist identity, visibility, and links. |
| `/me/portfolio` | Upload and organize artwork. |
| `/me/commissions` | Manage commission status and service cards. |
| `/notifications` | Comments, moderation, returned Stars, jury, and system notifications. |
| `/settings` | Account, privacy, contact, and notification preferences. |

### 21.3 Administration routes

| Route | Purpose |
| --- | --- |
| `/admin/members` | Member status, role, badge, storage, and moderation management. |
| `/admin/content` | Landing, About, navigation, footer, and announcement content. |
| `/admin/gallery` | Artwork moderation, featured content, and media-processing failures. |
| `/admin/commissions` | Reported services, unsafe links, and visibility overrides. |
| `/admin/reports` | Moderation queue. |
| `/admin/spotlights` | Featured Artist creation and history. |
| `/admin/tags` | Controlled specialties, media, software, and gallery taxonomy. |
| `/admin/settings` | Upload limits, watermark, derivative, comment, and site settings. |

A returning member logs in with Google without reusing an invitation. A first-time Google account must complete invitation redemption before account creation.

---

## 22. Artist Profile Structure

### 22.1 Identity fields

- Unique public slug.
- Display name or artist alias; real name is not required.
- Avatar.
- Optional profile banner.
- Short biography.
- Optional location/timezone.
- Optional languages.
- Join date.
- Controlled specialties such as character art, chibi, background, animation, pixel art, and graphic design.
- Commonly used software.
- External portfolio, social, and commission-platform links.
- Contact visibility preferences.

### 22.2 Profile lifecycle

| State | Meaning |
| --- | --- |
| `INCOMPLETE` | Member account exists but required public profile fields are missing. |
| `ACTIVE_PUBLIC` | Eligible for artist and commission directories. |
| `ACTIVE_HIDDEN` | Account remains active but profile is excluded from directories. |
| `SUSPENDED` | Profile and member actions are restricted. |
| `DELETED` | Soft-deleted account/profile. |

Profile lifecycle is separate from the global role and membership status.

### 22.3 Slug rules

- Slugs must be unique and case-normalized.
- Generate the initial slug from the display name, then allow editing.
- Preserve previous public URLs through slug redirects.
- Reject reserved words such as `admin`, `login`, `gallery`, `artists`, `commissions`, and `settings`.
- Apply the same stable-slug policy to public artwork pages.

### 22.4 Profile onboarding

After registration, show a completion checklist:

- Set a display name.
- Add an avatar.
- Add a biography.
- Add at least one portfolio artwork.
- Configure commission status.
- Add optional external links.

An incomplete profile is not automatically shown in the public artist directory.

### 22.5 Badges and achievements

System-awarded badges may include:

- Challenge Participant.
- Community Vote Winner.
- Jury Winner.
- Featured Artist.

Admin-awarded badges may include:

- Moderator.
- Community Contributor.
- Event Organizer.

Members cannot assign achievement badges to themselves. Every badge assignment stores its source and timestamp.

---

## 23. Canonical Artwork and Portfolio Model

### 23.1 Artwork

An artwork is the canonical creative work owned by an artist. It stores:

- Owner.
- Title and description.
- Creation/publication dates.
- Media type.
- Tags and software.
- Critique setting.
- Audience.
- Publication status.
- Current artwork version.

### 23.2 Artwork version

An artwork version is an immutable media revision. Replacing media creates a new version instead of overwriting the previous file.

This preserves challenge, moderation, result, and Hall of Fame integrity.

### 23.3 Portfolio entry

A portfolio entry determines how an artwork appears on an artist profile. It stores:

- Artwork reference.
- Display order.
- Pinned/featured state.
- Optional custom portfolio caption.
- Portfolio visibility.

Removing a portfolio entry does not delete the artwork or its challenge history.

### 23.4 Challenge submission relationship

A challenge submission references one locked artwork version. It is not the artwork itself.

When the challenge is finished:

- The system may create a portfolio entry automatically.
- The artist can hide that portfolio entry without removing the challenge record.
- Challenge history and Hall of Fame continue using the locked submission version.

### 23.5 Artwork publication lifecycle

```text
DRAFT
→ PROCESSING
→ READY
→ PUBLISHED
→ HIDDEN
```

Exceptional processing state:

```text
PROCESSING_FAILED
```

Soft deletion remains independent.

### 23.6 Artwork audience

| Audience | Behaviour |
| --- | --- |
| `PUBLIC` | Guest receives watermarked derivative; member receives clean full-quality media. |
| `MEMBERS_ONLY` | Hidden from guests; active members receive clean media. |
| `UNLISTED` | Available through a direct URL but absent from normal grids/directories. |
| `PRIVATE` | Owner and authorized administrators only. |

Challenge-controlled visibility can temporarily override whether a submitted version is discoverable, but it must not silently change the owner’s portfolio settings.

---

## 24. Commission Hub Structure

### 24.1 Product boundary

The platform is a directory and referral gateway. It:

- Displays artist availability and service information.
- Directs a prospective client to WhatsApp or an external commission platform.
- Does not create or manage internal orders.
- Does not track delivery or payment.
- Does not handle refunds, disputes, or escrow.
- Is not party to the artist-client transaction.

Display an appropriate directory disclaimer on commission pages.

### 24.2 Commission directory

The commission directory supports:

- Open and waitlisted artists.
- Artist-name search.
- Service category and specialty filters.
- Turnaround filtering.
- Price filtering only when the selected currency and pricing type are comparable.
- Recently updated and artist-name sorting.
- Optional filter to show closed artists.

### 24.3 Artist-wide status

- `OPEN`
- `CLOSED`
- `WAITLIST`

Waitlist stores current and maximum slots where provided.

### 24.4 Commission service lifecycle

- `DRAFT`
- `PUBLISHED`
- `UNAVAILABLE`
- `HIDDEN`
- Soft-deleted

An artist may be globally open while an individual service is unavailable.

### 24.5 Commission service fields

- Title and category.
- Description.
- Example artworks.
- Pricing type: fixed, starting-from, range, or contact-for-quote.
- Currency and relevant minimum/maximum price.
- Minimum/maximum turnaround.
- Included revision count.
- Personal/commercial-use availability.
- Optional add-ons.
- Terms summary.
- Order destination: WhatsApp, VGen, Artistree, Ko-fi, Trakteer, or custom URL.

### 24.6 WhatsApp contact consent

A public `wa.me` link exposes the target number. Artists must explicitly choose one of:

- Public WhatsApp.
- Members-only WhatsApp.
- Do not display WhatsApp.
- Use an external commission platform instead.

Do not imply that a public WhatsApp number can remain technically hidden.

### 24.7 Scope and policy information

Artist-wide information can include:

- Accepted subjects.
- Restricted subjects.
- Commercial-use policy.
- Revision policy.
- Cancellation/refund note.
- Estimated response time.

Individual services may add exceptions. These fields are informational and do not create an internal contract workflow.

---

## 25. Gallery and Artwork Discovery

### 25.1 Gallery sections

- Latest artworks.
- Featured artworks.
- Challenge winners.
- Animated artwork.
- Video artwork.
- Open-for-critique artwork.

### 25.2 Filters

- Media type.
- Art category.
- Medium.
- Software.
- Original/fanart.
- Challenge.
- Artist.
- Critique availability.

Database search/filtering is sufficient for the expected community size. A separate search engine is not required.

### 25.3 Tag governance

- Admin controls core categories, media types, specialties, and software values.
- Artists may add free-form descriptive tags.
- Moderators may merge, rename, or remove inappropriate/duplicated tags.
- Controlled software selection includes `Other`.

This avoids fragmenting filters through values such as `Photoshop`, `Adobe Photoshop`, and `PS`.

### 25.4 Sorting

- Newest.
- Oldest.
- Artist name.
- Featured.
- Random discovery.

Do not provide a popularity sort unless likes, favorites, or view-count metrics are explicitly added later.

### 25.5 Artwork detail page

- Correct media viewer.
- Title.
- Artist name and profile link.
- Description.
- Tags and software.
- Creation/publication date.
- Challenge origin and result where applicable.
- Critique mode.
- Comments.
- Share action.
- Copyright/ownership statement.
- Related artwork.

### 25.6 Full-quality member access

If full-quality media is displayed in a browser, a member can technically save it. The product must not claim otherwise.

Community policy should state that full-quality media is shared with trusted members for viewing and must not be redistributed.

### 25.7 Explicit social-network exclusions

Unless later approved, the product does not include:

- Follow system.
- Direct messages.
- General likes/reactions.
- Favorites/bookmarks.
- Reposts.
- Public view counters.
- Public artist rankings.

Stars remain exclusive to challenge voting.

---

## 26. Guest Landing Page

The guest landing page must answer:

1. What is this community?
2. What artwork does it create?
3. Which artists can a visitor discover or commission?
4. What is happening now?
5. How does an existing member sign in?

### 26.1 Recommended sections

1. **Hero**
   - Community name.
   - Short value proposition.
   - Explore Gallery CTA.
   - Find an Artist CTA.
   - Returning Member Login.

2. **Featured artwork**
   - Curated public artwork using watermarked derivatives.

3. **Featured Artist**
   - Artist identity, short bio, three selected works, and commission status.

4. **Artists open for commission**
   - Small curated/rotating selection and link to the full commission directory.

5. **Current challenge**
   - Visible challenge banner, status, and deadline; guest view only.

6. **Recent community activity**
   - Public-safe system events only.

7. **About the community**
   - Short history, purpose, and official social links.

8. **Footer**
   - About, Community Guidelines, Privacy, Terms, Copyright/Takedown, social links, and member login.

The landing page must not advertise open registration because first-time membership is invitation-only.

### 26.2 Structured content administration

Do not build a general-purpose page builder. Admin-editable structured fields are sufficient:

- Hero title and description.
- CTA labels/targets.
- About text.
- Official social links.
- Featured artwork selections.
- Section visibility and order.
- Footer links.
- Optional announcement banner.

---

## 27. Artist Directory

### 27.1 Artist card

- Avatar.
- Display name.
- Short bio.
- Specialties.
- Selected artwork thumbnails.
- Commission status.
- Achievement badges.

### 27.2 Filters and sorting

- Display-name search.
- Specialty.
- Medium.
- Software.
- Commission status.
- Featured Artist history.
- Alphabetical or recently updated sorting.

### 27.3 Directory eligibility

A profile appears only when:

- Its lifecycle is `ACTIVE_PUBLIC`.
- Required profile fields are complete.
- The member is active and not suspended/deleted.
- At least one visible portfolio artwork exists.

The artist directory is distinct from the commission directory; artists may appear even when commissions are closed.

---

## 28. Comments and Critique

### 28.1 Baseline behaviour

- Only active members can create comments.
- General appreciation on public artwork may be read by guests.
- Technical critique is visible only to authenticated members.
- Use flat comments initially; nested reply threads are not required.
- Authors can edit comments with an `edited` marker.
- Authors can soft-delete their own comments.
- Artwork owners and moderators can report/hide comments but cannot rewrite another member’s content.
- Rate-limit repeated comments.
- Sanitize all comment content.
- Do not allow comment attachments.

### 28.2 Critique mode

When `showcase_only` is selected:

- Appreciation comments are allowed.
- UI communicates that technical critique was not requested.

When `open_for_critique` is selected:

- Technical critique is allowed.
- UI may encourage constructive topics such as composition, anatomy, color, lighting, and technique.

The system does not automatically judge whether a comment is constructive.

---

## 29. In-App Notifications

An in-app notification system is required because several workflows depend on user-facing updates.

### 29.1 Notification events

- Appreciation comment received.
- Critique received.
- Artwork hidden/restored.
- Report resolved.
- Challenge submission status changed.
- Stars returned after disqualification.
- Jury assignment added/removed.
- Jury slot changed.
- Challenge deadline reminder.
- Featured Artist selection.
- Account warning/suspension.
- Monthly admin spotlight reminder.

### 29.2 Notification properties

- Recipient.
- Type.
- Target type and ID.
- Read/unread state.
- Creation timestamp.
- Optional expiry.
- Priority.
- Action URL.

The initial delivery channel is in-app only. Email and WhatsApp notifications remain out of scope.

Critical moderation/account notices cannot be suppressed. Ordinary activity notifications may be controlled through preferences.

---

## 30. Activity Feed and Featured Artist

### 30.1 Activity feed

The activity feed is generated from structured system events; it is not a member-posting feature.

Eligible public events:

- New public artwork.
- Artist opens commissions.
- Challenge opens.
- Challenge results are published.
- Featured Artist is published.

Rules:

- Never expose private/member-only content.
- Remove feed visibility when its source becomes hidden.
- Deduplicate repeated commission-status changes.
- Do not create events for minor profile edits.
- Store structured event data rather than final display sentences.

### 30.2 Featured Artist

- At most one active spotlight per calendar month in `Asia/Makassar`.
- Store artist, curator, description, three selected public artworks, state, visibility, and publication time.
- Support draft and published states.
- Preserve spotlight history.
- Link previous spotlight achievements from artist profiles.
- If a new spotlight is not selected, retain the previous spotlight and continue the admin reminder rather than showing an empty section.

---

## 31. Non-Challenge Administration

### 31.1 Member management

- Search/filter members.
- Review profile completeness.
- Assign/remove moderator role.
- Suspend, revoke, or reactivate membership.
- Assign badges.
- Review storage usage.
- Review moderation history.

### 31.2 Content management

- Landing-page structured fields.
- About content.
- Community social links.
- Navigation/footer links.
- Announcement banner.
- Featured gallery selections.

### 31.3 Gallery administration

- Review reported/hidden artwork.
- Inspect failed media jobs.
- Retry safe processing failures.
- Clean and merge taxonomy values.
- Apply bulk visibility actions where safe.

### 31.4 Commission administration

- Review reported services.
- Review broken/unsafe external links.
- Review public contact-consent settings.
- Override service visibility with an audited reason.

### 31.5 Site settings

- Upload size, dimension, duration, and frame limits.
- Public derivative resolution/bitrate.
- Watermark asset, placement, and opacity.
- Controlled software/category/specialty taxonomy.
- Comment rate limits.
- Spotlight reminder behaviour.

---

## 32. Account and Content Ownership

Recommended policy baseline:

- The artist retains copyright.
- The artist grants the platform permission to display uploaded media according to selected visibility.
- The artist can hide ordinary portfolio content.
- Challenge records and locked result snapshots remain preserved for integrity.
- Soft-deleting an account hides its profile and ordinary portfolio content.
- Challenge history may retain the display name and locked submission snapshot according to the published deletion policy.
- Suspended members cannot upload, comment, vote, or edit commission listings.
- Revoked members lose full-quality member-media access.
- Account export and deletion requests use an administrative workflow.

Required public policy pages:

- Privacy Policy.
- Terms of Use.
- Community Guidelines.
- Copyright/Takedown Process.
- Commission Directory Disclaimer.

---

## 33. Additional Data Model Requirements

| Entity | Purpose |
| --- | --- |
| `profile_slugs` / `slug_redirects` | Stable URLs after profile/artwork slug changes. |
| `profile_specialties` | Controlled artist-specialty relationships. |
| `badges` / `profile_badges` | System/admin achievement assignments. |
| `portfolio_entries` | Ordering, pinning, caption, and profile visibility. |
| `artwork_versions` | Immutable media revisions. |
| `commission_service_examples` | Links commission services to example artworks. |
| `commission_scope_rules` | Artist-level Do/Don't and policy information. |
| `content_pages` | About, Guidelines, Privacy, Terms, and disclaimer content. |
| `site_settings` | Watermark, limits, landing configuration, and taxonomy settings. |
| `notifications` | In-app event delivery. |
| `notification_preferences` | Optional member notification settings. |
| `spotlight_artworks` | Ordered spotlight artwork selection. |

Key content relationship:

```text
Profile
├── Artworks
│   ├── Artwork versions
│   └── Portfolio entries
├── Commission services
│   └── Example artworks
└── Badges

Challenge submission
└── References one locked artwork version
```

---

## 34. Cross-Cutting Public Experience Requirements

### 34.1 SEO

- Index public pages only.
- Apply `noindex` to member, admin, authentication, unlisted, private, and protected-media routes.
- Use canonical public URLs.
- Generate Open Graph metadata for public artists and artworks.
- Maintain a sitemap for public content.
- Redirect old public slugs.

### 34.2 Accessibility

- Keyboard-accessible navigation, menus, dialogs, and static-image lightbox.
- Visible focus states.
- Artwork alternative text.
- Reduced-motion support.
- Optional captions/descriptions for video artwork.
- Sufficient color contrast.
- Status indicators that do not rely only on color.

### 34.3 Performance

- Responsive thumbnails and media sources.
- Lazy-load gallery content.
- Paginate or cursor-load long grids/feeds.
- Generate poster images for video.
- Cache public pages and derivatives.
- Never load master files in landing/gallery grids.
- Avoid loading complete directories or activity history in one response.

### 34.4 Privacy

- Require explicit public WhatsApp consent.
- Do not expose email addresses publicly by default.
- Respect source visibility in activity and search.
- Remove hidden/suspended profiles from directory, sitemap, and public search.
- Never expose audit information to ordinary members.

---

## 35. Non-Challenge Acceptance Checklist

### Profiles and directories

- [ ] Incomplete/hidden/suspended/deleted profiles do not enter public directories.
- [ ] Slug changes preserve old links without exposing private profiles.
- [ ] Members cannot self-assign achievement badges.
- [ ] Artist and commission directories remain distinct.

### Artwork and portfolio

- [ ] Replacing media creates a new immutable artwork version.
- [ ] A challenge submission remains attached to its locked version.
- [ ] Hiding a portfolio entry does not delete challenge history.
- [ ] Every audience option enforces the correct media variant and authorization.
- [ ] Hidden/private content does not appear in gallery, search, activity, sitemap, or Open Graph metadata.

### Commissions

- [ ] Global and per-service availability behave independently.
- [ ] Public WhatsApp links require explicit consent.
- [ ] Closed artists are excluded from the default commission listing.
- [ ] External links are validated and safely rendered.
- [ ] The platform does not create internal order/payment records.

### Landing and discovery

- [ ] Guest pages never load master media.
- [ ] Landing sections tolerate missing content without broken layouts.
- [ ] Invitation-only registration is communicated correctly.
- [ ] Filters use normalized controlled fields where required.
- [ ] Public sitemap contains only visible public resources.

### Comments, notifications, and activity

- [ ] Only active members can comment.
- [ ] Critique visibility follows the artwork critique mode and audience rules.
- [ ] Comment edits/deletions preserve moderation evidence.
- [ ] Critical notifications cannot be suppressed.
- [ ] Activity events disappear when their source is no longer public.
- [ ] Repeated commission toggles do not spam the activity feed.

### Featured Artist and administration

- [ ] At most one spotlight is active for a month.
- [ ] Spotlight works must be public and visible.
- [ ] Admin overrides require an audit reason.
- [ ] Media-processing retries do not create duplicate files or records.

---

## 36. Non-Challenge Implementation Sequence

- [ ] Establish the canonical artwork/version/portfolio/submission relationship.
- [ ] Implement profile lifecycle, onboarding, slugs, redirects, badges, and account-removal behaviour.
- [ ] Implement commission-directory boundaries, service lifecycle, availability, and contact consent.
- [ ] Implement artwork audience, publication lifecycle, taxonomy, sorting, and detail pages.
- [ ] Implement guest landing sections and structured content administration.
- [ ] Implement artist-directory eligibility, cards, filters, and sorting.
- [ ] Implement comment visibility, critique behaviour, editing, reporting, and rate limiting.
- [ ] Implement in-app notifications and public activity events.
- [ ] Implement Featured Artist scheduling, history, and fallback behaviour.
- [ ] Complete non-challenge acceptance testing before declaring the platform feature-complete.
