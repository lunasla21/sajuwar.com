(async () => {
  const mounts = [...document.querySelectorAll('[data-birth-profile-picker]')];
  if (!mounts.length) return;
  const token = localStorage.getItem('sajuwar_auth_token') || '';
  const current = location.pathname + location.search;
  const manageUrl = '/birth-profiles.html?return=' + encodeURIComponent(current);
  function message(mount, text, href, label) {
    mount.replaceChildren(); const p = document.createElement('p'); p.textContent = text; mount.append(p);
    if (href) { const link = document.createElement('a'); link.href = href; link.textContent = label; mount.append(link); }
  }
  if (!token) { for (const mount of mounts) message(mount, '나와 가족의 사주를 저장하고 다시 불러올 수 있어요.', '/login.html?return=' + encodeURIComponent(manageUrl), '로그인하고 사주 저장하기'); return; }
  try {
    const response = await fetch('/api/birth-profiles', { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error(response.status === 401 ? '로그인이 만료되었습니다. 다시 로그인해주세요.' : '저장한 사주를 불러오지 못했습니다. 직접 입력은 계속 이용할 수 있어요.');
    const { profiles } = await response.json();
    const requested = new URLSearchParams(location.search).get('birthProfile');
    function selectProfile(profile) {
      localStorage.setItem('sajuwar_report_profile', JSON.stringify(profile));
      document.dispatchEvent(new CustomEvent('sajuwar:birth-profile-selected', { detail: profile }));
    }
    for (const [index, mount] of mounts.entries()) {
      mount.replaceChildren();
      if (profiles.length) {
        const label = document.createElement('label'), select = document.createElement('select'); select.id = 'savedBirthProfile' + index; label.htmlFor = select.id; label.textContent = '저장한 사주 불러오기';
        select.append(new Option('직접 입력하기', ''));
        for (const p of profiles) select.append(new Option(p.name + ' · ' + (p.relation === '직접 입력' ? p.customRelation : p.relation) + ' · ' + p.birth, p.id));
        select.addEventListener('change', () => { const p = profiles.find(p => p.id === select.value); if (p) selectProfile(p); });
        mount.append(label, select);
        if (profiles.some(p => p.id === requested)) select.value = requested;
      } else { const p = document.createElement('p'); p.textContent = '아직 저장한 사주가 없어요.'; mount.append(p); }
      const link = document.createElement('a'); link.href = manageUrl; link.textContent = '＋ 사주 추가 · 관리'; mount.append(link);
    }
    const profile = profiles.find(p => p.id === requested);
    if (profile) selectProfile(profile);
  } catch (error) {
    for (const mount of mounts) message(mount, error.message, '/login.html?return=' + encodeURIComponent(manageUrl), '로그인 확인하기');
  }
})();
