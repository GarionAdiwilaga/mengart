# Permanent Project Decisions

## 2026-08-25

### Baseline Specification Adoption
**Decision:** Adopt `Art_Community_App_Implementation_Blueprint_2.1.md` as the authoritative product requirement and agent baseline.
**Business Rule:** Target scale is ~100 active community members, low admin overhead, strict server-side authorization, immutable submission history, dual media variants (`master_clean` vs `public_watermarked`), UTC timestamps formatted in `Asia/Makassar` (WITA). Payments, escrow, WhatsApp bots, and AI detection are explicitly out of scope.
**Reason:** Documented in project baseline blueprint v2.1.0.

### Confirmed Technology Stack (Option A)
**Decision:** Confirmed **Option A: Next.js 15 (App Router, React 19, TypeScript)** as the fullstack web architecture.
- **Backend & Frontend:** Next.js 15 Fullstack (Server Components + Server Actions / Route Handlers)
- **Database & ORM:** PostgreSQL + Drizzle ORM
- **Queue & Async Worker:** BullMQ + Redis + `sharp` / `ffmpeg`
- **Styling & Components:** Tailwind CSS v4 + `shadcn/ui` + Lucide Icons
- **Auth:** NextAuth.js / Auth.js with Google OAuth 2.0 + custom hashed invite redemption middleware
**Business Rule:** Strict TypeScript throughout codebase; all API endpoints enforce server-side validation (Zod).
**Reason:** Selected by user for integrated SSR Open Graph metadata, unified TypeScript DX, and streamlined Docker deployment.

### Resource Capacity Update
**Decision:** Updated hardware resource assumptions to reflect 15 GiB total RAM (~14 GiB idle available). Media worker concurrency can be increased beyond 1 worker process, and image/video operations (Sharp/FFmpeg) can execute with parallel threads safely without risk of OOM.
**Business Rule:** Utilize available memory for faster media processing queues and thumbnail generation.
**Reason:** Clarified hardware environment with user.

### Cloudflare ZeroTrust & Reverse Proxy Compatibility
**Decision:** Ensure application architecture seamlessly supports Cloudflare Tunnel (`cloudflared`) and Nginx reverse proxy publishing.
**Business Rule:** Trust `X-Forwarded-Proto`, `CF-Connecting-IP`, and `X-Forwarded-For` proxy headers. Enforce `SameSite=Lax` / `Secure` HTTP-only session cookies and maintain absolute protocol-relative asset URLs.
**Reason:** Production deployment will be published via Cloudflare ZeroTrust behind a reverse proxy.

### Phase Sequence Refinements (Approved)
**Decision:** Adopt the 8-phase delivery sequence with two user-approved structural refinements:
1. **Canonical Artwork & Versioning in Phase 1 & 2:** Ensure `artwork_versions` and entity relationships (Artwork -> Artwork Version -> Submission) are established upfront in DB migrations to avoid breaking schema changes in Phase 3.
2. **Notification Core in Phase 2:** Build the in-app notification engine (`notifications` table + event triggers) during Phase 2 so Phase 3 (Challenges) and Phase 4 (Voting/Jury) can immediately trigger disqualification, Star refund, and assignment notifications.
**Business Rule:** No breaking schema refactors across mid-stage phases.
**Reason:** Clean cross-cutting integration for notifications and versioning across submission and voting lifecycle; explicitly approved by user.

## 2026-08-26

### Frontend Design System & Theme Direction
**Decision:** Adopt **Concept 1: "Studio Atelier / Warm Obsidian & Gallery Amber"** as the core visual design language.
- **Palette:** Warm obsidian dark canvas (`#0e1015`), layered charcoal surfaces, amber/gold accent glow (`#f59e0b` for Stars/badges), 1px subtle glass hairlines (`border-white/10`).
- **Typography:** *Syne* (expressive display headings), *Plus Jakarta Sans* (crisp, modern body), *JetBrains Mono* (software tags, WITA timestamps, metadata).
- **Component System:** Tailwind CSS v4 CSS-first design tokens + `shadcn/ui` + Lucide Icons.
**Business Rule:** Artwork is the hero; UI chrome must remain restrained, atmospheric, and high-craft.
**Reason:** Selected by user to give the digital art community a distinctive, atelier-grade gallery feel.

### Challenge Candidate Display & Voting Fairness Architecture
**Decision:** Implement an anti-bias candidate presentation system for challenge galleries (handling 8 to 20+ submissions without scroll fatigue or positional unfairness):
1. **Per-Voter Deterministic Randomization:** Candidate grid order is randomized per voter session so no single submission is perpetually stuck at the bottom or top of the page.
2. **Dual Discovery Views:**
   - *Balanced Atelier Grid:* Responsive multi-column grid with equal-weight cards, quick jump index, and remaining stars sticky capsule.
   - *Focus/Comparison Deck:* Fullscreen swipeable/keyboard-navigable slide deck allowing members to evaluate candidates one-by-one with full detail and side-by-side comparison.
