# Mirai RPG

Solo Android-приложение на React Native + Expo + TypeScript. Локальная RPG-система для дисциплины и роста: 5 категорий квестов, XP/уровни, daily-repeatable streaks, ачивки, без бэкенда.

## Стек
- **Expo 52 + React Native 0.76.9** (только Android)
- **expo-sqlite 15** — локальная БД (WAL, foreign keys ON)
- **expo-secure-store** — bcrypt-хэш пароля
- **bcryptjs** — cost 8
- **TypeScript 5.3** strict
- **Jest 29** + jest-expo — 95 unit-тестов

## Структура
```
src/
  domain/        # pure, DB-free: level curve, DR, achievements rules, category
  db/            # DbExecutor abstraction + memory fake + sqlite impl + schema + migrate
  repos/         # user, character, quest, completion, achievement
  services/      # auth, character, quest, progression (transactional), achievement
  seed/          # 76 system quests + 17 achievement defs (idempotent boot)
  ui/
    theme.ts     # color tokens
    components.tsx
    app_context.ts
    App.tsx      # state-driven navigation: Login | [Quests | Profile | Achievements]
    screens/
    toast.tsx
__tests__/       # 9 suites, 95 tests
```

## Запуск
```bash
npm install
npx expo start --android       # на устройстве
npx jest                       # 95/95
npx tsc --noEmit               # 0 errors
npx expo export --platform android --output-dir dist   # production bundle
```

## Что вырезано из LifeRPG
Всё что не нужно single-user Android-приложению:
- Backend (FastAPI/SQLAlchemy/JWT/friends/leaderboard/photo proof/admin)
- Cosmetics, shop
- Auth через email/Google
- Кросс-устройственная синхронизация

## Бизнес-правила
- **Level curve**: L1→L2 = 100 XP, L2→L3 = 300, ..., L6+ растёт ×1.4
- **DR (Diminishing Returns)**: 1.0× для первых 5 в категории, потом 0.85×, 0.70×, 0.55×, минимум 0.25×
- **Class auto-detect на L2**: доминирующая категория > 50% → класс (warrior/scholar/builder/monk/leader)
- **17 ачивок**: streaks, time-of-day, weekend, variety, personal records
- **Schema version** tracking в `config` таблице

## Безопасность
- Один пользователь, без сети
- Пароль bcrypt cost 8 в expo-secure-store (keychain на Android)
- Нет telemetry, нет аналитики
