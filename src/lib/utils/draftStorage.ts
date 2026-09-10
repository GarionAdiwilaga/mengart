/**
 * Utility for managing user-scoped submission drafts with full lifecycle cleanup,
 * monotonic integer generation counters, and per-draft cross-tab lock serialization.
 */

export interface SubmissionDraftData {
  title: string;
  description: string;
  softwareUsed: string;
  isSpoiler: boolean;
  savedAt: number;
  generation?: number;
}

const DRAFT_PREFIX = "mengart:draft:";
const DRAFT_GEN_PREFIX = "mengart:draft-generation:";
const LEGACY_DRAFT_PREFIX_V1 = "mengart_sub_draft:v1:";
const LEGACY_DRAFT_PREFIX_UNSCOPED = "mengart_sub_draft:";
const ACTIVE_DRAFT_CONTEXT_KEY = "mengart:active-draft-context";

export interface ActiveDraftContext {
  userId: string;
  challengeId: string;
  timestamp: number;
}

export function getDraftKey(userId: string, challengeId: string): string {
  return `${DRAFT_PREFIX}${userId}:${challengeId}`;
}

export function getDraftGenerationKey(userId: string, challengeId: string): string {
  return `${DRAFT_GEN_PREFIX}${userId}:${challengeId}`;
}

/**
 * Safe accessor for window.localStorage that catches SecurityErrors
 * in sandboxed iframes or restricted private-browsing contexts.
 */
function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch (_e) {
    return null;
  }
}

/**
 * Safe accessor for window.sessionStorage that catches SecurityErrors.
 */
function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch (_e) {
    return null;
  }
}

/**
 * Record the active challenge draft context currently open or edited by a user.
 */
export function setActiveDraftContext(userId: string, challengeId: string): void {
  const storage = getSessionStorage();
  if (!storage || !userId || !challengeId) return;
  try {
    const payload: ActiveDraftContext = {
      userId,
      challengeId,
      timestamp: Date.now(),
    };
    storage.setItem(ACTIVE_DRAFT_CONTEXT_KEY, JSON.stringify(payload));
  } catch (_e) {
    // Ignore storage exceptions
  }
}

/**
 * Retrieve the active challenge draft context, if any.
 */
export function getActiveDraftContext(): ActiveDraftContext | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(ACTIVE_DRAFT_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.userId === "string" && typeof parsed.challengeId === "string") {
      return parsed;
    }
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * Clear the active draft context.
 */
export function clearActiveDraftContext(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(ACTIVE_DRAFT_CONTEXT_KEY);
  } catch (_e) {
    // Ignore storage exceptions
  }
}

// In-flight autosave timer registry to allow cancellation across components and logout
const pendingAutosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerPendingDraftAutosave(
  userId: string,
  challengeId: string,
  timer: ReturnType<typeof setTimeout>
): void {
  const key = `${userId}:${challengeId}`;
  const existing = pendingAutosaveTimers.get(key);
  if (existing) clearTimeout(existing);
  pendingAutosaveTimers.set(key, timer);
}

export function cancelPendingDraftAutosave(userId?: string, challengeId?: string): void {
  if (userId && challengeId) {
    const key = `${userId}:${challengeId}`;
    const timer = pendingAutosaveTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      pendingAutosaveTimers.delete(key);
    }
    return;
  }
  pendingAutosaveTimers.forEach((timer) => clearTimeout(timer));
  pendingAutosaveTimers.clear();
}

const heldDraftLocks = new Set<string>();

/**
 * Executes a function under a per-(user, challenge) storage lock
 * to ensure cross-tab and concurrent operation serialization.
 * Critical: Does NOT execute fn() if the lock could not be acquired.
 */
