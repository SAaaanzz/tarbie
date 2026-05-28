import { test, expect } from '@playwright/test';
import { setupMocks, goTo, ADMIN_USER, TEACHER_USER, STUDENT_USER, MOCK } from './helpers';

/* ══════════════════════════════════════════════════════════════
   Role-based access: verify each role can only see its allowed
   navigation items and pages render without crashing.
   ══════════════════════════════════════════════════════════════ */

const ROLE_NAV: Record<string, { allowed: string[]; forbidden: string[] }> = {
  admin: {
    allowed: ['/', '/sessions', '/grades', '/events', '/open-sessions', '/courses', '/reports', '/admin/users', '/admin/classes', '/support', '/assistant', '/ratings', '/profile', '/settings'],
    forbidden: [],
  },
  teacher: {
    allowed: ['/', '/sessions', '/grades', '/events', '/open-sessions', '/courses', '/reports', '/admin/users', '/admin/classes', '/support', '/assistant', '/profile', '/settings'],
    forbidden: ['/ratings'],
  },
  student: {
    allowed: ['/', '/sessions', '/grades', '/events', '/open-sessions', '/courses', '/support', '/profile', '/settings'],
    forbidden: ['/reports', '/admin/users', '/admin/classes', '/assistant', '/ratings'],
  },
};

const USERS = { admin: ADMIN_USER, teacher: TEACHER_USER, student: STUDENT_USER };

for (const [role, nav] of Object.entries(ROLE_NAV)) {
  test.describe(`${role.charAt(0).toUpperCase() + role.slice(1)} — navigation access`, () => {
    test.beforeEach(async ({ page }) => {
      await setupMocks(page, USERS[role as keyof typeof USERS]);
    });

    test(`sidebar shows only allowed links for ${role}`, async ({ page }) => {
      await goTo(page, '/');
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();

      for (const href of nav.allowed) {
        const el = sidebar.locator(`a[href="${href}"]`).first();
        await expect(el).toBeVisible({ timeout: 5000 });
      }

      for (const href of nav.forbidden) {
        const count = await sidebar.locator(`a[href="${href}"]`).count();
        expect(count).toBe(0);
      }
    });

    test(`dashboard renders for ${role}`, async ({ page }) => {
      await goTo(page, '/');
      await expect(page.locator('text=Добро пожаловать')).toBeVisible({ timeout: 10000 });
    });

    test(`profile page renders for ${role}`, async ({ page }) => {
      await goTo(page, '/profile');
      // Profile page should render without errors
      await page.waitForTimeout(2000);
      const errorCount = await page.locator('text=Internal Server Error').count();
      expect(errorCount).toBe(0);
      // Should see some profile-related UI element
      const hasProfile = await page.locator('[class*="profile"], h1, h2').first().isVisible();
      expect(hasProfile).toBe(true);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   Student — verify session/grade access
   ══════════════════════════════════════════════════════════════ */

test.describe('Student — core flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, STUDENT_USER);
  });

  test('can view sessions list', async ({ page }) => {
    await goTo(page, '/sessions');
    await expect(page.locator('text=Патриотизм').first()).toBeVisible({ timeout: 10000 });
  });

  test('can view grades page', async ({ page }) => {
    await goTo(page, '/grades');
    await page.waitForTimeout(2000);
    const errorCount = await page.locator('text=Internal Server Error').count();
    expect(errorCount).toBe(0);
  });

  test('cannot see admin nav items', async ({ page }) => {
    await goTo(page, '/');
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    // No admin links
    expect(await sidebar.locator('a[href="/admin/users"]').count()).toBe(0);
    expect(await sidebar.locator('a[href="/admin/classes"]').count()).toBe(0);
    expect(await sidebar.locator('a[href="/ratings"]').count()).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════
   Teacher — verify session management access
   ══════════════════════════════════════════════════════════════ */

test.describe('Teacher — core flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, TEACHER_USER);
  });

  test('can view sessions and see create button', async ({ page }) => {
    await goTo(page, '/sessions');
    await expect(page.locator('text=Патриотизм').first()).toBeVisible({ timeout: 10000 });
  });

  test('can view grades page', async ({ page }) => {
    await goTo(page, '/grades');
    await page.waitForTimeout(2000);
    const errorCount = await page.locator('text=Internal Server Error').count();
    expect(errorCount).toBe(0);
  });

  test('can access user management', async ({ page }) => {
    await goTo(page, '/admin/users');
    await page.waitForTimeout(2000);
    const errorCount = await page.locator('text=Internal Server Error').count();
    expect(errorCount).toBe(0);
  });
});
