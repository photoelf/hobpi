# 07. Техническая архитектура

## 1. Обзор

```
┌──────────────────────────────────────────────────────────┐
│  Telegram Client (iOS / Android / Desktop)               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Mini App WebView                                  │  │
│  │  apps/web — React 19 + Vite + TypeScript           │  │
│  │  • экраны, рендер боя (CSS Grid, без canvas)       │  │
│  │  • packages/engine — тот же движок для реплеев     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTPS, заголовок Authorization: tma <initData>
┌──────────────────────▼───────────────────────────────────┐
│  apps/api — Fastify + Node 24                            │
│  • auth: HMAC-проверка initData                          │
│  • game: доход, найм, постройки, прокачка                │
│  • battle: авторитетная симуляция боя (packages/engine)  │
│  • pvp: матчмейкинг, Elo, реплеи                         │
│  • node:sqlite (встроенный) → PostgreSQL при масштабе    │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│  Telegram Bot API — пуш-уведомления, инлайн-шаринг       │
└──────────────────────────────────────────────────────────┘
```

## 2. Почему так

| Решение | Обоснование |
|---|---|
| **Монорепо + npm workspaces** | Движок боя обязан быть один на клиенте и сервере, иначе реплей разъедется с расчётом. Workspaces — без лишних инструментов. |
| **Изоморфный TS-движок** | Сервер — источник истины, клиент — просто ещё один исполнитель того же кода. Никакой дублирующей логики. |
| **Детерминизм на seed** | Реплей = `{seed, actions[]}` вместо покадрового лога. Экономит трафик и хранилище на порядки. |
| **`node:sqlite`** | Встроен в Node 22.5+, ноль нативных зависимостей и ноль инфраструктуры для MVP. Схема писана обычным SQL — миграция на Postgres механическая. |
| **Fastify** | Быстрый, чистые схемы валидации, минимум магии. |
| **React + Vite** | Стандарт, мгновенный HMR, маленький бандл. |
| **CSS Grid для поля боя** | 108 клеток — DOM справляется. Даёт бесплатную адаптивность, доступность и анимации через CSS. Canvas — усложнение без выгоды на этом масштабе. |
| **Никакого стейт-менеджера** | Данные приходят одним снапшотом `/state`. React Context + `useReducer` достаточно; Redux/Zustand — лишняя прослойка. |

## 3. Структура репозитория

```
HoBPI/
├── docs/                       ← эта документация
├── packages/
│   └── engine/                 ← @hobpi/engine — движок и контент
│       ├── src/
│       │   ├── types.ts        типы боя и контента
│       │   ├── rng.ts          mulberry32
│       │   ├── battle.ts       ядро: создание, ходы, урон, эффекты
│       │   ├── ai.ts           эвристический ИИ
│       │   ├── power.ts        оценка силы армии (ai_value)
│       │   ├── content/
│       │   │   ├── units.ts    28 бойцов, 4 фракции
│       │   │   ├── factions.ts фракции и их бонусы
│       │   │   ├── heroes.ts   классы героев
│       │   │   ├── abilities.ts приёмы героя
│       │   │   ├── artifacts.ts артефакты
│       │   │   └── buildings.ts здания и точки
│       │   └── index.ts
│       └── test/               node:test
├── apps/
│   ├── api/                    ← @hobpi/api
│   │   └── src/
│   │       ├── server.ts       точка входа Fastify
│   │       ├── db.ts           схема + доступ к node:sqlite
│   │       ├── auth.ts         проверка Telegram initData
│   │       ├── game.ts         доменная логика (доход, найм, апгрейды)
│   │       ├── pve.ts          генерация нейтральных «дворов»
│   │       └── routes/         REST-эндпоинты
│   └── web/                    ← @hobpi/web
│       └── src/
│           ├── main.tsx
│           ├── api.ts          fetch-клиент + Telegram initData
│           ├── tg.ts           обёртка над Telegram.WebApp
│           ├── state.tsx       контекст состояния игрока
│           ├── screens/        База / Бригада / Герой / Район / Арена / Топ
│           ├── battle/         экран боя + рендер реплея
│           └── ui/             примитивы UI
└── package.json                workspaces
```

## 4. Модель данных (SQLite)

```sql
players        id, tg_id, name, faction, hero_class, level, xp,
               atk, def, power, knowledge,               -- Сила/Броня/Авторитет/Связи
               nal, influence, svyazi, tovar,
               fuel, fuel_at, income_at, growth_at,
               rating, wins, losses, created_at, shield_until
buildings      player_id, key, level                     -- здания базы
spots          player_id, key, level                     -- точки дохода
army           player_id, slot, unit_id, count           -- боевая бригада
pool           player_id, unit_id, count                 -- накопленный прирост (доступно к найму)
artifacts      id, player_id, art_id, slot, equipped
battles        id, attacker_id, defender_id, kind, seed, setup_json,
               actions_json, result, log_summary, created_at
sessions       id, player_id, state_json, expires_at     -- активный интерактивный бой
```

