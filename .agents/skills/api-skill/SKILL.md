---
name: api-skill
description: "Suite of API skills for designing, mocking, documenting, securing, versioning, rate limiting, and generating tests for REST, Server Actions, and GraphQL APIs."
risk: safe
source: https://github.com/LambdaTest/agent-skills/tree/main/api-skill
date_added: "2026-09-04"
---

# API Skill Suite (LambdaTest / testmu-ai)

A comprehensive suite for designing, validating, securing, testing, and documenting APIs and Server Action endpoints.

## When to Use
- Designing REST endpoints, Next.js Route Handlers, and Server Actions.
- Generating automated API test cases, mocks, and contract validations.
- Designing API authentication, authorization, and rate limiting architectures.
- Creating and maintaining OpenAPI / Swagger specifications.

## Core Capabilities & References

| Capability | Scope & Focus | Reference Document |
| :--- | :--- | :--- |
| **API Security Patterns** | OAuth2, JWT, Session auth, RBAC, anti-CSRF, CORS, parameter tampering prevention | [api-security-patterns.md](./references/api-security-patterns.md) |
| **API to Testcase Generator** | Deriving comprehensive positive, negative, and edge-case test suites from API specs | [api-to-testcase-generator.md](./references/api-to-testcase-generator.md) |
| **API Rate Limiting & Throttling** | Sliding-window algorithms, token bucket, Redis rate limiting, retry headers (`Retry-After`) | [api-ratelimit-helper.md](./references/api-ratelimit-helper.md) |
| **API Versioning & Deprecation** | URI, header, and parameter versioning strategies; backward compatibility preservation | [api-versioning-helper.md](./references/api-versioning-helper.md) |
| **API Mocking & Sandboxing** | Deterministic mock responses, error state simulation, integration test fixtures | [api-mocking.md](./references/api-mocking.md) |
| **OpenAPI / Specification Generator**| Strict schema definitions, request/response payload validation using Zod/OpenAPI | [openapi-spec-generator.md](./references/openapi-spec-generator.md) |

## Best Practices for Fullstack Next.js Applications

1. **Server-Side Input Validation:**
   - Every Route Handler and Server Action must validate payloads using a strict schema (e.g. Zod).
   - Never trust client-supplied input for IDs, roles, scores, or pricing calculations.

2. **Standardized HTTP Responses:**
   - Success: `200 OK`, `201 Created`, `204 No Content`.
   - Client Errors: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `429 Too Many Requests`.
   - Server Errors: `500 Internal Server Error`, `503 Service Unavailable`.

3. **Rate Limiting & Abuse Prevention:**
   - Protect public-facing, auth, upload, and mutation routes with sliding-window or token-bucket rate limits.
