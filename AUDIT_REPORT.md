# Тәрбие Сағаты Manager — Comprehensive Audit Report

**Date:** 2025-01-XX  
**Auditor:** Cascade AI  
**Scope:** Full codebase — `apps/worker`, `apps/bot-worker`, `apps/web`, `packages/shared`, migrations, configurations  
**Methodology:** Static code review, architectural analysis, security assessment, data integrity check, performance profiling, compliance review

---

## 1. Executive Summary (Ultrathink)

### Strengths
- **Well-structured monorepo** with pnpm workspaces, shared types/schemas, and clear separation of concerns across 3 apps + 1 shared package
- **Strong type safety** with TypeScript strict mode (`noUnusedLocals`, `noUncheckedIndexedAccess`) and Zod validation on most critical endpoints
- **Cloudflare-native architecture** leveraging D1, KV, and Queues for serverless scale with zero-ops infrastructure
- **Solid DB schema design** — foreign keys, CHECK constraints, proper indexes, incremental migrations (10 migrations)
- **Admin audit trail** via `admin_change_log` table tracking creates, updates, deletes, imports, and auto-assigns
- **Structured logging** (`structuredLog`) with JSON output across all services
- **Notification resilience** — queue-based async delivery with retry logic (exponential backoff, 3 attempts, dead-letter logging)
- **Bilingual support** (Kazakh + Russian) consistently implemented across bot, notifications, and templates
- **Smart rating filter** to auto-invalidate suspicious/spam student reviews
- **Comprehensive feature set** — sessions, attendance, grades, events, open sessions, courses, support tickets, AI assistant, ratings

### Critical Risks
1. **Test token endpoint in production** — admin can mint arbitrary JWTs for any user
2. **Phone number not unique** — login-by-phone can match wrong user; no `UNIQUE` constraint on `users.phone`
3. **Missing input validation** on ~6 endpoints (events, open-sessions, support settings, admin test-token)
4. **Cross-school data leakage** on ratings endpoint — any authenticated user can read any session's ratings
5. **Two overlapping Telegram bot implementations** — `apps/worker/src/routes/telegram-bot.ts` (600 lines) and `apps/bot-worker/src/telegram.ts` (308 lines)
6. **Race conditions** in rate limiters (KV read-then-write is not atomic)
7. **Timing-unsafe webhook secret comparison** exposes to timing attacks
8. **API key in URL query parameter** for AI calls

---

## 2. Scope & Methodology

### Components Audited
| Component | Path | Lines | Description |
|---|---|---|---|
| API Worker | `apps/worker/src/` | ~3,200 | Hono REST API — auth, sessions, grades, events, admin, courses, AI, support, ratings, Telegram bot |
| Bot Worker | `apps/bot-worker/src/` | ~600 | Queue consumer, Telegram webhook, WhatsApp sender |
| Shared Package | `packages/shared/src/` | ~580 | Types, Zod schemas, utilities, college constants |
| Migrations | `apps/worker/migrations/` | 10 files | D1 schema evolution |
| Configuration | `wrangler.toml`, `package.json`, `tsconfig` | — | Build, deploy, runtime config |

### Audit Methods
- **Code Review** — Line-by-line review of all backend source files
- **Schema Analysis** — Full migration chain from 0001 to 0010
- **Security Assessment** — Auth flow, input validation, secret management, CORS, webhook verification
- **Data Integrity Check** — FK constraints, unique constraints, type consistency between schema/Zod/code
- **Performance Profiling** — Query patterns, N+1 detection, pagination coverage
- **Compliance Review** — PII handling, audit logs, data retention, GDPR readiness

---

## 3. Detailed Findings

### 3.1 Architecture & Environment

**Rating: ✅ Good with minor issues**

**Positives:**
- Clean monorepo structure with workspace-level scripts for dev/build/deploy
- Shared package prevents type drift between API and frontend
- Cloudflare Workers provides edge deployment, auto-scaling, and DDoS protection
- Queue-based notification decouples delivery from request handling
- Cron handler for daily reminders and weekly checks

**Issues:**

