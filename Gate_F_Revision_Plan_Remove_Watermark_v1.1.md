# Gate F Revision Plan --- Remove Public Watermarking v1.1

## Document Status

Status: PLAN MODE ONLY

Blueprint: 2.2.2

Affected Gate: Gate F --- Media Pipeline & Comprehensive Rate Limiting

Revision Type: Controlled Gate F Amendment

Production Authorization: NO-GO

------------------------------------------------------------------------

# Continuation Rule Compliance

This amendment follows the Mengart Chat Handoff continuation rules.

Mandatory continuity requirements:

-   Blueprint 2.2.2 remains authoritative.
-   No Blueprint version bump is introduced.
-   Gate F remains incomplete until independent QA approval.
-   Production remains NO-GO.
-   Implementation must stop after Gate F amendment completion.
-   Patch artifact must be generated against the approved baseline.
-   Runtime claims must be distinguished from independent QA
    verification.

------------------------------------------------------------------------

# 1. Purpose

This revision removes watermark generation from the Gate F media
derivative pipeline.

The change simplifies the media processing architecture while preserving
Blueprint 2.2.2 security guarantees.

Mengart remains an invite-only community platform. Public media exposure
is controlled through membership rules, ACL protection, and
resolution-limited derivatives; therefore watermarking is removed from
the current product model.

------------------------------------------------------------------------

# 2. Non-Goals

This revision does NOT:

-   create Blueprint 2.2.3;
-   redefine Blueprint 2.2.2 invariants;
-   change membership or visibility rules;
-   change storage architecture;
-   change media access-control rules;
-   remove public/master media separation;
-   change rate limiting behavior;
-   change accepted media formats.

------------------------------------------------------------------------

# 3. Baseline

Approved Gate E baseline:

f6b4d547789478e51588e1150e0f9db38181c810

Current Gate F implementation candidate:

28b5a47770aeef09b5dc7742b117e5c2eb1babb7

Revision applies as a controlled amendment after Gate F implementation.

------------------------------------------------------------------------

# 4. Architectural Decision

## Remove

-   SVG watermark overlays.
-   Watermark rendering during derivative generation.
-   Watermark-specific derivative naming.
-   Watermark-only verification logic.

## Retain

-   Single authoritative media validation engine.
-   No duplicated validation logic.
-   Magic-byte validation.
-   Deep media inspection.
-   MP4-only policy.
-   execFile only.
-   No shell interpolation.
-   H.264 validation.
-   AAC or silent audio.
-   No duration limit.
-   Rollback cleanup.
-   Worker idempotency.
-   Protected clean master media.
-   ACL enforcement.

------------------------------------------------------------------------

# 5. Public Derivative Policy

Public derivatives remain:

-   separate from master files;
-   resolution-limited;
-   optimized for viewing;
-   access controlled;
-   generated without watermark overlays.

------------------------------------------------------------------------

# 6. Implementation Scope

Modify derivative generation:

Before:

generateWatermarkedDerivatives()

After:

generateMediaDerivatives()

Responsibilities:

-   produce optimized public derivative;
-   enforce resolution limits;
-   generate thumbnails;
-   remove watermark overlay stage.

------------------------------------------------------------------------

# 7. Verification Requirements

Required:

npx tsx src/lib/**tests**/testGateFMediaAndRateLimiting.ts

npx tsx src/lib/**tests**/testGateESubmissionAndPortfolio.ts

npm run test:migrate

npm run test:all

npm run lint

npm run build

Completion requires:

-   watermark removal;
-   security invariant preservation;
-   regression pass;
-   patch artifact;
-   independent QA approval.

------------------------------------------------------------------------

# 8. Documentation Updates

Update:

-   DECISIONS.md
-   CURRENT_STATUS.md
-   HANDOFF.md

Record:

"Gate F amendment removes public watermarking. Public derivatives remain
resolution-limited and access-controlled. Clean master media protection
remains unchanged."

------------------------------------------------------------------------

# 9. Gate Status After Revision

Gate F: Awaiting Independent QA

Gate G: Blocked

Production: NO-GO
