/**
 * Shared provenance projection helper for public artwork displays.
 * Centralizes authoritative structured caption resolution, challenge title concealment,
 * and origin discrimination.
 */

export interface ProvenanceSource {
  origin?: "challenge" | "independent" | string;
  challengeSubmissionId?: string | null;
  challengeId?: string | null;
  challengeTitle?: string | null;
  challengeSlug?: string | null;
  challengeIsVisible?: boolean | null;
  challengeDeletedAt?: Date | string | null;
  systemCaption?: string | null;
  customCaption?: string | null;
  awardType?: string | null;
  categoryLabel?: string | null;
}

export interface ProjectedProvenance {
  origin: "challenge" | "independent";
  challengeId: string | null;
  challengeTitle: string | null;
  challengeSlug: string | null;
  systemCaption: string | null;
  customCaption: string | null;
  effectiveCaption: string | null;
}

/**
 * Builds public system caption strictly from structured metadata.
 * When redacted = true, challengeTitle is strictly omitted to prevent leaks.
 */
export function buildAuthoritativeSystemCaption(
  source: {
    challengeTitle?: string | null;
    awardType?: string | null;
    categoryLabel?: string | null;
  },
  redacted: boolean
): string {
  if (source.awardType === "community_vote_winner") {
    return redacted || !source.challengeTitle
      ? "Juara Favorit Komunitas"
      : `Juara Favorit Komunitas — ${source.challengeTitle}`;
  }

  if (source.awardType === "jury_award") {
    const label = source.categoryLabel?.trim();
    if (label && label !== "Pemenang Juri") {
      return redacted || !source.challengeTitle
        ? `Penghargaan Juri: ${label}`
        : `Penghargaan Juri: ${label} — ${source.challengeTitle}`;
    }
    return redacted || !source.challengeTitle
      ? "Pemenang Juri"
      : `Pemenang Juri — ${source.challengeTitle}`;
  }

  return redacted || !source.challengeTitle
    ? "Peserta Challenge"
    : `Peserta Challenge — ${source.challengeTitle}`;
}

/**
 * Backward-compatible neutral sanitizer.
 * For legacy records without structured metadata, returns safe neutral fallback.
 */
export function sanitizeSystemCaption(rawCaption: string | null | undefined): string {
  if (!rawCaption) return "Peserta Challenge";

  // Check exact prefix matches before any delimiter without searching the remainder
  if (rawCaption.startsWith("Juara Favorit Komunitas")) {
    return "Juara Favorit Komunitas";
  }
  if (rawCaption.startsWith("Pemenang Juri")) {
    return "Pemenang Juri";
  }
  // For legacy records without reliable metadata, use neutral fallback
  return "Peserta Challenge";
}

/**
 * Projects public artwork provenance consistently across API routes and page server components.
 * When a challenge is hidden or deleted and the viewer is not active staff:
 * - Redacts challengeTitle and challengeSlug to null
 * - Preserves origin: "challenge"
 * - Generates public system captions authoritatively from structured award metadata
 * - For legacy records without reliable metadata, uses neutral fallback "Peserta Challenge"
 * - Preserves artist's customCaption override
 */
export function projectPublicArtworkProvenance(
  source: ProvenanceSource,
  viewerContext: { isActiveStaff?: boolean } = {}
): ProjectedProvenance {
  const isChallengeOrigin = Boolean(
    source.challengeSubmissionId ||
      source.challengeId ||
      source.challengeTitle ||
      source.origin === "challenge"
  );
  const origin: "challenge" | "independent" = isChallengeOrigin ? "challenge" : "independent";

  if (!isChallengeOrigin) {
    const custom = source.customCaption || null;
    const system = source.systemCaption || null;
    return {
      origin: "independent",
      challengeId: null,
      challengeTitle: null,
      challengeSlug: null,
      systemCaption: system,
      customCaption: custom,
      effectiveCaption: custom ?? system ?? null,
    };
  }

  const isHiddenOrDeleted =
    source.challengeIsVisible === false || source.challengeDeletedAt != null;

  const shouldRedact = isHiddenOrDeleted && !viewerContext.isActiveStaff;
  const custom = source.customCaption || null;

  if (shouldRedact) {
    let safeSystem: string;
    if (source.awardType) {
      safeSystem = buildAuthoritativeSystemCaption(source, true);
    } else {
      safeSystem = "Peserta Challenge";
    }

    return {
      origin: "challenge",
      challengeId: null,
      challengeTitle: null,
      challengeSlug: null,
      systemCaption: safeSystem,
      customCaption: custom,
      effectiveCaption: custom ?? safeSystem ?? null,
    };
  }

  let finalSystem: string | null = null;
  if (source.awardType) {
    finalSystem = buildAuthoritativeSystemCaption(source, false);
  } else {
    finalSystem =
      source.systemCaption ||
      (source.challengeTitle
        ? `Peserta Challenge — ${source.challengeTitle}`
        : "Peserta Challenge");
  }

  return {
    origin: "challenge",
    challengeId: source.challengeId || null,
    challengeTitle: source.challengeTitle || null,
    challengeSlug: source.challengeSlug || null,
    systemCaption: finalSystem,
    customCaption: custom,
    effectiveCaption: custom ?? finalSystem ?? null,
  };
}