| ID | Severity | Finding | Location |
|---|---|---|---|
| A-1 | **Medium** | **Duplicate Telegram bot logic.** Full-featured bot in `apps/worker/src/routes/telegram-bot.ts` (600 lines) AND a separate bot in `apps/bot-worker/src/telegram.ts` (308 lines). Both handle `/start`, contact sharing, `/login`, session commands. This creates maintenance burden and potential behavior divergence. | `telegram-bot.ts`, `bot-worker/telegram.ts` |
| A-2 | **Low** | **Hardcoded webhook URL** `https://dprabota.bahtyarsanzhar.workers.dev/api/telegram/webhook` appears in two places. Should use `APP_URL` or a dedicated env var. | `admin.ts:845`, `telegram-bot.ts:19` |
| A-3 | **Low** | **No health check on main worker.** Bot worker has `/health`, but the API worker does not expose a health endpoint. | `worker.ts` |
| A-4 | **Info** | `bot-worker` and main `worker` share the same D1 database and KV namespace. This is fine for consistency but means both must stay in sync on schema expectations. | `wrangler.toml` files |

---

### 3.2 Code Quality & Maintainability

**Rating: ⚠️ Acceptable with notable gaps**

**Positives:**
- Consistent code style across all route files
- Zod schemas in shared package ensure validation is reusable
- `ERROR_CODES` centralized in shared utils
- TypeScript strict mode enabled with good tsconfig settings

**Issues:**

| ID | Severity | Finding | Location |
|---|---|---|---|
| CQ-1 | **Medium** | **Inconsistent error codes.** Some routes use `ERROR_CODES.FORBIDDEN`, others use inline `'FORBIDDEN'`; `ERROR_CODES.USER_NOT_FOUND` used for ticket-not-found in support routes. | `events.ts`, `open-sessions.ts`, `support.ts:67,96`, `ratings.ts` |
| CQ-2 | **Medium** | **Missing Zod validation on ~6 endpoints.** Bodies are cast with `as` but never validated: event create/update, open-session create/update, support-chat settings, admin test-token. | `events.ts:71,105`, `open-sessions.ts:72,105`, `admin.ts:866,877` |
| CQ-3 | **Medium** | **Schema/code mismatch — `lessons.type`.** Migration 0009 allows `'live'` (`CHECK(type IN ('video','text','live'))`), but `lessonTypeSchema` in shared only allows `'video' | 'text'`. Creating a 'live' lesson via DB tools would be accepted by D1 but rejected by the API. | `0009_courses.sql:53`, `schemas.ts:126` |
| CQ-4 | **Low** | **`notification_templates` CHECK constraint outdated.** DB CHECK doesn't include `'TOPIC_REMINDER'` event type, but code uses it. Migration 0005 acknowledges this with a comment but doesn't fix it. D1 will reject inserting a TOPIC_REMINDER template directly. | `0001_init.sql:117-119`, `0005_admin_changelog.sql:20-22` |
| CQ-5 | **Low** | **Unused export.** `sendWhatsAppTemplate` in `whatsapp.ts:44` is exported but never called anywhere in the codebase. | `bot-worker/whatsapp.ts:44` |
| CQ-6 | **Low** | **No request ID/tracing.** `structuredLog` doesn't include a request ID, making it hard to correlate logs for a single request across multiple functions. | `utils.ts:61-79` |
| CQ-7 | **Low** | **`(t as any).avatar_url`** — unsafe cast in `ratings.ts:157`. The TypeScript generic should include `avatar_url`. | `ratings.ts:157` |

---

### 3.3 Data Integrity & Functional Accuracy

**Rating: ⚠️ Significant issues found**

