# 12. Арт: стиль и промпты для генерации

Сейчас интерфейс держится на типографике, цвете и эмодзи — это осознанный выбор для MVP.
Этот документ нужен, чтобы заменить эмодзи на настоящий арт **без потери цельности**:
главный риск генеративного пайплайна не качество отдельной картинки, а разнобой между ними.

Решение: единый **стилевой блок**, который дословно приклеивается к каждому промпту.
Меняется только описание персонажа. Ничего больше — ни освещения, ни ракурса, ни палитры.

---

## 1. Стилевой блок (копировать без изменений)

```
STYLE: gritty 1990s Eastern-European crime comic illustration, flat vector shapes with
rough halftone/newsprint texture, heavy black ink outlines, limited palette —
desaturated asphalt greys (#1b1a17, #33302a), warm brass gold (#d9a441), muted brick red
(#b8382f), cold steel blue (#4a7fb5). Overcast winter daylight, single soft key light from
upper left. Waist-up character portrait, three-quarter view, facing slightly left,
neutral standing pose, centred, generous headroom. Solid dark charcoal background (#141311),
no gradient, no scenery. Square 1:1 composition. Slight paper grain over the whole image.
No text, no logos, no watermark, no signature, no frame, no border.
```

```
NEGATIVE: photorealistic, 3d render, anime, chibi, glossy, neon, cyberpunk, western cartoon,
smooth gradients, lens flare, depth of field, busy background, multiple characters,
text, letters, numbers, watermark, real brand marks, real people, extra fingers, deformed hands
```

**Параметры:** 1024×1024, потом даунскейл до 256×256 (иконки в UI) и 512×512 (карточки).
Одинаковый seed для одной фракции даёт заметно более родственный набор — рекомендую
фиксировать seed по фракции и менять только текст.

---

## 2. Промпт-шаблон

```
{СТИЛЕВОЙ БЛОК}

SUBJECT: {описание из таблицы ниже}
```

Всё. Никаких дополнительных «cinematic, masterpiece, 8k» — они ломают единство стиля.

---

## 3. Бойцы (28 штук)

### Старые авторитеты — Castle · seed A

| ID | Боец | SUBJECT |
|---|---|---|
| cas1 | Дворовый пацан | young lanky teenager in a cheap tracksuit and knitted hat, hands in pockets, bored defiant expression |
| cas2 | Стритфайтер | wiry young man in a denim jacket, split eyebrow, winding up to throw an empty glass bottle |
| cas3 | Охранник ТЦ | heavy-set middle-aged guard in a cheap black uniform jacket, arms folded, blank patient stare |
| cas4 | Курьер на «мерине» | lean courier in a leather jacket and sunglasses, car keys spinning on one finger, smirking |
| cas5 | Смотрящий | calm authoritative man in his fifties, grey overcoat, signet ring, hands clasped, cold measuring gaze |
| cas6 | Киллер | thin unremarkable man in a plain grey coat and flat cap, face half in shadow, hands in pockets |
| cas7 | Легенда района | imposing scarred elder in a long dark coat over a suit, heavy gold chain, weathered dignified face |

### Качалка — Stronghold · seed B

| ID | Боец | SUBJECT |
|---|---|---|
| str1 | Пацан с турника | skinny determined teenager in a stretched tank top, chalk on hands, defiant chin up |
| str2 | Боксёр-любитель | young boxer in a worn tracksuit, taped fists, broken nose, guard half-raised |
| str3 | Борец | thick-necked wrestler in a singlet under an open jacket, cauliflower ears, wide low stance |
| str4 | Тренер-диетолог | balding coach in a whistle and windbreaker, holding a shaker bottle, encouraging expression |
| str5 | Вышибала клуба | enormous bouncer in a black bomber jacket, earpiece, arms crossed, immovable |
| str6 | ММА-звезда | athletic fighter in fight shorts and open hoodie, taped hands, confident half-smile |
| str7 | Божество качалки | grotesquely muscular giant in a stretched singlet, veins, tiny sunglasses, absurd heroic pose |

### Гопники — Inferno · seed C

| ID | Боец | SUBJECT |
|---|---|---|
| inf1 | Мелкий с района | scrawny kid in an oversized tracksuit and cap, cigarette behind ear, squatting-ready posture |
| inf2 | Гопник с семками | young man in a tracksuit crouching on his heels, holding a paper cone of sunflower seeds, spitting |
| inf3 | Подъездный | shifty young man in a dark hoodie under a stairwell light, hands hidden, sidelong glare |
| inf4 | Барыга | slick middle-aged hustler in a leather coat, gold tooth, opening a battered briefcase |
| inf5 | Наёмник с рынка | hard-faced mercenary in a surplus jacket and boots, indifferent professional stare |
| inf6 | Отморозок | wild-eyed young man mid-lunge, shaved head, scarred knuckles, manic grin |
| inf7 | Смотрящий за окраиной | broad brutal boss in a long leather coat, shaved head, heavy rings, contemptuous sneer |