function withDraftLock<T>(userId: string, challengeId: string, fn: (storage: Storage) => T): T | null {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return null;

  const lockKey = `mengart:draft-lock:${userId}:${challengeId}`;
  if (heldDraftLocks.has(lockKey)) {
    return fn(storage);
  }

  const lockToken = `${Date.now()}:${Math.random()}`;
  const maxWaitMs = 100;
  const start = Date.now();
  let acquired = false;
  let attempts = 0;

  while (Date.now() - start < maxWaitMs && attempts++ < 50) {
    try {
      const existing = storage.getItem(lockKey);
      if (!existing) {
        storage.setItem(lockKey, lockToken);
        if (storage.getItem(lockKey) === lockToken) {
          acquired = true;
          break;
        }
      } else {
        const parts = existing.split(":");
        const lockTime = Number(parts[0] || 0);
        // Break stale lock after 1000ms
        if (Date.now() - lockTime > 1000) {
          storage.setItem(lockKey, lockToken);
          if (storage.getItem(lockKey) === lockToken) {
            acquired = true;
            break;
          }
        }
      }
    } catch (_e) {
      break;
    }
  }

  if (!acquired) {
    // Critical: Do not execute critical section after acquisition failure
    return null;
  }

  heldDraftLocks.add(lockKey);

  try {
    return fn(storage);
  } finally {
    heldDraftLocks.delete(lockKey);
    try {
      if (storage.getItem(lockKey) === lockToken) {
        storage.removeItem(lockKey);
      }
    } catch (_e) {
      // Ignore storage removal errors
    }
  }
}

/**
 * Asynchronous per-key serialization using Web Locks API when available in browser,
 * with graceful fallback to storage mutex.
 * Coordinates with other tabs via navigator.locks AND sets storage-level mutex while held.
 */
async function withDraftLockAsync<T>(
  userId: string,
  challengeId: string,
  fn: (storage: Storage) => Promise<T> | T
): Promise<T | null> {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return null;

  const lockKey = `mengart:draft-lock:${userId}:${challengeId}`;

  const runWithStorageLock = async (): Promise<T | null> => {
    if (heldDraftLocks.has(lockKey)) {
      return await fn(storage);
    }

    const lockToken = `${Date.now()}:${Math.random()}`;
    const maxWaitMs = 250;
    const start = Date.now();
    let acquired = false;
    let attempts = 0;

    while (Date.now() - start < maxWaitMs && attempts++ < 25) {
      try {
        const existing = storage.getItem(lockKey);
        if (!existing) {
          storage.setItem(lockKey, lockToken);
          if (storage.getItem(lockKey) === lockToken) {
            acquired = true;
            break;
          }
        } else {
          const parts = existing.split(":");
          const lockTime = Number(parts[0] || 0);
          if (Date.now() - lockTime > 1000) {
            storage.setItem(lockKey, lockToken);
            if (storage.getItem(lockKey) === lockToken) {
              acquired = true;
              break;
            }
          }
        }
        // Yield execution to allow other tab/process to progress
        await new Promise((resolve) => setTimeout(resolve, 10));
      } catch (_e) {
        break;
      }
    }

    if (!acquired) {
      return null;
    }

    heldDraftLocks.add(lockKey);
    try {
      return await fn(storage);
    } finally {
      heldDraftLocks.delete(lockKey);
      try {
        if (storage.getItem(lockKey) === lockToken) {
          storage.removeItem(lockKey);
        }
      } catch (_e) {
        // Ignore storage removal errors
      }
    }
  };

  if (typeof navigator !== "undefined" && navigator?.locks?.request) {
    try {
      return await navigator.locks.request(lockKey, { mode: "exclusive" }, async () => {
        return await runWithStorageLock();
      });
    } catch (_e) {
      // Fall back to storage lock if Web Locks request errors
    }
  }

  return await runWithStorageLock();
}

/**
 * Dispatches cross-tab / same-tab invalidation notifications.
 */
function notifyDraftInvalidated(detail: { userId: string; challengeId: string; generation: number }): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("mengart_draft_invalidated", { detail }));
  } catch (_e) {
    // Ignore event dispatch errors
  }
}

/**
 * Internal unlocked helper to read draft generation counter.
 */
function _internalGetDraftGeneration(storage: Storage, userId: string, challengeId: string): number {
  try {
    const raw = storage.getItem(getDraftGenerationKey(userId, challengeId));
    if (!raw) return 1;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  } catch (_e) {
    return 1;
  }
}