| ID | Severity | Finding | Location |
|---|---|---|---|
| DI-1 | **Critical** | **Phone number not unique.** `users.phone` has a non-unique index (`idx_users_phone`). Login via `/auth/login` does `SELECT ... WHERE phone = ? AND school_id = ?`, which is school-scoped. BUT Telegram linking (`handleContact`) does `SELECT ... WHERE phone = ?` without school scope — if the same phone exists in multiple schools, it links to the first match, potentially linking the wrong user. | `0001_init.sql:30`, `telegram.ts:106`, `telegram-bot.ts:570` |
| DI-2 | **High** | **Timezone mismatch.** `nowISO()` returns UTC. D1's `date('now')` is also UTC. Kazakhstan is UTC+5/+6. A session planned for "2025-01-15" (local) with `planned_date >= date('now')` at 23:00 local (17:00 UTC on Jan 15) works fine, but at 01:00 local Jan 16 (19:00 UTC Jan 15), `date('now')` = Jan 15 UTC, so a session planned for Jan 15 still appears as "upcoming" even though it's already past locally. | `telegram.ts:227`, `worker.ts` (cron) |
| DI-3 | **Medium** | **Event registration race condition.** Capacity check in `events.ts:179-184` reads COUNT, then inserts. Two concurrent registrations can both pass the check and exceed capacity. Same issue in `open-sessions.ts:180-187`. | `events.ts:178-184`, `open-sessions.ts:180-187` |
| DI-4 | **Medium** | **Absence alert re-triggering.** In `attendance.ts`, when attendance is re-marked for a session, the absence alert logic runs again. If a student had 3 absences, was alerted, then one is corrected and re-saved, the alert may or may not re-trigger depending on new state — but there's no dedup on alerts. | `attendance.ts:70-100` |
| DI-5 | **Medium** | **Monthly average formula ambiguity.** `grades.ts:245`: `average = sumGrades / totalSessions`. Absent students contribute 0 to sum but totalSessions still counts them. This means a student present for 5/10 sessions with grade 10 each gets average 5.0, same as a student present for 10/10 sessions with grade 5 each. This is a design choice but may confuse users expecting `sumGrades / attended`. | `grades.ts:245` |
| DI-6 | **Low** | **Orphaned phone change requests.** OTP records in `phone_change_requests` persist after verification (status = 'verified'). Old pending requests are expired by subsequent requests but never cleaned up. OTP plaintext remains in DB. | `support.ts:153-159` |
| DI-7 | **Low** | **Parent role access gaps.** Parents can authenticate but have limited explicit access. They can view student grades (`grades.ts:286-317`) but cannot view attendance, sessions, or reports directly — these endpoints check for admin/teacher roles only. | `sessions.ts`, `attendance.ts`, `reports.ts` |

---

### 3.4 Security Assessment

**Rating: 🔴 Critical issues requiring immediate attention**

#### 3.4.1 Authentication & Authorization

| ID | Severity | Finding | Location |
|---|---|---|---|
| S-1 | **Critical** | **Test token endpoint in production.** `POST /admin/test-token` generates a valid 1-hour JWT for any user in the same school. If an admin account is compromised, attacker can impersonate any user. No environment check — available in production. | `admin.ts:876-898` |
| S-2 | **Critical** | **Cross-school data leakage.** `GET /ratings/session/:sessionId` authenticates the user but does NOT verify the session belongs to the user's school. Any authenticated user can enumerate and read ratings from any school. | `ratings.ts:166-186` |
| S-3 | **High** | **No school_id scoping on teacher rating stats.** `GET /ratings/teacher/:teacherId` checks admin role or self, but doesn't verify the teacher belongs to the same school. An admin from school A can read teacher stats from school B. | `ratings.ts:74-129` |
| S-4 | **High** | **Timing-unsafe secret comparison.** Telegram webhook secret verified with `===` (simple string comparison), vulnerable to timing attacks. Should use `crypto.timingSafeEqual` or equivalent. | `telegram-bot.ts:38`, `bot-worker/telegram.ts:35` |
| S-5 | **High** | **OTP not timing-safe.** OTP verification in `auth.ts` and `support.ts` uses `===` comparison. Timing attacks could reveal OTP digits. | `auth.ts`, `support.ts:197` |

#### 3.4.2 Input Validation & Injection

