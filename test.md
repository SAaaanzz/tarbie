# Из корня проекта:
cd apps/web
pnpm test:e2e:report

# Или из корня через pnpm filter:
pnpm --filter @tarbie/web test:e2e:report

# Запустить один конкретный блок:
npx playwright test --grep "Student Full Functional"

# Только упавшие тесты перезапустить:
npx playwright test --last-failed

# Посмотреть прошлый отчёт без перезапуска:
npx playwright show-report