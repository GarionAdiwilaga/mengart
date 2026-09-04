# Mengart — Digital Art Collective & Private Atelier Platform

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.3-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0.0-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.39-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Production Ready](https://img.shields.io/badge/Status-Production_Ready_100%25-10B981?style=for-the-badge)](https://github.com/GarionAdiwilaga/mengart)

**Mengart** is an invitation-only digital art collective and atelier platform engineered for ~100 active creators. Designed with the **Studio Atelier** aesthetic (*Warm Obsidian & Gallery Amber*), Mengart combines high-craft visual presentation with rigorous server-side invariants: privacy-first dual-variant media pipelines, anti-bias Star voting, unranked dynamic jury awards, Discord-style plaintext bearer invitations, client-side 9:16 Canvas Story Cards, and zero-debt database architecture.

---

## 🏛️ Table of Contents

- [Architectural Highlights](#-architectural-highlights)
- [Design System & Frontend Craft](#-design-system--frontend-craft)
- [Domain Systems & Invariants](#-domain-systems--invariants)
  - [1. Authentication & Discord-Style Invites](#1-authentication--discord-style-invites)
  - [2. Dual Media Pipeline & Content Safety](#2-dual-media-pipeline--content-safety)
  - [3. Artwork Presentation & Spoiler UX](#3-artwork-presentation--spoiler-ux)
  - [4. Challenge Lifecycle & Anti-Bias Voting](#4-challenge-lifecycle--anti-bias-voting)
  - [5. Dynamic Jury & Recorder Model](#5-dynamic-jury--recorder-model)
  - [6. Community Comments & Curated Spotlight](#6-community-comments--curated-spotlight)
  - [7. 9:16 Canvas Story Card Generator](#7-916-canvas-story-card-generator)
- [Technology Stack](#-technology-stack)
- [Repository Structure](#-repository-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Database Setup & Migrations](#database-setup--migrations)
  - [Running the Application](#running-the-application)
- [Comprehensive Verification Matrix](#-comprehensive-verification-matrix)
- [Production Deployment & DevOps](#-production-deployment--devops)
- [Release Gates & Zero-Debt History](#-release-gates--zero-debt-history)
- [License](#-license)

---

## 🌟 Architectural Highlights

* **Zero Legacy Debt Policy:** Completely purged of deprecated MVP structures. Post-Gate-H migration `0014` and baseline revision `0015` eliminated legacy columns (`quorum_requirement`, `allow_revisions`, `round_sequence`, `critique_aspect`, `winner_slot_id`), deprecated enums (`critique_aspect`, `slot_type`, `'gif'`), and obsolete tables (`challenge_jury_scores`, `challenge_jury_slot_assignments`, `challenge_winner_slots`).
* **Single Authoritative Media Validation Engine:** Sniffs raw magic bytes before disk promotion. Accepts strictly static images (PNG, JPEG, WebP $\le$ 25MB) and MP4 video (H.264 + AAC or silent $\le$ 50MB, zero duration limit). Explicitly rejects GIF87a/89a, WebM, MKV, QuickTime `.mov`, SVG, and executables fail-closed.
* **Dual-Variant Media Architecture:** Resolution-limited WebP/MP4 derivatives ($\le 1920$px, zero watermarks) for public viewing; pristine original master files protected behind Gate A / Gate D Access Control Lists (accessible only to verified owners and active staff).
* **Deterministic Two-Phase Locking (2PL):** Concurrency-critical database mutations (invitation redemptions, ballot voting, jury assignments, staff demotions) utilize PostgreSQL row-level locks (`FOR UPDATE`) and transaction advisory locks to guarantee zero race conditions.
* **Tiered Sliding-Window Rate Limiting:** 14 write surfaces protected via Redis sliding windows. Graceful degradation: Security-critical actions fail closed on Redis outages; low-risk user profile/commission edits fail open with warnings to preserve uptime.
* **WITA Operational Timezone:** Timestamps and deadlines natively stored in UTC and rendered in absolute WITA (`Asia/Makassar` / UTC+8), reflecting community operating rhythms.

---

## 🎨 Design System & Frontend Craft

Mengart is styled strictly under the **Studio Atelier / Warm Obsidian & Gallery Amber** design specification:

* **Canvas & Surfaces:** Warm obsidian dark canvas (`#0e1015`), layered elevated charcoal cards (`#13161d`, `#191c23`, `#20232c`), 1px subtle glass hairlines (`border-white/10`).
* **The "One-Amber" Rule:** Restrained use of warm amber/gold (`#f59e0b` / Tailwind `amber-500`) reserved exclusively for primary interactive calls-to-action, Stars, active challenge stages, and award badges. No decorative amber clutter.
* **Typography Hierarchy:**
  * **Display & Headings:** *Syne* (expressive, artistic, bold).
  * **Body & Interface:** *Plus Jakarta Sans* (clean, legible, modern geometric sans).
  * **Metadata & Timestamps:** *JetBrains Mono* (software tags, WITA timestamps, invite codes, telemetry).
* **Mobile-First Touch Ergonomics:** Persistent thumb-first `MobileBottomNav` with safe-area inset adaptation (`env(safe-area-inset-bottom)`), $\ge 44$px touch targets, mobile stacked table views, and font-size clamping (`text-base sm:text-xs`) to prevent iOS Safari auto-zoom.

---

## ⚙️ Domain Systems & Invariants

### 1. Authentication & Discord-Style Invites
* **Google-Only OAuth 2.0:** Eliminates passwords, bcrypt hashing, and SMTP verification tokens. Requires verified Google identities (`profile.email_verified === true`).
* **Pending Invite Separation:** Authenticated accounts awaiting onboarding exist in a derived `PENDING_INVITE` state (`users.membership_status IS NULL`).
* **Direct Bearer Codes:**
  * Default generated codes use an unbiased CSPRNG (`crypto.randomInt(0, 62)`) producing exactly **8 alphanumeric characters** (`[A-Za-z0-9]`).
  * Custom vanity codes are normalized to lowercase `[a-z0-9-]`, $\le 25$ characters, with a reserved system keyword filter (`admin`, `api`, `dashboard`, etc.).
  * Stored uniquely as plaintext in `membership_invites.code`.
* **Admin-Only Management:** Active Admins can create, list, view bearer codes, copy raw codes, copy direct `/invite/<code>` links, and revoke invites.
* **OAuth Continuation:** Landing on an invite sets an HttpOnly cookie (`mengart_pending_invite`, TTL 15m). Google OAuth redirects to clean `/api/auth/redeem-callback` without token query leaks, redeeming the invite and clearing the cookie.

### 2. Dual Media Pipeline & Content Safety
* **Strict Format Enforcement:**
  * Images: JPEG (`ffd8ff`), PNG (`89504e470d0a1a0a`), WebP (`52494646...WEBP`), $\le 25$MB.
  * Video: MP4 container (`ftypisom`, `iso2`, `mp41`, `mp42`, `avc1`, `dash`, `m4v`), H.264 video codec, AAC audio or silent, $\le 50$MB, no duration limit.
* **Zero Watermarks on Public Derivatives:** High-DPI master originals are preserved. Public derivatives are resized/compressed to $\le 1920$px WebP or H.264 MP4 with stripped metadata and zero visual watermark overlays.
* **Asynchronous Queue Worker:** Powered by BullMQ + Redis with concurrency clamping, processing non-blocking background conversions, video posters, and 400x400 grid thumbnails.

### 3. Artwork Presentation & Spoiler UX
* **Artist-Controlled Spoiler Flag:** Creators can toggle `is_spoiler` on artwork creation, editing, or direct challenge submission.
* **Unrevealed State:**
  * In gallery grids (`ArtworkCard`), unrevealed spoiler artworks render with a heavy blur filter (`blur-xl`), generic safe alt text (`"Konten spoiler tersembunyi"`), a spoiler warning badge, and an interactive **"Buka Konten"** button.
  * In the full viewer (`ArtworkLightbox`), unrevealed spoilers render with `blur-2xl`, a centered warning modal card, and a **"Tampilkan Karya"** reveal button.
* **Authoritative Invariants:** Flagging an artwork as a spoiler never alters audience status, publication visibility, media ACL, contest eligibility, or Star voting tallies.

### 4. Challenge Lifecycle & Anti-Bias Voting
* **Authoritative Lifecycle State Machine:**
  $$\text{draft} \longrightarrow \text{scheduled} \longrightarrow \text{submission\_open} \longrightarrow \text{submission\_locked} \longrightarrow \text{voting\_open} \longrightarrow \text{tie\_pending} \mid \text{tiebreak\_open} \mid \text{jury\_selection\_open} \longrightarrow \text{finished}$$
* **4 Award Modes:** `vote_and_jury`, `vote_only`, `jury_only`, and `showcase_only`.
* **Anti-Bias Discovery:** Candidate grids apply a deterministic per-voter seed shuffle so no candidate remains permanently at the top or bottom of the gallery.
* **Star Allocation:** Members receive a configurable star allowance (default 1 Star/member). Enforces non-negative finite integer allocations, anti-self voting, and candidate whitelists.
* **Tie Resolution:** Single official Community Winner (`award_type = 'community_vote_winner'`). Ties for Rank #1 transition to `tie_pending`, allowing staff to start a single tiebreak round (seq 2, 1 Star/member) or resolve manually with an audit log.

### 5. Dynamic Jury & Recorder Model
* **Dynamic Category Awards:** Replaced rigid winner slots and numeric 1–100 scoring with free-text category labels (e.g. *"Best Lighting"*, *"Visual Narrative"*, defaulting to *"Jury Winner"*).
* **Single Designated Recorder:** Displayed jury panel with exactly one Jury Recorder (`is_recorder = true`). Recorder/Admin hold draft award edit authority during `JURY_SELECTION_OPEN`.
* **Mixed Mode Exclusion:** In `vote_and_jury` challenges, the resolved Community Winner is strictly excluded from receiving a Jury Award.
* **Governance Results Revocation:** Finished challenges can be revoked to `results_revoked` with an immutable audit snapshot, allowing Admin/Moderators to replace/clear winners before republishing.

### 6. Community Comments & Curated Spotlight
* **Unified Simple Comments Stream:** Author editing with an explicit `(diedit)` indicator, author soft-deletion, and staff hide/restore moderation with mandatory $\ge 5$ character reason and audit trails.
* **"Kritik Dipersilakan" Social Badge:** Artwork critique mode is treated as a social indicator ("Kritik Dipersilakan" or "Showcase") and does not block commenting.
* **Manual Featured Artist:** Strictly curated by Administrators (`monthly_spotlights`). Automated background crons and reminder notifications are eliminated. Soft-deletion columns and partial unique index `(year, month) WHERE deleted_at IS NULL` allow clean replacement curation while archiving history.

### 7. 9:16 Canvas Story Card Generator
* **Client-Side High-DPI Canvas:** Exports exact $1080 \times 1920$ px PNG story cards directly in the browser without server-side render queues.
* **Dual Rendering Modes:**
  * **Results Mode:** Renders Challenge Title, Winner Artwork, Artist Alias, and unranked Award Badges (zero synthetic `#null` or `#2` numbers).
  * **Announcement Mode:** Renders Challenge Banner and submission deadlines formatted in absolute WITA.
* **Sharing:** Native Web Share API (`navigator.share`) with automatic PNG download fallback.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack, Server Actions, Route Handlers) |
| **Runtime & Language** | Node.js 20+ LTS, TypeScript 5.7, React 19 |
| **Database & ORM** | PostgreSQL 16, Drizzle ORM 0.39, `drizzle-kit` |
| **Queue & Cache** | BullMQ 5.41, Redis 7 (AOF persistence), `ioredis` |
| **Media Processing** | `sharp` (decompression bomb protection, WebP), `ffmpeg` / `ffprobe` |
| **Styling & UI** | Tailwind CSS v4, `shadcn/ui` (New York style), Lucide Icons, Framer Motion |
| **Client State** | Zustand 5.0, TanStack React Query 5.102 |
| **Authentication** | NextAuth.js / Auth.js v5 beta (Google OAuth 2.0 only) |
| **Validation & Schema**| Zod 3.24, Content Sniffing Magic Bytes |
| **Testing & Auditing** | Playwright 1.62, TSX custom runner, Chrome DevTools MCP |

---

## 📁 Repository Structure

```text
mengart/
├── .agents/                    # Agent shared memory, rules, and specialized skills
├── .gstack/qa-reports/         # Comprehensive QA audit reports and baseline screenshots
├── drizzle/                    # PostgreSQL migrations (0000_... to 0015_prune_gif_media_type.sql)
│   └── meta/_journal.json      # Drizzle migration journal
├── e2e/                        # Playwright End-to-End test suites
│   ├── final-production-qa.spec.ts
│   └── gate-g-journeys.spec.ts
├── public/                     # Static assets and favicon
├── scripts/                    # Operational automation, migration verification, and backups
│   ├── backup.sh               # AES-256 + HMAC-SHA256 encrypted database and media backup
│   ├── restore.sh              # Authenticated archive restoration and verification
│   ├── resetDatabase.ts        # Disposable fixture reset for pre-production environments
│   ├── runScheduler.ts         # CLI challenge transition materializer
│   └── verifyMigrations.ts     # 12-scenario full-chain migration upgrade & invariant test suite
├── src/
│   ├── app/                    # Next.js App Router (pages, layouts, server actions, API routes)
│   │   ├── actions/            # Type-safe Server Actions (artworks, challenges, critiques, invites)
│   │   ├── admin/              # Command Center (diagnostics, invites, users, audits, spotlight)
│   │   ├── api/                # Health probes, protected cron endpoints, media delivery
│   │   ├── artists/            # Public artist profiles and commission status
│   │   ├── artworks/           # Artwork details, lightbox, and critique comments
│   │   ├── challenges/         # Challenge timeline, jury workspace, and results
│   │   ├── commissions/        # Public commissions directory and guidelines
│   │   ├── gallery/            # Public curated artwork gallery with filter controls
│   │   └── invite/             # Discord-style invitation onboarding and redemption
│   ├── auth.ts                 # NextAuth Google OAuth configuration and identity resolver
│   ├── components/             # Reusable UI components (admin, artworks, gallery, jury, ui)
│   ├── db/                     # Drizzle schema definitions and database connection pool
│   ├── hooks/                  # Client-side React hooks (useArtworks, etc.)
│   ├── lib/                    # Domain services, policy engine, rate limiting, and invariants
│   │   ├── __tests__/          # 18 exhaustive integration and invariant test suites
│   │   ├── services/           # Challenge, jury, voting, media, and moderation services
│   │   ├── policy.ts           # Centralized Gate A / Gate D Access Control List (ACL)
│   │   └── rateLimit.ts        # Sliding-window rate limiter with tiered degradation
│   ├── stores/                 # Zustand client stores (gallery filters, modals)
│   └── workers/                # BullMQ media processing background worker
├── CURRENT_STATUS.md           # Handoff document tracking active phases and blockers
├── DECISIONS.md                # Permanent project memory of all architectural decisions
├── DEPLOYMENT.md               # Production operations runbook and topology guide
├── docker-compose.yml          # Production multi-container orchestration
├── Dockerfile                  # Multi-stage production container build
└── package.json                # Dependencies and npm script targets
```

---

## 🚀 Getting Started

### Prerequisites

* **Node.js:** `v20.10.0+` (Node 22 recommended)
* **Package Manager:** `npm` (v10+)
* **Docker & Docker Compose:** For running PostgreSQL and Redis services
* **FFmpeg:** Installed on system (`ffmpeg` and `ffprobe` available on `$PATH`)

### Environment Setup

Create `.env.local` based on `.env.example`:

```bash
cp .env.example .env.local
```

Configure your local credentials:

```ini
# Application
NODE_ENV=development
APP_URL=http://localhost:3000
TIMEZONE=Asia/Makassar

# PostgreSQL Database
POSTGRES_USER=mengart
POSTGRES_PASSWORD=mengart_dev_pass
POSTGRES_DB=mengart_db
POSTGRES_PORT=5433
DATABASE_URL=postgres://mengart:mengart_dev_pass@localhost:5433/mengart_db

# Redis
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# NextAuth / Auth.js
AUTH_SECRET=development_super_secret_session_key_32bytes_minimum
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Storage Root
STORAGE_ROOT=./storage
```

### Database Setup & Migrations

Start local database and redis containers:

```bash
docker compose up -d postgres redis
```

Apply all migrations sequentially:

```bash
npm run db:migrate
```

*(Optional)* Seed standard test accounts:

```bash
npm run db:seed:accounts
```

### Running the Application

Start the Next.js development server:

```bash
npm run dev
```

In a separate terminal, build and run the media background worker:

```bash
npm run build:worker
npm run worker:media
```

Navigate to `http://localhost:3000`.

---

## 🧪 Comprehensive Verification Matrix

Mengart maintains a 100% automated verification standard across migrations, domain services, security policies, concurrency, and browser journeys.

```bash
# 1. Run full-chain PostgreSQL migration tests (12 scenarios including 0014 and 0015 upgrades)
npm run test:migrate

# 2. Run all 18 domain, lifecycle, concurrency, and security test suites
npm run test:all

# 3. Verify TypeScript types and ESLint
npm run lint

# 4. Compile Next.js production build and worker bundle
npm run build

# 5. Execute Playwright End-to-End test journeys
npx playwright test
```

### Key Automated Test Suites

* `scripts/verifyMigrations.ts`: Tests fresh database creation, sequential forward upgrades (0000 through 0015), fail-closed unreset checks, and column/table pruning assertions.
* `testGate1SecurityAndIntegrity.ts`: Verifies master media ACLs, soft deletion, and rate limits.
* `testPhase2VotingAndTiebreak.ts`: Verifies anti-bias shuffle, Star allocation rules, and tiebreak generation.
* `testPhase3SimplifiedJury.ts`: 63 scenarios validating recorder partial uniqueness, unranked awards, and mixed-mode exclusion.
* `testPhase4AuthAndInvites.ts`: 22 scenarios validating Google OAuth, 2PL redemption, surrogate codes, and last-active-admin lock.
* `testGateESubmissionAndPortfolio.ts`: 62 scenarios validating direct canonical submissions and portfolio promotions.
* `testGateFMediaAndRateLimiting.ts`: 28 scenarios testing magic-byte sniffing, GIF/WebM rejection, and MP4 container constraints.
* `testGateHConcurrencyAndDR.ts`: Validates rate limit saturation, Sharp memory clamping, and pool concurrency.
* `testPhase9LegacyCleanup.ts`: Asserts zero deprecated columns/tables/types in database schema.
* `final-production-qa.spec.ts`: Full browser journeys with automated screenshot capture across desktop and mobile viewports.

---

## 🚢 Production Deployment & DevOps

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the complete operations runbook.

### Production Container Orchestration

Mengart provides a multi-stage Docker build producing a minimal standalone Next.js runner alongside PostgreSQL 16, Redis 7, and the BullMQ media worker:

```bash
docker compose -f docker-compose.yml up -d --build
```

### Health Probes

* **Liveness:** `GET /api/health/liveness` (Returns HTTP 200 `{"status":"ok"}`)
* **Readiness:** `GET /api/health/readiness` (Checks PostgreSQL and Redis connections, returns HTTP 200 `{"status":"ready"}`)

### Automated State Materializer (Cron)

Challenge state progression is driven by the idempotent scheduler:
* **Option A (Local Crontab):** `* * * * * cd /opt/mengart && npm run cron:materialize`
* **Option B (HTTP Endpoint):** `POST /api/cron/materialize-challenges` with `Authorization: Bearer <CRON_SECRET>`. Fails closed (`HTTP 503`) when unconfigured.

### Disaster Recovery & Backups

Encrypted, authenticated backups using AES-256-CBC with HMAC-SHA256 integrity signatures:

```bash
# Backup database and media storage
./scripts/backup.sh

# Restore from backup archive
./scripts/restore.sh <TIMESTAMP_OR_ARCHIVE_FILE>
```

---

## 🏆 Release Gates & Zero-Debt History

| Phase / Gate | Focus Area | Status | Key Deliverables |
|---|---|:---:|---|
| **Gate A** | Database Migrations & Lifecycle Engine | ✅ PASS | Migration 0007, Rank #1 tiebreak reconstruction, scheduler idempotency |
| **Gate B** | Voting & Tie Resolution | ✅ PASS | Migration 0008 & 0009, single Community Winner, per-round ballot uniqueness |
| **Gate C** | Simplified Jury & Results Model | ✅ PASS | Migration 0010, dynamic category labels, single designated Jury Recorder |
| **Gate D** | Authentication & Direct Invites | ✅ PASS | Migration 0011, Google OAuth only, 8-char CSPRNG codes, 2PL redemption |
| **Gate E** | Submissions & Portfolio | ✅ PASS | Migration 0012, direct canonical submissions, portfolio auto-promotion |
| **Gate F** | Media Pipeline & Rate Limiting | ✅ PASS | Single validation engine, MP4-only video, watermark removal amendment |
| **Gate G** | Community UX & Story Cards | ✅ PASS | Migration 0013, simple comments, manual spotlight, 9:16 Story Card Canvas |
| **Gate H** | Disaster Recovery & Concurrency | ✅ PASS | Insecure defaults audit, memory clamping, pool concurrency, security headers |
| **Phase 9** | Comprehensive Legacy Cleanup | ✅ PASS | Migration 0014, dropped 5 columns, 2 enums, 3 legacy tables, 0 legacy debt |
| **Phase 10**| Final Production QA Baseline | ✅ PASS | Migration 0015, pruned GIF/WebM from schema/UI, completed Artwork Spoiler UX |

---

## 📄 License

Private and proprietary. Developed for the Mengart Artist Collective. All rights reserved.
