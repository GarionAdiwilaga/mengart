# Handoff Context — Gate D: Authentication, Invitations, Membership & Roles (Blueprint 2.2.2 Correction)

**Date:** 2026-08-30  
**Gate C Baseline Commit:** `94ab50040bf226039fc5c1a1f464faf9d95236a5`  
**Unapproved Base Gate D Commit:** `5496c2f5e7b3fda1806d6054b6401652bd3abb1a`  
**Current Phase:** Gate D (Authentication, Invitations, Membership & Roles — Blueprint 2.2.2) — **COMPLETED & 100% VERIFIED**

## Session Summary
- **Gate D Implementation & Blueprint 2.2.2 Correction Completed & Verified:**
  1. **Google-Only OAuth Authentication:** Migrated NextAuth in `src/auth.ts` to exclusive Google OAuth 2.0. Completely removed credentials provider, bcrypt password hashing, and SMTP verification/password reset flows. Dropped `password_hash` column and deprecated token tables without cascade.
  2. **Strict Google Identity Resolution (`resolveGoogleSignInIdentity`):** Enforces literal `profile.email_verified === true` (rejects `false`, `undefined`, `null`, and missing claims), lowercases emails, binds Google IDs to existing verified accounts, and fails closed on collisions and deleted accounts.
  3. **PENDING_INVITE Separation from Persistent Membership:** Persistent membership states in PostgreSQL enum `membership_status` are strictly `active | suspended | deleted` (nullable, no default). Authenticated Google users start with `membership_status IS NULL` (`PENDING_INVITE` derived state).
  4. **Direct Discord-Style Invitation Codes & Admin Management:** Stored invitation codes directly as unique plaintext `membership_invites.code`. Dropped `token_hash` and `token_prefix`. Generated codes use unbiased CSPRNG producing 8 alphanumeric chars `[A-Za-z0-9]`. Custom codes are normalized to lowercase `[a-z0-9-]` (max length 25). Admins can list, view, and copy actual stored codes and links. Moderators denied invite administration.
  5. **Deterministic Two-Phase Locking Redemption:** `redeemInviteService` locks `users` FOR UPDATE then `membership_invites` FOR UPDATE by `code`. Enforces transition matrix: `NULL -> ACTIVE` only (invite consumed); `ACTIVE -> ACTIVE` idempotent pass-through (zero usage consumed); `SUSPENDED` and `DELETED` rejected.
  6. **OAuth Continuation Invariant:** Removed Server Component cookie mutations. Pre-login Server Action sets HttpOnly cookie `mengart_pending_invite` (TTL 15m). Google OAuth initiates with clean callback `/api/auth/redeem-callback` (zero query tokens). Production route handler `/api/auth/redeem-callback` reads cookie, executes `redeemInviteService`, deletes cookie across all terminal paths, and redirects cleanly.
  7. **Preserved Profile Privacy:** `updateUserStatusAction` leaves `profiles.profileStatus` unchanged (`active_hidden` preserved across suspension/reactivation).
  8. **Live Staff Authorization:** Replaced role-only session checks with live database assertions (`requireModerator()`, `requireAdmin()`). Suspended staff members lose authority immediately.
  9. **Master Clean-Media Authorization Invariant:** Strictly requires `membershipStatus === 'active'` AND independent passage of Gate A media ACL (`canAccessMasterMedia`). Suspended artwork owners receive 403 Forbidden.
  10. **Last-Active-Admin Invariant Protection:** Advisory lock (`pg_advisory_xact_lock(4281729)`) serializes staff mutations, preventing the system from reaching 0 active Admins.
  11. **Forward Migration 0011 & Scenario 8 Verification:** `drizzle/0011_gate_d_auth_roles_membership.sql` verified with email collisions fail-closed (`RAISE EXCEPTION`), email lowercase normalization, `uniq_users_lower_email` index, direct `membership_invites.code`, and `uniq_membership_invites_code`.
  12. **Full Test Matrix:**
      - `npm run test:migrate`: 8/8 scenarios passed (including Scenario 8A & 8B).
      - `npx tsx src/lib/__tests__/testPhase4AuthAndInvites.ts`: 20/20 scenarios passed.
      - `npx tsx src/lib/__tests__/testPhase2VotingAndTiebreak.ts`: 20/20 scenarios passed.
      - `npx tsx src/lib/__tests__/testPhase3SimplifiedJury.ts`: 63/63 scenarios passed.
      - `npm run test:all`: 14/14 test suites passed cleanly.
      - `npm run lint`: 0 errors.
      - `npm run build`: Production build and worker bundle compiled cleanly.

## Next Steps
- Submit Gate D for independent QA review.
- Commit complete implementation, report `GATE_D_SHA`, and export format-patch artifact `gated.patch`.
- Stop after Gate D. Do NOT begin Gate E until Gate D is formally closed.
