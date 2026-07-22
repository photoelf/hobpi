# 08. Контракт API

База: `/api`. Формат — JSON. Все ошибки возвращают `{ "error": "текст на русском" }`
с кодом 400 (игровая ошибка), 401 (нет авторизации), 429 (лимит запросов) или 500.

## Авторизация

Каждый запрос несёт заголовок:

```
Authorization: tma <Telegram.WebApp.initData>
```

Сервер проверяет HMAC-подпись initData (см. [07-architecture.md](07-architecture.md)).

Строка проверки собирается из **всех** полей `initData`, кроме `hash`, отсортированных
по строке `ключ=значение`. Поле `signature` (нужное для сторонней Ed25519-проверки)
**входит** в подсчёт — если его исключить, не сойдётся ни один реальный `initData`,
и в Telegram никто не залогинится. Регрессия на это закрыта в `apps/api/test/auth.test.ts`.
В dev-режиме (нет `BOT_TOKEN` или `DEV_AUTH=1`) вместо этого принимается `X-Dev-User: <любой id>` —
это позволяет открывать мини-апп в обычном браузере и держать несколько «игроков» одновременно.

Лимит: 120 запросов в минуту на игрока.

---

## Профиль и контент

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/content` | Весь статический контент: фракции, классы, 28 бойцов, приёмы, артефакты, здания, точки. Клиент кэширует. |
| `GET` | `/api/me` | `{ registered, suggestedName }` или `{ registered: true, state }` |
| `POST` | `/api/auth/start` | Онбординг. Тело: `{ faction, heroClass, name }` → `{ ok, state }` |
| `GET` | `/api/state` | Полный снапшот игрока (см. ниже) |
| `POST` | `/api/hero/equip` | `{ artifactId }` → снапшот. Конфликтующий по слоту снимается сам. |
| `POST` | `/api/hero/unequip` | `{ artifactId }` → снапшот |
| `POST` | `/api/hero/rename` | `{ name }` → снапшот |

### Снапшот `state`

```jsonc
{
  "player": {
    "id", "name", "faction", "factionName", "heroClass", "heroClassName",
    "level", "xp", "xpCurrent", "xpNext", "rank",
    "stats": { "attack", "defense", "power", "knowledge", "morale", "luck", "speedBonus" },
    "nal", "influence", "svyazi", "tovar", "vaultCap",
    "fuel", "fuelMax", "rating", "wins", "losses", "power"
  },
  "buildings":   { "dvor": 1, "sigarnaya": 2 },
  "spots":       [{ "key": "larek", "level": 1 }],
  "spotSlots":   3,
  "army":        [{ "slot": 0, "unitId": "cas1", "count": 20 }],
  "pool":        { "cas1": 14 },          // накопленный прирост, доступный к найму
  "artifacts":   [{ "id": 1, "artId": "sportivka", "equipped": true }],
  "incomePerTick": { "nal": 370 },
  "nextIncomeIn": 12600000,               // мс до следующего тика дохода
  "weekly":      { "key", "name", "desc", "icon" },
  "roster":      ["cas1", "…"]            // юниты своей фракции
}
```

Все мутирующие вызовы возвращают **этот же снапшот** — клиенту не нужен отдельный refetch.

---

## Город и бригада

| Метод | Путь | Тело |
|---|---|---|
| `POST` | `/api/city/build` | `{ key }` — здание найма или спец-здание (для спец — следующий уровень) |
| `POST` | `/api/city/spot` | `{ key }` — взять точку под крышу |
| `POST` | `/api/city/spot/upgrade` | `{ key }` — апгрейд точки |
| `POST` | `/api/army/recruit` | `{ unitId, count }` — найм из накопленного прироста |
| `POST` | `/api/army/dismiss` | `{ slot, count? }` — распустить |
| `POST` | `/api/army/toPool` | `{ slot, count }` — вернуть бойцов в пул найма |
| `POST` | `/api/army/arrange` | `{ order: number[] }` — порядок слотов = расстановка сверху вниз |

---

## Бои

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/pve/camps` | 3 нейтральных «двора» под силу игрока, ротация раз в 30 мин |
| `GET` | `/api/battle/current` | Незаконченный бой (игрок закрыл мини-апп посреди боя) |
| `POST` | `/api/battle/start` | `{ kind: 'pve'\|'pvp', difficulty?, targetId?, auto? }` |
| `POST` | `/api/battle/act` | `{ battleId, action }` — одно действие игрока |
| `POST` | `/api/battle/retreat` | `{ battleId }` — отступление |
| `GET` | `/api/battle/:id` | Запись боя для реплея |

### Жизненный цикл интерактивного боя

```
POST /api/battle/start { kind: 'pve', difficulty: 'normal' }
  → 200 { auto: false, battleId, setup, state, meta }
     • списано топливо
     • сервер уже прокрутил ходы ИИ до первого хода игрока

POST /api/battle/act { battleId, action }
  → 200 { state, finished: false }
  → 200 { state, finished: true, battleId, summary, playerState }
     • сервер валидирует действие, применяет, прокручивает ИИ
     • при завершении: потери, трофеи, XP, Elo, запись в историю
```

`action` — union из движка:

```ts
{ type: 'move',   x, y }
{ type: 'attack', targetId, x, y }   // x,y — клетка, с которой бьём
{ type: 'shoot',  targetId }
{ type: 'heal',   targetId }
{ type: 'defend' }
{ type: 'wait' }
{ type: 'cast',   abilityId, targetId?, x?, y? }
```

Клиент вычисляет допустимые ходы локально функцией `legalMoves(state)` из `@hobpi/engine` —
той же, которой сервер валидирует. Это даёт мгновенную подсветку без сетевого запроса,
но **не даёт возможности сжульничать**: решение всегда перепроверяется на сервере.

### Автобой

`{ auto: true }` → сервер сразу считает весь бой обоими ИИ:

```
200 { auto: true, battleId, summary, winner, rounds, playerState }
```

### Реплей

```
GET /api/battle/:id
200 {
  id, kind, auto, setup, actions, aiSides: ['B'] | ['A','B'],
  result: 'A' | 'B' | 'draw', summary, createdAt, viewerSide: 'A' | 'B'
}
```

Клиент восстанавливает бой вызовом `replay(setup, actions, aiSides)` — то есть весь реплей
это несколько сотен байт вместо покадрового лога. Доступ только участникам боя.

---

## Социальное

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/arena/opponents` | 5 соперников: окно ±15% силы, расширяется шагами до ±50% |
| `GET` | `/api/ladder` | Топ-25 по рейтингу + место игрока |
| `GET` | `/api/history` | Последние 20 боёв игрока (атаки и обороны) |

---

## Правила защиты игроков (реализованы)

| Правило | Значение |
|---|---|
| Щит новичка | 48 часов после регистрации; **снимается сам**, если игрок сам пошёл в атаку |
| Щит после поражения в обороне | 30 минут |
| Кулаун на повторную атаку одного игрока | 6 часов |
| Стоимость боёв | PvE — 1 топливо, PvP — 2 |
| Потери защитника | 50% павших восстанавливается |
| Трофей с победы в PvP | 5% казны проигравшего, максимум 3 000 налика |
| Защита от тупика | если бригада полностью полегла, выдаётся 5 бойцов 1-го тира бесплатно |
| TTL боя | 30 минут, потом сессия удаляется |