| ID | Severity | Finding | Location |
|---|---|---|---|
| S-6 | **High** | **Unvalidated JSON bodies.** Multiple endpoints accept `await c.req.json() as T` without Zod parsing: events CRUD, open-sessions CRUD, admin settings, admin test-token. Malicious payloads could inject unexpected fields. | See CQ-2 |
| S-7 | **Medium** | **LIKE prefix match on ticket IDs.** `handleAdminReply` extracts a short ID from Telegram message text and queries `WHERE id LIKE ? || '%'`. A Telegram message containing a common prefix could match unintended tickets. | `telegram-bot.ts:537` |
| S-8 | **Medium** | **Avatar upload size unlimited.** `c.req.arrayBuffer()` reads the entire body into memory without checking Content-Length. A malicious request with a large body could exhaust Worker memory (128MB limit). | `auth.ts` (avatar endpoint) |

#### 3.4.3 Secret Management

| ID | Severity | Finding | Location |
|---|---|---|---|
| S-9 | **High** | **API key in URL query parameter.** Gemini API key passed as `?key=${apiKey}` in the URL. This may appear in Cloudflare logs, edge caches, or error reports. Should use an Authorization header if supported. | `assistant.ts:113` |
| S-10 | **Medium** | **OTP stored plaintext.** OTPs for login and phone change stored in KV and D1 as plain strings. While they expire (5min TTL in KV), DB records persist indefinitely. | `auth.ts`, `support.ts:158` |
| S-11 | **Medium** | **Inconsistent magic token entropy.** Main worker generates `generateId()` (1 UUID = 122 bits), bot-worker generates `generateId() + generateId()` (2 UUIDs = 244 bits). Inconsistent security posture for the same auth flow. | `telegram-bot.ts:580`, `bot-worker/telegram.ts:191` |

#### 3.4.4 CORS & Headers

| ID | Severity | Finding | Location |
|---|---|---|---|
| S-12 | **Medium** | **Localhost in production CORS.** `http://localhost:5173` is always in the allowed origins list, even in production. An attacker running a local dev server could make authenticated cross-origin requests if they obtain a victim's JWT. | `cors.ts:8` |
| S-13 | **Low** | **Missing security headers.** No `Content-Security-Policy`, `Strict-Transport-Security`, or `Referrer-Policy` headers. `X-Content-Type-Options` and `X-Frame-Options` are set (good). | `cors.ts` |

#### 3.4.5 Rate Limiting

| ID | Severity | Finding | Location |
|---|---|---|---|
| S-14 | **High** | **TOCTOU race in rate limiter.** `rateLimit` reads count from KV, checks limit, then writes incremented count. Concurrent requests between read and write bypass the limit. KV is eventually consistent. | `rate-limit.ts:5-23` |
| S-15 | **Medium** | **Bot rate limiter effectively disabled.** `RATE_LIMIT_WINDOW = 1` (1 second TTL). The KV key expires in 1 second, so the 30-message limit resets every second, allowing ~30 msg/sec throughput — essentially no effective limit. | `queue-consumer.ts:9-10` |

---

### 3.5 Performance & Reliability

**Rating: ⚠️ Acceptable with optimization opportunities**

| ID | Severity | Finding | Location |
|---|---|---|---|
| P-1 | **Medium** | **N+1 query pattern.** Student monthly grades endpoint (`GET /students/:studentId/monthly`) loops over each class and executes 2 queries per class (sessions + grades). For a student in 5 classes, this is 10+ queries per request. | `grades.ts:349-374` |
| P-2 | **Medium** | **Unbounded IN clause.** `grades.ts:200-213` builds `WHERE session_id IN (...)` with all completed session IDs for a month. A very active class could have 60+ sessions, creating a large IN clause. D1/SQLite handles this reasonably but it's not ideal. | `grades.ts:200-213` |
| P-3 | **Medium** | **Sequential Telegram sends.** `sendRatingRequest` (`telegram-bot.ts:440-450`) sends messages to all students one-by-one in a `for` loop. For a class of 30 students, this could take 30+ seconds and hit Telegram's rate limit (30 msg/sec). | `telegram-bot.ts:440-450` |
| P-4 | **Low** | **No caching.** Frequently accessed data (class lists, templates, user profiles) is fetched from D1 on every request. KV could cache hot data with short TTL. | General |
| P-5 | **Low** | **No pagination on events/open-sessions listings.** Both endpoints return all matching records without LIMIT/OFFSET. Could grow unbounded. | `events.ts:11-29`, `open-sessions.ts:11-31` |
| P-6 | **Low** | **Course catalog subqueries.** Each row in the courses list executes 4 correlated subqueries (enrolled_count, avg_rating, modules_count, lessons_count). For 20+ courses, this multiplies query cost. | `courses.ts:62-77` |

