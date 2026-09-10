/**
 * Safe Return URL Validator
 * Prevents open redirects, protocol-relative attacks, backslash bypasses, and auth loops.
 */

const FORBIDDEN_AUTH_LOOP_PREFIXES = [
  "/login",
  "/account-suspended",
  "/onboarding",
  "/api/auth",
  "/register",
];

function hasControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

const ENCODED_CONTROL_REGEX = /%(0[0-9a-fA-F]|1[0-9a-fA-F]|7[fF])/;
const TRUSTED_DUMMY_BASE = "http://mengart.internal";

export function getSafeReturnUrl(
  candidate: string | null | undefined,
  fallback: string = "/gallery"
): string {
  if (!candidate || typeof candidate !== "string") {
    return fallback;
  }

  // Reject raw ASCII control characters (\x00-\x1F, \x7F) including tabs and newlines
  if (hasControlChars(candidate)) {
    return fallback;
  }

  // Reject percent-encoded control characters (%00-%1F, %7F)
  if (ENCODED_CONTROL_REGEX.test(candidate)) {
    return fallback;
  }

  // Reject backslashes (both literal and percent-encoded %5C / %5c)
  if (candidate.includes("\\") || /%5[cC]/.test(candidate)) {
    return fallback;
  }

  const trimmed = candidate.trim();

  // Must start with exactly one leading slash
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Reject external protocol schemes
  if (
    trimmed.includes("://") ||
    /^(javascript|data|vbscript):/i.test(trimmed)
  ) {
    return fallback;
  }

  // Parse against trusted dummy base to resolve dot-segments and normalize origin
  let parsed: URL;
  try {
    parsed = new URL(trimmed, TRUSTED_DUMMY_BASE);
  } catch {
    return fallback;
  }

  // Ensure candidate parsed strictly into the internal origin without scheme/host morphing
  if (
    parsed.origin !== TRUSTED_DUMMY_BASE ||
    parsed.protocol !== "http:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hostname !== "mengart.internal" ||
    parsed.port !== ""
  ) {
    return fallback;
  }

  // Normalized path after WHATWG normalization (resolves dot segments like /gallery/../login -> /login)
  const normalizedPath = parsed.pathname.toLowerCase();

  // Reject paths that do not start with a single slash or morph into protocol-relative paths
  if (
    !normalizedPath.startsWith("/") ||
    normalizedPath.startsWith("//") ||
    normalizedPath.startsWith("/\\") ||
    parsed.pathname.startsWith("//") ||
    parsed.pathname.startsWith("/\\")
  ) {
    return fallback;
  }

  // Reject auth loop paths after full canonical normalization
  for (const forbidden of FORBIDDEN_AUTH_LOOP_PREFIXES) {
    if (normalizedPath === forbidden || normalizedPath.startsWith(`${forbidden}/`)) {
      return fallback;
    }
  }

  // Return canonical relative path + search query (stripping hash/fragment)
  // Preserves legitimate search query parameters including +, %20, and encoded terms
  return parsed.pathname + parsed.search;
}
