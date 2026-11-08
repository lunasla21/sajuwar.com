const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const RELATIONS = ['본인', '배우자', '연인', '부모', '자녀', '친구', '직접 입력'];
function failure(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function cleanProfile(input = {}) {
  const name = String(input.name || '').trim();
  const relation = String(input.relation || '본인').trim();
  const customRelation = relation === '직접 입력' ? String(input.customRelation || '').trim() : '';
  const calendarType = input.calendarType || 'solar';
  const birth = String(input.birth || '');
  const gender = input.gender;
  const timeUnknown = input.timeUnknown === true;
  const time = timeUnknown ? '12:00' : String(input.time || '');
  const birthCountry = String(input.birthCountry || 'KR').trim();
  const birthRegion = String(input.birthRegion || '서울').trim();
  if (!name || name.length > 60) throw failure('이름을 1~60자로 입력해주세요.');
  if (!RELATIONS.includes(relation) || (relation === '직접 입력' && (!customRelation || customRelation.length > 30))) throw failure('관계를 선택하거나 30자 이내로 입력해주세요.');
  if (!['solar', 'lunar'].includes(calendarType)) throw failure('양력 또는 음력을 선택해주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw failure('생년월일을 확인해주세요.');
  const [year, month, day] = birth.split('-').map(Number);
  if (year < 1900 || year > new Date().getFullYear() || month < 1 || month > 12 || day < 1 || day > (calendarType === 'lunar' ? 30 : 31)) throw failure('생년월일 범위를 확인해주세요.');
  if (calendarType === 'solar') { const date = new Date(Date.UTC(year, month - 1, day)); if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw failure('존재하지 않는 생년월일입니다.'); }
  if (!['female', 'male'].includes(gender)) throw failure('성별을 선택해주세요.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw failure('태어난 시간을 입력하거나 시간 모름을 선택해주세요.');
  if (!['KR','US','JP','CN','CA','AU','GB','SG','VN','TH','PH','OTHER'].includes(birthCountry) || !birthRegion || birthRegion.length > 60) throw failure('출생 국가와 지역을 확인해주세요.');
  return { name, relation, customRelation, calendarType, birth, gender, timeUnknown, time, birthCountry, birthRegion };
}
function createBirthProfileStore(baseDir, dataDir = process.env.SAJUWAR_DATA_DIR || path.join(baseDir, 'data')) {
  const file = path.join(dataDir, 'birth_profiles.json');
  function read() {
    if (!fs.existsSync(file)) return [];
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows)) throw new Error('Invalid birth profile store');
    return rows;
  }
  function write(rows) {
    fs.mkdirSync(dataDir, { recursive: true });
    const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(rows, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, file);
  }
  const publicProfile = ({ user_id, ...profile }) => profile;
  function list(userId) { return read().filter(p => p.user_id === userId).map(publicProfile); }
  function create(userId, input) {
    const rows = read();
    if (rows.filter(p => p.user_id === userId).length >= 100) throw failure('사주는 최대 100명까지 저장할 수 있습니다.');
    const profile = { ...cleanProfile(input), id: crypto.randomUUID(), user_id: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    rows.push(profile); write(rows); return publicProfile(profile);
  }
  function update(userId, id, input) {
    const rows = read(), index = rows.findIndex(p => p.id === id && p.user_id === userId);
    if (index === -1) throw failure('사주를 찾을 수 없습니다.', 404);
    rows[index] = { ...rows[index], ...cleanProfile({ ...rows[index], ...input }), updated_at: new Date().toISOString() };
    write(rows); return publicProfile(rows[index]);
  }
  function remove(userId, id) {
    const rows = read(), index = rows.findIndex(p => p.id === id && p.user_id === userId);
    if (index === -1) throw failure('사주를 찾을 수 없습니다.', 404);
    rows.splice(index, 1); write(rows);
  }
  return { list, create, update, remove };
}
function registerBirthProfileRoutes(app, { baseDir, requireLogin, store = createBirthProfileStore(baseDir) }) {
  app.use('/api/birth-profiles', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function handle(operation, status = 200) {
    return (req, res) => {
      const user = requireLogin(req, res); if (!user) return;
      try { res.status(status).json(operation(user.id, req)); }
      catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : '저장한 사주를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }); }
    };
  }
  app.get('/api/birth-profiles', handle(userId => ({ profiles: store.list(userId) })));
  app.post('/api/birth-profiles', handle((userId, req) => ({ profile: store.create(userId, req.body) }), 201));
  app.patch('/api/birth-profiles/:id', handle((userId, req) => ({ profile: store.update(userId, req.params.id, req.body) })));
  app.delete('/api/birth-profiles/:id', handle((userId, req) => { store.remove(userId, req.params.id); return { ok: true }; }));
}
module.exports = { createBirthProfileStore, registerBirthProfileRoutes, cleanProfile };
