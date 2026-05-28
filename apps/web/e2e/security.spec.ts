import { test, expect } from '@playwright/test';
import { ADMIN_USER, MOCK } from './helpers';

/* ══════════════════════════════════════════════════════════════
   Security-focused E2E tests.
   These verify the FRONTEND correctly handles error responses
   that the backend now returns (429 rate-limit, 403 forbidden,
   413 body too large, etc.).
   ══════════════════════════════════════════════════════════════ */

test.describe('Login — rate-limit handling', () => {
  test('shows error when login returns 429', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/login') {
        return route.fulfill({
          status: 429,
          json: { success: false, code: 'RATE_LIMITED', message: 'Слишком много попыток. Подождите 5 минут.' },
        });
      }
      return route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto('/');
    await page.click('text=Войти по номеру телефона');
    await page.locator('input[type="tel"]').fill('+77001234567');
    await page.click('text=Получить код в Telegram');

    // The app should show the rate-limit error
    await expect(page.locator('text=Слишком много попыток')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when verify returns 429', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/login') {
        return route.fulfill({ json: { success: true, data: { message: 'OTP sent', expires_in: 300 } } });
      }
      if (url.pathname === '/api/auth/verify') {
        return route.fulfill({
          status: 429,
          json: { success: false, code: 'RATE_LIMITED', message: 'Слишком много попыток ввода кода. Подождите 15 минут.' },
        });
      }
      return route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto('/');
    await page.click('text=Войти по номеру телефона');
    await page.locator('input[type="tel"]').fill('+77001234567');
    await page.click('text=Получить код в Telegram');
    await expect(page.locator('text=Введите код')).toBeVisible();
    await page.locator('input[placeholder="000000"]').fill('123456');
    await page.click('text=Войти');

    await expect(page.locator('text=Слишком много попыток')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Login — wrong OTP handling', () => {
  test('shows error on invalid OTP', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/login') {
        return route.fulfill({ json: { success: true, data: { message: 'OTP sent', expires_in: 300 } } });
      }
      if (url.pathname === '/api/auth/verify') {
        return route.fulfill({
          status: 400,
          json: { success: false, code: 'OTP_INVALID', message: 'Неверный код' },
        });
      }
      return route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto('/');
    await page.click('text=Войти по номеру телефона');
    await page.locator('input[type="tel"]').fill('+77001234567');
    await page.click('text=Получить код в Telegram');
    await expect(page.locator('text=Введите код')).toBeVisible();
    await page.locator('input[placeholder="000000"]').fill('000000');
    await page.click('text=Войти');

    await expect(page.locator('text=Неверный код')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when OTP expired', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/login') {
        return route.fulfill({ json: { success: true, data: { message: 'OTP sent', expires_in: 300 } } });
      }
      if (url.pathname === '/api/auth/verify') {
        return route.fulfill({
          status: 400,
          json: { success: false, code: 'OTP_EXPIRED', message: 'Код истёк. Запросите новый.' },
        });
      }
      return route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto('/');
    await page.click('text=Войти по номеру телефона');
    await page.locator('input[type="tel"]').fill('+77001234567');
    await page.click('text=Получить код в Telegram');
    await expect(page.locator('text=Введите код')).toBeVisible();
    await page.locator('input[placeholder="000000"]').fill('123456');
    await page.click('text=Войти');

    await expect(page.locator('text=Код истёк')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Auth — session expiry', () => {
  test('redirects to login when /api/auth/me returns 401', async ({ page }) => {
    // Inject a stale token into localStorage
    await page.addInitScript(() => {
      localStorage.setItem('tarbie-auth', JSON.stringify({
        state: { token: 'expired_token', lang: 'ru' },
        version: 0,
      }));
    });

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/me') {
        return route.fulfill({
          status: 401,
          json: { success: false, code: 'UNAUTHORIZED', message: 'Token expired' },
        });
      }
      return route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto('/');
    // Should see login page, not dashboard
    await expect(page.locator('text=Вход в систему')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Error pages', () => {
  test('user not found shows proper error', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/login') {
        return route.fulfill({
          status: 404,
          json: { success: false, code: 'USER_NOT_FOUND', message: 'Пользователь с таким номером не найден' },
        });
      }
      return route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto('/');
    await page.click('text=Войти по номеру телефона');
    await page.locator('input[type="tel"]').fill('+77009999999');
    await page.click('text=Получить код в Telegram');

    await expect(page.locator('text=не найден')).toBeVisible({ timeout: 5000 });
  });
});
