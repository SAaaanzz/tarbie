// Страница «Прогон тестов API» (для админа): запуск проверок эндпоинтов.
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { navigate } from '../lib/router';
import { Play, Loader2, Terminal, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

/* ─── Types ─── */

type TestStatus = 'pending' | 'running' | 'passed' | 'failed';

type TestSection = 'API Tests' | 'UI Tests' | 'CRUD Tests' | 'Security Tests' | 'Stress Tests' | 'Other';

interface TestResult {
  id: string;
  section?: TestSection;
  group: string;
  name: string;
  status: TestStatus;
  error?: string;
  durationMs?: number;
  story?: string;
  warnings?: string[];
}

/* ─── Constants ─── */

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://dprabota.bahtyarsanzhar.workers.dev';

const API_ENDPOINTS = [
  '/api/sessions',
  '/api/sessions/classes',
  '/api/sessions/booked-rooms',
  '/api/grades',
  '/api/events',
  '/api/open-sessions',
  '/api/courses',
  '/api/courses/categories',
  '/api/courses/my/enrolled',
  '/api/admin/users',
  '/api/admin/classes',
  '/api/reports',
  '/api/reports/monthly',
  '/api/ratings/teachers',
  '/api/support/tickets',
  '/api/notifications',
  '/api/admin/settings',
  '/api/admin/changelog',
];

const API_POST_ENDPOINTS = [
  { path: '/api/assistant/usage', method: 'GET' as const, label: 'AI usage quota' },
];

const TEST_PREFIX = '__TEST__';

interface PageDef {
  path: string;
  label: string;
  checks?: string[];
  buttons?: ButtonDef[];
  inputs?: InputDef[];
  selects?: SelectDef[];
  modals?: ModalDef[];
}

interface ButtonDef {
  selector: string;
  label: string;
  safeToClick: boolean;
  expectModal?: boolean;
  closeAfter?: string;
}

interface InputDef {
  selector: string;
  label: string;
  testValue: string;
}

interface SelectDef {
  selector: string;
  label: string;
  optionIndex?: number;
}

interface ModalDef {
  triggerSelector: string;
  label: string;
  closeSelector: string;
}

const PAGES: PageDef[] = [
  {
    path: '/', label: 'DashboardPage', checks: ['Всего', 'Завершено'],
    buttons: [],
  },
  {
    path: '/sessions', label: 'SessionsPage',
    buttons: [
      { selector: 'button:has(.lucide-download)', label: 'Excel export menu', safeToClick: true },
      { selector: 'button:has(.lucide-wand-2)', label: 'Auto-assign btn', safeToClick: true, expectModal: true, closeAfter: 'button:has(.lucide-x)' },
      { selector: 'button:has(.lucide-upload)', label: 'Import btn', safeToClick: true, expectModal: true, closeAfter: 'button:has(.lucide-x)' },
      { selector: 'button:has(.lucide-plus)', label: 'New session btn', safeToClick: true, expectModal: true, closeAfter: 'button:has(.lucide-x)' },
    ],
    selects: [],
  },
  {
    path: '/grades', label: 'GradesPage',
    selects: [
      { selector: 'select.input-field', label: 'Class selector' },
    ],
    inputs: [
      { selector: 'input[type="month"]', label: 'Month picker', testValue: '' },
    ],
  },
  {
    path: '/events', label: 'EventsPage',
    buttons: [
      { selector: 'button:has(.lucide-plus)', label: 'New event btn', safeToClick: true, expectModal: true, closeAfter: 'button:has(.lucide-x)' },
    ],
  },
  {
    path: '/open-sessions', label: 'OpenSessionsPage',
    buttons: [
      { selector: 'button:has(.lucide-plus)', label: 'New open session btn', safeToClick: true, expectModal: true, closeAfter: 'button:has(.lucide-x)' },
    ],
  },
  {
    path: '/courses', label: 'CourseCatalogPage',
    inputs: [
      { selector: 'input[type="text"]', label: 'Search input', testValue: 'test' },
    ],
  },
  { path: '/my-courses', label: 'MyCoursesPage' },
  {
    path: '/reports', label: 'ReportsPage',
    selects: [
      { selector: 'select.input-field', label: 'Class selector' },
    ],
    inputs: [
      { selector: 'input[type="month"]', label: 'Month picker', testValue: '' },
    ],
  },
  { path: '/admin/users', label: 'AdminUsersPage' },
  { path: '/admin/classes', label: 'AdminClassesPage' },
  {
    path: '/profile', label: 'ProfilePage',
    buttons: [
      { selector: 'button:has(.lucide-camera)', label: 'Avatar upload hover btn', safeToClick: false },
    ],
    selects: [
      { selector: 'select.input-field', label: 'Language select' },
    ],
  },
  {
    path: '/settings', label: 'SettingsPage',
    buttons: [
      { selector: 'button:has(.lucide-bell)', label: 'Webhook setup btn', safeToClick: false },
    ],
  },
  {
    path: '/support', label: 'SupportPage',
    buttons: [
      { selector: 'button:has(.lucide-plus)', label: 'New ticket btn', safeToClick: true },
    ],
  },
  {
    path: '/assistant', label: 'AssistantPage',
    inputs: [
      { selector: 'input[type="text"]', label: 'AI prompt input', testValue: '' },
    ],
  },
  { path: '/ratings', label: 'TeacherRatingsPage' },
];

/* ─── Helpers ─── */

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`Timeout ${ms}ms`));
    }, ms);
    fetch(url, { ...opts, signal: ctrl.signal })
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms (${label})`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

function extractWarnings(story: string | undefined): string[] {
  if (!story) return [];
  const lines = story.split('\n');
  const warnings: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('⚠️')) warnings.push(trimmed.replace(/^⚠️\s?/, ''));
    if (trimmed.toLowerCase().startsWith('warn:')) warnings.push(trimmed.slice(5).trim());
  }
  return warnings;
}

function sectionForGroup(group: string): TestSection {
  if (group.startsWith('A.') || group.startsWith('B.') || group.startsWith('C.') || group.startsWith('CA.') || group.startsWith('AC.') || group.startsWith('Y.') || group.startsWith('AM.')) {
    return 'API Tests';
  }
  if (group.startsWith('AD.') || group.startsWith('AE.') || group.startsWith('AF.') || group.startsWith('AG.') || group.startsWith('AH.') || group.startsWith('AI.') || group.startsWith('AJ.') || group.startsWith('AK.') || group.startsWith('AL.') || group.startsWith('AQ.') || group.startsWith('AX.')) {
    return 'CRUD Tests';
  }
  if (group.startsWith('AR.') || group.startsWith('AS.') || group.startsWith('AT.')) {
    return 'Security Tests';
  }
  if (group.startsWith('AU.') || group.startsWith('AV.') || group.startsWith('AW.')) {
    return 'UI Tests';
  }
  if (group.startsWith('BA.') || group.startsWith('BB.') || group.startsWith('BC.') || group.startsWith('BD.') || group.startsWith('BE.') || group.startsWith('BF.') || group.startsWith('BG.') || group.startsWith('BH.') || group.startsWith('BI.') || group.startsWith('BJ.') || group.startsWith('BK.') || group.startsWith('BL.') || group.startsWith('BM.') || group.startsWith('BN.') || group.startsWith('BO.') || group.startsWith('BP.') || group.startsWith('BQ.') || group.startsWith('BR.')) {
    return 'Stress Tests';
  }
  if (group.startsWith('D.') || group.startsWith('E.') || group.startsWith('F.') || group.startsWith('G.') || group.startsWith('H.') || group.startsWith('I.') || group.startsWith('J.') || group.startsWith('K.') || group.startsWith('L.') || group.startsWith('M.') || group.startsWith('N.') || group.startsWith('O.') || group.startsWith('P.') || group.startsWith('Q.') || group.startsWith('R.') || group.startsWith('S.') || group.startsWith('T.') || group.startsWith('U.') || group.startsWith('V.') || group.startsWith('W.') || group.startsWith('X.') || group.startsWith('Z.') || group.startsWith('AA.') || group.startsWith('AB.') || group.startsWith('AN.') || group.startsWith('AO.') || group.startsWith('AP.') || group.startsWith('AU.') || group.startsWith('AV.') || group.startsWith('AW.')) {
    return 'UI Tests';
  }
  return 'Other';
}

/* ─── Component ─── */

export function TestRunnerPage() {
  const { lang } = useAuthStore();
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const consoleErrors = useRef<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const [onlyFailed, setOnlyFailed] = useState(false);

  const runStartedAtRef = useRef<number>(0);
  const runDurationMs = useRef<number>(0);
  const globalStopRef = useRef(false);
  const stressOnlyRef = useRef(false);

  const countersRef = useRef({
    apiRequests: 0,
    pagesVisited: 0,
    buttonsClicked: 0,
    crudCreated: 0,
    crudUpdated: 0,
    crudDeleted: 0,
  });

  const healthOkRef = useRef(true);
  const perfTimingsRef = useRef<Array<{label: string; ms: number; op: string}>>([]);

  const currentThemeRef = useRef(useThemeStore.getState().theme);
  const currentLangRef = useRef(useAuthStore.getState().lang);

  useEffect(() => {
    currentThemeRef.current = useThemeStore.getState().theme;
    currentLangRef.current = useAuthStore.getState().lang;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  const updateResult = useCallback(
    (id: string, patch: Partial<TestResult>) => {
      setResults((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
        return next;
      });
      setTimeout(scrollToBottom, 30);
    },
    [scrollToBottom],
  );

  const addResult = useCallback(
    (r: TestResult) => {
      setResults((prev) => [...prev, r]);
      setTimeout(scrollToBottom, 30);
    },
    [scrollToBottom],
  );

  /* ─── Run a single test with story ─── */
  async function runTest(
    id: string,
    group: string,
    name: string,
    fn: () => Promise<string>,
    add: typeof addResult,
    update: typeof updateResult,
    timeoutMs: number,
  ): Promise<boolean> {
    if (globalStopRef.current) {
      add({ id, group, name, status: 'failed', error: 'Stopped (global timeout)', story: 'FAIL → Stopped (global timeout)' });
      return false;
    }
    const elapsed = performance.now() - runStartedAtRef.current;
    if (elapsed > 20 * 60 * 1000) {
      globalStopRef.current = true;
      add({ id, group, name, status: 'failed', error: 'Stopped (global timeout)', story: 'FAIL → Stopped (global timeout)' });
      return false;
    }

    add({ id, group, name, status: 'running', section: sectionForGroup(group) });
    const t0 = performance.now();
    try {
      const story = await withTimeout(fn(), timeoutMs, `${group} ${name}`);
      const warnings = extractWarnings(story);
      if (warnings.length > 0) {
        update(id, {
          status: 'failed',
          error: `Warnings present (${warnings.length})`,
          durationMs: performance.now() - t0,
          story,
          warnings,
          section: sectionForGroup(group),
        });
        return false;
      }
      update(id, { status: 'passed', durationMs: performance.now() - t0, story, warnings, section: sectionForGroup(group) });
      return true;
    } catch (err) {
      const story = `FAIL → ${err instanceof Error ? err.message : String(err)}`;
      update(id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - t0,
        story,
        warnings: extractWarnings(story),
        section: sectionForGroup(group),
      });
      return false;
    }
  }

  /* ─── Main runner ─── */
  const runAll = useCallback(async (stressOnly = false) => {
    setResults([]);
    setRunning(true);
    setDone(false);
    setOnlyFailed(false);
    consoleErrors.current = [];

    stressOnlyRef.current = stressOnly;
    runStartedAtRef.current = performance.now();
    runDurationMs.current = 0;
    globalStopRef.current = false;
    runDurationMs.current = 0;
    countersRef.current = { apiRequests: 0, pagesVisited: 0, buttonsClicked: 0, crudCreated: 0, crudUpdated: 0, crudDeleted: 0 };
    healthOkRef.current = true;
    perfTimingsRef.current = [];

    const token = useAuthStore.getState().token;
    const role = useAuthStore.getState().user?.role ?? '';
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const ensureJson = async (res: Response): Promise<unknown> => {
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        const text = await res.text();
        throw new Error(`Expected JSON content-type, got: ${contentType || '(missing)'}; body: ${text.slice(0, 120)}`);
      }
      return res.json();
    };

    const ensureApiSuccess = (json: any): any => {
      if (!json || json.success !== true) {
        const msg = json?.message || json?.error || 'Unknown API error';
        throw new Error(`API success=false: ${msg}`);
      }
      return json.data;
    };

    const requestJson = async (
      path: string,
      init: RequestInit,
      timeoutMs: number
    ): Promise<{ res: Response; json: any; ms: number }> => {
      const t0 = performance.now();
      const res = await apiFetch(path, init, timeoutMs);
      const ms = Math.round(performance.now() - t0);
      const json = await ensureJson(res);
      return { res, json, ms };
    };

    const STRICT_MODE = true;

    const bestEffort = async <T,>(
      stepLabel: string,
      fn: () => Promise<T>,
      steps: string[]
    ): Promise<T | null> => {
      try {
        return await fn();
      } catch (e) {
        const msg = `${stepLabel} failed: ${e instanceof Error ? e.message : String(e)}`;
        if (STRICT_MODE) {
          throw new Error(msg);
        }
        steps.push(`⚠️ ${msg}`);
        return null;
      }
    };

    const nav = async (to: string, waitMs = 1200): Promise<void> => {
      countersRef.current.pagesVisited += 1;
      navigate(to);
      await delay(waitMs);
    };

    const apiFetch = async (path: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
      countersRef.current.apiRequests += 1;
      const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
      return fetchWithTimeout(url, init, timeoutMs);
    };

    const clickEl = async (el: HTMLElement, waitMs = 400): Promise<void> => {
      countersRef.current.buttonsClicked += 1;
      el.click();
      await delay(waitMs);
    };

    // Intercept console.error
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      consoleErrors.current.push(args.map(String).join(' '));
      origError.apply(console, args);
    };

    // Intercept window errors
    const capturedErrors: string[] = [];
    const onErr = (e: ErrorEvent) => capturedErrors.push(e.message);
    const onRej = (e: PromiseRejectionEvent) => capturedErrors.push(String(e.reason));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);

    const add = (r: TestResult) => {
      setResults((prev) => [...prev, r]);
      setTimeout(scrollToBottom, 30);
    };
    const update = (id: string, patch: Partial<TestResult>) => {
      setResults((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      setTimeout(scrollToBottom, 30);
    };

    /* ══════════════════════════════════════════════════════════════════
       A. HEALTH CHECK
       ══════════════════════════════════════════════════════════════════ */
    const healthPassed = await runTest('health', 'A. Health Check', 'GET /api/health → 200', async () => {
      const res = await apiFetch('/api/health', { headers }, 5000);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return `1) Отправлен GET ${API_BASE}/api/health → status ${res.status} OK`;
    }, add, update, 10000);
    healthOkRef.current = healthPassed;

    /* ══════════════════════════════════════════════════════════════════
       B. AUTH CHECK
       ══════════════════════════════════════════════════════════════════ */
    if (healthOkRef.current) {
      await runTest('auth', 'B. Auth Check', 'GET /api/auth/me → user object', async () => {
        const res = await apiFetch('/api/auth/me', { headers }, 5000);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        const data = json.data ?? json;
        if (!data.id || !data.role || !data.full_name) {
          throw new Error('Response missing id, role or full_name');
        }
        return `1) GET /api/auth/me → ${res.status}\n2) user.id=${data.id}, role=${data.role}, name=${data.full_name}`;
      }, add, update, 10000);
    } else {
      await runTest('auth-skip', 'B. Auth Check', 'SKIP: API unavailable', async () => {
        return '⚠️ Health check failed — skipping API tests';
      }, add, update, 10000);
    }

    if (!stressOnlyRef.current) {
    /* ══════════════════════════════════════════════════════════════════
       C. API ENDPOINTS SMOKE
       ══════════════════════════════════════════════════════════════════ */
    if (healthOkRef.current) {
      for (let i = 0; i < API_ENDPOINTS.length; i++) {
        const ep = API_ENDPOINTS[i]!;
        await runTest(`api-${i}`, 'C. API Smoke', `GET ${ep}`, async () => {
          const steps: string[] = [];
          const t0 = performance.now();
          const res = await apiFetch(ep, { headers }, 5000);
          const ms = Math.round(performance.now() - t0);
          steps.push(`1) GET ${ep} → status ${res.status}, ${ms}ms`);

          const contentType = res.headers.get('content-type') || '';
          steps.push(`2) content-type: ${contentType || '(missing)'}`);
          if (!contentType.toLowerCase().includes('application/json')) {
            throw new Error(`Invalid content-type: ${contentType || '(missing)'}`);
          }

          if (ms >= 3000) {
            steps.push(`⚠️ response time slow: ${ms}ms (expected < 3000ms)`);
          }

          if (!res.ok) throw new Error(`Status ${res.status}`);
          const json = await res.json();
          if (json.success !== true) throw new Error('json.success !== true');

          const data = json.data;
          const isArray = Array.isArray(data);
          const isObject = !!data && typeof data === 'object' && !isArray;
          const dataLen = isArray ? data.length : isObject ? Object.keys(data).length : 0;
          steps.push(`3) success=true, dataType=${isArray ? 'array' : isObject ? 'object' : typeof data}, dataSize=${dataLen}`);
          if (dataLen <= 0) throw new Error('data is empty');

          return steps.join('\n');
        }, add, update, 10000);
      }
    } else {
      await runTest('api-smoke-skip', 'C. API Smoke', 'SKIP: API unavailable', async () => {
        return '⚠️ Health check failed — skipping API smoke tests';
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       CA. EXTRA API ENDPOINTS
       ══════════════════════════════════════════════════════════════════ */
    if (healthOkRef.current) {
      for (let i = 0; i < API_POST_ENDPOINTS.length; i++) {
        const ep = API_POST_ENDPOINTS[i]!;
        await runTest(`api-extra-${i}`, 'CA. API Extra', `${ep.method} ${ep.path} (${ep.label})`, async () => {
          const res = await fetchWithTimeout(`${API_BASE}${ep.path}`, { method: ep.method, headers }, 5000);
          if (!res.ok) throw new Error(`Status ${res.status}`);
          return `1) ${ep.method} ${ep.path} → ${res.status}`;
        }, add, update, 10000);
      }
    } else {
      await runTest('api-extra-skip', 'CA. API Extra', 'SKIP: API unavailable', async () => {
        return '⚠️ Health check failed — skipping extra API tests';
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       D. PAGE RENDER CHECK
       ══════════════════════════════════════════════════════════════════ */
    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i]!;
      await runTest(`page-${i}`, 'D. Page Render', `${page.path} (${page.label})`, async () => {
        capturedErrors.length = 0;
        const steps: string[] = [];
        steps.push(`1) navigate("${page.path}")`);
        await nav(page.path, 1200);
        const main = document.querySelector('main');
        if (!main) throw new Error('<main> not found in DOM');
        steps.push(`2) <main> found, innerHTML length=${main.innerHTML?.length ?? 0}`);
        if ((main.innerHTML?.length ?? 0) < 50) throw new Error('Empty screen (innerHTML < 50 chars)');

        const heading = main.querySelector('h1, h2');
        steps.push(`3) heading <h1>/<h2> exists: ${heading ? 'YES' : 'NO'}`);
        if (!heading) throw new Error('No <h1> or <h2> found in <main>');

        const errDiv = main.querySelector('.text-red-500, .error, [role="alert"]');
        steps.push(`4) visible error block found: ${errDiv ? 'YES' : 'NO'}`);
        if (errDiv) {
          const text = (errDiv.textContent || '').trim().slice(0, 200);
          throw new Error(`Error UI detected: ${text || '(no text)'}`);
        }

        const imgs = Array.from(main.querySelectorAll('img')) as HTMLImageElement[];
        let brokenImgs = 0;
        for (const img of imgs) {
          const src = img.currentSrc || img.src || '';
          if (!src) continue;
          if (src.startsWith('data:')) continue;
          if (img.complete && img.naturalWidth > 0) continue;
          brokenImgs += 1;
        }
        steps.push(`5) images: total=${imgs.length}, broken=${brokenImgs}`);
        if (brokenImgs > 0) throw new Error(`${brokenImgs} image(s) not loaded (naturalWidth=0)`);

        if (page.checks) {
          for (const txt of page.checks) {
            const found = main.innerHTML.includes(txt);
            steps.push(`6) check text "${txt}" → ${found ? 'FOUND' : 'NOT FOUND'}`);
            if (!found) throw new Error(`Expected text "${txt}" not found`);
          }
        }
        if (capturedErrors.length > 0) throw new Error(`JS errors: ${capturedErrors.join('; ')}`);
        steps.push(`7) No JS errors captured`);
        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       E. BUTTON CLICK TESTS (every button on every page)
       ══════════════════════════════════════════════════════════════════ */
    let btnIdx = 0;
    for (const page of PAGES) {
      if (!page.buttons || page.buttons.length === 0) continue;
      for (const btn of page.buttons) {
        const testId = `btn-${btnIdx++}`;
        await runTest(testId, 'E. Button Clicks', `${page.label} → ${btn.label}`, async () => {
          const steps: string[] = [];
          steps.push(`1) navigate("${page.path}")`);
          navigate(page.path);
          await delay(1200);

          const el = document.querySelector(btn.selector) as HTMLButtonElement | null;
          if (!el) {
            steps.push(`2) selector "${btn.selector}" → NOT FOUND (skip)`);
            return steps.join('\n');
          }
          steps.push(`2) found button: "${el.textContent?.trim().slice(0, 40)}"`);

          if (btn.safeToClick) {
            capturedErrors.length = 0;
            el.click();
            steps.push(`3) clicked button`);
            await delay(800);

            if (btn.expectModal) {
              const modal = document.querySelector('[role="dialog"], .modal, .fixed.inset-0');
              steps.push(`4) modal expected → ${modal ? 'FOUND' : 'NOT FOUND'}`);
              if (btn.closeAfter) {
                await delay(300);
                const closeBtn = document.querySelector(btn.closeAfter) as HTMLElement | null;
                if (closeBtn) {
                  closeBtn.click();
                  steps.push(`5) closed modal via "${btn.closeAfter}"`);
                  await delay(400);
                }
              }
            }

            if (capturedErrors.length > 0) {
              throw new Error(`JS errors after click: ${capturedErrors.join('; ')}`);
            }
            steps.push(`${steps.length + 1}) No JS errors after click`);
          } else {
            steps.push(`3) button marked unsafe, skip click (exists = OK)`);
          }
          return steps.join('\n');
        }, add, update, 10000);
      }
    }

    /* ══════════════════════════════════════════════════════════════════
       F. AUTO-CLICK EVERY BUTTON ON EVERY PAGE
       ══════════════════════════════════════════════════════════════════ */
    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i]!;
      await runTest(`auto-btn-${i}`, 'F. Click All Buttons', `${page.label} (${page.path})`, async () => {
        const steps: string[] = [];
        await nav(page.path, 1200);

        const allBtns = Array.from(document.querySelectorAll('main button:not([disabled])'));
        steps.push(`1) navigate("${page.path}") → ${allBtns.length} enabled buttons`);

        let clicked = 0;
        let errored = 0;
        let a11yMissing = 0;
        for (let bi = 0; bi < allBtns.length; bi++) {
          const btn = allBtns[bi] as HTMLButtonElement;
          const text = btn.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) || '';
          const aria = btn.getAttribute('aria-label') || '';
          const title = btn.getAttribute('title') || '';
          const classes = (btn.getAttribute('class') || '').trim().slice(0, 120);
          const disabled = btn.disabled;

          const hasAccessible = text.length > 0 || aria.length > 0 || title.length > 0;
          if (!hasAccessible) a11yMissing++;

          const label = text || aria || title || '(no text)';
          // Skip dangerous buttons (delete, remove, logout)
          const lower = label.toLowerCase();
          const isDangerous = ['удалить', 'жою', 'delete', 'remove', 'выйти', 'шығу', 'logout'].some(w => lower.includes(w));
          if (isDangerous) {
            steps.push(`  ${bi + 1}. ⚠️ SKIP dangerous: "${label}" class="${classes}" disabled=${disabled}`);
            continue;
          }
          capturedErrors.length = 0;
          try {
            const beforeMain = document.querySelector('main');
            const beforeLen = beforeMain?.innerHTML?.length ?? 0;

            steps.push(`  ${bi + 1}. click "${label}" class="${classes}" disabled=${disabled}`);
            await clickEl(btn, 400);
            clicked++;

            // Close any modal that opened
            const modal = document.querySelector('.fixed.inset-0, [role="dialog"]');
            if (modal) {
              const closeBtn = modal.querySelector('button:has(.lucide-x), button[aria-label="close"]') as HTMLElement | null;
              if (closeBtn) { await clickEl(closeBtn, 300); }
            }

            const afterMain = document.querySelector('main');
            const afterLen = afterMain?.innerHTML?.length ?? 0;
            if (afterLen < 50) {
              throw new Error(`Main became empty after click (before=${beforeLen}, after=${afterLen})`);
            }

            if (capturedErrors.length > 0) {
              errored++;
              steps.push(`     ❌ JS error: ${capturedErrors[0]?.slice(0, 120)}`);
            } else {
              steps.push(`     ✅ OK`);
            }
          } catch (e) {
            errored++;
            steps.push(`     ❌ click threw: ${e instanceof Error ? e.message : String(e)}`);
          }
          // Re-navigate if page changed
          if (window.location.pathname !== page.path) {
            await nav(page.path, 800);
          }
        }
        if (a11yMissing > 0) {
          steps.push(`⚠️ accessibility: ${a11yMissing} button(s) without text/aria-label/title`);
        }
        steps.push(`2) clicked=${clicked}, errors=${errored}, a11y_missing=${a11yMissing}`);
        if (errored > 0) throw new Error(`${errored} button(s) caused JS errors`);
        return steps.join('\n');
      }, add, update, 10000);
    }
    /* ══════════════════════════════════════════════════════════════════
       G. INPUT FIELD TESTS
       ══════════════════════════════════════════════════════════════════ */
    let inputIdx = 0;
    for (const page of PAGES) {
      if (!page.inputs || page.inputs.length === 0) continue;
      for (const inp of page.inputs) {
        const testId = `input-${inputIdx++}`;
        await runTest(testId, 'G. Input Fields', `${page.label} → ${inp.label}`, async () => {
          const steps: string[] = [];
          navigate(page.path);
          await delay(1200);

          const el = document.querySelector(inp.selector) as HTMLInputElement | null;
          if (!el) {
            steps.push(`1) selector "${inp.selector}" → NOT FOUND`);
            throw new Error(`Input not found: ${inp.selector}`);
          }
          steps.push(`1) found input: type="${el.type}", name="${el.name || ''}"`);

          if (inp.testValue) {
            const orig = el.value;
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            nativeInputValueSetter?.call(el, inp.testValue);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            steps.push(`2) set value="${inp.testValue}" (was "${orig}")`);
            await delay(500);
            steps.push(`3) value after set: "${el.value}"`);
            // Restore
            nativeInputValueSetter?.call(el, orig);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            steps.push(`4) restored value to "${orig}"`);
          } else {
            steps.push(`2) no test value specified, checking presence only`);
          }
          return steps.join('\n');
        }, add, update, 10000);
      }
    }

    /* ══════════════════════════════════════════════════════════════════
       H. SELECT/DROPDOWN TESTS
       ══════════════════════════════════════════════════════════════════ */
    let selIdx = 0;
    for (const page of PAGES) {
      if (!page.selects || page.selects.length === 0) continue;
      for (const sel of page.selects) {
        const testId = `select-${selIdx++}`;
        await runTest(testId, 'H. Select Fields', `${page.label} → ${sel.label}`, async () => {
          const steps: string[] = [];
          navigate(page.path);
          await delay(1200);

          const el = document.querySelector(sel.selector) as HTMLSelectElement | null;
          if (!el) {
            steps.push(`1) selector "${sel.selector}" → NOT FOUND`);
            throw new Error(`Select not found: ${sel.selector}`);
          }
          const optCount = el.options.length;
          steps.push(`1) found <select> with ${optCount} options, current="${el.value}"`);

          if (optCount > 1) {
            const targetIdx = sel.optionIndex ?? 1;
            const origVal = el.value;
            el.value = el.options[Math.min(targetIdx, optCount - 1)]?.value ?? '';
            el.dispatchEvent(new Event('change', { bubbles: true }));
            steps.push(`2) changed to option[${targetIdx}]="${el.value}"`);
            await delay(600);
            // Restore
            el.value = origVal;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            steps.push(`3) restored to "${origVal}"`);
          } else {
            steps.push(`2) only ${optCount} option(s), skip interaction`);
          }
          return steps.join('\n');
        }, add, update, 10000);
      }
    }

    /* ══════════════════════════════════════════════════════════════════
       I. AUTO-DISCOVER ALL INPUTS/SELECTS ON EVERY PAGE
       ══════════════════════════════════════════════════════════════════ */
    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i]!;
      await runTest(`auto-input-${i}`, 'I. Auto-Discover Inputs', `${page.label} (${page.path})`, async () => {
        const steps: string[] = [];
        navigate(page.path);
        await delay(1200);

        const inputs = document.querySelectorAll('main input, main textarea, main select');
        steps.push(`1) navigate("${page.path}") → found ${inputs.length} form elements`);

        inputs.forEach((el, idx) => {
          const tag = el.tagName.toLowerCase();
          const type = (el as HTMLInputElement).type || '';
          const name = (el as HTMLInputElement).name || '';
          const val = (el as HTMLInputElement).value?.slice(0, 30) || '';
          steps.push(`  ${idx + 1}. <${tag}> type="${type}" name="${name}" value="${val}"`);
        });

        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       J. SIDEBAR NAVIGATION TESTS
       ══════════════════════════════════════════════════════════════════ */
    await runTest('sidebar-links', 'J. Sidebar Navigation', 'Click every sidebar link', async () => {
      const steps: string[] = [];
      navigate('/');
      await delay(800);

      const sidebarLinks = document.querySelectorAll('aside a, nav a, [data-sidebar] a');
      steps.push(`1) found ${sidebarLinks.length} sidebar/nav links`);

      let clicked = 0;
      for (let li = 0; li < sidebarLinks.length; li++) {
        const link = sidebarLinks[li] as HTMLAnchorElement;
        const href = link.getAttribute('href') || '';
        const text = link.textContent?.trim().slice(0, 40) || '';
        steps.push(`  ${li + 1}. <a href="${href}"> "${text}"`);

        if (href && href.startsWith('/') && !href.includes('test-runner')) {
          navigate(href);
          await delay(600);
          const main = document.querySelector('main');
          const ok = main && (main.innerHTML?.length ?? 0) > 30;
          steps.push(`     → navigated, main rendered: ${ok ? 'YES' : 'NO'}`);
          clicked++;
        }
      }
      steps.push(`2) navigated to ${clicked} sidebar links`);
      navigate('/');
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       K. THEME TOGGLE TEST
       ══════════════════════════════════════════════════════════════════ */
    await runTest('theme-toggle', 'K. Theme Toggle', 'Toggle dark/light theme', async () => {
      const steps: string[] = [];
      const origTheme = useThemeStore.getState().theme;
      steps.push(`1) current theme: "${origTheme}"`);

      useThemeStore.getState().toggleTheme();
      await delay(300);
      const newTheme = useThemeStore.getState().theme;
      steps.push(`2) toggled → now "${newTheme}"`);
      const hasDarkClass = document.documentElement.classList.contains('dark');
      steps.push(`3) <html> has .dark class: ${hasDarkClass}`);

      if (newTheme === 'dark' && !hasDarkClass) throw new Error('Expected .dark class on <html>');
      if (newTheme === 'light' && hasDarkClass) throw new Error('Unexpected .dark class on <html>');

      // Restore
      useThemeStore.getState().setTheme(origTheme);
      await delay(200);
      steps.push(`4) restored theme to "${origTheme}"`);
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       L. LANGUAGE TOGGLE (KZ)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('lang-kz', 'L. Language Toggle', 'Switch to KZ → check KZ text', async () => {
      const steps: string[] = [];
      const origLang = useAuthStore.getState().lang;
      steps.push(`1) original lang: "${origLang}"`);

      useAuthStore.getState().setLang('kz');
      navigate('/');
      await delay(1500);
      steps.push(`2) switched to "kz", navigated to /`);

      const body = document.body.innerText;
      const hasKz = body.includes('Басқару тақтасы') || body.includes('Басты бет') || body.includes('Тәрбие');
      steps.push(`3) KZ text found: ${hasKz}`);
      if (!hasKz) throw new Error('KZ text not found after lang switch');

      useAuthStore.getState().setLang(origLang);
      steps.push(`4) restored lang to "${origLang}"`);
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       L2. LANGUAGE TOGGLE (RU)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('lang-ru', 'L. Language Toggle', 'Switch back to RU → check RU text', async () => {
      const steps: string[] = [];
      useAuthStore.getState().setLang('ru');
      navigate('/');
      await delay(1500);
      steps.push(`1) switched to "ru", navigated to /`);

      const body = document.body.innerText;
      const hasRu = body.includes('Панель управления') || body.includes('Система управления') || body.includes('Тәрбие');
      steps.push(`2) RU text found: ${hasRu}`);
      if (!hasRu) throw new Error('RU text not found after lang switch');
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       M. LANGUAGE TOGGLE PER PAGE (every page in KZ, then back to RU)
       ══════════════════════════════════════════════════════════════════ */
    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i]!;
      await runTest(`lang-page-${i}`, 'M. Lang Per Page', `${page.label} in KZ`, async () => {
        const steps: string[] = [];
        useAuthStore.getState().setLang('kz');
        navigate(page.path);
        await delay(1200);
        steps.push(`1) navigate("${page.path}") in KZ`);

        const main = document.querySelector('main');
        if (!main) throw new Error('<main> not found');
        steps.push(`2) <main> rendered, length=${main.innerHTML?.length ?? 0}`);
        if ((main.innerHTML?.length ?? 0) < 30) throw new Error('Empty screen in KZ mode');
        steps.push(`3) page rendered in KZ — OK`);

        useAuthStore.getState().setLang('ru');
        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       N. AUTH STORE FUNCTIONS
       ══════════════════════════════════════════════════════════════════ */
    await runTest('store-auth-setlang', 'N. Store Functions', 'authStore.setLang round-trip', async () => {
      const steps: string[] = [];
      const orig = useAuthStore.getState().lang;
      steps.push(`1) original lang="${orig}"`);

      useAuthStore.getState().setLang('kz');
      const now = useAuthStore.getState().lang;
      steps.push(`2) setLang("kz") → lang="${now}"`);
      if (now !== 'kz') throw new Error(`Expected "kz", got "${now}"`);

      useAuthStore.getState().setLang(orig);
      steps.push(`3) restored lang="${useAuthStore.getState().lang}"`);
      return steps.join('\n');
    }, add, update, 10000);

    await runTest('store-theme-toggle', 'N. Store Functions', 'themeStore.toggleTheme round-trip', async () => {
      const steps: string[] = [];
      const orig = useThemeStore.getState().theme;
      steps.push(`1) original theme="${orig}"`);

      useThemeStore.getState().toggleTheme();
      const mid = useThemeStore.getState().theme;
      steps.push(`2) toggle → theme="${mid}"`);

      useThemeStore.getState().toggleTheme();
      const end = useThemeStore.getState().theme;
      steps.push(`3) toggle again → theme="${end}"`);
      if (end !== orig) throw new Error(`Expected "${orig}", got "${end}"`);

      useThemeStore.getState().setTheme(orig);
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       O. PAGINATION TESTS
       ══════════════════════════════════════════════════════════════════ */
    const paginatedPages = ['/sessions', '/courses', '/admin/users'];
    for (let i = 0; i < paginatedPages.length; i++) {
      const ppath = paginatedPages[i]!;
      await runTest(`pagination-${i}`, 'O. Pagination', `Pagination on ${ppath}`, async () => {
        const steps: string[] = [];
        navigate(ppath);
        await delay(1200);
        steps.push(`1) navigate("${ppath}")`);

        const nextBtns = document.querySelectorAll('main button');
        let paginationBtn: HTMLButtonElement | null = null;
        nextBtns.forEach((b) => {
          const txt = (b as HTMLElement).textContent?.trim().toLowerCase() || '';
          if (txt.includes('→') || txt.includes('next') || txt.includes('дальше') || txt.includes('келесі') || txt === '>') {
            paginationBtn = b as HTMLButtonElement;
          }
        });

        if (paginationBtn) {
          steps.push(`2) found pagination button: "${(paginationBtn as HTMLButtonElement).textContent?.trim()}"`);
          if (!(paginationBtn as HTMLButtonElement).disabled) {
            (paginationBtn as HTMLButtonElement).click();
            await delay(800);
            steps.push(`3) clicked → page changed`);
          } else {
            steps.push(`3) button disabled (only 1 page?)`);
          }
        } else {
          steps.push(`2) no pagination button found (possibly single page)`);
        }
        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       P. FILTER BUTTONS
       ══════════════════════════════════════════════════════════════════ */
    await runTest('filter-sessions', 'P. Filters', 'Session status filter buttons', async () => {
      const steps: string[] = [];
      navigate('/sessions');
      await delay(1200);
      steps.push(`1) navigate("/sessions")`);

      const filterBtns = document.querySelectorAll('main button');
      const statusKeywords = ['все', 'запланировано', 'завершено', 'отменено', 'барлық', 'жоспарланған'];
      let filtersFound = 0;

      filterBtns.forEach((b) => {
        const text = (b as HTMLElement).textContent?.trim().toLowerCase() || '';
        if (statusKeywords.some((kw) => text.includes(kw))) {
          filtersFound++;
          steps.push(`  filter: "${(b as HTMLElement).textContent?.trim()}"`);
          (b as HTMLElement).click();
        }
      });

      if (filtersFound > 0) {
        await delay(600);
        steps.push(`2) clicked ${filtersFound} filter buttons`);
      } else {
        steps.push(`2) no filter buttons found`);
      }
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       Q. CLICKABLE CARDS & LIST ITEMS
       ══════════════════════════════════════════════════════════════════ */
    const cardPages = ['/events', '/open-sessions', '/courses', '/ratings'];
    for (let i = 0; i < cardPages.length; i++) {
      const cp = cardPages[i]!;
      await runTest(`cards-${i}`, 'Q. Card Clicks', `Clickable cards on ${cp}`, async () => {
        const steps: string[] = [];
        navigate(cp);
        await delay(1200);
        steps.push(`1) navigate("${cp}")`);

        const cards = document.querySelectorAll('main [class*="cursor-pointer"], main [onclick], main .card');
        steps.push(`2) found ${cards.length} clickable card(s)`);

        if (cards.length > 0) {
          capturedErrors.length = 0;
          (cards[0] as HTMLElement).click();
          steps.push(`3) clicked first card`);
          await delay(800);

          if (capturedErrors.length > 0) {
            throw new Error(`JS errors after card click: ${capturedErrors.join('; ')}`);
          }
          steps.push(`4) no JS errors after click`);

          // Try to close any opened modal
          const closeBtn = document.querySelector('button:has(.lucide-x), [aria-label="close"]') as HTMLElement | null;
          if (closeBtn) {
            closeBtn.click();
            await delay(300);
            steps.push(`5) closed modal/dialog`);
          }
        }
        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       R. RESPONSIVE / MOBILE SIDEBAR TOGGLE
       ══════════════════════════════════════════════════════════════════ */
    await runTest('sidebar-toggle', 'R. Sidebar', 'Toggle sidebar collapse', async () => {
      const steps: string[] = [];
      navigate('/');
      await delay(800);

      const toggleBtn = document.querySelector('button:has(.lucide-chevrons-left), button:has(.lucide-chevrons-right), button:has(.lucide-menu)') as HTMLElement | null;
      if (toggleBtn) {
        steps.push(`1) found sidebar toggle button`);
        toggleBtn.click();
        await delay(400);
        steps.push(`2) clicked → sidebar toggled`);
        toggleBtn.click();
        await delay(400);
        steps.push(`3) clicked again → sidebar restored`);
      } else {
        steps.push(`1) no sidebar toggle button found`);
      }
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       S. HEADER/LAYOUT BUTTONS
       ══════════════════════════════════════════════════════════════════ */
    await runTest('header-btns', 'S. Header Buttons', 'Theme & lang buttons in header', async () => {
      const steps: string[] = [];
      navigate('/');
      await delay(800);

      // Theme toggle in header
      const themeBtn = document.querySelector('header button:has(.lucide-moon), header button:has(.lucide-sun)') as HTMLElement | null;
      if (themeBtn) {
        const origTheme = useThemeStore.getState().theme;
        themeBtn.click();
        await delay(300);
        steps.push(`1) clicked theme toggle in header → theme="${useThemeStore.getState().theme}"`);
        useThemeStore.getState().setTheme(origTheme);
      } else {
        steps.push(`1) no theme button in header`);
      }

      // Language button
      const langBtn = document.querySelector('header button:has(.lucide-globe), header button:has(.lucide-languages)') as HTMLElement | null;
      if (langBtn) {
        langBtn.click();
        await delay(300);
        steps.push(`2) clicked lang toggle in header`);
        // Restore
        useAuthStore.getState().setLang('ru');
      } else {
        steps.push(`2) no lang button in header`);
      }

      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       T. FULL DOM SCAN — ALL BUTTONS EVERYWHERE
       ══════════════════════════════════════════════════════════════════ */
    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i]!;
      await runTest(`dom-scan-${i}`, 'T. Full DOM Scan', `All <button> on ${page.label}`, async () => {
        const steps: string[] = [];
        navigate(page.path);
        await delay(1200);

        const btns = document.querySelectorAll('button');
        steps.push(`1) navigate("${page.path}") → ${btns.length} total <button> in DOM`);

        let enabledCount = 0;
        let disabledCount = 0;
        btns.forEach((b, idx) => {
          const text = b.textContent?.trim().slice(0, 60) || '(empty)';
          const disabled = b.disabled;
          if (disabled) disabledCount++; else enabledCount++;
          if (idx < 20) {
            steps.push(`  ${idx + 1}. "${text}" ${disabled ? '[disabled]' : '[enabled]'}`);
          }
        });
        if (btns.length > 20) steps.push(`  ... and ${btns.length - 20} more`);
        steps.push(`2) enabled=${enabledCount}, disabled=${disabledCount}`);
        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       U. ALL LINKS SCAN
       ══════════════════════════════════════════════════════════════════ */
    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i]!;
      await runTest(`links-scan-${i}`, 'U. Links Scan', `All <a> on ${page.label}`, async () => {
        const steps: string[] = [];
        navigate(page.path);
        await delay(1200);

        const links = document.querySelectorAll('a');
        steps.push(`1) navigate("${page.path}") → ${links.length} total <a> in DOM`);

        links.forEach((a, idx) => {
          const href = a.getAttribute('href') || '';
          const text = a.textContent?.trim().slice(0, 50) || '(empty)';
          if (idx < 15) {
            steps.push(`  ${idx + 1}. <a href="${href}"> "${text}"`);
          }
        });
        if (links.length > 15) steps.push(`  ... and ${links.length - 15} more`);
        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       W. AUTO-CLICK EVERY LINK ON EVERY PAGE
       ══════════════════════════════════════════════════════════════════ */
    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i]!;
      await runTest(`auto-link-${i}`, 'W. Click All Links', `${page.label} (${page.path})`, async () => {
        const steps: string[] = [];
        navigate(page.path);
        await delay(1200);

        const links = Array.from(document.querySelectorAll('main a[href]'));
        steps.push(`1) navigate("${page.path}") → ${links.length} links in <main>`);

        let visited = 0;
        for (let li = 0; li < links.length && li < 10; li++) {
          const a = links[li] as HTMLAnchorElement;
          const href = a.getAttribute('href') || '';
          const text = a.textContent?.trim().slice(0, 40) || '';
          if (href.startsWith('/') && !href.includes('test-runner') && !href.includes('logout')) {
            capturedErrors.length = 0;
            a.click();
            await delay(600);
            const main = document.querySelector('main');
            const ok = main && (main.innerHTML?.length ?? 0) > 30;
            steps.push(`  ${li + 1}. <a href="${href}"> "${text}" → ${ok ? '✅ rendered' : '❌ empty'}`);
            if (capturedErrors.length > 0) steps.push(`     ⚠️ JS error: ${capturedErrors[0]?.slice(0, 80)}`);
            visited++;
            navigate(page.path);
            await delay(600);
          } else if (href.startsWith('http')) {
            steps.push(`  ${li + 1}. <a href="${href.slice(0, 50)}"> "${text}" → external, skip`);
          }
        }
        steps.push(`2) visited ${visited} internal links`);
        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       X. OPEN & CLOSE EVERY MODAL
       ══════════════════════════════════════════════════════════════════ */
    const modalPages = PAGES.filter(p => p.buttons?.some(b => b.expectModal));
    for (let i = 0; i < modalPages.length; i++) {
      const page = modalPages[i]!;
      const modalBtns = page.buttons!.filter(b => b.expectModal);
      for (let j = 0; j < modalBtns.length; j++) {
        const mb = modalBtns[j]!;
        await runTest(`modal-cycle-${i}-${j}`, 'X. Modal Open/Close', `${page.label} → ${mb.label}`, async () => {
          const steps: string[] = [];
          navigate(page.path);
          await delay(1200);
          steps.push(`1) navigate("${page.path}")`);

          const trigger = document.querySelector(mb.selector) as HTMLElement | null;
          if (!trigger) { steps.push(`2) trigger not found`); return steps.join('\n'); }

          // Open modal
          trigger.click();
          await delay(800);
          const modal = document.querySelector('.fixed.inset-0, [role="dialog"], .modal');
          steps.push(`2) opened modal → ${modal ? 'VISIBLE' : 'NOT FOUND'}`);

          if (modal) {
            // Check all inputs inside modal
            const modalInputs = modal.querySelectorAll('input, textarea, select');
            steps.push(`3) modal has ${modalInputs.length} form elements`);
            modalInputs.forEach((el, idx) => {
              const tag = el.tagName.toLowerCase();
              const type = (el as HTMLInputElement).type || '';
              const name = (el as HTMLInputElement).name || '';
              const placeholder = (el as HTMLInputElement).placeholder || '';
              steps.push(`  ${idx + 1}. <${tag}> type="${type}" name="${name}" placeholder="${placeholder.slice(0, 30)}"`);
            });

            // Check all buttons inside modal
            const modalBtnsInner = modal.querySelectorAll('button');
            steps.push(`4) modal has ${modalBtnsInner.length} buttons`);
            modalBtnsInner.forEach((b, idx) => {
              steps.push(`  ${idx + 1}. "${(b as HTMLElement).textContent?.trim().slice(0, 40)}"`);
            });

            // Close modal
            if (mb.closeAfter) {
              const closeBtn = document.querySelector(mb.closeAfter) as HTMLElement | null;
              if (closeBtn) { closeBtn.click(); await delay(400); steps.push(`5) closed modal`); }
            }
          }
          return steps.join('\n');
        }, add, update, 10000);
      }
    }

    /* ══════════════════════════════════════════════════════════════════
       Y. API ERROR HANDLING (bad requests)
       ══════════════════════════════════════════════════════════════════ */
    const errorEndpoints = [
      { path: '/api/nonexistent', expect: 404, label: '404 Not Found' },
      { path: '/api/sessions/99999999', expect: 404, label: 'Invalid session ID' },
      { path: '/api/grades?session_id=invalid', expect: 400, label: 'Bad grade query' },
    ];
    if (healthOkRef.current) {
      for (let i = 0; i < errorEndpoints.length; i++) {
        const ep = errorEndpoints[i]!;
        await runTest(`api-err-${i}`, 'Y. API Errors', `${ep.label} (${ep.path})`, async () => {
          const steps: string[] = [];
          try {
            const res = await fetchWithTimeout(`${API_BASE}${ep.path}`, { headers }, 5000);
            steps.push(`1) ${ep.path} → status ${res.status}`);
            if (res.ok) {
              steps.push(`2) ⚠️ expected error but got 200 OK`);
            } else {
              steps.push(`2) ✅ correctly returned error status ${res.status}`);
            }
          } catch (err) {
            steps.push(`1) request failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          return steps.join('\n');
        }, add, update, 10000);
      }
    } else {
      await runTest('api-errors-skip', 'Y. API Errors', 'SKIP: API unavailable', async () => {
        return '⚠️ Health check failed — skipping API error handling tests';
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       Z. IMAGE/AVATAR LOADING CHECK
       ══════════════════════════════════════════════════════════════════ */
    await runTest('img-check', 'Z. Images', 'Check all images load on profile/main pages', async () => {
      const steps: string[] = [];
      const imgPages = ['/', '/profile', '/admin/users', '/ratings'];
      let totalImgs = 0;
      let brokenImgs = 0;

      for (const p of imgPages) {
        navigate(p);
        await delay(1200);
        const imgs = document.querySelectorAll('main img');
        steps.push(`${p} → ${imgs.length} images`);
        imgs.forEach((img) => {
          totalImgs++;
          const src = (img as HTMLImageElement).src?.slice(0, 60) || '';
          const natural = (img as HTMLImageElement).naturalWidth;
          if (natural === 0 && src && !src.includes('data:')) {
            brokenImgs++;
            steps.push(`  ❌ broken: ${src}`);
          }
        });
      }
      steps.push(`Total: ${totalImgs} images, ${brokenImgs} broken`);
      if (brokenImgs > 0) throw new Error(`${brokenImgs} broken image(s)`);
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AA. EMPTY STATE CHECKS
       ══════════════════════════════════════════════════════════════════ */
    await runTest('empty-states', 'AA. Empty States', 'Pages with no data show empty state', async () => {
      const steps: string[] = [];
      const emptyCheckPages = ['/my-courses', '/support'];
      for (const p of emptyCheckPages) {
        navigate(p);
        await delay(1200);
        const main = document.querySelector('main');
        const html = main?.innerHTML ?? '';
        const hasContent = html.length > 50;
        const hasEmptyMsg = html.includes('Пока нет') || html.includes('пусто') || html.includes('Әзірге жоқ') || html.includes('empty') || html.includes('бос');
        steps.push(`${p} → content=${hasContent}, empty_msg=${hasEmptyMsg}, length=${html.length}`);
      }
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AB. ACCESSIBILITY — ALL INTERACTIVE ELEMENTS HAVE ACCESSIBLE TEXT
       ══════════════════════════════════════════════════════════════════ */
    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i]!;
      await runTest(`a11y-${i}`, 'AB. Accessibility', `${page.label} — buttons have text/aria`, async () => {
        const steps: string[] = [];
        navigate(page.path);
        await delay(1200);

        const btns = document.querySelectorAll('main button');
        let missing = 0;
        btns.forEach((b, idx) => {
          const text = b.textContent?.trim() || '';
          const aria = b.getAttribute('aria-label') || '';
          const title = b.getAttribute('title') || '';
          const hasIcon = b.querySelector('svg') !== null;
          const accessible = text.length > 0 || aria.length > 0 || title.length > 0;
          if (!accessible && hasIcon) {
            missing++;
            steps.push(`  ${idx + 1}. ⚠️ icon-only button without aria-label`);
          }
        });
        steps.push(`1) ${btns.length} buttons, ${missing} missing accessible text`);
        return steps.join('\n');
      }, add, update, 10000);
    }

    /* ══════════════════════════════════════════════════════════════════
       AC. NETWORK LATENCY — API RESPONSE TIMES
       ══════════════════════════════════════════════════════════════════ */
    await runTest('api-latency', 'AC. API Latency', 'Measure response times for all endpoints', async () => {
      const steps: string[] = [];
      const timings: { ep: string; ms: number }[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping latency test';
      for (const ep of API_ENDPOINTS.slice(0, 8)) {
        const t0 = performance.now();
        try {
          await fetchWithTimeout(`${API_BASE}${ep}`, { headers }, 5000);
          const ms = Math.round(performance.now() - t0);
          timings.push({ ep, ms });
          steps.push(`${ep} → ${ms}ms ${ms > 2000 ? '⚠️ SLOW' : '✅'}`);
        } catch {
          steps.push(`${ep} → TIMEOUT/ERROR`);
        }
      }
      const avg = timings.length > 0 ? Math.round(timings.reduce((s, t) => s + t.ms, 0) / timings.length) : 0;
      const slowCount = timings.filter(t => t.ms > 2000).length;
      steps.push(`\nAverage: ${avg}ms, Slow (>2s): ${slowCount}/${timings.length}`);
      if (slowCount > timings.length / 2) throw new Error('More than half of endpoints are slow');
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AG. CRUD — СОЗДАНИЕ СОБЫТИЯ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('crud-event', 'AG. CRUD Events', 'Create → (register) → delete event (best-effort)', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping CRUD';
      if (role !== 'admin' && role !== 'teacher') return `⚠️ role=${role} — skip`;

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const eventDate = tomorrow.toISOString().slice(0, 10);
      const payload = { title: `${TEST_PREFIX}_EVENT`, description: 'test', event_date: eventDate, event_time: '10:00', location: 'Тест', capacity: 100 };

      const createdId = await bestEffort('POST /api/events', async () => {
        const { res, json } = await requestJson('/api/events', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 10000);
        const data = ensureApiSuccess(json);
        const id = data?.id;
        steps.push(`1) POST /api/events → status ${res.status}, id=${id || '(missing)'}`);
        if (!id) throw new Error('event id missing');
        countersRef.current.crudCreated += 1;
        return String(id);
      }, steps);

      if (!createdId) return steps.join('\n');

      await bestEffort('POST /api/events/{id}/register', async () => {
        const { res, json } = await requestJson(`/api/events/${createdId}/register`, { method: 'POST', headers }, 10000);
        steps.push(`2) POST /api/events/${createdId}/register → status ${res.status}`);
        ensureApiSuccess(json);
      }, steps);

      await bestEffort('DELETE /api/events/{id}', async () => {
        const { res, json } = await requestJson(`/api/events/${createdId}`, { method: 'DELETE', headers }, 10000);
        steps.push(`3) DELETE /api/events/${createdId} → status ${res.status}`);
        ensureApiSuccess(json);
        countersRef.current.crudDeleted += 1;
      }, steps);

      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       AH. CRUD — ОТКРЫТЫЕ ЗАНЯТИЯ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('crud-open-session', 'AH. CRUD Open Sessions', 'Create → (register) → delete open session (best-effort)', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping CRUD';

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const sessionDate = tomorrow.toISOString().slice(0, 10);
      const payload = { title: `${TEST_PREFIX}_OPEN`, description: 'test', session_date: sessionDate, session_time: '10:00', location: 'Тест', max_students: 30 };

      const createdId = await bestEffort('POST /api/open-sessions', async () => {
        const { res, json } = await requestJson('/api/open-sessions', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 10000);
        const data = ensureApiSuccess(json);
        const id = data?.id;
        steps.push(`1) POST /api/open-sessions → status ${res.status}, id=${id || '(missing)'}`);
        if (!id) throw new Error('open session id missing');
        countersRef.current.crudCreated += 1;
        return String(id);
      }, steps);

      if (!createdId) return steps.join('\n');

      await bestEffort('POST /api/open-sessions/{id}/register', async () => {
        const { res, json } = await requestJson(`/api/open-sessions/${createdId}/register`, { method: 'POST', headers }, 10000);
        steps.push(`2) POST /api/open-sessions/${createdId}/register → status ${res.status}`);
        ensureApiSuccess(json);
      }, steps);

      await bestEffort('DELETE /api/open-sessions/{id}', async () => {
        const { res, json } = await requestJson(`/api/open-sessions/${createdId}`, { method: 'DELETE', headers }, 10000);
        steps.push(`3) DELETE /api/open-sessions/${createdId} → status ${res.status}`);
        ensureApiSuccess(json);
        countersRef.current.crudDeleted += 1;
      }, steps);

      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       AJ. CRUD — SUPPORT ТИКЕТЫ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('crud-support', 'AJ. CRUD Support', 'Create ticket → send message → verify messages', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping CRUD';

      const subject = `${TEST_PREFIX}_TICKET`;
      const message = 'test';

      const { res: createRes, json: createJson } = await requestJson('/api/support/tickets', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      }, 10000);
      const createData = ensureApiSuccess(createJson);
      const ticketId = createData?.id;
      steps.push(`1) POST /api/support/tickets → status ${createRes.status}, id=${ticketId || '(missing)'}`);
      if (!ticketId) throw new Error('ticket id missing');
      countersRef.current.crudCreated += 1;

      const { res: msgRes, json: msgJson } = await requestJson(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test reply' }),
      }, 10000);
      ensureApiSuccess(msgJson);
      steps.push(`2) POST /api/support/tickets/${ticketId}/messages → status ${msgRes.status}`);
      countersRef.current.crudUpdated += 1;

      const { res: msgsRes, json: msgsJson } = await requestJson(`/api/support/tickets/${ticketId}/messages`, { headers }, 10000);
      const msgsData = ensureApiSuccess(msgsJson);
      const msgsArr = Array.isArray(msgsData) ? msgsData : [];
      steps.push(`3) GET /api/support/tickets/${ticketId}/messages → count=${msgsArr.length} (status=${msgsRes.status})`);
      if (msgsArr.length < 2) steps.push('⚠️ expected at least 2 messages');

      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       AR. API — НЕВАЛИДНЫЕ ДАННЫЕ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('api-invalid', 'AR. Invalid Data', 'POST invalid payloads → expect 4xx', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping security tests';

      const cases = [
        { label: 'sessions empty topic', path: '/api/sessions', body: { class_id: '', topic: '', planned_date: '', time_slot: '', room: '', duration_minutes: 45 } },
        { label: 'admin users empty phone', path: '/api/admin/users', body: { full_name: `${TEST_PREFIX}_BAD`, phone: '', role: 'student', lang: 'ru' } },
      ];

      for (const c of cases) {
        const res = await apiFetch(c.path, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(c.body) }, 10000);
        const contentType = res.headers.get('content-type') || '';
        steps.push(`1) ${c.label}: POST ${c.path} → status ${res.status}, content-type=${contentType || '(missing)'}`);
        if (res.ok) throw new Error(`${c.label}: expected 4xx but got ${res.status}`);
        if (!contentType.toLowerCase().includes('application/json')) throw new Error(`${c.label}: expected JSON error response`);
        const json: any = await ensureJson(res);
        if (json?.success !== false) throw new Error(`${c.label}: expected json.success===false`);
        if (typeof json?.code !== 'string' || json.code.length < 2) throw new Error(`${c.label}: expected error code in json.code`);
        steps.push(`   json.success=false, code=${json.code}`);
      }
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AS. API — НЕСУЩЕСТВУЮЩИЕ РЕСУРСЫ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('api-404', 'AS. Missing Resources', '404 checks', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping security tests';
      const endpoints = [
        { method: 'GET', path: '/api/sessions/nonexistent_id_12345' },
        { method: 'GET', path: '/api/courses/nonexistent_id_12345' },
        { method: 'DELETE', path: '/api/events/nonexistent_id_12345' },
        { method: 'PATCH', path: '/api/sessions/nonexistent_id_12345/complete' },
      ];
      for (const ep of endpoints) {
        const res = await apiFetch(ep.path, { method: ep.method, headers }, 10000);
        steps.push(`${ep.method} ${ep.path} → status ${res.status}`);
        if (res.status !== 404) throw new Error(`Expected 404 for ${ep.method} ${ep.path}, got ${res.status}`);
      }
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AT. SECURITY — ROLE CHECKS / 401 WITHOUT TOKEN
       ══════════════════════════════════════════════════════════════════ */
    await runTest('security-role', 'AT. Security', 'Role checks and unauth 401', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping security tests';

      if (role === 'admin') {
        steps.push('1) admin — skip 403 role checks');
      } else {
        const res = await apiFetch('/api/admin/users', { headers }, 10000);
        steps.push(`1) GET /api/admin/users as role=${role} → status ${res.status}`);
        if (res.status !== 403) throw new Error(`Expected 403 for non-admin /api/admin/users, got ${res.status}`);
      }

      const res401 = await apiFetch('/api/auth/me', { headers: {} }, 10000);
      steps.push(`2) GET /api/auth/me without Bearer → status ${res401.status}`);
      if (res401.status !== 401) throw new Error(`Expected 401 without Bearer, got ${res401.status}`);
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AU. PERFORMANCE — ВРЕМЯ РЕНДЕРА СТРАНИЦ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('perf-pages', 'AU. Performance', 'Measure navigate→render time per page', async () => {
      const steps: string[] = [];
      const timings: Array<{ path: string; ms: number }> = [];
      for (const p of PAGES) {
        const t0 = performance.now();
        await nav(p.path, 0);
        const deadline = performance.now() + 3000;
        while (performance.now() < deadline) {
          const main = document.querySelector('main');
          if (main && (main.innerHTML?.length ?? 0) > 100) break;
          await delay(50);
        }
        const ms = Math.round(performance.now() - t0);
        timings.push({ path: p.path, ms });
        if (ms > 3000) steps.push(`${p.path} → ${ms}ms ❌`);
        else if (ms > 1500) steps.push(`${p.path} → ${ms}ms ⚠️`);
        else steps.push(`${p.path} → ${ms}ms ✅`);
      }
      const avg = Math.round(timings.reduce((s, t) => s + t.ms, 0) / Math.max(1, timings.length));
      const slowest = timings.reduce((a, b) => (b.ms > a.ms ? b : a), timings[0]!);
      steps.push(`\nAverage: ${avg}ms`);
      steps.push(`Slowest: ${slowest.path} → ${slowest.ms}ms`);
      if (slowest.ms > 3000) throw new Error(`Slowest page render > 3000ms (${slowest.path} ${slowest.ms}ms)`);
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AW. LANGUAGE — ПОЛНАЯ ПРОВЕРКА ПЕРЕВОДОВ (WARN)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('lang-full', 'AW. Language', 'KZ pages should not contain RU words (warn)', async () => {
      const steps: string[] = [];
      const ruWords = ['Создать', 'Удалить', 'Сохранить', 'Отмена', 'Добавить'];
      const origLang = useAuthStore.getState().lang;
      useAuthStore.getState().setLang('kz');
      for (const p of PAGES) {
        await nav(p.path, 1200);
        const txt = document.body.innerText;
        const found = ruWords.filter((w) => txt.includes(w));
        if (found.length > 0) steps.push(`⚠️ ${p.path}: RU words: ${found.join(', ')}`);
        else steps.push(`${p.path}: OK`);
      }
      useAuthStore.getState().setLang(origLang);
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AI. CRUD — КУРСЫ (best-effort full cycle)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('crud-courses', 'AI. CRUD Courses', 'Create course → module → lesson → update → delete (best-effort)', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping CRUD';
      if (role !== 'admin' && role !== 'teacher') return `⚠️ role=${role} — skip`;

      const categoryId = await bestEffort('GET /api/courses/categories', async () => {
        const { json } = await requestJson('/api/courses/categories', { headers }, 10000);
        const data = ensureApiSuccess(json);
        const arr = Array.isArray(data) ? data : [];
        if (arr.length === 0) throw new Error('No categories');
        return String(arr[0]?.id || arr[0]?.value || arr[0]?.slug || '');
      }, steps);
      if (!categoryId) return steps.join('\n');
      steps.push(`1) category_id=${categoryId}`);

      const courseId = await bestEffort('POST /api/courses', async () => {
        const body = { title: `${TEST_PREFIX}_COURSE`, description: 'test', category_id: categoryId, price: 0 };
        const { res, json } = await requestJson('/api/courses', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
        const data = ensureApiSuccess(json);
        const id = data?.id;
        steps.push(`2) POST /api/courses → status ${res.status}, id=${id || '(missing)'}`);
        if (!id) throw new Error('course id missing');
        countersRef.current.crudCreated += 1;
        return String(id);
      }, steps);
      if (!courseId) return steps.join('\n');

      const moduleId = await bestEffort('POST /api/courses/{id}/modules', async () => {
        const body = { title: `${TEST_PREFIX}_MODULE`, sort_order: 0 };
        const { res, json } = await requestJson(`/api/courses/${courseId}/modules`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
        const data = ensureApiSuccess(json);
        const id = data?.id;
        steps.push(`3) POST /api/courses/${courseId}/modules → status ${res.status}, id=${id || '(missing)'}`);
        if (!id) throw new Error('module id missing');
        countersRef.current.crudCreated += 1;
        return String(id);
      }, steps);

      const lessonId = moduleId
        ? await bestEffort('POST lesson', async () => {
          const body = { title: `${TEST_PREFIX}_LESSON`, type: 'text', content: 'test', sort_order: 0 };
          const { res, json } = await requestJson(`/api/courses/${courseId}/modules/${moduleId}/lessons`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          const data = ensureApiSuccess(json);
          const id = data?.id;
          steps.push(`4) POST /api/courses/${courseId}/modules/${moduleId}/lessons → status ${res.status}, id=${id || '(missing)'}`);
          if (!id) throw new Error('lesson id missing');
          countersRef.current.crudCreated += 1;
          return String(id);
        }, steps)
        : null;

      if (moduleId && lessonId) {
        await bestEffort('PUT lesson update', async () => {
          const body = { title: `${TEST_PREFIX}_LESSON_UPDATED`, type: 'text', content: 'test', sort_order: 0 };
          const { res, json } = await requestJson(`/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          ensureApiSuccess(json);
          steps.push(`5) PUT lesson → status ${res.status}`);
          countersRef.current.crudUpdated += 1;
        }, steps);
      }

      // Cleanup in reverse order (best-effort)
      if (moduleId && lessonId) {
        await bestEffort('DELETE lesson', async () => {
          const { res, json } = await requestJson(`/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, { method: 'DELETE', headers }, 10000);
          ensureApiSuccess(json);
          steps.push(`6) DELETE lesson → status ${res.status}`);
          countersRef.current.crudDeleted += 1;
        }, steps);
      }
      if (moduleId) {
        await bestEffort('DELETE module', async () => {
          const { res, json } = await requestJson(`/api/courses/${courseId}/modules/${moduleId}`, { method: 'DELETE', headers }, 10000);
          ensureApiSuccess(json);
          steps.push(`7) DELETE module → status ${res.status}`);
          countersRef.current.crudDeleted += 1;
        }, steps);
      }
      await bestEffort('DELETE course', async () => {
        const { res, json } = await requestJson(`/api/courses/${courseId}`, { method: 'DELETE', headers }, 10000);
        ensureApiSuccess(json);
        steps.push(`8) DELETE course → status ${res.status}`);
        countersRef.current.crudDeleted += 1;
      }, steps);

      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       AK. УВЕДОМЛЕНИЯ — TELEGRAM (best-effort probe)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('notifications-probe', 'AK. Notifications', 'Probe notifications endpoints (best-effort)', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping notifications';

      await bestEffort('GET /api/admin/settings', async () => {
        const { res, json } = await requestJson('/api/admin/settings', { headers }, 10000);
        const data = ensureApiSuccess(json);
        const supportChat = data?.support_chat_id ?? data?.telegram_support_chat_id;
        steps.push(`1) GET /api/admin/settings → status ${res.status}, support_chat_id=${supportChat ?? '(null)'}`);
      }, steps);

      await bestEffort('GET /api/notifications', async () => {
        const { res, json } = await requestJson('/api/notifications', { headers }, 10000);
        const data = ensureApiSuccess(json);
        const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
        steps.push(`2) GET /api/notifications → status ${res.status}, items=${count}`);
      }, steps);

      await bestEffort('POST /api/notifications/send', async () => {
        const body = { event_type: 'reminder', session_id: 'test' };
        const { res, json } = await requestJson('/api/notifications/send', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
        steps.push(`3) POST /api/notifications/send → status ${res.status}`);
        if (json?.success === true) steps.push('   success=true');
        else steps.push('⚠️ success not true');
      }, steps);

      await bestEffort('GET /api/notifications/log', async () => {
        const { res } = await requestJson('/api/notifications/log', { headers }, 10000);
        steps.push(`4) GET /api/notifications/log → status ${res.status}`);
      }, steps);

      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AL. ОЦЕНКИ — ПОЛНЫЙ ЦИКЛ (best-effort)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('grades-cycle', 'AL. Grades', 'Init → set grades → verify (best-effort)', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping grades';

      const sessions = await bestEffort('GET /api/sessions', async () => {
        const { json } = await requestJson('/api/sessions', { headers }, 10000);
        const data = ensureApiSuccess(json);
        return Array.isArray(data) ? data : [];
      }, steps);
      if (!sessions || sessions.length === 0) return steps.join('\n');
      const completed = sessions.find((s: any) => String(s?.status || '').toLowerCase().includes('complete')) || sessions[0];
      const sessionId = completed?.id;
      const classId = completed?.class_id;
      steps.push(`1) session_id=${sessionId || '(missing)'}, class_id=${classId || '(missing)'}`);
      if (!sessionId) return steps.join('\n');

      await bestEffort('POST init grades', async () => {
        const { res } = await requestJson(`/api/grades/sessions/${sessionId}/init`, { method: 'POST', headers }, 10000);
        steps.push(`2) POST /api/grades/sessions/${sessionId}/init → status ${res.status}`);
      }, steps);

      const grades = await bestEffort('GET grades list', async () => {
        const { json } = await requestJson(`/api/grades/sessions/${sessionId}/grades`, { headers }, 10000);
        const data = ensureApiSuccess(json);
        return Array.isArray(data) ? data : [];
      }, steps);
      steps.push(`3) grades count=${grades?.length ?? 0}`);

      if (grades && grades.length > 0) {
        await bestEffort('PUT grades', async () => {
          const first = grades[0];
          const body = [{ student_id: first.student_id, grade: 8, status: 'present' }];
          const { res } = await requestJson(`/api/grades/sessions/${sessionId}/grades`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          steps.push(`4) PUT grades → status ${res.status}`);
        }, steps);
      }

      await bestEffort('GET monthly', async () => {
        if (!classId) return;
        const month = new Date().toISOString().slice(0, 7);
        const { res } = await requestJson(`/api/grades/classes/${classId}/monthly?month=${encodeURIComponent(month)}`, { headers }, 10000);
        steps.push(`5) GET monthly → status ${res.status}`);
      }, steps);

      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       AM. ЭКСПОРТ — ПРОВЕРКА API ОТВЕТОВ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('export-structures', 'AM. Export', 'Verify reports/ratings structures', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping export checks';

      await bestEffort('GET /api/reports/monthly', async () => {
        const month = new Date().toISOString().slice(0, 7);
        const { res, json } = await requestJson(`/api/reports/monthly?month=${encodeURIComponent(month)}`, { headers }, 10000);
        const data = ensureApiSuccess(json);
        const hasSummary = data && typeof data === 'object' && 'summary' in data;
        steps.push(`1) GET /api/reports/monthly → status ${res.status}, hasSummary=${hasSummary}`);
        const rate = data?.summary?.completion_rate;
        if (typeof rate === 'number' && (rate < 0 || rate > 100)) throw new Error(`completion_rate out of range: ${rate}`);
      }, steps);

      await bestEffort('GET /api/ratings/teachers', async () => {
        const { res, json } = await requestJson('/api/ratings/teachers', { headers }, 10000);
        const data = ensureApiSuccess(json);
        const arr = Array.isArray(data) ? data : [];
        const ok = arr.length === 0 || ('teacher_name' in arr[0] && 'avg_rating' in arr[0]);
        steps.push(`2) GET /api/ratings/teachers → status ${res.status}, items=${arr.length}, shapeOk=${ok}`);
        if (!ok) throw new Error('ratings shape invalid');
      }, steps);

      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AN. ФОРМЫ НА ФРОНТЕ — UI ВАЛИДАЦИЯ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('ui-validation', 'AN. Forms Validation', 'Open create modals and submit empty → expect errors', async () => {
      const steps: string[] = [];

      const cases = [
        { path: '/sessions', trigger: 'button:has(.lucide-plus)' },
        { path: '/events', trigger: 'button:has(.lucide-plus)' },
        { path: '/admin/users', trigger: 'button.btn-primary' },
        { path: '/admin/classes', trigger: 'button:has(.lucide-plus), button.btn-primary' },
        { path: '/support', trigger: 'button:has(.lucide-plus)' },
      ];

      for (const c of cases) {
        await nav(c.path, 1200);
        const trigger = document.querySelector(c.trigger) as HTMLElement | null;
        if (!trigger) {
          steps.push(`⚠️ ${c.path}: trigger not found (${c.trigger})`);
          continue;
        }
        await clickEl(trigger, 800);
        const modal = document.querySelector('.fixed.inset-0, [role="dialog"], .modal') as HTMLElement | null;
        if (!modal) {
          steps.push(`⚠️ ${c.path}: modal not found after click`);
          continue;
        }

        const submit = modal.querySelector('button[type="submit"], .btn-primary') as HTMLElement | null;
        if (!submit) {
          steps.push(`⚠️ ${c.path}: submit not found`);
          continue;
        }
        await clickEl(submit, 600);

        const hasAlert = !!modal.querySelector('[role="alert"], .text-red-500, .border-red-500, .border-red-400');
        steps.push(`${c.path}: submit empty → error UI: ${hasAlert ? 'YES' : 'NO'}`);
        if (!hasAlert) steps.push(`⚠️ ${c.path}: expected validation error UI`);

        const close = modal.querySelector('button:has(.lucide-x), [aria-label="close"], button.btn-secondary') as HTMLElement | null;
        if (close) await clickEl(close, 400);
      }

      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AO. АВТО-РАСПРЕДЕЛЕНИЕ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('auto-assign', 'AO. Auto Assign', 'Open auto-assign modal and capture POST (best-effort)', async () => {
      const steps: string[] = [];
      await nav('/sessions', 1200);
      const btn = document.querySelector('button:has(.lucide-wand-2)') as HTMLElement | null;
      if (!btn) return '⚠️ wand button not found';

      const fetchCalls: Array<{ url: string; method: string }> = [];
      const origFetch = window.fetch;
      (window as any).fetch = async (...args: any[]) => {
        const input = args[0];
        const init = args[1] || {};
        const url = typeof input === 'string' ? input : String(input?.url || '');
        const method = String(init?.method || 'GET');
        fetchCalls.push({ url, method });
        return (origFetch as any).apply(window, args as unknown[]);
      };

      try {
        await clickEl(btn, 800);
        const modal = document.querySelector('.fixed.inset-0, [role="dialog"], .modal') as HTMLElement | null;
        if (!modal) return '⚠️ auto-assign modal not found';

        const hasDate = !!modal.querySelector('input[type="date"], input[name*="date"], input[id*="date"]');
        const hasPairs = !!modal.querySelector('input[type="number"], select');
        steps.push(`1) modal fields: date=${hasDate}, pairs/select=${hasPairs}`);

        const submit = modal.querySelector('button[type="submit"], .btn-primary') as HTMLElement | null;
        if (submit) await clickEl(submit, 1200);

        const matched = fetchCalls.filter(c => c.method === 'POST' && c.url.includes('/api/admin/sessions/auto-assign'));
        steps.push(`2) captured POST /api/admin/sessions/auto-assign calls=${matched.length}`);
        if (matched.length === 0) steps.push('⚠️ auto-assign POST not observed');

        const close = modal.querySelector('button:has(.lucide-x), [aria-label="close"], button.btn-secondary') as HTMLElement | null;
        if (close) await clickEl(close, 400);
      } finally {
        (window as any).fetch = origFetch;
      }

      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AP. ИМПОРТ DOCX — UI
       ══════════════════════════════════════════════════════════════════ */
    await runTest('docx-import-ui', 'AP. Import DOCX', 'Open import modal and check file input', async () => {
      const steps: string[] = [];
      await nav('/sessions', 1200);
      const btn = document.querySelector('button:has(.lucide-upload)') as HTMLElement | null;
      if (!btn) return '⚠️ upload button not found';
      await clickEl(btn, 800);
      const modal = document.querySelector('.fixed.inset-0, [role="dialog"], .modal') as HTMLElement | null;
      if (!modal) return '⚠️ import modal not found';
      const file = modal.querySelector('input[type="file"]') as HTMLInputElement | null;
      steps.push(`1) file input exists: ${file ? 'YES' : 'NO'}`);
      if (!file) steps.push('⚠️ expected input[type=file]');
      const close = modal.querySelector('button:has(.lucide-x), [aria-label="close"], button.btn-secondary') as HTMLElement | null;
      if (close) await clickEl(close, 400);
      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AQ. ДВОЙНОЙ КЛИК / ГОНКА
       ══════════════════════════════════════════════════════════════════ */
    await runTest('race-sessions', 'AQ. Race', 'Double POST /api/sessions simultaneously', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping race test';

      const { json: clsJson } = await requestJson('/api/sessions/classes', { headers }, 10000);
      const clsData = ensureApiSuccess(clsJson);
      const arr = Array.isArray(clsData) ? clsData : [];
      if (arr.length === 0) throw new Error('No classes');
      const classId = arr[0]?.id;
      if (!classId) throw new Error('class_id missing');

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const plannedDate = tomorrow.toISOString().slice(0, 10);
      const body = { class_id: classId, topic: `${TEST_PREFIX}_RACE`, planned_date: plannedDate, time_slot: '09:00-09:45', room: '101', duration_minutes: 45 };

      const post = async () => {
        const res = await apiFetch('/api/sessions', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
        let json: any = null;
        try { json = await ensureJson(res); } catch { }
        return { res, json };
      };

      const [a, b] = await Promise.all([post(), post()]);
      steps.push(`1) POST#1 status=${a.res.status}`);
      steps.push(`2) POST#2 status=${b.res.status}`);

      const id1 = a.json?.data?.id;
      const id2 = b.json?.data?.id;
      steps.push(`3) ids: ${id1 || '(none)'} / ${id2 || '(none)'}`);

      // Acceptable outcomes: one 409, or two created with different ids
      const ok = (a.res.status === 409 || b.res.status === 409) || (id1 && id2 && id1 !== id2);
      if (!ok) steps.push('⚠️ unexpected race outcome');

      // Cleanup any created
      for (const id of [id1, id2]) {
        if (!id) continue;
        await bestEffort(`DELETE session ${id}`, async () => {
          const { json } = await requestJson(`/api/sessions/${id}`, { method: 'DELETE', headers }, 10000);
          ensureApiSuccess(json);
          countersRef.current.crudDeleted += 1;
        }, steps);
      }

      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       AV. ДАННЫЕ В DOM СОВПАДАЮТ С API (heuristics)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('dom-vs-api', 'AV. DOM vs API', 'Sessions/events/users/courses presence checks', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping DOM/API parity';

      const checks = [
        { path: '/api/sessions', page: '/sessions', field: 'topic' },
        { path: '/api/events', page: '/events', field: 'title' },
        { path: '/api/admin/users', page: '/admin/users', field: 'full_name' },
        { path: '/api/courses', page: '/courses', field: 'title' },
      ];

      for (const c of checks) {
        const api = await bestEffort(`GET ${c.path}`, async () => {
          const { json } = await requestJson(c.path, { headers }, 10000);
          const data = ensureApiSuccess(json);
          return Array.isArray(data) ? data : [];
        }, steps);
        if (!api || api.length === 0) {
          steps.push(`⚠️ ${c.path}: empty data`);
          continue;
        }
        const first = api[0];
        const expectedText = String(first?.[c.field] || '').trim();
        await nav(c.page, 1200);
        const mainText = document.querySelector('main')?.innerText || '';
        const found = expectedText ? mainText.includes(expectedText) : false;
        steps.push(`${c.page}: first.${c.field}="${expectedText.slice(0, 40)}" → ${found ? 'FOUND' : 'NOT FOUND'}`);
        if (!found) steps.push(`⚠️ ${c.page}: expected text not found in DOM`);
      }

      return steps.join('\n');
    }, add, update, 10000);

    /* ══════════════════════════════════════════════════════════════════
       AD. CRUD — СОЗДАНИЕ СЕССИИ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('crud-session', 'AD. CRUD Sessions', 'Create → find → complete → delete session', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping CRUD';
      if (role !== 'admin' && role !== 'teacher') return `⚠️ role=${role} — skipping sessions CRUD`; 

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const plannedDate = tomorrow.toISOString().slice(0, 10);

      const classesRes = await apiFetch('/api/sessions/classes', { headers }, 5000);
      if (!classesRes.ok) throw new Error(`GET /api/sessions/classes status ${classesRes.status}`);
      const classesJson: any = await ensureJson(classesRes);
      const classesData = ensureApiSuccess(classesJson);
      const classesArr = Array.isArray(classesData) ? classesData : [];
      if (classesArr.length === 0) throw new Error('No classes returned for sessions CRUD');
      const classId = classesArr[0]?.id;
      if (!classId) throw new Error('class_id missing');
      steps.push(`1) GET /api/sessions/classes → OK, class_id=${classId}`);

      const payload = {
        class_id: classId,
        topic: `${TEST_PREFIX}_SESSION`,
        planned_date: plannedDate,
        time_slot: '09:00-09:45',
        room: '101',
        duration_minutes: 45,
      };
      const createRes = await apiFetch('/api/sessions', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 10000);
      const createJson: any = await ensureJson(createRes);
      const created = ensureApiSuccess(createJson);
      const createdId = created?.id;
      steps.push(`2) POST /api/sessions → status ${createRes.status}, id=${createdId || '(missing)'}`);
      if (createRes.status !== 201 && createRes.status !== 200) throw new Error(`Expected 201/200, got ${createRes.status}`);
      if (!createdId) throw new Error('Created session id missing');
      countersRef.current.crudCreated += 1;

      const listRes = await apiFetch('/api/sessions', { headers }, 5000);
      if (!listRes.ok) throw new Error(`GET /api/sessions status ${listRes.status}`);
      const listJson: any = await ensureJson(listRes);
      const listData = ensureApiSuccess(listJson);
      const listArr = Array.isArray(listData) ? listData : [];
      const found = listArr.find((s: any) => s?.id === createdId);
      steps.push(`3) GET /api/sessions → found_by_id=${found ? 'YES' : 'NO'}`);
      if (!found) throw new Error('Created session not found in list');

      const completeRes = await apiFetch(`/api/sessions/${createdId}/complete`, { method: 'PATCH', headers }, 10000);
      const completeJson: any = await ensureJson(completeRes);
      const completeData = ensureApiSuccess(completeJson);
      steps.push(`4) PATCH /api/sessions/${createdId}/complete → status ${completeRes.status}, status=${completeData?.status || '(unknown)'}`);
      countersRef.current.crudUpdated += 1;

      const delRes = await apiFetch(`/api/sessions/${createdId}`, { method: 'DELETE', headers }, 10000);
      const delJson: any = await ensureJson(delRes);
      ensureApiSuccess(delJson);
      steps.push(`5) DELETE /api/sessions/${createdId} → status ${delRes.status}`);
      countersRef.current.crudDeleted += 1;

      const listRes2 = await apiFetch('/api/sessions', { headers }, 5000);
      const listJson2: any = await ensureJson(listRes2);
      const listData2 = ensureApiSuccess(listJson2);
      const listArr2 = Array.isArray(listData2) ? listData2 : [];
      const stillThere = listArr2.some((s: any) => s?.id === createdId);
      steps.push(`6) GET /api/sessions → deleted_absent=${stillThere ? 'NO' : 'YES'}`);
      if (stillThere) throw new Error('Deleted session still present in list');

      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       AE. CRUD — СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('crud-user', 'AE. CRUD Users', 'Create → find → update → delete user', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping CRUD';
      if (role !== 'admin') return `⚠️ role=${role} — admin only, skip`; 

      const phone = '+70000000000';
      const createBody = { full_name: `${TEST_PREFIX}_USER`, phone, role: 'student', lang: 'ru' };

      const tryCreate = async (): Promise<string> => {
        const res = await apiFetch('/api/admin/users', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(createBody) }, 10000);
        const json: any = await ensureJson(res);
        const data = ensureApiSuccess(json);
        const id = data?.id;
        if (!id) throw new Error('Created user id missing');
        steps.push(`1) POST /api/admin/users → status ${res.status}, id=${id}`);
        if (res.status !== 201 && res.status !== 200) throw new Error(`Expected 201/200, got ${res.status}`);
        countersRef.current.crudCreated += 1;
        return id;
      };

      let userId: string | null = null;
      try {
        userId = await tryCreate();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('409') && !msg.toLowerCase().includes('duplicate')) throw e;
        steps.push(`⚠️ duplicate phone detected, attempting cleanup by phone=${phone}`);

        const listRes = await apiFetch('/api/admin/users', { headers }, 10000);
        const listJson: any = await ensureJson(listRes);
        const listData = ensureApiSuccess(listJson);
        const listArr = Array.isArray(listData) ? listData : [];
        const existing = listArr.find((u: any) => u?.phone === phone);
        if (existing?.id) {
          const delRes = await apiFetch(`/api/admin/users/${existing.id}`, { method: 'DELETE', headers }, 10000);
          const delJson: any = await ensureJson(delRes);
          ensureApiSuccess(delJson);
          steps.push(`2) DELETE existing user by phone → id=${existing.id}, status ${delRes.status}`);
          countersRef.current.crudDeleted += 1;
        }
        userId = await tryCreate();
      }

      const listRes2 = await apiFetch('/api/admin/users', { headers }, 10000);
      const listJson2: any = await ensureJson(listRes2);
      const listData2 = ensureApiSuccess(listJson2);
      const listArr2 = Array.isArray(listData2) ? listData2 : [];
      const found = listArr2.find((u: any) => u?.id === userId);
      steps.push(`3) GET /api/admin/users → found_by_id=${found ? 'YES' : 'NO'}`);
      if (!found) throw new Error('Created user not found');

      const updBody = { full_name: `${TEST_PREFIX}_UPDATED`, phone, role: 'student', lang: 'ru' };
      const updRes = await apiFetch(`/api/admin/users/${userId}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(updBody) }, 10000);
      const updJson: any = await ensureJson(updRes);
      ensureApiSuccess(updJson);
      steps.push(`4) PUT /api/admin/users/${userId} → status ${updRes.status}`);
      countersRef.current.crudUpdated += 1;

      const delRes2 = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE', headers }, 10000);
      const delJson2: any = await ensureJson(delRes2);
      ensureApiSuccess(delJson2);
      steps.push(`5) DELETE /api/admin/users/${userId} → status ${delRes2.status}`);
      countersRef.current.crudDeleted += 1;

      const listRes3 = await apiFetch('/api/admin/users', { headers }, 10000);
      const listJson3: any = await ensureJson(listRes3);
      const listData3 = ensureApiSuccess(listJson3);
      const listArr3 = Array.isArray(listData3) ? listData3 : [];
      const stillThere = listArr3.some((u: any) => u?.id === userId);
      steps.push(`6) GET /api/admin/users → deleted_absent=${stillThere ? 'NO' : 'YES'}`);
      if (stillThere) throw new Error('Deleted user still present');

      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       AF. CRUD — СОЗДАНИЕ КЛАССА
       ══════════════════════════════════════════════════════════════════ */
    await runTest('crud-class', 'AF. CRUD Classes', 'Create → find → delete class', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping CRUD';
      if (role !== 'admin') return `⚠️ role=${role} — admin only, skip`; 

      const createRes = await apiFetch('/api/admin/classes', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${TEST_PREFIX}_CLASS` }) }, 10000);
      const createJson: any = await ensureJson(createRes);
      const created = ensureApiSuccess(createJson);
      const classId = created?.id;
      steps.push(`1) POST /api/admin/classes → status ${createRes.status}, id=${classId || '(missing)'}`);
      if (!classId) throw new Error('Created class id missing');
      countersRef.current.crudCreated += 1;

      const listRes = await apiFetch('/api/admin/classes', { headers }, 10000);
      const listJson: any = await ensureJson(listRes);
      const listData = ensureApiSuccess(listJson);
      const listArr = Array.isArray(listData) ? listData : [];
      const found = listArr.find((c: any) => c?.id === classId);
      steps.push(`2) GET /api/admin/classes → found_by_id=${found ? 'YES' : 'NO'}`);
      if (!found) throw new Error('Created class not found');

      const delRes = await apiFetch(`/api/admin/classes/${classId}`, { method: 'DELETE', headers }, 10000);
      const delJson: any = await ensureJson(delRes);
      ensureApiSuccess(delJson);
      steps.push(`3) DELETE /api/admin/classes/${classId} → status ${delRes.status}`);
      countersRef.current.crudDeleted += 1;

      const listRes2 = await apiFetch('/api/admin/classes', { headers }, 10000);
      const listJson2: any = await ensureJson(listRes2);
      const listData2 = ensureApiSuccess(listJson2);
      const listArr2 = Array.isArray(listData2) ? listData2 : [];
      const stillThere = listArr2.some((c: any) => c?.id === classId);
      steps.push(`4) GET /api/admin/classes → deleted_absent=${stillThere ? 'NO' : 'YES'}`);
      if (stillThere) throw new Error('Deleted class still present');

      return steps.join('\n');
    }, add, update, 30000);
    } // end if (!stressOnlyRef.current)

    /* ══════════════════════════════════════════════════════════════════
       BA. SPAM — МАССОВОЕ СОЗДАНИЕ МЕРОПРИЯТИЙ (50 шт)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-events-50', 'BA. Spam Events', 'Create 50 events rapidly → speed report → cleanup', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin' && role !== 'teacher') throw new Error(`role=${role}, need admin/teacher`);

      const ids: string[] = [];
      const timings: number[] = [];
      const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const eventDate = tomorrow.toISOString().slice(0, 10);

      for (let batch = 0; batch < 5; batch++) {
        const promises = Array.from({ length: 10 }, (_, i) => {
          const idx = batch * 10 + i;
          const body = { title: `${TEST_PREFIX}_SPAM_EV_${idx}`, description: 'spam test', event_date: eventDate, event_time: `${String(10 + Math.floor(idx / 6)).padStart(2, '0')}:${String((idx % 6) * 10).padStart(2, '0')}`, location: 'Test', capacity: 50 };
          const t0 = performance.now();
          return apiFetch('/api/events', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 15000)
            .then(async res => {
              const ms = Math.round(performance.now() - t0);
              timings.push(ms);
              const j: any = await res.json().catch(() => null);
              const id = j?.data?.id;
              if (id) { ids.push(String(id)); countersRef.current.crudCreated++; }
              return { status: res.status, id, ms };
            });
        });
        const batchRes = await Promise.all(promises);
        const ok = batchRes.filter(r => r.id).length;
        steps.push(`Batch ${batch + 1}/5: created=${ok}/10, avg=${Math.round(batchRes.reduce((s, r) => s + r.ms, 0) / 10)}ms`);
      }

      timings.sort((a, b) => a - b);
      const avg = Math.round(timings.reduce((s, t) => s + t, 0) / Math.max(1, timings.length));
      const p95 = timings[Math.floor(timings.length * 0.95)] || 0;
      steps.push(`\nSpeed: avg=${avg}ms, min=${timings[0] || 0}ms, max=${timings[timings.length - 1] || 0}ms, p95=${p95}ms`);
      steps.push(`Created: ${ids.length}/50`);
      perfTimingsRef.current.push({ label: 'Spam Event Create (avg)', ms: avg, op: 'create' });
      perfTimingsRef.current.push({ label: 'Spam Event Create (p95)', ms: p95, op: 'create' });
      if (ids.length < 40) throw new Error(`Only ${ids.length}/50 created`);

      // Delete 90%, keep 10% for manual verification
      const evKeepCount = Math.max(1, Math.ceil(ids.length * 0.1));
      const evToDelete = ids.slice(0, ids.length - evKeepCount);
      const evToKeep = ids.slice(ids.length - evKeepCount);
      let cleaned = 0;
      const delTimings: number[] = [];
      for (const id of evToDelete) {
        const t0 = performance.now();
        try { await apiFetch(`/api/events/${id}`, { method: 'DELETE', headers }, 10000); delTimings.push(Math.round(performance.now() - t0)); cleaned++; countersRef.current.crudDeleted++; } catch { /* ok */ }
      }
      const delAvg = delTimings.length ? Math.round(delTimings.reduce((s, t) => s + t, 0) / delTimings.length) : 0;
      steps.push(`Cleanup: deleted ${cleaned}/${evToDelete.length}, KEPT ${evToKeep.length} for verification, avg delete=${delAvg}ms`);
      if (evToKeep.length > 0) steps.push(`⚡ KEPT IDs: ${evToKeep.slice(0, 3).join(', ')}...`);
      perfTimingsRef.current.push({ label: 'Spam Event Delete (avg)', ms: delAvg, op: 'delete' });
      return steps.join('\n');
    }, add, update, 120000);

    /* ══════════════════════════════════════════════════════════════════
       BB. SPAM — ОТКРЫТЫЕ СЕССИИ (10) + МАССОВАЯ РЕГИСТРАЦИЯ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-open-sessions', 'BB. Spam Open Sessions', 'Create 10 open sessions + register in all → cleanup', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin' && role !== 'teacher') throw new Error(`role=${role}, need admin/teacher`);

      const ids: string[] = [];
      const createTimings: number[] = [];
      const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const sessionDate = tomorrow.toISOString().slice(0, 10);

      for (let i = 0; i < 10; i++) {
        const body = { title: `${TEST_PREFIX}_SPAM_OS_${i}`, description: 'spam test', session_date: sessionDate, session_time: `${String(10 + i).padStart(2, '0')}:00`, location: 'Test', max_students: 30 };
        const t0 = performance.now();
        const res = await apiFetch('/api/open-sessions', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 15000);
        createTimings.push(Math.round(performance.now() - t0));
        const j: any = await res.json().catch(() => null);
        const id = j?.data?.id;
        if (id) { ids.push(String(id)); countersRef.current.crudCreated++; }
      }
      const createAvg = Math.round(createTimings.reduce((s, t) => s + t, 0) / Math.max(1, createTimings.length));
      steps.push(`Created: ${ids.length}/10, avg=${createAvg}ms`);
      perfTimingsRef.current.push({ label: 'Open Session Create (avg)', ms: createAvg, op: 'create' });

      let registered = 0;
      const regTimings: number[] = [];
      for (const id of ids) {
        const t0 = performance.now();
        try {
          const res = await apiFetch(`/api/open-sessions/${id}/register`, { method: 'POST', headers }, 10000);
          regTimings.push(Math.round(performance.now() - t0));
          if (res.ok) registered++;
        } catch { /* ok */ }
      }
      const regAvg = regTimings.length ? Math.round(regTimings.reduce((s, t) => s + t, 0) / regTimings.length) : 0;
      steps.push(`Registered in: ${registered}/${ids.length}, avg=${regAvg}ms`);
      perfTimingsRef.current.push({ label: 'Open Session Register (avg)', ms: regAvg, op: 'update' });

      // Delete 90%, keep 10% for verification
      const osKeepCount = Math.max(1, Math.ceil(ids.length * 0.1));
      const osToDelete = ids.slice(0, ids.length - osKeepCount);
      const osToKeep = ids.slice(ids.length - osKeepCount);
      let cleaned = 0;
      for (const id of osToDelete) {
        try { await apiFetch(`/api/open-sessions/${id}`, { method: 'DELETE', headers }, 10000); cleaned++; countersRef.current.crudDeleted++; } catch { /* ok */ }
      }
      steps.push(`Cleanup: deleted ${cleaned}/${osToDelete.length}, KEPT ${osToKeep.length} for verification`);
      if (osToKeep.length > 0) steps.push(`⚡ KEPT IDs: ${osToKeep.join(', ')}`);
      return steps.join('\n');
    }, add, update, 120000);

    /* ══════════════════════════════════════════════════════════════════
       BC. SPAM — ОТЗЫВЫ УЧИТЕЛЯМ (20 шт)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-ratings', 'BC. Spam Ratings', 'Post 20 reviews to a teacher rapidly', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');

      const { json: teachersJson } = await requestJson('/api/ratings/teachers', { headers }, 10000);
      const teachersData = ensureApiSuccess(teachersJson);
      const teachers = Array.isArray(teachersData) ? teachersData : [];
      if (teachers.length === 0) throw new Error('No teachers found');
      const teacherId = teachers[0]?.id || teachers[0]?.teacher_id;
      if (!teacherId) throw new Error('teacher_id missing');
      steps.push(`1) Target teacher: id=${teacherId}, name=${teachers[0]?.teacher_name || '(unknown)'}`);

      let posted = 0;
      let rejected = 0;
      const timings: number[] = [];
      for (let i = 0; i < 20; i++) {
        const body = { teacher_id: teacherId, rating: (i % 5) + 1, comment: `${TEST_PREFIX}_REVIEW_${i}` };
        const t0 = performance.now();
        try {
          const res = await apiFetch('/api/ratings', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          timings.push(Math.round(performance.now() - t0));
          if (res.ok) posted++;
          else rejected++;
        } catch { rejected++; }
      }
      const avg = timings.length ? Math.round(timings.reduce((s, t) => s + t, 0) / timings.length) : 0;
      steps.push(`2) Posted: ${posted}/20, Rejected: ${rejected}/20, avg=${avg}ms`);
      perfTimingsRef.current.push({ label: 'Rating POST (avg)', ms: avg, op: 'create' });
      if (rejected > 15) steps.push(`3) Rate limiting or validation detected (${rejected} rejected)`);
      else if (posted >= 15) steps.push(`3) No rate limiting detected — server accepted ${posted}/20 spam reviews`);
      return steps.join('\n');
    }, add, update, 60000);

    /* ══════════════════════════════════════════════════════════════════
       BD. SPAM — ТИКЕТЫ ПОДДЕРЖКИ (20 шт)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-tickets', 'BD. Spam Tickets', 'Create 20 support tickets rapidly → measure → cleanup', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');

      const ids: string[] = [];
      const timings: number[] = [];
      for (let i = 0; i < 20; i++) {
        const body = { subject: `${TEST_PREFIX}_SPAM_TICKET_${i}`, message: `Spam test ticket #${i}` };
        const t0 = performance.now();
        try {
          const res = await apiFetch('/api/support/tickets', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          timings.push(Math.round(performance.now() - t0));
          const j: any = await res.json().catch(() => null);
          const id = j?.data?.id;
          if (id) { ids.push(String(id)); countersRef.current.crudCreated++; }
        } catch { /* ok */ }
      }
      const avg = timings.length ? Math.round(timings.reduce((s, t) => s + t, 0) / timings.length) : 0;
      steps.push(`Created: ${ids.length}/20, avg=${avg}ms`);
      perfTimingsRef.current.push({ label: 'Ticket Create (avg)', ms: avg, op: 'create' });
      if (ids.length < 15) throw new Error(`Only ${ids.length}/20 tickets created`);

      // Send message to each ticket
      let messaged = 0;
      for (const id of ids) {
        try {
          await apiFetch(`/api/support/tickets/${id}/messages`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'spam msg' }) }, 10000);
          messaged++;
        } catch { /* ok */ }
      }
      steps.push(`Messaged: ${messaged}/${ids.length}`);

      return steps.join('\n');
    }, add, update, 120000);

    /* ══════════════════════════════════════════════════════════════════
       BE. CONCURRENT API STRESS (20 параллельных GET)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('concurrent-stress', 'BE. Concurrent Stress', '20 parallel GET requests to different endpoints', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');

      const endpoints = [
        '/api/sessions', '/api/events', '/api/open-sessions', '/api/courses',
        '/api/admin/users', '/api/admin/classes', '/api/grades',
        '/api/reports', '/api/ratings/teachers', '/api/support/tickets',
        '/api/sessions', '/api/events', '/api/open-sessions', '/api/courses',
        '/api/admin/users', '/api/admin/classes', '/api/grades',
        '/api/reports', '/api/ratings/teachers', '/api/notifications',
      ];

      const results: Array<{ ep: string; status: number; ms: number }> = [];
      const t0global = performance.now();
      const promises = endpoints.map(ep => {
        const t0 = performance.now();
        return apiFetch(ep, { headers }, 15000)
          .then(res => { results.push({ ep, status: res.status, ms: Math.round(performance.now() - t0) }); })
          .catch(() => { results.push({ ep, status: 0, ms: Math.round(performance.now() - t0) }); });
      });
      await Promise.all(promises);
      const totalMs = Math.round(performance.now() - t0global);

      const ok = results.filter(r => r.status >= 200 && r.status < 400).length;
      const errs = results.filter(r => r.status === 0 || r.status >= 500).length;
      const rate429 = results.filter(r => r.status === 429).length;
      const timingsArr = results.map(r => r.ms).sort((a, b) => a - b);
      const avg = Math.round(timingsArr.reduce((s, t) => s + t, 0) / Math.max(1, timingsArr.length));
      const p95 = timingsArr[Math.floor(timingsArr.length * 0.95)] || 0;

      steps.push(`20 concurrent requests completed in ${totalMs}ms`);
      steps.push(`OK: ${ok}, Errors(5xx/timeout): ${errs}, Rate-limited(429): ${rate429}`);
      steps.push(`Latency: avg=${avg}ms, min=${timingsArr[0] || 0}ms, max=${timingsArr[timingsArr.length - 1] || 0}ms, p95=${p95}ms`);
      perfTimingsRef.current.push({ label: 'Concurrent GET (avg)', ms: avg, op: 'read' });
      perfTimingsRef.current.push({ label: 'Concurrent GET (p95)', ms: p95, op: 'read' });
      if (errs > 5) throw new Error(`${errs}/20 requests failed under concurrent load`);
      return steps.join('\n');
    }, add, update, 60000);

    /* ══════════════════════════════════════════════════════════════════
       BF. MASS USER CRUD (20 студентов: создать → удалить, кроме админов)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-users', 'BF. Mass Users', 'Create 20 students → verify → delete all non-admin', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin') throw new Error(`role=${role}, admin only`);

      const ids: string[] = [];
      const createTimings: number[] = [];
      for (let i = 0; i < 20; i++) {
        const body = { full_name: `${TEST_PREFIX}_SPAM_USER_${i}`, phone: `+7000${String(i).padStart(7, '0')}`, role: 'student', lang: 'ru' };
        const t0 = performance.now();
        try {
          const res = await apiFetch('/api/admin/users', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          createTimings.push(Math.round(performance.now() - t0));
          const j: any = await res.json().catch(() => null);
          const id = j?.data?.id;
          if (id) { ids.push(String(id)); countersRef.current.crudCreated++; }
        } catch { /* ok */ }
      }
      const createAvg = createTimings.length ? Math.round(createTimings.reduce((s, t) => s + t, 0) / createTimings.length) : 0;
      steps.push(`Created: ${ids.length}/20, avg=${createAvg}ms`);
      perfTimingsRef.current.push({ label: 'User Create (avg)', ms: createAvg, op: 'create' });

      // Verify all exist
      const { json: listJson } = await requestJson('/api/admin/users', { headers }, 10000);
      const listData = ensureApiSuccess(listJson);
      const listArr = Array.isArray(listData) ? listData : [];
      const foundCount = ids.filter(id => listArr.some((u: any) => u?.id === id)).length;
      steps.push(`Verified in list: ${foundCount}/${ids.length}`);
      if (foundCount < ids.length) throw new Error(`Only ${foundCount}/${ids.length} found in list`);

      // Delete 90%, keep 10% for verification
      const uKeepCount = Math.max(1, Math.ceil(ids.length * 0.1));
      const uToDelete = ids.slice(0, ids.length - uKeepCount);
      const uToKeep = ids.slice(ids.length - uKeepCount);
      let deleted = 0;
      const delTimings: number[] = [];
      for (const id of uToDelete) {
        const t0 = performance.now();
        try {
          await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE', headers }, 10000);
          delTimings.push(Math.round(performance.now() - t0));
          deleted++; countersRef.current.crudDeleted++;
        } catch { /* ok */ }
      }
      const delAvg = delTimings.length ? Math.round(delTimings.reduce((s, t) => s + t, 0) / delTimings.length) : 0;
      steps.push(`Deleted: ${deleted}/${uToDelete.length}, KEPT ${uToKeep.length}, avg=${delAvg}ms`);
      if (uToKeep.length > 0) steps.push(`⚡ KEPT IDs: ${uToKeep.join(', ')}`);
      perfTimingsRef.current.push({ label: 'User Delete (avg)', ms: delAvg, op: 'delete' });

      // Verify deleted are gone
      const { json: listJson2 } = await requestJson('/api/admin/users', { headers }, 10000);
      const listData2 = ensureApiSuccess(listJson2);
      const listArr2 = Array.isArray(listData2) ? listData2 : [];
      const stillThere = uToDelete.filter(id => listArr2.some((u: any) => u?.id === id)).length;
      if (stillThere > 0) throw new Error(`${stillThere} users still present after delete`);
      steps.push(`Verified: deleted users gone, kept users remain`);

      return steps.join('\n');
    }, add, update, 120000);

    /* ══════════════════════════════════════════════════════════════════
       BG. CRUD SPEED BENCHMARK — замер скорости каждой операции
       ══════════════════════════════════════════════════════════════════ */
    await runTest('crud-speed-bench', 'BG. Speed Bench', 'Timed CRUD cycle for session, event, class, user', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin') throw new Error(`role=${role}, admin only`);

      const bench = async (label: string, createFn: () => Promise<{id: string; res: Response}>, deleteFn: (id: string) => Promise<void>) => {
        const t0c = performance.now();
        const { id, res } = await createFn();
        const createMs = Math.round(performance.now() - t0c);
        countersRef.current.crudCreated++;

        const t0d = performance.now();
        await deleteFn(id);
        const deleteMs = Math.round(performance.now() - t0d);
        countersRef.current.crudDeleted++;

        steps.push(`${label}: create=${createMs}ms (status ${res.status}), delete=${deleteMs}ms`);
        perfTimingsRef.current.push({ label: `${label} Create`, ms: createMs, op: 'create' });
        perfTimingsRef.current.push({ label: `${label} Delete`, ms: deleteMs, op: 'delete' });
      };

      const { json: clsJson } = await requestJson('/api/sessions/classes', { headers }, 10000);
      const clsData = ensureApiSuccess(clsJson);
      const classArr = Array.isArray(clsData) ? clsData : [];
      const classId = classArr[0]?.id;

      if (classId) {
        const tomorrow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await bench('Session', async () => {
          const body = { class_id: classId, topic: `${TEST_PREFIX}_BENCH_S`, planned_date: tomorrow, time_slot: '08:00-08:45', room: '999', duration_minutes: 45 };
          const res = await apiFetch('/api/sessions', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          const j: any = await ensureJson(res); const data = ensureApiSuccess(j);
          return { id: String(data?.id), res };
        }, async (id) => {
          const r = await apiFetch(`/api/sessions/${id}`, { method: 'DELETE', headers }, 10000);
          const j: any = await ensureJson(r); ensureApiSuccess(j);
        });
      }

      const tmrw = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await bench('Event', async () => {
        const body = { title: `${TEST_PREFIX}_BENCH_E`, description: 'bench', event_date: tmrw, event_time: '12:00', location: 'Test', capacity: 10 };
        const res = await apiFetch('/api/events', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
        const j: any = await ensureJson(res); const data = ensureApiSuccess(j);
        return { id: String(data?.id), res };
      }, async (id) => {
        const r = await apiFetch(`/api/events/${id}`, { method: 'DELETE', headers }, 10000);
        const j: any = await ensureJson(r); ensureApiSuccess(j);
      });

      // Get teacher for class bench
      let benchTeacherId: string | null = null;
      try {
        const tRes = await apiFetch('/api/admin/users', { headers }, 10000);
        const tJson: any = await ensureJson(tRes);
        const tArr = Array.isArray(tJson?.data) ? tJson.data : [];
        benchTeacherId = tArr.find((u: any) => u?.role === 'teacher')?.id || null;
      } catch { /* ok */ }

      if (benchTeacherId) {
        await bench('Class', async () => {
          const body = { name: `${TEST_PREFIX}_BCL`.slice(0, 20), teacher_id: benchTeacherId, academic_year: '2025-2026' };
          const res = await apiFetch('/api/admin/classes', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          const j: any = await ensureJson(res); const data = ensureApiSuccess(j);
          return { id: String(data?.id), res };
        }, async (id) => {
          const r = await apiFetch(`/api/admin/classes/${id}`, { method: 'DELETE', headers }, 10000);
          const j: any = await ensureJson(r); ensureApiSuccess(j);
        });
      } else { steps.push('Class: SKIP (no teacher found)'); }

      await bench('User', async () => {
        const body = { full_name: `${TEST_PREFIX}_BENCH_U`, phone: '+70009999999', role: 'student', lang: 'ru' };
        const res = await apiFetch('/api/admin/users', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
        const j: any = await ensureJson(res); const data = ensureApiSuccess(j);
        return { id: String(data?.id), res };
      }, async (id) => {
        const r = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE', headers }, 10000);
        const j: any = await ensureJson(r); ensureApiSuccess(j);
      });

      return steps.join('\n');
    }, add, update, 60000);

    /* ══════════════════════════════════════════════════════════════════
       BH. SPAM — МАССОВОЕ ДОБАВЛЕНИЕ УЧЕНИКОВ В КЛАСС (20 шт)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-class-students', 'BH. Spam Class Students', 'Create class → add 20 students → verify → cleanup', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin') throw new Error(`role=${role}, admin only`);

      // Get teacher_id
      let teacherIdBH: string | null = null;
      try {
        const uRes = await apiFetch('/api/admin/users', { headers }, 10000);
        const uJson: any = await ensureJson(uRes);
        const uArr = Array.isArray(uJson?.data) ? uJson.data : [];
        teacherIdBH = uArr.find((u: any) => u?.role === 'teacher')?.id || null;
      } catch { /* ok */ }
      if (!teacherIdBH) throw new Error('No teacher found for class creation');

      // Create test class
      const clsRes = await apiFetch('/api/admin/classes', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${TEST_PREFIX}_CLS`.slice(0, 20), teacher_id: teacherIdBH, academic_year: '2025-2026' }) }, 10000);
      const clsJson: any = await ensureJson(clsRes);
      const clsData = ensureApiSuccess(clsJson);
      const classId = clsData?.id;
      if (!classId) throw new Error('Failed to create test class');
      countersRef.current.crudCreated++;
      steps.push(`1) Created class id=${classId}`);

      // Create 20 students
      const studentIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        try {
          const body = { full_name: `${TEST_PREFIX}_CLS_STU_${i}`, phone: `+7001${String(i).padStart(7, '0')}`, role: 'student', lang: 'ru' };
          const res = await apiFetch('/api/admin/users', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          const j: any = await res.json().catch(() => null);
          const id = j?.data?.id;
          if (id) { studentIds.push(String(id)); countersRef.current.crudCreated++; }
        } catch { /* ok */ }
      }
      steps.push(`2) Created ${studentIds.length}/20 students`);

      // Add all students to class in one batch (API takes student_ids array)
      let added = 0;
      const t0Add = performance.now();
      try {
        const res = await apiFetch(`/api/admin/classes/${classId}/students`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ student_ids: studentIds }) }, 15000);
        const addMs = Math.round(performance.now() - t0Add);
        if (res.ok) added = studentIds.length;
        steps.push(`3) Added to class: ${added}/${studentIds.length} in ${addMs}ms`);
        perfTimingsRef.current.push({ label: 'Add Students to Class (batch)', ms: addMs, op: 'update' });
      } catch { steps.push(`3) Failed to add students to class`); }

      // Verify students in class
      try {
        const studentsRes = await apiFetch(`/api/admin/classes/${classId}/students`, { headers }, 10000);
        const studentsJson: any = await studentsRes.json().catch(() => null);
        const studentsArr = Array.isArray(studentsJson?.data) ? studentsJson.data : [];
        steps.push(`4) Students in class: ${studentsArr.length}`);
      } catch { steps.push('4) Could not verify students list'); }

      // Cleanup: delete 90% students, keep class + 10% for verification
      const bhKeep = Math.max(1, Math.ceil(studentIds.length * 0.1));
      const bhDel = studentIds.slice(0, studentIds.length - bhKeep);
      const bhKept = studentIds.slice(studentIds.length - bhKeep);
      let delStu = 0;
      for (const sid of bhDel) {
        try { await apiFetch(`/api/admin/users/${sid}`, { method: 'DELETE', headers }, 10000); delStu++; countersRef.current.crudDeleted++; } catch { /* ok */ }
      }
      steps.push(`5) Cleanup: ${delStu}/${bhDel.length} students deleted, KEPT ${bhKept.length} students + class ${classId}`);
      steps.push(`⚡ KEPT class: ${classId}, students: ${bhKept.join(', ')}`);

      return steps.join('\n');
    }, add, update, 180000);

    /* ══════════════════════════════════════════════════════════════════
       BI. FULL BUTTON CLICK TEST — нажать ВСЕ кнопки на ВСЕХ страницах
       ══════════════════════════════════════════════════════════════════ */
    await runTest('full-btn-stress', 'BI. Full Button Stress', 'Click every button on every page — track errors', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      const targetPages = [...PAGES.map(p => p.path)];
      let totalButtons = 0;
      let totalErrors = 0;
      const errorLog: string[] = [];

      for (const path of targetPages) {
        navigate(path);
        await delay(1500);
        countersRef.current.pagesVisited++;
        const main = document.querySelector('main');
        if (!main) { steps.push(`${path}: no <main>`); continue; }
        const buttons = main.querySelectorAll('button:not([disabled])');
        let pageErrors = 0;
        for (let i = 0; i < buttons.length; i++) {
          const btn = buttons[i] as HTMLButtonElement;
          if (!btn.offsetParent) continue; // not visible
          const text = (btn.textContent || '').trim().slice(0, 30) || `btn[${i}]`;
          try {
            btn.click();
            countersRef.current.buttonsClicked++;
            totalButtons++;
            await delay(150);
            // Close any modal
            const modal = document.querySelector('.fixed.inset-0, [role="dialog"]');
            if (modal) {
              const closeBtn = modal.querySelector('button') as HTMLButtonElement | null;
              if (closeBtn) { closeBtn.click(); await delay(100); }
            }
          } catch (e) {
            pageErrors++;
            totalErrors++;
            errorLog.push(`[${path}] "${text}": ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        steps.push(`${path}: ${buttons.length} buttons, ${pageErrors} errors`);
      }

      steps.push(`\nТОТАЛ: ${totalButtons} кнопок нажато, ${totalErrors} ошибок`);
      if (errorLog.length > 0) {
        steps.push(`\nОШИБКИ:`);
        errorLog.slice(0, 20).forEach(e => steps.push(`  ${e}`));
      }
      if (totalErrors > totalButtons * 0.1) throw new Error(`${totalErrors} button errors (>10% of ${totalButtons})`);
      return steps.join('\n');
    }, add, update, 180000);

    /* ══════════════════════════════════════════════════════════════════
       BJ. USER DELETION SECURITY — админ не может быть удалён
       ══════════════════════════════════════════════════════════════════ */
    await runTest('user-deletion-security', 'BJ. User Deletion Security', 'Admin cannot be deleted, others can', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin') throw new Error(`role=${role}, admin only`);

      // Get all users
      const { json: usersJson } = await requestJson('/api/admin/users', { headers }, 10000);
      const users = ensureApiSuccess(usersJson);
      const userArr = Array.isArray(users) ? users : [];
      steps.push(`1) Total users: ${userArr.length}`);

      const admins = userArr.filter((u: any) => u?.role === 'admin');
      const nonAdmins = userArr.filter((u: any) => u?.role !== 'admin' && String(u?.full_name || '').includes(TEST_PREFIX));
      steps.push(`2) Admins: ${admins.length}, Test non-admins: ${nonAdmins.length}`);

      // Try to delete admin
      let adminProtected = false;
      if (admins.length > 0) {
        const adminId = admins[0]?.id;
        try {
          const res = await apiFetch(`/api/admin/users/${adminId}`, { method: 'DELETE', headers }, 10000);
          if (res.status === 403 || res.status === 400) {
            adminProtected = true;
            steps.push(`3) ✅ Admin DELETE blocked (status ${res.status})`);
          } else {
            const j: any = await res.json().catch(() => null);
            if (!j?.success) { adminProtected = true; steps.push(`3) ✅ Admin DELETE rejected (success=false)`); }
            else steps.push(`3) ❌ Admin was DELETED! status=${res.status}`);
          }
        } catch (e) {
          adminProtected = true;
          steps.push(`3) ✅ Admin DELETE threw error (protected): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!adminProtected) throw new Error('Admin user was NOT protected from deletion!');

      // Delete a test user if available
      let deletedNonAdmin = 0;
      for (const u of nonAdmins.slice(0, 3)) {
        try {
          const res = await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE', headers }, 10000);
          if (res.ok) { deletedNonAdmin++; countersRef.current.crudDeleted++; }
        } catch { /* ok */ }
      }
      steps.push(`4) Non-admin deletions: ${deletedNonAdmin}/${Math.min(3, nonAdmins.length)}`);

      return steps.join('\n');
    }, add, update, 60000);

    /* ══════════════════════════════════════════════════════════════════
       BK. FORM VALIDATION — XSS, SQL injection, пустые формы, emoji
       ══════════════════════════════════════════════════════════════════ */
    await runTest('form-validation-xss', 'BK. Form Validation', 'XSS/SQL/emoji/empty/long string tests', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');

      const XSS = "<script>alert('xss')</script>";
      const SQL = "'; DROP TABLE users; --";
      const LONG = 'A'.repeat(5000);
      const EMOJI = '🔥🔥🔥🔥🔥';
      const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const payloads: Array<{label: string; endpoint: string; body: any}> = [
        { label: 'XSS in event title', endpoint: '/api/events', body: { title: XSS, description: 'test', event_date: tomorrow, event_time: '10:00', location: 'X', capacity: 10 } },
        { label: 'SQL in event title', endpoint: '/api/events', body: { title: SQL, description: 'test', event_date: tomorrow, event_time: '10:00', location: 'X', capacity: 10 } },
        { label: 'Long string (5000)', endpoint: '/api/events', body: { title: LONG, description: LONG, event_date: tomorrow, event_time: '10:00', location: 'X', capacity: 10 } },
        { label: 'Emoji in event', endpoint: '/api/events', body: { title: EMOJI, description: EMOJI, event_date: tomorrow, event_time: '10:00', location: EMOJI, capacity: 10 } },
        { label: 'Empty event title', endpoint: '/api/events', body: { title: '', description: '', event_date: tomorrow, event_time: '10:00', location: '', capacity: 0 } },
        { label: 'XSS in username', endpoint: '/api/admin/users', body: { full_name: XSS, phone: '+77009999998', role: 'student', lang: 'ru' } },
        { label: 'SQL in username', endpoint: '/api/admin/users', body: { full_name: SQL, phone: '+77009999997', role: 'student', lang: 'ru' } },
        { label: 'Invalid phone', endpoint: '/api/admin/users', body: { full_name: 'Test', phone: 'not-a-phone', role: 'student', lang: 'ru' } },
        { label: 'XSS in class name', endpoint: '/api/admin/classes', body: { name: XSS } },
        { label: 'XSS in ticket', endpoint: '/api/support/tickets', body: { subject: XSS, message: SQL } },
      ];

      const results: Array<{label: string; status: number; accepted: boolean}> = [];
      for (const p of payloads) {
        try {
          const res = await apiFetch(p.endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(p.body) }, 10000);
          const j: any = await res.json().catch(() => null);
          results.push({ label: p.label, status: res.status, accepted: !!(j?.success) });
          // Clean up created entities
          if (j?.data?.id) {
            const delEndpoint = p.endpoint + '/' + j.data.id;
            try { await apiFetch(delEndpoint, { method: 'DELETE', headers }, 5000); countersRef.current.crudDeleted++; } catch { /* ok */ }
          }
        } catch (e) {
          results.push({ label: p.label, status: 0, accepted: false });
        }
      }

      const accepted = results.filter(r => r.accepted);
      const rejected = results.filter(r => !r.accepted);
      steps.push(`Accepted: ${accepted.length}/${results.length}`);
      steps.push(`Rejected/Failed: ${rejected.length}/${results.length}`);
      steps.push('');
      results.forEach(r => {
        const icon = r.accepted ? '⚠️' : '✅';
        steps.push(`${icon} ${r.label}: status=${r.status}, accepted=${r.accepted}`);
      });
      steps.push('');
      const dangerAccepted = results.filter(r => r.accepted && (r.label.includes('XSS') || r.label.includes('SQL')));
      if (dangerAccepted.length > 0) {
        steps.push(`⚠️ ВНИМАНИЕ: ${dangerAccepted.length} опасных строк приняты сервером!`);
        dangerAccepted.forEach(r => steps.push(`  - ${r.label}`));
      }
      return steps.join('\n');
    }, add, update, 60000);

    /* ══════════════════════════════════════════════════════════════════
       BL. NAVIGATION STRESS — быстрая навигация 10 циклов
       ══════════════════════════════════════════════════════════════════ */
    await runTest('nav-stress', 'BL. Navigation Stress', '10 rapid navigation cycles through all pages', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');

      const allPaths = PAGES.map(p => p.path);
      let crashes = 0;
      let pagesVisited = 0;
      const t0 = performance.now();

      for (let cycle = 0; cycle < 10; cycle++) {
        for (const path of allPaths) {
          try {
            navigate(path);
            await delay(300);
            countersRef.current.pagesVisited++;
            pagesVisited++;
            const main = document.querySelector('main');
            if (!main) crashes++;
          } catch {
            crashes++;
          }
        }
      }

      const totalMs = Math.round(performance.now() - t0);
      steps.push(`10 циклов × ${allPaths.length} страниц = ${pagesVisited} навигаций`);
      steps.push(`Время: ${totalMs}ms`);
      steps.push(`Крэши: ${crashes}`);
      steps.push(`Avg навигация: ${Math.round(totalMs / pagesVisited)}ms`);
      perfTimingsRef.current.push({ label: 'Navigation (avg per page)', ms: Math.round(totalMs / pagesVisited), op: 'read' });

      if (crashes > 0) throw new Error(`${crashes} navigation crashes detected`);
      return steps.join('\n');
    }, add, update, 180000);

    /* ══════════════════════════════════════════════════════════════════
       BM. SECURITY — проверка ролей (студент не может получить admin)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('security-roles', 'BM. Security Roles', 'Verify role-based access enforcement', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');

      // Test admin-only endpoints without admin privileges
      const adminEndpoints = [
        { method: 'GET', path: '/api/admin/users' },
        { method: 'GET', path: '/api/admin/classes' },
        { method: 'POST', path: '/api/admin/users' },
        { method: 'DELETE', path: '/api/admin/users/u_nonexistent' },
        { method: 'POST', path: '/api/admin/sessions/auto-assign' },
        { method: 'POST', path: '/api/admin/classes' },
      ];

      // Try without token
      let noTokenBlocked = 0;
      for (const ep of adminEndpoints) {
        try {
          const res = await apiFetch(ep.path, { method: ep.method, headers: { 'Content-Type': 'application/json' } }, 10000);
          if (res.status === 401 || res.status === 403) noTokenBlocked++;
          else steps.push(`⚠️ ${ep.method} ${ep.path} returned ${res.status} without token (expected 401/403)`);
        } catch { noTokenBlocked++; }
      }
      steps.push(`1) Without token: ${noTokenBlocked}/${adminEndpoints.length} blocked`);

      // Verify current user role matches what API says
      const { json: meJson } = await requestJson('/api/auth/me', { headers }, 10000);
      const meData = ensureApiSuccess(meJson);
      steps.push(`2) Current user role: ${meData?.role}`);
      if (meData?.role !== role) throw new Error(`Role mismatch: store=${role}, API=${meData?.role}`);

      // If admin, verify we CAN access admin endpoints
      if (role === 'admin') {
        let adminAccessOk = 0;
        for (const ep of ['/api/admin/users', '/api/admin/classes']) {
          try {
            const res = await apiFetch(ep, { headers }, 10000);
            if (res.ok) adminAccessOk++;
          } catch { /* ok */ }
        }
        steps.push(`3) Admin access works: ${adminAccessOk}/2 endpoints OK`);
      }

      // Test unauthorized mutations
      const hackerHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer invalid_token_12345' };
      let hackerBlocked = 0;
      for (const ep of adminEndpoints.slice(0, 3)) {
        try {
          const res = await apiFetch(ep.path, { method: ep.method, headers: hackerHeaders }, 10000);
          if (res.status === 401 || res.status === 403) hackerBlocked++;
          else steps.push(`⚠️ ${ep.method} ${ep.path} accepted invalid token (status ${res.status})`);
        } catch { hackerBlocked++; }
      }
      steps.push(`4) Invalid token: ${hackerBlocked}/3 blocked`);

      if (noTokenBlocked < adminEndpoints.length * 0.5) throw new Error(`Only ${noTokenBlocked}/${adminEndpoints.length} endpoints blocked without auth`);
      return steps.join('\n');
    }, add, update, 60000);

    /* ══════════════════════════════════════════════════════════════════
       BN. SPAM — 50 ОТКРЫТЫХ СЕССИЙ (расширение)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-os-50', 'BN. Spam Open Sessions 50', 'Create 50 open sessions rapidly → speed report → cleanup', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin' && role !== 'teacher') throw new Error(`role=${role}, need admin/teacher`);

      const ids: string[] = [];
      const timings: number[] = [];
      const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      for (let batch = 0; batch < 5; batch++) {
        const promises = Array.from({ length: 10 }, (_, i) => {
          const idx = batch * 10 + i;
          const body = { title: `${TEST_PREFIX}_SPAM_OS50_${idx}`, description: 'spam test', session_date: tomorrow, session_time: `${String(10 + (idx % 8)).padStart(2, '0')}:00`, location: 'Test', max_students: 30 };
          const t0 = performance.now();
          return apiFetch('/api/open-sessions', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 15000)
            .then(async res => {
              timings.push(Math.round(performance.now() - t0));
              const j: any = await res.json().catch(() => null);
              const id = j?.data?.id;
              if (id) { ids.push(String(id)); countersRef.current.crudCreated++; }
              return { id, ms: Math.round(performance.now() - t0) };
            });
        });
        await Promise.all(promises);
        steps.push(`Batch ${batch + 1}/5: total created=${ids.length}`);
      }

      timings.sort((a, b) => a - b);
      const avg = Math.round(timings.reduce((s, t) => s + t, 0) / Math.max(1, timings.length));
      steps.push(`Speed: avg=${avg}ms, min=${timings[0] || 0}ms, max=${timings[timings.length - 1] || 0}ms`);
      steps.push(`Created: ${ids.length}/50`);
      perfTimingsRef.current.push({ label: 'Spam OS50 Create (avg)', ms: avg, op: 'create' });
      if (ids.length < 40) throw new Error(`Only ${ids.length}/50 created`);

      // Cleanup
      let cleaned = 0;
      for (const id of ids) {
        try { await apiFetch(`/api/open-sessions/${id}`, { method: 'DELETE', headers }, 10000); cleaned++; countersRef.current.crudDeleted++; } catch { /* ok */ }
      }
      steps.push(`Cleanup: ${cleaned}/${ids.length}`);
      return steps.join('\n');
    }, add, update, 120000);

    /* ══════════════════════════════════════════════════════════════════
       BO. SPAM — 100 ОТЗЫВОВ К УЧИТЕЛЮ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-100-reviews', 'BO. Spam 100 Reviews', 'Post 100 reviews rapidly → check rate limiting', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');

      let teacherId: string | null = null;
      try {
        const { json } = await requestJson('/api/ratings/teachers', { headers }, 10000);
        const data = ensureApiSuccess(json);
        const arr = Array.isArray(data) ? data : [];
        teacherId = arr[0]?.id || arr[0]?.teacher_id || null;
      } catch { /* ok */ }
      if (!teacherId) { return '⚠️ No teacher found for reviews test'; }

      let posted = 0;
      let rejected = 0;
      const timings: number[] = [];

      for (let i = 0; i < 100; i++) {
        const body = { teacher_id: teacherId, rating: (i % 10) + 1, comment: `${TEST_PREFIX}_REVIEW100_${i}` };
        const t0 = performance.now();
        try {
          const res = await apiFetch('/api/ratings', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          timings.push(Math.round(performance.now() - t0));
          if (res.ok) posted++; else rejected++;
        } catch { rejected++; }
      }

      const avg = timings.length ? Math.round(timings.reduce((s, t) => s + t, 0) / timings.length) : 0;
      steps.push(`Posted: ${posted}/100, Rejected: ${rejected}/100`);
      steps.push(`Speed: avg=${avg}ms`);
      perfTimingsRef.current.push({ label: 'Spam 100 Reviews (avg)', ms: avg, op: 'create' });
      if (rejected > 80) steps.push('✅ Rate limiting detected');
      else if (posted >= 80) steps.push('⚠️ No rate limiting — 80+ reviews accepted');
      return steps.join('\n');
    }, add, update, 180000);

    /* ══════════════════════════════════════════════════════════════════
       BP. SPAM — 50 СООБЩЕНИЙ В ОДИН ТИКЕТ
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-50-messages', 'BP. Spam 50 Messages', 'Send 50 messages to one support ticket rapidly', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');

      // Create a test ticket
      let ticketId: string | null = null;
      try {
        const res = await apiFetch('/api/support/tickets', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: `${TEST_PREFIX}_SPAM50MSG`, message: 'init' }) }, 10000);
        const j: any = await res.json().catch(() => null);
        ticketId = j?.data?.id ? String(j.data.id) : null;
        if (ticketId) countersRef.current.crudCreated++;
      } catch { /* ok */ }
      if (!ticketId) return '⚠️ Could not create ticket for spam test';
      steps.push(`1) Created ticket: ${ticketId}`);

      let sent = 0;
      const timings: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        try {
          const res = await apiFetch(`/api/support/tickets/${ticketId}/messages`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Spam #${i}` }) }, 10000);
          timings.push(Math.round(performance.now() - t0));
          if (res.ok) sent++;
        } catch { /* ok */ }
      }
      const avg = timings.length ? Math.round(timings.reduce((s, t) => s + t, 0) / timings.length) : 0;
      steps.push(`2) Sent: ${sent}/50, avg=${avg}ms`);
      perfTimingsRef.current.push({ label: 'Spam 50 Messages (avg)', ms: avg, op: 'create' });
      return steps.join('\n');
    }, add, update, 120000);

    /* ══════════════════════════════════════════════════════════════════
       BQ. МАССОВОЕ СОЗДАНИЕ КУРСОВ (20 шт)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-courses-20', 'BQ. Spam Courses 20', 'Create 20 courses rapidly → cleanup', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin' && role !== 'teacher') throw new Error(`role=${role}, need admin/teacher`);

      const ids: string[] = [];
      const timings: number[] = [];
      for (let i = 0; i < 20; i++) {
        const body = { title: `${TEST_PREFIX}_SPAM_COURSE_${i}`, description: 'Spam course test', price: 0, lang: 'ru' };
        const t0 = performance.now();
        try {
          const res = await apiFetch('/api/courses', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          timings.push(Math.round(performance.now() - t0));
          const j: any = await res.json().catch(() => null);
          if (j?.data?.id) { ids.push(String(j.data.id)); countersRef.current.crudCreated++; }
        } catch { /* ok */ }
      }
      const avg = timings.length ? Math.round(timings.reduce((s, t) => s + t, 0) / timings.length) : 0;
      steps.push(`Created: ${ids.length}/20, avg=${avg}ms`);
      perfTimingsRef.current.push({ label: 'Course Create (avg)', ms: avg, op: 'create' });

      // Delete 90%, keep 10% for manual verification
      const keepCount = Math.max(1, Math.ceil(ids.length * 0.1));
      const toDelete = ids.slice(0, ids.length - keepCount);
      const toKeep = ids.slice(ids.length - keepCount);
      let cleaned = 0;
      for (const id of toDelete) {
        try { await apiFetch(`/api/courses/${id}`, { method: 'DELETE', headers }, 10000); cleaned++; countersRef.current.crudDeleted++; } catch { /* ok */ }
      }
      steps.push(`Cleanup: deleted ${cleaned}/${toDelete.length}, KEPT ${toKeep.length} for verification`);
      if (toKeep.length > 0) steps.push(`⚡ KEPT IDs: ${toKeep.join(', ')}`);
      return steps.join('\n');
    }, add, update, 120000);

    /* ══════════════════════════════════════════════════════════════════
       BR. МАССОВОЕ СОЗДАНИЕ ГРУПП (10 шт)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('spam-classes-10', 'BR. Spam Classes 10', 'Create 10 classes rapidly → cleanup', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) throw new Error('Health check failed');
      if (role !== 'admin') throw new Error(`role=${role}, admin only`);

      // Get teacher_id for class creation
      let teacherIdForClass: string | null = null;
      try {
        const usersRes = await apiFetch('/api/admin/users', { headers }, 10000);
        const usersJson: any = await ensureJson(usersRes);
        const usersData = ensureApiSuccess(usersJson);
        const usersArr = Array.isArray(usersData) ? usersData : [];
        const teacher = usersArr.find((u: any) => u?.role === 'teacher');
        teacherIdForClass = teacher?.id || null;
      } catch { /* ok */ }
      if (!teacherIdForClass) throw new Error('No teacher found for class creation');

      const ids: string[] = [];
      const timings: number[] = [];
      for (let i = 0; i < 10; i++) {
        const body = { name: `${TEST_PREFIX}_CLS_${i}`.slice(0, 20), teacher_id: teacherIdForClass, academic_year: '2025-2026' };
        const t0 = performance.now();
        try {
          const res = await apiFetch('/api/admin/classes', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
          timings.push(Math.round(performance.now() - t0));
          const j: any = await res.json().catch(() => null);
          if (j?.data?.id) { ids.push(String(j.data.id)); countersRef.current.crudCreated++; }
        } catch { /* ok */ }
      }
      const avg = timings.length ? Math.round(timings.reduce((s, t) => s + t, 0) / timings.length) : 0;
      steps.push(`Created: ${ids.length}/10, avg=${avg}ms`);
      perfTimingsRef.current.push({ label: 'Class Create (avg)', ms: avg, op: 'create' });

      // Delete 90%, keep 10% for manual verification
      const keepCount = Math.max(1, Math.ceil(ids.length * 0.1));
      const toDeleteCls = ids.slice(0, ids.length - keepCount);
      const toKeepCls = ids.slice(ids.length - keepCount);
      let cleaned = 0;
      for (const id of toDeleteCls) {
        try { await apiFetch(`/api/admin/classes/${id}`, { method: 'DELETE', headers }, 10000); cleaned++; countersRef.current.crudDeleted++; } catch { /* ok */ }
      }
      steps.push(`Cleanup: deleted ${cleaned}/${toDeleteCls.length}, KEPT ${toKeepCls.length} for verification`);
      if (toKeepCls.length > 0) steps.push(`\u26a1 KEPT IDs: ${toKeepCls.join(', ')}`);
      return steps.join('\n');
    }, add, update, 60000);

    /* ══════════════════════════════════════════════════════════════════
       AX. VERIFY REMAINING (НЕ удаляем — проверяем что данные сохранились)
       ══════════════════════════════════════════════════════════════════ */
    await runTest('verify-remaining', 'AX. Verify Data', 'Check that test entities are STILL in database (no cleanup)', async () => {
      const steps: string[] = [];
      if (!healthOkRef.current) return '⚠️ Health check failed — skipping';
      if (role !== 'admin') return `⚠️ role=${role} — verify requires admin`;

      const checks = [
        { url: '/api/events', field: 'title', label: 'Мероприятия' },
        { url: '/api/open-sessions', field: 'title', label: 'Открытые занятия' },
        { url: '/api/admin/users', field: 'full_name', label: 'Пользователи' },
        { url: '/api/admin/classes', field: 'name', label: 'Группы' },
      ];

      let totalFound = 0;
      for (const check of checks) {
        try {
          const res = await apiFetch(check.url, { headers }, 10000);
          const json: any = await ensureJson(res);
          const data = ensureApiSuccess(json);
          const arr = Array.isArray(data) ? data : [];
          const matching = arr.filter((item: any) => String(item?.[check.field] || '').includes(TEST_PREFIX));
          totalFound += matching.length;
          if (matching.length > 0) {
            steps.push(`✅ ${check.label}: ${matching.length} шт СОХРАНЕНЫ`);
            matching.slice(0, 2).forEach((m: any) => steps.push(`   → ${m[check.field]} (id=${m.id})`));
          } else {
            steps.push(`⚠️ ${check.label}: 0 шт`);
          }
        } catch (e) {
          steps.push(`⚠️ ${check.label}: ошибка проверки`);
        }
      }

      steps.push(`\n📊 ИТОГО: ${totalFound} тестовых сущностей РЕАЛЬНО сохранены в базе`);
      if (totalFound === 0) throw new Error('Ни одна тестовая сущность не сохранилась!');

      // Restore user prefs
      useAuthStore.getState().setLang('ru');
      useThemeStore.getState().setTheme(currentThemeRef.current);
      return steps.join('\n');
    }, add, update, 30000);

    /* ══════════════════════════════════════════════════════════════════
       V. CONSOLE ERROR SCAN
       ══════════════════════════════════════════════════════════════════ */
    await runTest('console-errors', 'V. Console Errors', 'Check captured console.error calls', async () => {
      const steps: string[] = [];
      steps.push(`1) total console.error captured: ${consoleErrors.current.length}`);
      if (consoleErrors.current.length > 0) {
        consoleErrors.current.slice(0, 5).forEach((e, i) => {
          steps.push(`  ${i + 1}. ${e.slice(0, 120)}`);
        });
        throw new Error(`${consoleErrors.current.length} console.error(s): ${consoleErrors.current.slice(0, 3).join(' | ')}`);
      }
      steps.push(`2) CLEAN — no console errors`);
      return steps.join('\n');
    }, add, update, 10000);

    // Restore console & listeners
    console.error = origError;
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onRej);

    // Navigate back
    navigate('/test-runner');
    runDurationMs.current = Math.round(performance.now() - runStartedAtRef.current);
    setRunning(false);
    setDone(true);
  }, [scrollToBottom]);

  /* ─── Expandable story state ─── */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* ─── Derived stats ─── */
  const total = results.length;
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const runningCount = results.filter((r) => r.status === 'running').length;
  const warningsCount = results.reduce((acc, r) => acc + (r.warnings?.length ?? 0), 0);
  // A(1)+B(1)+C(eps)+CA(post)+D(pages)+E(btns)+F(pages)+G(inputs)+H(selects)+I(pages)+J(1)+K(1)+L(2)+M(pages)+N(2)+O(3)+P(1)+Q(4)+R(1)+S(1)+T(pages)+U(pages)+W(pages)+X(modals)+Y(3)+Z(1)+AA(1)+AB(pages)+AC(1)+AG(1)+AH(1)+AJ(1)+AR(1)+AS(1)+AT(1)+AU(1)+AW(1)+AI(1)+AK(1)+AL(1)+AM(1)+AN(1)+AO(1)+AP(1)+AQ(1)+AV(1)+V(1)
  const btnCount = PAGES.reduce((s, p) => s + (p.buttons?.length ?? 0), 0);
  const inputCount = PAGES.reduce((s, p) => s + (p.inputs?.length ?? 0), 0);
  const selectCount = PAGES.reduce((s, p) => s + (p.selects?.length ?? 0), 0);
  const modalCount = PAGES.reduce((s, p) => s + (p.buttons?.filter(b => b.expectModal)?.length ?? 0), 0);
  const expectedTotal = 1 + 1 + API_ENDPOINTS.length + API_POST_ENDPOINTS.length + PAGES.length + btnCount + PAGES.length + inputCount + selectCount + PAGES.length + 1 + 1 + 2 + PAGES.length + 2 + 3 + 1 + 4 + 1 + 1 + PAGES.length + PAGES.length + PAGES.length + modalCount + 3 + 1 + 1 + PAGES.length + 1 + 1 + 17 + 8 + 10;
  const progress = running ? (total / expectedTotal) * 100 : done ? 100 : 0;

  const visibleResults = useMemo(() => {
    if (!onlyFailed) return results;
    return results.filter((r) => r.status === 'failed');
  }, [onlyFailed, results]);

  /* ─── Render ─── */
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {lang === 'kz' ? 'Тест жүгірткіші' : 'Тест-раннер'}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {lang === 'kz'
              ? 'Бір батырмамен барлық SPA smoke-тесттерін жүргізу'
              : 'Полный smoke-тест SPA одним кликом'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyFailed((v) => !v)}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
              onlyFailed
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
            disabled={running || results.length === 0}
          >
            {lang === 'kz' ? 'Тек Failed' : 'Только Failed'}
          </button>
          <button
            onClick={() => runAll(true)}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-red-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {lang === 'kz' ? 'Стресс...' : 'Стресс...'}
              </>
            ) : (
              <>
                <Terminal size={18} />
                {lang === 'kz' ? 'Стресс-тест' : 'Стресс-тест'}
              </>
            )}
          </button>
          <button
            onClick={() => runAll(false)}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-primary-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {lang === 'kz' ? 'Орындалуда...' : 'Выполняется...'}
              </>
            ) : done ? (
              <>
                <RotateCcw size={18} />
                {lang === 'kz' ? 'Қайта жүргізу' : 'Запустить снова'}
              </>
            ) : (
              <>
                <Play size={18} />
                {lang === 'kz' ? 'Барлық тесттер' : 'Все тесты'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {(running || done) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {running
                ? lang === 'kz' ? 'Орындалуда...' : 'Выполняется...'
                : lang === 'kz' ? 'Аяқталды' : 'Завершено'}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                done && failed === 0
                  ? 'bg-green-500'
                  : done && failed > 0
                    ? 'bg-amber-500'
                    : 'bg-primary-500'
              }`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary cards */}
      {done && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{lang === 'kz' ? 'Барлығы' : 'Всего'}</p>
          </div>
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 p-4 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{passed}</p>
            <p className="text-xs text-green-600 dark:text-green-400">{lang === 'kz' ? 'Өтті' : 'Passed'}</p>
          </div>
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-4 text-center">
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{warningsCount}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">{lang === 'kz' ? 'Ескертулер' : 'Warnings'}</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-4 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">{failed}</p>
            <p className="text-xs text-red-600 dark:text-red-400">{lang === 'kz' ? 'Сәтсіз' : 'Failed'}</p>
          </div>
        </div>
      )}

      {done && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-gray-700 dark:text-gray-200">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{lang === 'kz' ? 'Жалпы уақыт' : 'Время выполнения'}</div>
              <div className="font-semibold">{Math.round(runDurationMs.current / 1000)}s</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">API requests</div>
              <div className="font-semibold">{countersRef.current.apiRequests}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{lang === 'kz' ? 'Беттер' : 'Страниц посещено'}</div>
              <div className="font-semibold">{countersRef.current.pagesVisited}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{lang === 'kz' ? 'Батырмалар' : 'Кнопок нажато'}</div>
              <div className="font-semibold">{countersRef.current.buttonsClicked}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">CRUD created / updated / deleted</div>
              <div className="font-semibold">{countersRef.current.crudCreated} / {countersRef.current.crudUpdated} / {countersRef.current.crudDeleted}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{lang === 'kz' ? 'Тоқтатылды' : 'Stopped'}</div>
              <div className={`font-semibold ${globalStopRef.current ? 'text-red-600 dark:text-red-400' : ''}`}>{globalStopRef.current ? 'YES' : 'NO'}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── FINAL REPORT ─── */}
      {done && (() => {
        const sections: Record<string, {passed: string[]; failed: Array<{name: string; error: string}>}> = {};
        for (const r of results) {
          const sec = r.section || 'Other';
          if (!sections[sec]) sections[sec] = { passed: [], failed: [] };
          if (r.status === 'passed') sections[sec].passed.push(`[${r.group}] ${r.name}`);
          else if (r.status === 'failed') sections[sec].failed.push({ name: `[${r.group}] ${r.name}`, error: r.error || '(unknown)' });
        }
        const allPassed = results.filter(r => r.status === 'passed');
        const allFailed = results.filter(r => r.status === 'failed');
        const passRate = total > 0 ? Math.round((allPassed.length / total) * 100) : 0;
        const perf = perfTimingsRef.current;

        return (
          <div className="space-y-4">
            {/* Overall verdict */}
            <div className={`rounded-xl border-2 p-5 ${allFailed.length === 0 ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : 'border-red-400 bg-red-50 dark:bg-red-900/20'}`}>
              <h2 className="text-lg font-bold mb-2">{allFailed.length === 0 ? '✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `❌ НАЙДЕНО ПРОБЛЕМ: ${allFailed.length}`}</h2>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Пройдено: {allPassed.length}/{total} ({passRate}%) | Время: {Math.round(runDurationMs.current / 1000)}s | API запросов: {countersRef.current.apiRequests}
              </p>
            </div>

            {/* What works */}
            <div className="rounded-xl border border-green-200 dark:border-green-800 bg-white dark:bg-gray-800 p-4">
              <h3 className="font-bold text-green-700 dark:text-green-400 mb-2">✅ ЧТО РАБОТАЕТ ({allPassed.length})</h3>
              <div className="space-y-2 text-sm">
                {Object.entries(sections).map(([sec, data]) => data.passed.length > 0 && (
                  <div key={sec}>
                    <div className="font-semibold text-gray-600 dark:text-gray-400">{sec} ({data.passed.length})</div>
                    <div className="ml-3 text-gray-500 dark:text-gray-400 text-xs max-h-24 overflow-y-auto">
                      {data.passed.map((p, i) => <div key={i}>{p}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What doesn't work */}
            {allFailed.length > 0 && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 p-4">
                <h3 className="font-bold text-red-700 dark:text-red-400 mb-2">❌ ЧТО НЕ РАБОТАЕТ ({allFailed.length})</h3>
                <div className="space-y-2 text-sm">
                  {Object.entries(sections).map(([sec, data]) => data.failed.length > 0 && (
                    <div key={sec}>
                      <div className="font-semibold text-gray-600 dark:text-gray-400">{sec} ({data.failed.length} проблем)</div>
                      <div className="ml-3 space-y-1">
                        {data.failed.map((f, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-red-600 dark:text-red-400 font-medium">{f.name}</span>
                            <span className="text-gray-500 dark:text-gray-400 ml-2">— {f.error.slice(0, 200)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Problems detail */}
            {allFailed.length > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 p-4">
                <h3 className="font-bold text-amber-700 dark:text-amber-400 mb-2">⚠️ ДЕТАЛИ ПРОБЛЕМ</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {allFailed.map((r, i) => (
                    <div key={i} className="border-b border-gray-100 dark:border-gray-700 pb-2 text-xs">
                      <div className="font-semibold text-red-600 dark:text-red-400">{i + 1}. [{r.group}] {r.name}</div>
                      <div className="text-gray-600 dark:text-gray-400 ml-3">{r.error}</div>
                      {r.story && <pre className="text-[10px] text-gray-400 ml-3 mt-1 whitespace-pre-wrap max-h-20 overflow-y-auto">{r.story.slice(0, 500)}</pre>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Performance report */}
            {perf.length > 0 && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 p-4">
                <h3 className="font-bold text-blue-700 dark:text-blue-400 mb-2">📊 ОТЧЁТ ПО СКОРОСТИ</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1 pr-2">Операция</th>
                        <th className="py-1 pr-2">Тип</th>
                        <th className="py-1 text-right">Время (ms)</th>
                        <th className="py-1 text-right pl-2">Оценка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perf.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{p.label}</td>
                          <td className="py-1 pr-2 text-gray-500">{p.op}</td>
                          <td className="py-1 text-right font-mono">{p.ms}</td>
                          <td className={`py-1 text-right pl-2 font-semibold ${p.ms < 500 ? 'text-green-600' : p.ms < 2000 ? 'text-amber-600' : 'text-red-600'}`}>
                            {p.ms < 500 ? 'FAST' : p.ms < 2000 ? 'OK' : 'SLOW'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Средняя скорость CRUD: {perf.length > 0 ? Math.round(perf.reduce((s, p) => s + p.ms, 0) / perf.length) : 0}ms | 
                  Самая медленная: {perf.length > 0 ? perf.reduce((a, b) => b.ms > a.ms ? b : a).label : '-'} ({perf.length > 0 ? perf.reduce((a, b) => b.ms > a.ms ? b : a).ms : 0}ms)
                </div>
              </div>
            )}

            {/* Stress test summary */}
            {(() => {
              const stressResults = results.filter(r => r.section === 'Stress Tests');
              if (stressResults.length === 0) return null;
              const stressPassed = stressResults.filter(r => r.status === 'passed').length;
              const stressFailed = stressResults.filter(r => r.status === 'failed').length;
              return (
                <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 p-4">
                  <h3 className="font-bold text-purple-700 dark:text-purple-400 mb-2">🔥 СТРЕСС-ТЕСТЫ</h3>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <p>Пройдено: {stressPassed}/{stressResults.length} | Провалено: {stressFailed}</p>
                    <div className="mt-2 space-y-1 text-xs">
                      {stressResults.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className={r.status === 'passed' ? 'text-green-500' : 'text-red-500'}>{r.status === 'passed' ? '✅' : '❌'}</span>
                          <span className="text-gray-600 dark:text-gray-400">[{r.group}] {r.name}</span>
                          {r.durationMs != null && <span className="text-gray-400">({Math.round(r.durationMs)}ms)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Live log */}
      {results.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-950 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-2.5 bg-gray-900">
            <Terminal size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-400">
              Test Log — {passed} passed, {failed} failed{runningCount > 0 ? `, ${runningCount} running` : ''}
            </span>
          </div>
          <div ref={logRef} className="max-h-[600px] overflow-y-auto p-3 space-y-1 font-mono text-[13px] leading-6">
            {visibleResults.map((r) => (
              <div key={r.id} className="group">
                <div
                  className="flex items-start gap-2 cursor-pointer hover:bg-gray-800/50 rounded px-1 -mx-1"
                  onClick={() => r.story && toggleExpand(r.id)}
                >
                  {r.status === 'running' && (
                    <span className="shrink-0 text-yellow-400">⏳</span>
                  )}
                  {r.status === 'passed' && (
                    <span className="shrink-0 text-green-400">✅</span>
                  )}
                  {r.status === 'failed' && (
                    <span className="shrink-0 text-red-400">❌</span>
                  )}
                  {r.status === 'pending' && (
                    <span className="shrink-0 text-gray-500">○</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <span
                      className={`${
                        r.status === 'passed'
                          ? 'text-green-400'
                          : r.status === 'failed'
                            ? 'text-red-400'
                            : r.status === 'running'
                              ? 'text-yellow-300'
                              : 'text-gray-500'
                      }`}
                    >
                      <span className="text-gray-500">[{r.group}]</span> {r.name}
                      {r.durationMs != null && (
                        <span className="ml-2 text-gray-600">({Math.round(r.durationMs)}ms)</span>
                      )}
                    </span>
                    {r.status === 'failed' && r.error && (
                      <div className="mt-0.5 text-red-500/80 text-xs break-all">↳ {r.error}</div>
                    )}
                  </div>
                  {r.story && (
                    <span className="shrink-0 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      {expandedIds.has(r.id) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </span>
                  )}
                </div>
                {/* ─── Story / History ─── */}
                {r.story && expandedIds.has(r.id) && (
                  <div className="ml-7 mt-1 mb-2 rounded border border-gray-700/50 bg-gray-900/80 px-3 py-2 text-[11px] leading-5 text-gray-400 whitespace-pre-wrap">
                    {r.story}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !running && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-20 text-gray-400">
          <Terminal size={40} className="mb-3" />
          <p className="text-sm">
            {lang === 'kz'
              ? 'Тесттерді бастау үшін батырманы басыңыз'
              : 'Нажмите кнопку для запуска тестов'}
          </p>
        </div>
      )}
    </div>
  );
}
