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

export function getSafeReturnUrl(
  candidate: string | null | undefined,
  fallback: string = "/gallery"
): string {
  if (!candidate || typeof candidate !== "string") {
    return fallback;
  }

  const trimmed = candidate.trim();

  // Must start with exactly one leading slash
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Reject any backslashes anywhere in the URL
  if (trimmed.includes("\\")) {
    return fallback;
  }

  // Reject external protocols and control characters
  if (
    trimmed.includes("://") ||
    trimmed.toLowerCase().includes("javascript:") ||
    trimmed.toLowerCase().includes("data:") ||
    trimmed.toLowerCase().includes("vbscript:")
  ) {
    return fallback;
  }

  // Extract path without query parameters for loop check
  const pathPart = trimmed.split("?")[0].toLowerCase();

  // Reject auth loop paths
  for (const forbidden of FORBIDDEN_AUTH_LOOP_PREFIXES) {
    if (pathPart === forbidden || pathPart.startsWith(`${forbidden}/`)) {
      return fallback;
    }
  }

  return trimmed;
}