3. **Ballot Review Dock:** A sticky drawer/bar summarizing spent and remaining Stars, highlighting unviewed/unvoted candidates before submission.
**Business Rule:** Every candidate must have equal visual prominence and discovery fairness during voting rounds.
### Studio Atelier Style Guide & Design Token Standards
**Decision:** Adopt `studio-atelier-frontend-style-guide.md` as the authoritative frontend design specification.
- **Palette & Tokens:** CSS-first tokens in `src/app/globals.css` with exact values: `canvas` (`#0E1015`), `canvas-elevated` (`#13161D`), `surface-1` (`#191C23`), `surface-2` (`#20232C`), `surface-3` (`#292D37`), `text-primary` (`#F6F2E9`), `amber-500` (`#F59E0B`), `border-subtle` (`rgba(255,255,255,0.10)`).
- **One-Amber Rule:** Amber is restricted to primary actions, Stars, active stages, and awards. No decorative amber clutter.
- **Component Baseline:** shadcn/ui with New York style as structural base, customized to Studio Atelier design tokens.
**Business Rule:** Artwork fidelity must never be altered (no color tints or decorative overlays on images).
**Reason:** Documented in style guide baseline.

### UI Language & Terminology Standards
**Decision:** Default user interface language is natural Bahasa Indonesia, actively incorporating standard English terms widely used in the digital art community:
- Commission Hub: `Commission`, `Open for Commission`, `Waitlist`, `Slots`, `Do / Don't`
- Challenge & Voting: `Challenge`, `Submission`, `Voting`, `Stars`, `Jury`, `Hall of Fame`
- Artwork & Gallery: `Artwork`, `Portfolio`, `Gallery`, `Master Quality`, `Watermarked Preview`, `Lightbox`, `Focus Mode`
- Technical & System: `Software`, `GIF`, `Video`, `WITA`, `Dashboard`, `Login`
- **Date & Time Display:** Absolute WITA timestamps (`Asia/Makassar` / UTC+8), e.g., `18 Agu 2026, 23.59 WITA`.
**Business Rule:** Blend natural Indonesian phrasing with familiar art ecosystem terminology to avoid awkward literal translations.
**Reason:** Clarified by user and aligned with community expectations.

### Discord-style Short & Custom Vanity Invitation Codes
**Decision:** Transition default invitation tokens from 64-character random hex strings to human-friendly 8-character base58/alphanumeric short codes (e.g. `a7K9xQ2v`, `SVcqWf3G`), and allow administrators/moderators to optionally specify custom vanity invite codes (e.g. `komorebi`, `atelier-vip-2026`, `batch-2`).
**Business Rule:** 
- Default generated tokens are 8 characters long, avoiding ambiguous characters (0, O, 1, l, I).
- Custom vanity codes must be between 3 and 32 characters, matching `/^[a-zA-Z0-9_-]+$/`, and must be unique among active/unexpired invitations.
- Tokens continue to be hashed with SHA-256 (`tokenHash`) for database storage so raw custom/short tokens remain secure.
- Invitation URLs and manual code inputs support both short codes and custom vanity codes seamlessly (e.g., `/invite/komorebi` or `/invite/a7K9xQ2v`).
**Reason:** User requested short and customizable invitation codes like Discord for clean sharing and memorable vanity links.

### Email/Password Auth, Automatic Google Merging & Invitation Code Parsing
**Decision:** 
1. Support dual authentication: Google OAuth 2.0 and manual Email/Password (`CredentialsProvider`).
2. Automatic Account Merging: When a user registers with email/password and later signs in via Google using the same email, NextAuth will automatically link their `googleId` to their existing account without duplicating records or losing their portfolio.
3. Email Verification: Password-based registrations require email verification before active login. Google OAuth registrations automatically satisfy email verification.
4. Flexible Invitation Entry: On `/invite` and `/login`, allow manual entry of invitation tokens or full invitation URLs (intelligently regex-extracting token from URLs).
**Business Rule:** Preserve invite-only access across all registration methods while preventing fragmented multiple accounts for the same creator.
**Reason:** Requested by user for flexibility and account consolidation.

## 2026-08-27

### Frontend Architecture Modernization (React Query, Zustand & Framer Motion)
**Decision:** Upgrade and unify the frontend architecture using **React 19 + TypeScript**, **Zustand** (modular client UI stores: `useModalStore`, `useLightboxStore`, `useVotingStore`, `useGalleryFilterStore`), **TanStack React Query** (`@tanstack/react-query` for asynchronous server state, mutations, and caching), **Radix UI Primitives & shadcn/ui**, **Tailwind CSS v4** (Studio Atelier design tokens), and **Framer Motion** (`framer-motion` for fluid micro-interactions, layout transitions, and pan/zoom physics).
**Business Rule:**
- Universal persistent `AppHeader` across all views with global search shortcut (`Cmd+K`), notification drawer, quick upload CTA, and avatar dropdown with dedicated Studio vs Admin Switcher.
- Clear separation between **Member Artist Studio** (`/me/*`) and **System Admin Command Center** (`/admin/*`).
- Contextual admin overlays (`ArtworkAdminMenu`) accessible on every artwork card for instant spotlight curation or moderation takedowns without leaving gallery views.
- Full invite codes with 1-click copy buttons, redemption logs drawer, and status filters.
**Reason:** User requested architectural stack modernization and a complete UX overhaul from MVP into a mature, production-ready atelier platform.
