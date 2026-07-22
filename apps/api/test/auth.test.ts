/**
 * Проверка подписи Telegram initData.
 *
 * Главное, что здесь проверяется, — состав data-check-string. Реальный initData
 * содержит поля, которых нет в упрощённых примерах (signature, chat_instance,
 * chat_type, start_param). Если хоть одно выпадет из подсчёта, подпись не сойдётся
 * и в Telegram никто не залогинится, хотя все «синтетические» тесты будут зелёными.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyInitData } from '../src/auth.ts';

const TOKEN = '123456:TEST-TOKEN-NOT-A-REAL-ONE';

/** Подписывает набор полей ровно так, как это делает Telegram. */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const checkString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  const q = new URLSearchParams(fields);
  q.set('hash', hash);
  return q.toString();
}

const user = JSON.stringify({ id: 42, first_name: 'Батя', username: 'batya', language_code: 'ru' });
const fresh = () => String(Math.floor(Date.now() / 1000));

test('принимает initData в том виде, в каком его шлёт Telegram', async () => {
  const initData = sign({
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user,
    auth_date: fresh(),
    signature: 'K8sV1n0mF3xQ2pLd7YbTcRzA9jHgWnEuIoPaSdFgHjKlZxCvBnM',
    chat_instance: '-3788475317572404878',
    chat_type: 'sender',
  });
  const u = await verifyInitData(initData, TOKEN);
  assert.ok(u, 'подпись с полем signature должна проходить');
  assert.equal(u.id, '42');
  assert.equal(u.firstName, 'Батя');
});

test('принимает минимальный initData без необязательных полей', async () => {
  const u = await verifyInitData(sign({ user, auth_date: fresh() }), TOKEN);
  assert.ok(u);
  assert.equal(u.id, '42');
});

test('принимает initData с start_param из deep-link', async () => {
  const u = await verifyInitData(
    sign({ user, auth_date: fresh(), signature: 'abc', start_param: 'ref_777' }),
    TOKEN,
  );
  assert.ok(u, 'start_param тоже входит в подсчёт');
});

test('отклоняет подделанный hash', async () => {
  const initData = sign({ user, auth_date: fresh(), signature: 'abc' });
  const tampered = initData.replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);
  assert.equal(await verifyInitData(tampered, TOKEN), null);
});

test('отклоняет подмену данных при сохранённой подписи', async () => {
  const initData = sign({ user, auth_date: fresh(), signature: 'abc' });
  const swapped = initData.replace(
    encodeURIComponent(user),
    encodeURIComponent(JSON.stringify({ id: 999, first_name: 'Чужой' })),
  );
  assert.equal(await verifyInitData(swapped, TOKEN), null);
});

test('отклоняет подпись, сделанную чужим токеном', async () => {
  const initData = sign({ user, auth_date: fresh() }, '999:ANOTHER-BOT-TOKEN');
  assert.equal(await verifyInitData(initData, TOKEN), null);
});

test('отклоняет протухший initData', async () => {
  const old = String(Math.floor(Date.now() / 1000) - 25 * 3600);
  assert.equal(await verifyInitData(sign({ user, auth_date: old }), TOKEN), null);
});

test('отклоняет initData без hash и без токена бота', async () => {
  assert.equal(await verifyInitData(`user=${encodeURIComponent(user)}`, TOKEN), null);
  assert.equal(await verifyInitData(sign({ user, auth_date: fresh() }), ''), null);
});

test('порядок полей в строке запроса не влияет на результат', async () => {
  const fields = { user, auth_date: fresh(), signature: 'abc', chat_type: 'private' };
  const initData = sign(fields);
  const q = new URLSearchParams(initData);
  const reordered = new URLSearchParams();
  for (const k of [...q.keys()].reverse()) reordered.set(k, q.get(k)!);
  assert.ok(await verifyInitData(reordered.toString(), TOKEN));
});
