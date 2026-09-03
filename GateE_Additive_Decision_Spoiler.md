# Mengart Additive Product Decision — Artwork Spoiler Presentation

**Decision status:** Approved additive feature for Gate E / Gate G  
**Blueprint authority:** Blueprint 2.2.2 remains unchanged  
**Approved development baseline:** `46ccdca661de9240ff364ee63d9f5ccb5ca242bc`  
**Decision scope:** Artwork metadata and presentation only

## Decision

Mengart will support an artist-controlled **spoiler** flag for artwork.

An artwork marked as a spoiler remains governed by its existing audience, publication state, ownership, membership authorization, and media ACL. The spoiler flag does not create a new privacy state or authorization boundary.

Conceptually:

```text
audience = PUBLIC
isSpoiler = true
```

means the viewer is authorized to receive/view the artwork according to the existing rules, but the normal UI initially obscures the artwork until the viewer intentionally chooses to reveal it.

## Authoritative invariants

```text
Spoiler != audience
Spoiler != publication status
Spoiler != privacy
Spoiler != media ACL
Spoiler != authentication
Spoiler != challenge eligibility
```

The existing audience states remain authoritative:

```text
PUBLIC
MEMBERS_ONLY
UNLISTED
PRIVATE
```

Gate A / Gate D media authorization remains authoritative. Spoiler must never be used as a substitute for protecting private or clean-master media.

## Data model direction

Use one simple artwork-level boolean as the source of truth:

```text
artworks.is_spoiler BOOLEAN NOT NULL DEFAULT FALSE
```

Do not introduce spoiler levels, spoiler audiences, expiry, permissions, or viewer-reveal database records in this iteration.

The flag belongs to the canonical artwork so the same state follows the work across ordinary portfolio display and challenge-related display.

## Author controls

An ACTIVE artist may set or clear the spoiler flag on their own artwork during supported artwork creation/editing flows.

For direct challenge uploads, the submission flow may also set the canonical artwork's spoiler flag.

Changing spoiler state is metadata-only. It must not:

- change audience;
- change publication status;
- regenerate media;
- alter ownership;
- alter challenge eligibility;
- create a media revision;
- rewrite challenge result history.

## Gate split

### Gate E — domain/data integration

Gate E owns:

- forward schema migration;
- canonical artwork spoiler field;
- create/edit action handling;
- challenge-upload propagation;
- API/query serialization of spoiler state;
- tests proving spoiler does not change audience/ACL/publication semantics;
- documenting the additive decision in repository decision/handoff records.

### Gate G — viewing experience completion

Gate G owns the final spoiler presentation UX, including:

- cover/blur/obscured artwork presentation;
- explicit Reveal Artwork control;
- title-hiding policy for unrevealed spoilers;
- lightbox reveal behavior;
- per-page/session reveal state;
- keyboard/touch accessibility;
- screen-reader behavior and safe unrevealed alt text;
- mobile behavior;
- E2E coverage;
- SEO/metadata review so hidden spoiler content is not accidentally exposed through user-facing metadata.

Until Gate G is complete, production remains NO-GO, so Gate E does not need to pretend the final UX is complete.

## Default reveal behavior

Recommended v1 behavior for Gate G:

```text
unrevealed
→ show generic spoiler notice
→ user clicks/taps Reveal
→ reveal for current page/session state
→ page refresh may cover it again
```

No persistent viewer preference is required in this iteration.

## Challenge behavior

Spoiler marking does not remove a submission from voting or jury eligibility. Authorized challenge viewers may intentionally reveal the artwork before judging/voting.

The spoiler flag must not alter frozen voting candidates, Star totals, jury awards, or Gate B/Gate C result semantics.

## Blueprint version

No Blueprint 2.2.3 is required for this feature because it does not change an existing product invariant. This decision is additive and is tracked through Gate E planning plus repository `DECISIONS.md` / `HANDOFF.md` updates.
