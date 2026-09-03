---
name: insecure-defaults
description: "Detect and audit insecure default configurations, hardcoded secrets, default credentials, fail-open switches, weak crypto, permissive CORS, and debug leakage in codebases."
risk: safe
source: https://github.com/trailofbits/skills/tree/main/plugins/insecure-defaults
date_added: "2026-09-04"
---

# Insecure Defaults Detection (Trail of Bits)

Audits a codebase for insecure default configuration, tracing each candidate before reporting it.

## When to Use
- Auditing authentication, authorization, token hashing, and cryptography.
- Reviewing environment variable defaults and secret fallbacks.
- Auditing CORS headers, file permissions, and storage ACLs.
- Verifying error handlers to prevent debug stack trace leakage to clients.

## Audit Categories

| Category | Example Vulnerability | Rule File |
| :--- | :--- | :--- |
| **Fallback Secrets** | `SECRET = process.env.SECRET || 'dev_secret'` | [fallback-secrets.md](./references/fallback-secrets.md) |
| **Default Credentials** | Hardcoded seeds `admin / admin123` | [default-credentials.md](./references/default-credentials.md) |
| **Fail-Open Switches** | `const authRequired = process.env.REQUIRE_AUTH === 'true'` (defaults to false when unset) | [fail-open-security.md](./references/fail-open-security.md) |
| **Weak Crypto** | Insecure hashing (MD5/SHA1 for passwords) or predictable randomness (`Math.random()`) | [weak-crypto.md](./references/weak-crypto.md) |
| **Permissive Access** | `Access-Control-Allow-Origin: *`, `0o777` permissions, unauthenticated admin routes | [permissive-access.md](./references/permissive-access.md) |
| **Debug Leakage** | Returning raw database errors or stack traces to clients in API responses | [debug-features.md](./references/debug-features.md) |

## Core Principles

1. **Fail-Closed by Default:**
   - Security checks, authentication guards, and rate limiters must fail closed if configuration or secrets are missing.
   - Example: Missing `CRON_SECRET` must return HTTP 503 (disabled/unavailable), never permit unrestricted execution.

2. **No Fallback Secrets in Production:**
   - Critical secrets (`AUTH_SECRET`, `CRON_SECRET`, encryption keys) must never fall back to default string literals.
   - Throw an explicit startup error if required production secrets are missing.

3. **Cryptographically Secure Randomness:**
   - Always use `crypto.randomBytes` or `crypto.getRandomValues` for security tokens, invite codes, and session keys. Never use `Math.random()`.