### Айтишники — Tower · seed D

| ID | Боец | SUBJECT |
|---|---|---|
| tow1 | Стажёр | nervous young intern in a hoodie clutching a laptop like a shield, oversized glasses |
| tow2 | Эникейщик | tired man in a checked shirt with a screwdriver and tangle of cables around his neck |
| tow3 | Тестировщик | focused woman in a plain sweater, notebook and pen, one eyebrow raised sceptically |
| tow4 | Сисадмин | bearded heavyset admin in a black band t-shirt, mug of tea, unbothered thousand-yard stare |
| tow5 | Продакт | polished young manager in a fitted shirt, presenting a chart, over-confident smile |
| tow6 | Дрон-курьер | small quadcopter drone with a parcel strapped underneath, hovering, blinking status lights |
| tow7 | Кибер-безопасник | severe figure in a black hooded jacket, face lit cold blue from below, mirrored glasses |

---

## 4. Гербы фракций (512×512)

Тот же стилевой блок, но `SUBJECT` — эмблема, а не персонаж, и добавь
`emblem, centred symmetrical badge, no character`:

| Фракция | SUBJECT |
|---|---|
| Старые авторитеты | brass signet ring over crossed vintage keys, laurel of cigarette smoke |
| Качалка | crossed dumbbell and horizontal bar, rough concrete texture |
| Гопники | sunflower seed husk crest over a flat cap silhouette |
| Айтишники | stylised office tower made of stacked server units, single glowing window |

---

## 5. Фоны и иконки

| Что | Размер | SUBJECT |
|---|---|---|
| Фон поля боя | 1536×1024 | empty asphalt courtyard between panel houses, puddles, dumpster, overcast, no people |
| Фон базы | 1536×1024 | cluttered garage cooperative at dusk, corrugated metal doors, no people |
| Точка «Ларёк» | 256×256 | small metal street kiosk with barred window, isometric object, no people |
| Точка «Ночной клуб» | 256×256 | shabby club entrance with a rope and red bulb, isometric object, no people |
| Точка «Рынок» | 256×256 | market stall with awning and crates, isometric object, no people |
| Точка «Автосервис» | 256×256 | open garage bay with a car on a lift, isometric object, no people |

Для объектов добавляй в конец стилевого блока: `isometric object icon, 3/4 top-down view,
no background, centred, no character`.

---

## 6. Артефакты (256×256)

`SUBJECT: {предмет}, single object, centred, floating, no hands, no background`

Одежда и техника генерируются без проблем. **Со стволами генераторы часто отказывают** —
это ожидаемо и обходится формулировкой, а не уговорами:

| Артефакт | Рабочая формулировка |
|---|---|
| Бита «Аргумент» | worn wooden baseball bat lying flat, taped grip, sports equipment |
| Нож-бабочка | closed balisong folding knife, closed, decorative object |
| ТТ | vintage silhouette of a 1940s service pistol, flat black icon, side profile, museum catalogue style |
| Обрез | flat black silhouette icon of a short double-barrel hunting shotgun, side profile, no person |

Правила, чтобы не ловить отказы: предмет **один**, **лежит или силуэт**, **никаких рук**,
**не направлен на зрителя**, никакого контекста применения. Если модель всё равно
отказывает — оставляем эмодзи, это не блокер.

---

## 7. Порядок работы

1. Сгенерировать одну **эталонную** карточку (рекомендую `cas5 Смотрящий` — средний тир,
   спокойная поза) и утвердить её. Она задаёт планку.
2. Прогнать фракцию целиком одним seed'ом, отсмотреть **набором**, а не по одной:
   разнобой виден только в ряду.
3. Убрать фон в прозрачность, ужать до 256×256 PNG, положить в `apps/web/public/units/<id>.png`.
4. В `packages/engine/src/content/units.ts` поле `icon` заменить с эмодзи на путь;
   в `Field.tsx` и карточках отрисовать `<img>` вместо текста.

Шаг 4 — единственное изменение в коде: `icon` уже проходит сквозь весь UI одной строкой,
поэтому подмена эмодзи на картинки не потребует переписывать экраны.

---

## 8. Чего не генерировать

- Реальных людей, реальные лица, узнаваемых актёров.
- Реальные бренды, логотипы, марки машин, надписи на кириллице (модели их коверкают —
  весь текст рисуем шрифтами в UI, а не в картинке).
- Сцены насилия, крови, применения оружия.
- Наркотики в любом виде.
