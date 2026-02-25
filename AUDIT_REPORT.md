# XRS Names - Dependency Update & Security Audit Report

**Date:** February 25, 2026  
**Version:** 1.0.0 → 1.1.0

---

## Dependency Updates

| Package | Old Version | New Version | Change |
|---------|-------------|-------------|--------|
| express | ^4.18.2 | ^4.21.2 | Security patches, bug fixes (staying on v4 LTS — v5 is now `latest` on npm but involves breaking changes in routing/path-to-regexp) |
| sqlite3 | ^5.1.6 | ^5.1.7 | Patch update |
| cors | ^2.8.5 | ^2.8.6 | Patch update with minor fixes |
| nodemon | ^3.0.1 | ^3.1.14 | Multiple bug fixes and improvements |
| **helmet** | — | ^8.1.0 | **NEW** — Security headers middleware |
| **express-rate-limit** | — | ^7.5.0 | **NEW** — Rate limiting middleware |

### Note on Express 5
Express 5.2.1 is now the default `latest` on npm (since March 2025). It includes breaking changes like updated `path-to-regexp@8.x` (no sub-expression regex), removed deprecated APIs, and requires Node.js 18+. The current codebase works fine on Express 4.x LTS which is still supported. Migration to v5 can be done separately when ready.

---

## Security Fixes Applied

### 1. Added Helmet (Security Headers)
- Sets `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, and other protective headers
- CSP configured to allow inline styles/scripts needed by the frontend

### 2. Added Rate Limiting
- **General API:** 100 requests per 15 minutes per IP
- **Registration endpoint:** 10 registrations per hour per IP (prevents name squatting/spam)

### 3. Request Body Size Limit
- Added `express.json({ limit: '10kb' })` — prevents large payload DoS attacks

### 4. Input Validation Hardened
- Added `typeof` checks on all input parameters before validation
- Address validation now enforces alphanumeric-only characters
- Search query sanitized to strip non-name characters before DB query
- Name/address coerced to `String()` before processing
- Missing required fields return 400 early

### 5. Metadata Sanitization
- New `sanitizeMetadata()` function whitelists allowed fields: `description`, `avatar`, `website`, `email`
- Each field capped at 256 characters
- Prevents arbitrary JSON injection into the database

### 6. Safe JSON Parsing
- `JSON.parse(row.metadata)` replaced with `safeJsonParse()` — prevents crashes on corrupted data

### 7. Update Endpoint Hardened
- Now requires `signature` field (returns 401 without it)
- Added input validation on the name parameter
- TODO comment added for proper cryptographic signature verification

### 8. Improved Error Handling
- Added 404 catch-all handler for unknown routes
- Added global error handler middleware
- All DB errors now log the error message (not full objects) for debugging
- Registration returns 201 (Created) instead of 200

### 9. CORS Configuration
- Can be restricted via `CORS_ORIGINS` env var (comma-separated)
- Limited to GET/POST/PUT methods only
- Preflight cache set to 24 hours

### 10. Database Improvements
- WAL mode enabled for better concurrent read performance
- Busy timeout set to 5000ms to handle lock contention
- `db.serialize()` wraps table creation for reliable init
- DB path configurable via `DB_PATH` env var
- Process exits on DB connection failure

### 11. Graceful Shutdown
- Now handles both `SIGINT` and `SIGTERM`
- Exits with error code 1 if DB close fails

### 12. Node.js Engine Requirement
- Added `engines: { node: ">=18.0.0" }` to package.json

---

## Remaining Recommendations

1. **Signature Verification** — The update endpoint accepts but doesn't verify signatures. Implement proper cryptographic verification against the owner's address.
2. **Express 5 Migration** — Plan migration when ready; review the [migration guide](https://expressjs.com/en/guide/migrating-5.html).
3. **HTTPS** — Ensure the service runs behind a reverse proxy (nginx/Caddy) with TLS in production.
4. **Logging** — Consider adding `morgan` or `pino` for structured request logging.
5. **Database Backups** — Set up automated SQLite backups for production.
6. **Name Expiry** — The `expires_at` column exists but isn't enforced — consider adding expiry logic.
