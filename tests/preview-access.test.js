const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sajuwar-preview-'));
process.env.SAJUWAR_DATA_DIR = tempDir;
process.env.OPENAI_API_KEY = '';
process.env.SAJUWAR_ADMIN_KEY = '';
const { app } = require('../server');
const { createUserStore } = require('../user_store');
const { createOrderStore } = require('../order_store');
const { buildFreePreview } = require('../preview_report');
let server, origin;
const profile = { name: '테스트전략가', birth: '1990-01-15', time: '12:00', gender: 'female', calendarType: 'solar', timeUnknown: true, birthCountry: 'KR', birthRegion: '서울' };
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = 'http://127.0.0.1:' + server.address().port; });
after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); fs.rmSync(tempDir, { recursive: true, force: true }); });
async function analyze(route, payload, token = '') {
  const response = await fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) });
  return { status: response.status, data: await response.json() };
}
test('public analysis aliases return a bounded preview, even with forged developer flags', async () => {
  for (const route of ['/analyze', '/api/saju']) {
    const r = await analyze(route, { ...profile, paidReport: false, developerMode: true });
    assert.equal(r.status, 200); assert.equal(r.data.access_level, 'preview');
    assert.ok(r.data.preview.type && r.data.preview.weapon && r.data.preview.summary);
    assert.ok(r.data.result.length < 500);
    for (const key of ['daewoon', 'sewoon', 'dailyLuck', 'analysisEvidence', 'developer_debug']) assert.equal(r.data[key], undefined);
    assert.equal(r.data.pillars.hour, '미상'); assert.equal(r.data.upgrade.amount, 1000);
  }
});
test('preview types follow calculated stems and do not expose full report data', () => {
  const wood = buildFreePreview({ name: 'A', pillars: { day: '甲子' } });
  const metal = buildFreePreview({ name: 'A', pillars: { day: '庚子' } });
  assert.notEqual(wood.preview.type, metal.preview.type);
  assert.match(wood.preview.basis, /일간 甲/);
});
test('requesting paid content requires login and an active product purchase', async () => {
  assert.equal((await analyze('/analyze', { ...profile, paidReport: true })).status, 401);
  const users = createUserStore(tempDir);
  const auth = users.signup({ name: 'Unpaid', email: 'unpaid@example.com', phone: '01012345678', password: 'test-password' });
  assert.equal((await analyze('/api/saju', { ...profile, paidReport: true }, auth.token)).status, 403);
});
test('paid entry returns and stores the migrated reading, retains unknown-time profile, and cannot unlock masterbook', async () => {
  const users = createUserStore(tempDir), orders = createOrderStore(tempDir);
  const auth = users.signup({ name: 'Paid', email: 'paid@example.com', phone: '01012345678', password: 'test-password' });
  const order = orders.createBankTransferOrder({ user_id: auth.user.id, name: auth.user.name, email: auth.user.email, phone: auth.user.phone, product_id: 'premium_report' });
  orders.activatePurchase(order);
  const r = await analyze('/analyze', { ...profile, paidReport: true, product_id: 'premium_report' }, auth.token);
  assert.equal(r.status, 200); assert.equal(r.data.access_level, 'paid'); assert.equal(r.data.report_version, 'entry-battlefield-v1');
  assert.ok(r.data.result.length > 500); assert.ok(r.data.daewoon && r.data.sewoon);
  assert.equal(r.data.pillars.hour, '미상');
  const cachedResponse = await fetch(origin + '/api/my/report?product_id=premium_report', { headers: { Authorization: 'Bearer ' + auth.token } });
  assert.equal(cachedResponse.status, 200);
  const cached = await cachedResponse.json(); assert.equal(cached.profile.timeUnknown, true); assert.equal(cached.profile.birthRegion, '서울'); assert.equal(cached.response.result, r.data.result);
  assert.equal((await analyze('/analyze', { ...profile, paidReport: true, product_id: 'master_intelligence_report' }, auth.token)).status, 403);
  assert.equal((await analyze('/analyze', { ...profile, birth: '1991-01-15', paidReport: true }, auth.token)).status, 403);
});


test('stored files cannot be read through static or encoded paths', async () => {
  const dataDir = path.join(__dirname, '..', 'data');
  const fileName = 'static-access-test-' + process.pid + '.json';
  const file = path.join(dataDir, fileName);
  fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, '{"test":"must remain private"}');
  try {
    for (const route of ['/data/' + fileName, '/%64ata/' + fileName, '/data%2F' + fileName, '//data//' + fileName]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 404, route);
    }
  } finally { fs.unlinkSync(file); try { fs.rmdirSync(dataDir); } catch {} }
});
