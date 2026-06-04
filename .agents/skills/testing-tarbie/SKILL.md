---
name: testing-tarbie
description: How to run the Tarbie Сағаты frontend end-to-end (Playwright) test suite. Use when asked to test, verify, or add e2e tests for apps/web.
---

# Testing Tarbie (frontend e2e)

The only automated tests are Playwright e2e tests in `apps/web/e2e/` (199 tests across
`full-site.spec.ts`, `role-access.spec.ts`, `security.spec.ts`). The worker packages declare
`vitest` but have **no test files**.

## Key fact: tests are self-contained
Every spec mocks the API with `page.route('**/api/**', ...)` (see `e2e/helpers.ts` →
`setupMocks` / `setupBulkMocks`). So **no running backend (worker) is required** — Playwright
only needs the Vite dev server, which its `webServer` config starts automatically via
`pnpm dev` on `http://localhost:5173`.

Auth is faked by injecting a `tarbie-auth` localStorage entry and mocking `/api/auth/me`.
The mocked user role (`ADMIN_USER` / `TEACHER_USER` / `STUDENT_USER`) drives role-based UI.

## Setup (once)
```bash
pnpm install
pnpm --filter @tarbie/shared build      # web imports @tarbie/shared
cd apps/web && npx playwright install chromium --with-deps
```

## Run
```bash
cd apps/web
npx playwright test                                  # full suite (~10 min, 1 worker)
npx playwright test -g "role filter buttons work"   # single test by title
npx playwright test e2e/security.spec.ts             # one file
```
Full suite takes ~10 minutes (`fullyParallel: false`, single worker). Report: `npx playwright show-report`.

## Domain terminology (important for assertions)
The `teacher` role is shown in the UI as **«Куратор»** (curator), not «Учитель». Curators
manage users/classes through `/api/teacher/*` (frontend picks the base via `useApiBase()` in
`apps/web/src/main.tsx`), so curators **do** see the «Пользователи» / «Группы» nav items;
only the curator-ratings page (`/ratings`) is admin-only. Keep e2e assertions consistent with this.

## Note
`playwright-report/` and `test-results/` are generated artifacts and are gitignored — do not commit them.
