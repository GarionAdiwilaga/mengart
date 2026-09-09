/**
 * Shared provenance projection helper for public artwork displays.
 * Centralizes caption redaction, challenge title concealment, and origin discrimination.
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
 * Sanitizes system caption to remove private/hidden challenge titles while preserving award categories.
 */
export function sanitizeSystemCaption(rawCaption: string | null | undefined): string {
  if (!rawCaption) return "Peserta Challenge";

  // Check for Community Winner
  if (rawCaption.includes("Juara Favorit Komunitas")) {
    return "Juara Favorit Komunitas";
  }

  // Check for Jury Award (with or without category)
  if (rawCaption.includes("Penghargaan Juri")) {
    const match = rawCaption.match(/Penghargaan Juri:\s*([^—–-]+)/i);
    if (match && match[1]?.trim()) {
      return `Penghargaan Juri: ${match[1].trim()}`;
    }
    return "Penghargaan Juri";
  }

  // Default fallback for challenge participants
  return "Peserta Challenge";
}

/**
 * Projects public artwork provenance consistently across API routes and page server components.
 * When a challenge is hidden or deleted and the viewer is not active staff:
 * - Redacts challengeTitle and challengeSlug to null
 * - Preserves origin: "challenge"
 * - Replaces system-generated captions that disclose the hidden challenge title with safe neutral captions
 * - Preserves artist's customCaption override
 */
export function projectPublicArtworkProvenance(
  source: ProvenanceSource,
  viewerContext: { isActiveStaff?: boolean } = {}
): ProjectedProvenance {
  const isChallengeOrigin = Boolean(source.challengeSubmissionId || source.origin === "challenge");
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
    const safeSystem = sanitizeSystemCaption(source.systemCaption);
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

  const rawSystem = source.systemCaption || null;
  return {
    origin: "challenge",
    challengeId: source.challengeId || null,
    challengeTitle: source.challengeTitle || null,
    challengeSlug: source.challengeSlug || null,
    systemCaption: rawSystem,
    customCaption: custom,
    effectiveCaption: custom ?? rawSystem ?? null,
  };
}
