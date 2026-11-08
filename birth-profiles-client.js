(async () => {
  const $ = id => document.getElementById(id);
  const token = localStorage.getItem('sajuwar_auth_token') || '';
  const requested = new URLSearchParams(location.search).get('return') || '/';
  let target = '/';
  if (requested.startsWith('/') && !/[\\\x00-\x20]/.test(requested)) { const url = new URL(requested, location.origin); if (url.origin === location.origin && ['/', '/report-view.html', '/index.html'].includes(url.pathname)) target = url.pathname + url.search; }
  $('loginLink').href = '/login.html?return=' + encodeURIComponent(location.pathname + location.search);
  let profiles = [], editingId = '', relation = '본인', calendarType = 'solar', gender = '';
  function authRequired() { $('authGate').hidden = false; $('profileContent').hidden = true; }
  async function request(url, method = 'GET', body) {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (response.status === 401) authRequired();
    if (!response.ok) throw new Error(data.error || '사주를 불러오지 못했습니다.');
    return data;
  }
  function choices(group, attr, value) { document.querySelectorAll('#' + group + ' [' + attr + ']').forEach(button => button.setAttribute('aria-pressed', String(button.getAttribute(attr) === value))); }
  function syncRelation() { choices('relationGroup', 'data-relation', relation); $('customRelationField').hidden = relation !== '직접 입력'; $('customRelation').required = relation === '직접 입력'; }
  function syncTime() { $('profileTime').disabled = $('profileTimeUnknown').checked; $('profileTime').required = !$('profileTimeUnknown').checked; }
  document.querySelectorAll('[data-relation]').forEach(button => button.addEventListener('click', () => { relation = button.dataset.relation; syncRelation(); if (relation === '직접 입력') $('customRelation').focus(); }));
  document.querySelectorAll('[data-calendar]').forEach(button => button.addEventListener('click', () => { calendarType = button.dataset.calendar; choices('calendarGroup', 'data-calendar', calendarType); }));
  document.querySelectorAll('[data-gender]').forEach(button => button.addEventListener('click', () => { gender = button.dataset.gender; choices('genderGroup', 'data-gender', gender); }));
  $('profileTimeUnknown').addEventListener('change', syncTime);
  function edit(profile = {}) {
    editingId = profile.id || ''; relation = profile.relation || '본인'; calendarType = profile.calendarType || 'solar'; gender = profile.gender || '';
    $('formTitle').textContent = editingId ? '저장한 사주 수정' : '새로운 사주 추가';
    $('profileName').value = profile.name || ''; $('customRelation').value = profile.customRelation || ''; $('profileBirth').value = profile.birth || '';
    $('profileTime').value = profile.timeUnknown ? '' : profile.time || ''; $('profileTimeUnknown').checked = profile.timeUnknown === true;
    $('profileCountry').value = profile.birthCountry || 'KR'; $('profileRegion').value = profile.birthRegion || '서울';
    syncRelation(); syncTime(); choices('calendarGroup', 'data-calendar', calendarType); choices('genderGroup', 'data-gender', gender);
    $('formMessage').textContent = ''; $('profileForm').hidden = false; $('addProfile').hidden = true; $('profileForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('profileName').focus();
  }
  $('addProfile').addEventListener('click', () => edit());
  $('cancelEdit').addEventListener('click', () => { $('profileForm').hidden = true; $('addProfile').hidden = false; });
  function useProfile(profile) {
    localStorage.setItem('sajuwar_report_profile', JSON.stringify(profile));
    const url = new URL(target, location.origin); url.searchParams.set('birthProfile', profile.id); location.href = url.pathname + url.search;
  }
  function render() {
    const list = $('profileList'); list.replaceChildren();
    if (!profiles.length) { const empty = document.createElement('p'); empty.className = 'empty-profiles'; empty.textContent = '아직 저장한 사주가 없어요. 나의 사주부터 추가해보세요.'; list.append(empty); }
    for (const profile of profiles) {
      const card = document.createElement('article'); card.className = 'saved-profile';
      const head = document.createElement('div'); head.className = 'profile-name'; const name = document.createElement('h2'); name.textContent = profile.name;
      const relationTag = document.createElement('span'); relationTag.className = 'relation-badge'; relationTag.textContent = profile.relation === '직접 입력' ? profile.customRelation : profile.relation; head.append(name, relationTag);
      const details = document.createElement('p'); details.className = 'muted'; details.textContent = profile.birth + ' · ' + (profile.calendarType === 'lunar' ? '음력' : '양력') + ' · ' + (profile.gender === 'female' ? '여성' : '남성') + ' · ' + (profile.timeUnknown ? '시간 미상' : profile.time);
      const actions = document.createElement('div'); actions.className = 'profile-actions';
      const choose = document.createElement('button'); choose.className = 'choose'; choose.textContent = target.startsWith('/report-view.html') ? '이 사주 선택하기' : '이 사주로 미리보기'; choose.addEventListener('click', () => useProfile(profile));
      const update = document.createElement('button'); update.textContent = '수정'; update.addEventListener('click', () => edit(profile));
      const remove = document.createElement('button'); remove.className = 'delete'; remove.textContent = '삭제'; remove.addEventListener('click', async () => {
        if (!confirm(profile.name + '님의 저장한 사주를 삭제할까요? 구매한 리포트는 삭제되지 않습니다.')) return;
        remove.disabled = true;
        try { await request('/api/birth-profiles/' + encodeURIComponent(profile.id), 'DELETE'); profiles = profiles.filter(p => p.id !== profile.id); render(); $('message').textContent = '저장한 사주를 삭제했습니다.'; }
        catch (error) { $('message').textContent = error.message; remove.disabled = false; }
      }); actions.append(choose, update, remove); card.append(head, details, actions); list.append(card);
    }
  }
  $('profileForm').addEventListener('submit', async event => {
    event.preventDefault(); $('formMessage').textContent = '';
    if (!gender) { $('formMessage').textContent = '성별을 선택해주세요.'; $('genderGroup').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const input = { name: $('profileName').value.trim(), relation, customRelation: $('customRelation').value.trim(), calendarType, birth: $('profileBirth').value, gender, time: $('profileTime').value, timeUnknown: $('profileTimeUnknown').checked, birthCountry: $('profileCountry').value, birthRegion: $('profileRegion').value.trim() };
    $('saveProfile').disabled = true;
    try {
      const data = await request('/api/birth-profiles' + (editingId ? '/' + encodeURIComponent(editingId) : ''), editingId ? 'PATCH' : 'POST', input);
      if (editingId) profiles = profiles.map(p => p.id === editingId ? data.profile : p); else profiles.push(data.profile);
      $('profileForm').hidden = true; $('addProfile').hidden = false; render(); $('message').textContent = '사주를 저장했습니다. 목록에서 선택해 불러오세요.'; $('message').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) { $('formMessage').textContent = error.message; }
    finally { $('saveProfile').disabled = false; }
  });
  if (!token) { authRequired(); return; }
  try {
    profiles = (await request('/api/birth-profiles')).profiles;
    $('profileContent').hidden = false; render();
    if (new URLSearchParams(location.search).get('draft') === '1') { let draft = {}; try { draft = JSON.parse(localStorage.getItem('sajuwar_report_profile') || '{}'); } catch {} edit(draft); }
  } catch (error) { $('message').textContent = error.message; }
})();
