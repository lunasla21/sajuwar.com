(() => {
  const params = new URLSearchParams(location.search);
  function safePath(value) {
    if (!value || !value.startsWith('/') || /[\\\x00-\x20]/.test(value)) return '/mypage.html';
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? url.pathname + url.search + url.hash : '/mypage.html';
  }
  const target = safePath(params.get('return'));
  const message = document.getElementById('message');
  const finish = data => {
    localStorage.setItem('sajuwar_auth_token', data.token);
    localStorage.setItem('sajuwar_user', JSON.stringify(data.user));
    location.replace(target);
  };
  document.getElementById('signupLink').href = '/signup.html?return=' + encodeURIComponent(target);
  document.getElementById('emailToggle').addEventListener('click', () => {
    const panel = document.getElementById('emailPanel');
    panel.hidden = !panel.hidden;
    document.getElementById('emailToggle').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) document.getElementById('email').focus();
  });
  document.getElementById('emailPanel').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('loginSubmit');
    button.disabled = true;
    message.textContent = '';
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: document.getElementById('email').value.trim(), password: document.getElementById('password').value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '로그인에 실패했습니다.');
      finish(data);
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
  fetch('/api/auth/providers').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
    for (const provider of data.providers) {
      const button = document.querySelector('[data-provider="' + provider.id + '"]');
      if (!button) continue;
      button.disabled = !provider.enabled;
      if (provider.enabled) button.querySelector('em').textContent = '→';
      button.addEventListener('click', () => location.assign('/api/auth/' + provider.id + '/start?return=' + encodeURIComponent(target)));
    }
  }).catch(() => {});
  if (params.has('error')) message.textContent = params.get('error') === 'unavailable' ? '이 간편로그인은 준비 중입니다. 이메일로 시작해주세요.' : '간편로그인이 완료되지 않았습니다. 다시 시도해주세요.';
  if (params.get('social') === 'complete') {
    message.textContent = '로그인을 확인하고 있습니다…';
    fetch('/api/auth/social-result').then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); finish(data); }).catch(error => message.textContent = error.message);
  }
  const product = new URL(target, location.origin).searchParams.get('product');
  if (product) fetch('/api/products').then(r => r.json()).then(data => {
    const item = data.products.find(p => p.id === product);
    if (item) { document.getElementById('loginIntro').hidden = true; document.getElementById('productTicket').hidden = false; document.getElementById('productName').textContent = item.name; document.getElementById('productPrice').textContent = item.amount.toLocaleString('ko-KR') + '원'; }
  }).catch(() => {});
})();