Индексы: `players(rating)`, `players(tg_id) unique`, `battles(defender_id, created_at)`.

## 5. Жизненный цикл интерактивного боя

```
POST /battle/start {kind: 'pve'|'pvp', targetId}
      → сервер: списывает топливо, генерирует seed, строит setup,
        создаёт session, возвращает {battleId, seed, setup}
      → клиент: локально прогоняет движок из seed+setup → идентичное состояние

POST /battle/act {battleId, action}
      → сервер: валидирует и применяет действие, затем прокручивает ходы ИИ
        до следующего хода игрока, возвращает {actions[], state, finished}
      → клиент: применяет те же действия к своей копии → анимирует

бой окончен → сервер начисляет трофеи/XP/потери, пишет battles, удаляет session
```

Клиент **никогда** не сообщает результат — только намерение. Сервер считает всё сам.

## 6. Производительность и лимиты

| Параметр | Значение |
|---|---|
| Полная симуляция боя (30 раундов, 14 стеков) | < 5 мс на сервере |
| Размер реплея | ~0.3–2 КБ |
| Первый экран (gzip) | цель < 300 КБ |
| SQLite | до ~10 000 DAU на одной ноде, дальше — Postgres |
| Rate limit | 60 запросов/мин на игрока, 10 стартов боя/час |

## 7. Деплой

Telegram требует для мини-аппа HTTPS с валидным сертификатом. Поддерживаются две схемы.

### Схема A: GitHub Pages (фронт) + Cloudflare Worker (API) — развёрнуто

```
https://photoelf.github.io/hobpi/        →  apps/web/dist  (GitHub Pages)
https://hobpi-api.photoelf.workers.dev   →  apps/api       (Cloudflare Worker + D1)
Бот: @bandy_spb_bot
```

Почему Workers, а не Render/Fly: на бесплатных тарифах контейнер засыпает после
15 минут простоя, и первый заход в мини-апп упирается в 30–50 секунд холодного
старта — для игры с трёхминутными сессиями это убивает возвраты. Workers не спят,
а D1 — тот же SQLite, что и локально, поэтому `schema.sql` общий.

**Почему нельзя всё на Pages.** Pages отдаёт только статические файлы — там не может
работать ни Node, ни база. Без сервера пропадает ровно то, ради чего игра затевалась:

| Что ломается без API | Почему |
|---|---|
| Асинхронный PvP | Нужно общее состояние между разными Telegram-аккаунтами |
| Защита от накрутки | Бой считал бы клиент — результат подделывается в консоли за минуту |
| Проверка `initData` | HMAC требует `BOT_TOKEN`, а его нельзя класть в статику |
| Рейтинг и лидерборд | Нужна общая БД |
| Сохранения | localStorage теряется при смене устройства |

Настройка:

1. `Settings → Pages → Source: GitHub Actions` — воркфлоу `.github/workflows/deploy-web.yml`.
2. `Settings → Variables → Actions → API_URL` = адрес сервера, например `https://hobpi-api.fly.dev`.
   Без неё сборка падает намеренно — молча выкатить неработающий фронт хуже, чем не выкатить.
3. На хосте API задать `ALLOWED_ORIGINS=https://<user>.github.io` — иначе браузер зарежет CORS.
   (в `apps/api/wrangler.toml` уже прописано)
4. Базовый путь `/<repo>/` подставляется автоматически (`VITE_BASE`), SPA-фолбэк — через `404.html`.
5. В BotFather указать URL мини-аппа: `https://<user>.github.io/<repo>/`.

### Схема B: один процесс

`npm run build`, затем `node apps/api/src/server.ts` — при наличии `apps/web/dist`
Fastify раздаёт мини-апп сам через `@fastify/static`. Нужен один домен и TLS
(Caddy/Nginx). Проще в эксплуатации, но требует VPS.

### Далее

API в контейнере, web на CDN, БД — управляемый Postgres, реплеи — в объектное хранилище.

### Переменные окружения

**Сервер (`apps/api`)**

```
BOT_TOKEN=...            токен бота: проверка initData и пуши. Без него — dev-режим!
DB_PATH=./data/game.db
PORT=8080
ALLOWED_ORIGINS=https://user.github.io      список через запятую; пусто = любой origin
PUBLIC_URL=https://...
DEV_AUTH=                1 — пускать по заголовку X-Dev-User. НИКОГДА в проде
LOG_LEVEL=info
```

**Сборка мини-аппа (`apps/web`)**

```
VITE_API_URL=https://hobpi-api.fly.dev      пусто = тот же origin (схема B)
VITE_BASE=/hobpi/                           подпуть GitHub Pages
```

> ⚠️ Если `BOT_TOKEN` не задан, сервер поднимается в **dev-режиме** и пускает любого
> по заголовку `X-Dev-User` — то есть аккаунт угоняется одной строкой в консоли.
> Перед публичным запуском `BOT_TOKEN` обязателен, `DEV_AUTH` — пуст.