---

### 3.6 Compliance & Audit Logs

**Rating: ⚠️ Partial compliance**

| ID | Severity | Finding | Location |
|---|---|---|---|
| C-1 | **High** | **No data retention/purge policy.** `notifications_log`, `phone_change_requests`, `support_messages`, `admin_change_log` grow indefinitely. No cron job or mechanism to purge old records. For GDPR/PDPA compliance, PII must have defined retention periods. | Schema-wide |
| C-2 | **High** | **No user data export/deletion.** No endpoint for users to request export of their personal data or account deletion. Required under GDPR Article 15/17 and Kazakhstan's Personal Data Protection Law. | Missing feature |
| C-3 | **Medium** | **PII in notification logs.** `notifications_log.message_text` stores the full notification text, which may contain student names, attendance status, and other PII. These logs have no TTL or anonymization. | `queue-consumer.ts:51-54` |
| C-4 | **Medium** | **No consent mechanism.** Users are added by admins without explicit consent for data processing, Telegram integration, or notification sending. | Admin user creation flow |
| C-5 | **Low** | **Admin change log doesn't cover all mutations.** Support ticket status changes (resolve/close from Telegram) bypass the admin change log. Rating submissions, event registrations, and course enrollments are not logged. | `telegram-bot.ts:140-146` |
| C-6 | **Info** | **School BIN validation is good.** 12-digit BIN (Business Identification Number) validation in Zod schema aligns with Kazakhstan's tax ID format. | `schemas.ts:110-112` |

---

## 4. Recommendations & Prioritized Remediation Plan

### 🔴 Priority: CRITICAL (Fix before production / immediately)

| # | Finding | Remediation | Effort |
|---|---|---|---|
| 1 | S-1: Test token endpoint | Remove entirely, or gate behind `ENVIRONMENT !== 'production'` check | 15 min |
| 2 | S-2: Cross-school rating leakage | Add `school_id` check to `GET /ratings/session/:sessionId` and `GET /ratings/teacher/:teacherId` — join with session/class to verify school | 30 min |
| 3 | DI-1: Phone not unique | Add `UNIQUE(phone, school_id)` constraint via new migration. Update Telegram linking queries to scope by school (requires bot to know school context or use a different linking flow) | 2 hr |
| 4 | S-4/S-5: Timing-unsafe comparisons | Replace `===` with `crypto.subtle.timingSafeEqual` (available in Workers) for webhook secrets and OTP verification | 1 hr |

### 🟠 Priority: HIGH (Fix within 1-2 weeks)

| # | Finding | Remediation | Effort |
|---|---|---|---|
| 5 | S-6/CQ-2: Missing Zod validation | Create Zod schemas for events, open-sessions, support-chat, test-token inputs | 2 hr |
| 6 | S-9: API key in URL | Check if Gemini API supports `Authorization` header; if not, document the risk and ensure Cloudflare logs are not publicly accessible | 30 min |
| 7 | S-12: Localhost in CORS | Conditionally include localhost only when `ENVIRONMENT !== 'production'` | 15 min |
| 8 | S-14: Rate limiter race | Use Cloudflare Workers `Atomics` or Durable Objects for atomic counters, or accept eventual consistency with documentation | 3 hr |
| 9 | A-1: Duplicate bot logic | Consolidate into one implementation. Recommend keeping the main worker's `telegram-bot.ts` (more complete) and making bot-worker focus solely on queue consumption. | 4 hr |
| 10 | C-1: Data retention | Add a cron job to purge `notifications_log` > 90 days, `phone_change_requests` with status != 'pending' > 30 days, `admin_change_log` > 1 year | 2 hr |
| 11 | C-2: User data export/deletion | Add `DELETE /auth/me` and `GET /auth/me/export` endpoints with proper cascade cleanup | 4 hr |

