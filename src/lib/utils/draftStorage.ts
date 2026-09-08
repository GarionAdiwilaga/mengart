/**
 * Utility for managing user-scoped submission drafts with full lifecycle cleanup.
 */

export interface SubmissionDraftData {
  title: string;
  description: string;
  softwareUsed: string;
  isSpoiler: boolean;
  savedAt: number;
}

const DRAFT_PREFIX = "mengart_sub_draft:";
const FORMAT_VERSION = "v1";

function getDraftKey(userId: string, challengeId: string): string {
  return `${DRAFT_PREFIX}${FORMAT_VERSION}:${userId}:${challengeId}`;
}

/**
 * Purge any legacy unscoped drafts (e.g. mengart_sub_draft:challengeId)
 * or drafts belonging to unknown format versions.
 */
export function purgeLegacyDrafts(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DRAFT_PREFIX)) {
        // If it doesn't match the versioned format "mengart_sub_draft:v1:..."
        if (!key.startsWith(`${DRAFT_PREFIX}${FORMAT_VERSION}:`)) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_e) {
    // Ignore storage errors
  }
}

/**
 * Save draft for a specific user and challenge.
 */
export function saveSubmissionDraft(
  userId: string,
  challengeId: string,
  data: Omit<SubmissionDraftData, "savedAt">
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!userId || !challengeId) return;

  try {
    const key = getDraftKey(userId, challengeId);
    const payload: SubmissionDraftData = {
      title: String(data.title || "").slice(0, 150),
      description: String(data.description || "").slice(0, 2000),
      softwareUsed: String(data.softwareUsed || "").slice(0, 100),
      isSpoiler: Boolean(data.isSpoiler),
      savedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (_e) {
    // QuotaExceededError or private browsing mode
  }
}

/**
 * Load draft for a specific user and challenge.
 * Returns null if missing, expired, or invalid.
 */
export function loadSubmissionDraft(
  userId: string,
  challengeId: string
): SubmissionDraftData | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  if (!userId || !challengeId) return null;

  try {
    const key = getDraftKey(userId, challengeId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    // Validate fields
    return {
      title: typeof parsed.title === "string" ? parsed.title.slice(0, 150) : "",
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 2000) : "",
      softwareUsed: typeof parsed.softwareUsed === "string" ? parsed.softwareUsed.slice(0, 100) : "",
      isSpoiler: Boolean(parsed.isSpoiler),
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Clear a specific challenge draft for a user.
 */
export function clearSubmissionDraft(userId: string, challengeId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!userId || !challengeId) return;

  try {
    localStorage.removeItem(getDraftKey(userId, challengeId));
  } catch (_e) {
    // Ignore storage errors
  }
}

/**
 * Clear ALL submission drafts across all users and challenges.
 * Used during logout to guarantee zero cross-account leakage.
 */
export function clearAllSubmissionDrafts(): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DRAFT_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_e) {
    // Ignore storage errors
  }
}