/**
 * Internal unlocked helper to increment generation and notify listeners.
 * Re-reads storage generation immediately before writing to catch any interleaved update.
 */
function _internalIncrementDraftGeneration(storage: Storage, userId: string, challengeId: string): number {
  const genKey = getDraftGenerationKey(userId, challengeId);
  const readGen = _internalGetDraftGeneration(storage, userId, challengeId);

  // Re-read storage generation immediately before writing to catch any interleaved update
  const latestRaw = storage.getItem(genKey);
  const latestGen = latestRaw ? parseInt(latestRaw, 10) : readGen;
  const validLatest = Number.isFinite(latestGen) && latestGen >= 1 ? latestGen : readGen;
  const nextGen = Math.max(readGen + 1, validLatest + 1);

  try {
    storage.setItem(genKey, String(nextGen));
  } catch (_e) {
    // Ignore storage errors
  }
  notifyDraftInvalidated({ userId, challengeId, generation: nextGen });
  return nextGen;
}

/**
 * Internal unlocked helper to clear draft payload and increment generation.
 */
function _internalClearSubmissionDraft(storage: Storage, userId: string, challengeId: string): number {
  const nextGen = _internalIncrementDraftGeneration(storage, userId, challengeId);
  try {
    storage.removeItem(getDraftKey(userId, challengeId));
    storage.removeItem(`${LEGACY_DRAFT_PREFIX_V1}${userId}:${challengeId}`);
  } catch (_e) {
    // Ignore storage errors
  }
  return nextGen;
}

/**
 * Get current generation counter for a specific user and challenge draft.
 * Monotonic positive integer starting from 1.
 */
export function getDraftGeneration(userId: string, challengeId: string): number {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return 1;
  return _internalGetDraftGeneration(storage, userId, challengeId);
}

/**
 * Increment the draft generation for a specific user and challenge.
 * Returns null if the lock could not be acquired (no unlocked mutations on failure).
 */
export function incrementDraftGeneration(userId: string, challengeId: string): number | null {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return null;

  return withDraftLock(userId, challengeId, (s) => {
    return _internalIncrementDraftGeneration(s, userId, challengeId);
  });
}

/**
 * Asynchronously increment draft generation using Web Locks when available.
 * Returns null if the lock could not be acquired (no unlocked mutations on failure).
 */
export async function incrementDraftGenerationAsync(userId: string, challengeId: string): Promise<number | null> {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return null;

  return await withDraftLockAsync(userId, challengeId, async (s) => {
    return _internalIncrementDraftGeneration(s, userId, challengeId);
  });
}

/**
 * Mark a draft invalidated for a specific user and challenge.
 * Increments the persistent generation marker even if no draft currently exists.
 */
export function markDraftInvalidated(userId: string, challengeId?: string): void {
  if (userId && challengeId) {
    incrementDraftGeneration(userId, challengeId);
  }
}

/**
 * Check whether a draft for a given user/challenge has been invalidated.
 */
export function isDraftInvalidated(
  userId: string,
  challengeId: string,
  expectedGeneration?: number
): boolean {
  if (!userId || !challengeId) return false;
  const currentGen = getDraftGeneration(userId, challengeId);
  if (expectedGeneration !== undefined) {
    return currentGen !== expectedGeneration;
  }
  return false;
}

/**
 * Purge any legacy unscoped drafts (e.g. mengart_sub_draft:challengeId)
 */
export function purgeLegacyDrafts(): void {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_DRAFT_PREFIX_UNSCOPED)) {
        // If it's not a versioned or modern key
        if (!key.startsWith(LEGACY_DRAFT_PREFIX_V1)) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => storage.removeItem(k));
  } catch (_e) {
    // Ignore storage errors
  }
}

/**
 * Internal unlocked helper to save draft payload.
 */