### 🟡 Priority: MEDIUM (Fix within 1 month)

| # | Finding | Remediation | Effort |
|---|---|---|---|
| 12 | DI-2: Timezone | Store and compare dates in Kazakhstan local time, or add a `timezone` field to schools table and convert consistently | 3 hr |
| 13 | DI-3: Event registration race | Use D1 `batch()` with conditional insert: `INSERT ... WHERE (SELECT COUNT(*) ...) < capacity` | 1 hr |
| 14 | P-1: N+1 queries | Refactor student monthly grades to use a single query with GROUP BY class_id | 2 hr |
| 15 | P-3: Sequential TG sends | Use `Promise.allSettled` with concurrency limiter (e.g., batch of 5) instead of sequential loop | 1 hr |
| 16 | CQ-3: Schema mismatch | Add `'live'` to `lessonTypeSchema` or remove from DB CHECK | 15 min |
| 17 | CQ-4: TOPIC_REMINDER CHECK | Add new migration to recreate `notification_templates` with updated CHECK constraint, or accept code-level validation only | 30 min |
| 18 | S-8: Avatar size limit | Check `Content-Length` header and reject > 2MB before calling `arrayBuffer()` | 15 min |
| 19 | S-11: Magic token entropy | Standardize on `generateId() + generateId()` (2 UUIDs) across both implementations | 15 min |
| 20 | P-5: Missing pagination | Add LIMIT/OFFSET parameters to events and open-sessions list endpoints | 1 hr |
| 21 | S-13: Security headers | Add `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy` in CORS middleware | 30 min |

### 🟢 Priority: LOW (Backlog / nice-to-have)

| # | Finding | Remediation | Effort |
|---|---|---|---|
| 22 | CQ-1: Inconsistent error codes | Standardize all routes to use `ERROR_CODES.*` constants | 1 hr |
| 23 | CQ-5: Unused WhatsApp template fn | Remove or document for future use | 5 min |
| 24 | CQ-6: No request ID | Add `X-Request-Id` header generation in middleware and pass to `structuredLog` | 1 hr |
| 25 | P-4: No caching | Add KV caching for templates, class lists with 5-min TTL | 3 hr |
| 26 | P-6: Course subqueries | Refactor to use JOINs with GROUP BY or materialized counts | 2 hr |
| 27 | DI-7: Parent role gaps | Add parent-accessible read endpoints for attendance and sessions | 3 hr |
| 28 | C-4: Consent mechanism | Add consent tracking table and opt-in/opt-out flow for notifications | 4 hr |

---

## 5. Conclusion: Production Readiness

### Verdict: ⚠️ **Conditionally Ready — Critical fixes required before public launch**

The project demonstrates solid engineering fundamentals: a well-structured monorepo, good TypeScript discipline, comprehensive feature coverage, proper database design with FK constraints and migrations, and thoughtful UX with bilingual support.

**However, 4 critical issues must be resolved before production:**

1. **Remove or disable the test-token endpoint** — trivial impersonation vector
2. **Fix cross-school data leakage** in ratings endpoints — violates multi-tenant isolation
3. **Add unique constraint on phone+school** — prevents wrong-user login and Telegram linking
4. **Use timing-safe comparisons** for secrets and OTPs — prevents cryptographic side-channel attacks

**After critical fixes, the system is viable for a controlled beta** with a known user base (single school). For multi-school production deployment, the HIGH-priority items (validation gaps, CORS hardening, rate limiter fixes, data retention policy, and GDPR compliance endpoints) should also be addressed.

**Estimated remediation effort:**
- Critical fixes: **~4 hours**
- High-priority fixes: **~18 hours**
- Medium-priority fixes: **~13 hours**
- Full remediation: **~40 hours**

### Positive Highlights
- The notification queue with retry/dead-letter is production-grade
- Admin change log provides good auditability for administrative actions
- The AI assistant has proper restrictions, daily limits, and model fallback
- Zod schema sharing between frontend and backend prevents validation drift
- The smart rating filter is a thoughtful anti-abuse mechanism

---

*End of Audit Report*
