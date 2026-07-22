/**
 * Сквозная проверка мини-аппа: собранный бандл монтируется в jsdom и играет
 * реальный сценарий против настоящего API на временной БД.
 *
 * Ловит то, что не видят ни tsc, ни тесты API: падения при рендере, кривые хуки,
 * обращения к отсутствующим полям ответа.
 *
 * Запуск: npm run build && node tools/ui-smoke.ts
 */
import { readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'hobpi-ui-')), 'ui.db');

const { createApp } = await import('../apps/api/src/app.ts');
const { nodeDb } = await import('../apps/api/src/adapters/node.ts');
const { db, close } = nodeDb(process.env.DB_PATH);
const app = createApp({ db, devAuth: true, rateLimit: 0 });

const distDir = resolve(import.meta.dirname, '../apps/web/dist/assets');
const bundle = readdirSync(distDir).find((f) => f.endsWith('.js'));
if (!bundle) {
  console.error('Нет сборки. Сначала: npm run build');
  process.exit(1);
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:5173/',
  pretendToBeVisual: true,
});

const w = dom.window as unknown as Record<string, unknown>;

// глобалы, которые ожидает React-бандл
const define = (k: string, v: unknown) => {
  // часть глобалов в Node объявлена только через getter — переопределяем дескриптором
  Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
};
define('window', dom.window);
for (const k of [
  'document', 'navigator', 'location', 'localStorage', 'HTMLElement', 'Element',
  'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'DOMParser',
]) {
  define(k, w[k]);
}

// относительные /api уходят прямо в обработчик — сеть не нужна
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  return app.fetch(new Request(new URL(url, 'http://app.local').toString(), init));
}) as typeof fetch;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = () => dom.window.document.body.textContent ?? '';

function findButton(re: RegExp): HTMLElement | null {
  const nodes = [...dom.window.document.querySelectorAll('button')];
  return (nodes.find((b) => re.test(b.textContent ?? '')) as HTMLElement) ?? null;
}

function click(el: HTMLElement | null, what: string): void {
  if (!el) throw new Error(`Не нашёл элемент: ${what}`);
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

const checks: Array<[string, boolean]> = [];
const expect = (name: string, ok: boolean) => {
  checks.push([name, ok]);
  console.log(`${ok ? '✔' : '✖'} ${name}`);
};

let errors = 0;
dom.window.addEventListener('error', () => { errors++; });
const origError = console.error;
console.error = (...args: unknown[]) => {
  const s = String(args[0] ?? '');
  // предупреждения React о act() в этом окружении ожидаемы
  if (!/not wrapped in act|Warning:/.test(s)) errors++;
  origError(...args);
};

await import(pathToFileURL(join(distDir, bundle)).href);

await sleep(900);
expect('приложение смонтировалось', text().length > 0);
expect('показан онбординг', /БАНДЫ ПЕТЕРБУРГА/.test(text()) && /За кого держишь/.test(text()));
expect('перечислены все 4 фракции',
  ['Старые авторитеты', 'Качалка', 'Гопники', 'Айтишники'].every((f) => text().includes(f)));

click(findButton(/Старые авторитеты/), 'карточка фракции');
await sleep(120);
click(findButton(/^Дальше$/), 'кнопка «Дальше» (шаг 1)');
await sleep(150);
expect('шаг выбора класса открылся', /Кто ты сам/.test(text()));
expect('перечислены 3 класса',
  ['Авторитет', 'Опер', 'Мажор-бизнесмен'].every((c) => text().includes(c)));

click(findButton(/Опер/), 'карточка класса');
await sleep(120);
click(findButton(/^Дальше$/), 'кнопка «Дальше» (шаг 2)');
await sleep(150);
expect('шаг клички открылся', /Как тебя звать/.test(text()));

click(findButton(/Заехать на район/), 'кнопка регистрации');
await sleep(900);

const base = text();
expect('после онбординга открылась База', /Здания найма/.test(base) && /Доход/.test(base));
expect('видна строка ресурсов', /1 500|1 500/.test(base) || /💵/.test(base));
expect('стартовая точка на месте', /Ларёк/.test(base));
expect('видны все 7 зданий найма',
  ['Двор', 'Спортплощадка', 'Пункт охраны', 'Гараж', 'Штаб бригады', 'Мастерская', 'Особняк']
    .every((b) => base.includes(b)));

click(findButton(/Герой/), 'кнопка «Герой»');
await sleep(350);
const heroText = text();
expect('экран героя открылся', /Статы/.test(heroText) && /Прикид/.test(heroText));
expect('на кукле все 8 слотов, включая ствол',
  dom.window.document.querySelectorAll('.slot').length === 8 && /Ствол/.test(heroText));
click(findButton(/^✕$/), 'закрыть героя');
await sleep(250);

click(findButton(/Бригада/), 'вкладка «Бригада»');
await sleep(250);
expect('экран бригады показывает стартовый стек и найм',
  /Дворовый пацан/.test(text()) && /Найм/.test(text()));

click(findButton(/Район/), 'вкладка «Район»');
await sleep(700);
expect('экран района показал дворы',
  /Дворы района/.test(text()) && /Заехать/.test(text()));

click(findButton(/^Заехать⛽1$|^Заехать/), 'кнопка «Заехать» (старт боя)');
await sleep(1200);
const battle = text();
expect('открылся экран боя', /раунд/.test(battle) && /Глухая/.test(battle));
expect('на поле есть бойцы обеих сторон',
  dom.window.document.querySelectorAll('.unit.A').length > 0 &&
  dom.window.document.querySelectorAll('.unit.B').length > 0);
// в очереди остаются только не походившие в этом раунде — к ходу игрока их может быть немного
expect('очередь инициативы отрисована',
  dom.window.document.querySelectorAll('.queue-item').length >= 1);
expect('подсвечены доступные ходы',
  dom.window.document.querySelectorAll('.cell.move, .cell.attack').length > 0);

// играем бой до конца: бьём, если можем, иначе шагаем к врагу
for (let i = 0; i < 220; i++) {
  const doc = dom.window.document;
  if (!doc.querySelector('.battle')) break;
  const target =
    (doc.querySelector('.cell.attack') as HTMLElement) ??
    (doc.querySelector('.cell.move') as HTMLElement);
  if (target) click(target, 'клетка');
  else click(findButton(/Глухая/), 'защита');
  await sleep(70);
}

await sleep(600);
const after = text();
expect('бой завершился и показан итог',
  /Район твой|Не срослось|Разошлись/.test(after) || /Дворы района/.test(after));

const closeBtn = findButton(/^Дальше$/);
if (closeBtn) click(closeBtn, 'закрыть итог');
await sleep(300);
click(findButton(/Арена/), 'вкладка «Арена»');
await sleep(600);
expect('арена открылась', /рейтинг/.test(text()));

click(findButton(/Топ/), 'вкладка «Топ»');
await sleep(500);
expect('таблица лидеров открылась', /Хозяева города/.test(text()));

expect('нет ошибок рантайма в консоли', errors === 0);

close();
dom.window.close();

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} проверок пройдено`);
process.exit(failed.length ? 1 : 0);
