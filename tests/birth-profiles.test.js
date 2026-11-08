const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { createBirthProfileStore, registerBirthProfileRoutes, cleanProfile } = require('../birth_profile_store');
const input = { name: '테스트', relation: '자녀', birth: '2020-10-03', time: '04:30', gender: 'female', calendarType: 'solar', birthCountry: 'KR', birthRegion: '서울' };
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sajuwar-profiles-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: createBirthProfileStore(dir, dir) };
}
test('profiles persist; owner is server supplied and cannot be overwritten', t => {
  const { store, dir } = fixture(t);
  const profile = store.create('u1', { ...input, user_id: 'u2', id: 'fake-id' });
  assert.notEqual(profile.id, 'fake-id'); assert.equal(profile.user_id, undefined);
  assert.equal(createBirthProfileStore(dir, dir).list('u1')[0].birth, input.birth);
  const updated = store.update('u1', profile.id, { name: '새이름', user_id: 'u2', relation: '직접 입력', customRelation: '형제자매' });
  assert.equal(updated.name, '새이름'); assert.equal(updated.customRelation, '형제자매'); assert.equal(updated.created_at, profile.created_at);
  assert.deepEqual(store.list('u2'), []);
});
test('other users cannot read, change or delete a saved profile', t => {
  const { store } = fixture(t), profile = store.create('u1', input);
  assert.deepEqual(store.list('u2'), []);
  assert.throws(() => store.update('u2', profile.id, { name: 'Intruder' }), { status: 404 });
  assert.throws(() => store.remove('u2', profile.id), { status: 404 });
  assert.equal(store.list('u1')[0].name, input.name);
  store.remove('u1', profile.id); assert.deepEqual(store.list('u1'), []);
});
test('validates calendar dates, custom relation, gender, location and unknown time', () => {
  for (const patch of [{ birth: '2023-02-29' }, { birth: '2024-13-10' }, { gender: '' }, { time: '24:30' }, { relation: '직접 입력', customRelation: '' }, { birthCountry: 'invalid' }]) assert.throws(() => cleanProfile({ ...input, ...patch }), { status: 400 });
  assert.equal(cleanProfile({ ...input, birth: '2024-02-29' }).birth, '2024-02-29');
  const unknown = cleanProfile({ ...input, time: '', timeUnknown: true }); assert.equal(unknown.time, '12:00'); assert.equal(unknown.timeUnknown, true);
});
test('corrupted storage fails closed and is not silently overwritten', t => {
  const { store, dir } = fixture(t), file = path.join(dir, 'birth_profiles.json'); fs.writeFileSync(file, 'broken-json');
  assert.throws(() => store.create('u1', input)); assert.equal(fs.readFileSync(file, 'utf8'), 'broken-json');
});
test('CRUD routes require login and isolate accounts', async t => {
  const { store, dir } = fixture(t), app = express(); app.use(express.json());
  registerBirthProfileRoutes(app, { baseDir: dir, store, requireLogin: (req, res) => { const id = req.get('X-Test-User'); if (!id) { res.status(401).json({ error: '로그인이 필요합니다.' }); return null; } return { id }; } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function request(method = 'GET', suffix = '', user = '', body) { const r = await fetch(origin + '/api/birth-profiles' + suffix, { method, headers: { 'Content-Type': 'application/json', ...(user ? { 'X-Test-User': user } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, data: await r.json(), cache: r.headers.get('cache-control') }; }
  assert.equal((await request()).status, 401);
  assert.equal((await request('POST', '', '', input)).status, 401);
  const created = await request('POST', '', 'u1', input); assert.equal(created.status, 201); assert.equal(created.cache, 'no-store');
  assert.deepEqual((await request('GET', '', 'u2')).data.profiles, []);
  const id = created.data.profile.id;
  assert.equal((await request('PATCH', '/' + id, 'u2', { name: 'Other' })).status, 404);
  assert.equal((await request('PATCH', '/' + id, 'u1', { name: 'Updated' })).data.profile.name, 'Updated');
  assert.equal((await request('DELETE', '/' + id, 'u2')).status, 404);
  assert.equal((await request('DELETE', '/' + id, 'u1')).status, 200);
  assert.deepEqual((await request('GET', '', 'u1')).data.profiles, []);
});
