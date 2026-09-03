# Agent Prompt --- Gate F Watermark Removal Amendment v1.1

You are implementing a controlled Gate F amendment under Blueprint
2.2.2.

Do not create Blueprint 2.2.3.

Do not expand scope.

Stop after Gate F amendment completion for independent QA.

------------------------------------------------------------------------

# Continuation Rules

Follow Mengart Chat Handoff continuation rules:

-   Blueprint 2.2.2 is authoritative.
-   Gate F is not complete until independent QA PASS.
-   Production remains NO-GO.
-   Do not advance to Gate G.
-   Provide patch artifact against the approved baseline.
-   Separate implementation verification from independent QA.

------------------------------------------------------------------------

# Baseline

Blueprint: 2.2.2

Approved Gate E baseline:

f6b4d547789478e51588e1150e0f9db38181c810

Current Gate F implementation:

28b5a47770aeef09b5dc7742b117e5c2eb1babb7

------------------------------------------------------------------------

# Objective

Remove watermarking from the public media derivative pipeline.

Reason:

Mengart is an invite-only platform. Public derivatives remain
resolution-limited and access-controlled. Watermarking is no longer
required and adds unnecessary processing complexity.

------------------------------------------------------------------------

# Mandatory Constraints

## Media Validation

Must remain unchanged:

-   one authoritative validation entry point;
-   no duplicated validation logic;
-   synchronous and worker paths remain identical.

## Media Security

Must remain:

-   execFile only;
-   no shell interpolation;
-   MP4-only container validation;
-   H.264 video validation;
-   AAC or silent audio;
-   no duration limit;
-   rollback cleanup.

## Access Model

Master media:

-   clean;
-   protected;
-   ACL restricted.

Public derivative:

-   separate from master;
-   resolution-limited;
-   optimized;
-   no watermark.

------------------------------------------------------------------------

# Implementation Steps

1.  Inspect current implementation first.

Do not assume previous watermark architecture remains unchanged.

2.  Remove:

-   watermark rendering;
-   watermark assets;
-   watermark-specific processing functions.

3.  Update tests:

Remove watermark-only assertions.

Add verification that:

-   public derivative exists without watermark;
-   resolution limits remain;
-   master access remains protected;
-   media validation parity remains.

4.  Update:

-   DECISIONS.md
-   CURRENT_STATUS.md
-   HANDOFF.md

------------------------------------------------------------------------

# Verification

Run:

npx tsx src/lib/**tests**/testGateFMediaAndRateLimiting.ts

npx tsx src/lib/**tests**/testGateESubmissionAndPortfolio.ts

npm run test:migrate

npm run test:all

npm run lint

npm run build

------------------------------------------------------------------------

# Deliverables

Provide:

1.  Implementation summary.
2.  Changed files.
3.  Verification results.
4.  Commit SHA.
5.  Patch artifact:

git format-patch --stdout --binary --full-index

against:

f6b4d547789478e51588e1150e0f9db38181c810

------------------------------------------------------------------------

# Stop Condition

Stop after Gate F amendment completion.

Do not proceed to Gate G.

Await independent QA.
