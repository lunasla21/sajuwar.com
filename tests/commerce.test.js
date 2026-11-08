const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createOrderStore } = require('../order_store');
const { createUserStore } = require('../user_store');
const { registerPaymentRoutes } = require('../payment_routes');
const { registerOAuthRoutes, safeReturn } = require('../oauth_routes');

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return 'http://127.0.0.1:' + server.address().port;
}
function store(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sajuwar-commerce-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { orderStore: createOrderStore(dir), userStore: createUserStore(dir) };
}
async function post(origin, url, body, user = 'u1') {
  const response = await fetch(origin + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': user }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
async function paymentFixture(t, mode = 'live', responseStatus = 'DONE') {
  const { orderStore } = store(t), app = express(); app.use(express.json());
  let calls = 0;
  const env = { SAJUWAR_TOSS_CLIENT_KEY: mode + '_ck_example', SAJUWAR_TOSS_SECRET_KEY: mode + '_sk_example', SAJUWAR_TOSS_LIVE_ENABLED: 'true', SAJUWAR_PUBLIC_URL: 'https://www.sajuwar.com' };
  registerPaymentRoutes(app, { orderStore, env,
    requireLogin: (req, res) => { if (!req.get('X-Test-User')) { res.sendStatus(401); return null; } return { id: req.get('X-Test-User'), name: 'Tester', email: 'tester@example.com', phone: '01012345678' }; },
    fetcher: async (url, options) => { calls++; assert.equal(url, 'https://api.tosspayments.com/v1/payments/confirm'); const body = JSON.parse(options.body); assert.equal(options.headers['Idempotency-Key'], 'sajuwar-confirm-' + body.orderId); return { ok: true, json: async () => ({ ...body, totalAmount: body.amount, status: responseStatus, method: '카드' }) }; },
  });
  const origin = await serve(t, app);
  return { orderStore, origin, calls: () => calls };
}

test('live payment verifies amount and ownership; activation is idempotent', async t => {
  const f = await paymentFixture(t);
  const denied = await post(f.origin, '/api/payments/orders', { product_id: 'premium_report' }); assert.equal(denied.status, 400);
  const created = await post(f.origin, '/api/payments/orders', { product_id: 'premium_report', terms_accepted: true });
  assert.equal(created.data.amount.value, 1000);
  const retried = await post(f.origin, '/api/payments/orders', { product_id: 'premium_report', terms_accepted: true }); assert.equal(retried.data.orderId, created.data.orderId);
  const payload = { orderId: created.data.orderId, paymentKey: 'payment-example', amount: 1000 };
  assert.equal((await post(f.origin, '/api/payments/confirm', { ...payload, amount: 1 })).status, 400);
  assert.equal((await post(f.origin, '/api/payments/confirm', payload, 'u2')).status, 404); assert.equal(f.calls(), 0);
  assert.equal(f.orderStore.hasPurchase({ user_id: 'u1', product_id: 'premium_report' }), false);
  assert.equal((await post(f.origin, '/api/payments/confirm', payload)).status, 200);
  assert.equal(f.orderStore.hasPurchase({ user_id: 'u1', product_id: 'premium_report' }), true);
  assert.equal((await post(f.origin, '/api/payments/confirm', payload)).status, 200); assert.equal(f.calls(), 1);
  assert.equal((await post(f.origin, '/api/payments/confirm', { ...payload, paymentKey: 'different' })).status, 409);
  assert.equal(f.orderStore.listPurchases().length, 1);
});
test('test payment never grants production purchase rights', async t => {
  const f = await paymentFixture(t, 'test');
  const created = await post(f.origin, '/api/payments/orders', { product_id: 'premium_report', terms_accepted: true });
  const result = await post(f.origin, '/api/payments/confirm', { orderId: created.data.orderId, paymentKey: 'test-example', amount: 1000 });
  assert.equal(result.data.testMode, true);
  assert.equal(f.orderStore.hasPurchase({ user_id: 'u1', product_id: 'premium_report' }), false);
  assert.equal(f.orderStore.listPurchases().length, 0);
});
test('unsettled provider response cannot grant rights', async t => {
  const f = await paymentFixture(t, 'live', 'WAITING_FOR_DEPOSIT');
  const created = await post(f.origin, '/api/payments/orders', { product_id: 'premium_report', terms_accepted: true });
  assert.equal((await post(f.origin, '/api/payments/confirm', { orderId: created.data.orderId, paymentKey: 'not-settled', amount: 1000 })).status, 409);
  assert.equal(f.orderStore.listPurchases().length, 0);
});
test('unconfigured PG stays disabled and never exposes secret', async t => {
  const { orderStore } = store(t), app = express(); app.use(express.json());
  registerPaymentRoutes(app, { orderStore, requireLogin: () => ({ id: 'u1' }), env: { SAJUWAR_TOSS_SECRET_KEY: 'live_sk_private' } });
  const origin = await serve(t, app), response = await fetch(origin + '/api/payments/config');
  const body = await response.text(); assert.equal(JSON.parse(body).enabled, false); assert.ok(!body.includes('live_sk_private'));
  assert.equal((await post(origin, '/api/payments/orders', { product_id: 'premium_report', terms_accepted: true })).status, 503);
});
test('safe return blocks external destinations, slash escapes and controls', () => {
  for (const bad of ['//evil.example', '/\\evil.example', '/\nevil', 'https://evil.example']) assert.equal(safeReturn(bad), '/mypage.html');
  assert.equal(safeReturn('/payment.html?product=premium_report'), '/payment.html?product=premium_report');
});
test('social accounts use provider identity, never an existing email account', t => {
  const { userStore } = store(t);
  const existing = userStore.signup({ name: 'Existing', email: 'same@example.com', phone: '01012345678', password: 'password123' });
  const google = userStore.socialLogin({ provider: 'google', subject: 'g123', email: 'same@example.com', name: 'Google user' });
  assert.notEqual(existing.user.id, google.user.id);
  assert.equal(userStore.socialLogin({ provider: 'google', subject: 'g123', email: 'same@example.com' }).user.id, google.user.id);
  assert.equal(userStore.login({ email: 'same@example.com', password: 'password123' }).user.id, existing.user.id);
});
test('OAuth validates browser state, preserves checkout and exchanges one-time result', async t => {
  const { userStore } = store(t), app = express();
  registerOAuthRoutes(app, userStore, { env: { SAJUWAR_PUBLIC_URL: 'https://www.sajuwar.com', SAJUWAR_GOOGLE_CLIENT_ID: 'client', SAJUWAR_GOOGLE_CLIENT_SECRET: 'secret' }, fetcher: async url => ({ ok: true, json: async () => url.includes('/token') ? { access_token: 'access' } : { sub: 'g123', email_verified: true, email: 'oauth@example.com', name: 'Google user' } }) });
  const origin = await serve(t, app), target = '/payment.html?product=premium_report';
  const start = await fetch(origin + '/api/auth/google/start?return=' + encodeURIComponent(target), { redirect: 'manual' });
  const authorization = new URL(start.headers.get('location')), state = authorization.searchParams.get('state');
  assert.equal(authorization.origin, 'https://accounts.google.com'); assert.ok(authorization.searchParams.get('code_challenge'));
  const callback = origin + '/api/auth/google/callback?state=' + state + '&code=code';
  const forged = await fetch(callback, { redirect: 'manual' }); assert.ok(forged.headers.get('location').includes('expired'));
  const accepted = await fetch(callback, { headers: { Cookie: 'sw_oauth_state=' + state }, redirect: 'manual' });
  assert.equal(new URL(accepted.headers.get('location'), origin).searchParams.get('return'), target);
  const cookie = accepted.headers.get('set-cookie').match(/sw_oauth_result=([^;]+)/)[1];
  const result = await fetch(origin + '/api/auth/social-result', { headers: { Cookie: 'sw_oauth_result=' + cookie } });
  const auth = await result.json(); assert.ok(auth.token); assert.equal(auth.user.email, 'oauth@example.com');
  assert.equal((await fetch(origin + '/api/auth/social-result', { headers: { Cookie: 'sw_oauth_result=' + cookie } })).status, 401);
});