function _internalSaveSubmissionDraft(
  storage: Storage,
  userId: string,
  challengeId: string,
  data: Omit<SubmissionDraftData, "savedAt" | "generation">,
  expectedGeneration?: number
): boolean {
  const currentGen = _internalGetDraftGeneration(storage, userId, challengeId);
  if (expectedGeneration !== undefined && expectedGeneration !== currentGen) {
    // Generation mismatch: stale callback or invalidated draft!
    return false;
  }

  try {
    const key = getDraftKey(userId, challengeId);
    const payload: SubmissionDraftData = {
      title: String(data.title || "").slice(0, 150),
      description: String(data.description || "").slice(0, 2000),
      softwareUsed: String(data.softwareUsed || "").slice(0, 100),
      isSpoiler: Boolean(data.isSpoiler),
      savedAt: Date.now(),
      generation: currentGen,
    };
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch (_e) {
    // QuotaExceededError or private browsing mode
    return false;
  }
}

/**
 * Save draft for a specific user and challenge.
 * Verifies that expectedGeneration matches current persistent generation.
 * Rejects saves when draft lock cannot be acquired or generation mismatches.
 */
export function saveSubmissionDraft(
  userId: string,
  challengeId: string,
  data: Omit<SubmissionDraftData, "savedAt" | "generation">,
  expectedGeneration?: number
): boolean {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return false;

  const result = withDraftLock(userId, challengeId, (s) => {
    return _internalSaveSubmissionDraft(s, userId, challengeId, data, expectedGeneration);
  });
  return result === true;
}

/**
 * Asynchronously save draft using Web Locks API when available.
 */
export async function saveSubmissionDraftAsync(
  userId: string,
  challengeId: string,
  data: Omit<SubmissionDraftData, "savedAt" | "generation">,
  expectedGeneration?: number
): Promise<boolean> {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return false;

  const result = await withDraftLockAsync(userId, challengeId, async (s) => {
    return _internalSaveSubmissionDraft(s, userId, challengeId, data, expectedGeneration);
  });
  return result === true;
}

/**
 * Internal unlocked helper to load draft payload.
 */
function _internalLoadSubmissionDraft(
  storage: Storage,
  userId: string,
  challengeId: string
): SubmissionDraftData | null {
  try {
    const key = getDraftKey(userId, challengeId);
    let raw = storage.getItem(key);

    // Attempt migration from legacy v1 key if modern key is absent
    if (!raw) {
      const legacyKey = `${LEGACY_DRAFT_PREFIX_V1}${userId}:${challengeId}`;
      const legacyRaw = storage.getItem(legacyKey);
      if (legacyRaw) {
        raw = legacyRaw;
        storage.removeItem(legacyKey);
        storage.setItem(key, legacyRaw);
      }
    }

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const currentGen = _internalGetDraftGeneration(storage, userId, challengeId);
    if (parsed.generation !== undefined && parsed.generation !== currentGen) {
      // Stale draft from older generation
      storage.removeItem(key);
      return null;
    }

    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now();

    return {
      title: typeof parsed.title === "string" ? parsed.title.slice(0, 150) : "",
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 2000) : "",
      softwareUsed: typeof parsed.softwareUsed === "string" ? parsed.softwareUsed.slice(0, 100) : "",
      isSpoiler: Boolean(parsed.isSpoiler),
      savedAt,
      generation: currentGen,
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Load draft for a specific user and challenge.
 * Returns null if missing, expired, invalidated, or generation mismatch.
 * Automatically migrates from legacy v1 format if present.
 */
export function loadSubmissionDraft(
  userId: string,
  challengeId: string
): SubmissionDraftData | null {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return null;

  return withDraftLock(userId, challengeId, (s) => {
    return _internalLoadSubmissionDraft(s, userId, challengeId);
  });
}

/**
 * Asynchronously load draft using Web Locks API when available.
 */
export async function loadSubmissionDraftAsync(
  userId: string,
  challengeId: string
): Promise<SubmissionDraftData | null> {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return null;

  return await withDraftLockAsync(userId, challengeId, async (s) => {
    return _internalLoadSubmissionDraft(s, userId, challengeId);
  });
}

/**
 * Clear a specific challenge draft for a user.
 * Increments generation counter to reject in-flight saves and removes draft payload.
 * Retains generation key in storage.
 * Returns true if lock was acquired and cleared, false if lock could not be acquired.
 */
export function clearSubmissionDraft(userId: string, challengeId: string): boolean {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return false;

  const result = withDraftLock(userId, challengeId, (s) => {
    return _internalClearSubmissionDraft(s, userId, challengeId);
  });
  return result !== null;
}

/**
 * Asynchronously clear a specific challenge draft using Web Locks API when available.
 * Returns true if lock was acquired and cleared, false if lock could not be acquired.
 */
export async function clearSubmissionDraftAsync(userId: string, challengeId: string): Promise<boolean> {
  const storage = getLocalStorage();
  if (!storage || !userId || !challengeId) return false;

  const result = await withDraftLockAsync(userId, challengeId, async (s) => {
    return _internalClearSubmissionDraft(s, userId, challengeId);
  });
  return result !== null;
}

/**
 * Alias for clearSubmissionDraft for explicit user-challenge scoping.
 */
export function clearUserChallengeDraft(userId: string, challengeId: string): boolean {
  return clearSubmissionDraft(userId, challengeId);
}

/**
 * Invalidate active challenge draft upon user logout.
 * Scoped strictly to the active draft context registered by the submission modal.
 * Cancels any pending autosave timers, advances persistent generation marker,
 * removes draft payload, and clears active context.
 * Does NOT perform mass user or global deletion when no active challenge context exists.
 * Returns true if invalidation succeeded (or no context), false if lock could not be acquired.
 */
export async function invalidateActiveDraftOnLogout(departingUserId?: string): Promise<boolean> {
  const context = getActiveDraftContext();
  if (!context) return true;

  if (departingUserId && context.userId !== departingUserId) {
    return true;
  }

  // 1. Cancel in-flight debounce autosave timer for active challenge draft
  cancelPendingDraftAutosave(context.userId, context.challengeId);

  // 2. Invalidate draft atomically: increment generation marker and clear payload
  let cleared = await clearSubmissionDraftAsync(context.userId, context.challengeId);

  if (!cleared) {
    // Brief retry on contention
    await new Promise((resolve) => setTimeout(resolve, 50));
    cleared = await clearSubmissionDraftAsync(context.userId, context.challengeId);
  }

  if (cleared) {
    // 3. Clear active context ONLY when draft clearance succeeded under lock
    clearActiveDraftContext();
    return true;
  }

  // If lock acquisition failed, DO NOT erase active context or pretend invalidation succeeded
  return false;
}

/**
 * Clear drafts for a specific user, scoped strictly to that user's challenges.
 * Does NOT delete unrelated challenges or other users' drafts.
 */
export function clearDraftsForUser(userId: string): void {
  const storage = getLocalStorage();
  if (!storage || !userId) return;

  try {
    const prefix = `${DRAFT_PREFIX}${userId}:`;
    const legacyPrefix = `${LEGACY_DRAFT_PREFIX_V1}${userId}:`;
    const challengesToClear: string[] = [];

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) {
        if (key.startsWith(prefix)) {
          const chId = key.slice(prefix.length);
          if (chId && !challengesToClear.includes(chId)) challengesToClear.push(chId);
        } else if (key.startsWith(legacyPrefix)) {
          const chId = key.slice(legacyPrefix.length);
          if (chId && !challengesToClear.includes(chId)) challengesToClear.push(chId);
        }
      }
    }

    for (const chId of challengesToClear) {
      clearSubmissionDraft(userId, chId);
    }
  } catch (_e) {
    // Ignore storage errors
  }
}

/**
 * Global cleanup helper: purges legacy unscoped drafts.
 * Broad deletion across all users and challenges is strictly prohibited.
 */
export function clearAllSubmissionDrafts(userId?: string, challengeId?: string): void {
  if (userId && challengeId) {
    clearSubmissionDraft(userId, challengeId);
    return;
  }
  purgeLegacyDrafts();
}


