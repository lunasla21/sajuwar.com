const crypto = require('crypto');
const PROVIDERS = {
  kakao: { authorize: 'https://kauth.kakao.com/oauth/authorize', token: 'https://kauth.kakao.com/oauth/token', profile: 'https://kapi.kakao.com/v2/user/me' },
  naver: { authorize: 'https://nid.naver.com/oauth2.0/authorize', token: 'https://nid.naver.com/oauth2.0/token', profile: 'https://openapi.naver.com/v1/nid/me' },
  google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', profile: 'https://openidconnect.googleapis.com/v1/userinfo' },
};
function safeReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\x00-\x20]/.test(value)) return '/mypage.html';
  const url = new URL(value, 'https://sajuwar.com');
  return url.origin === 'https://sajuwar.com' ? url.pathname + url.search + url.hash : '/mypage.html';
}
function registerOAuthRoutes(app, userStore, { env = process.env, fetcher = fetch } = {}) {
  const states = new Map();
  const results = new Map();
  const origin = new URL(env.SAJUWAR_PUBLIC_URL || 'https://www.sajuwar.com').origin;
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:'), path: '/api/auth' };
  const cookieValue = (req, key) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(key + '='))?.slice(key.length + 1);
  function config(provider) {
    const prefix = 'SAJUWAR_' + provider.toUpperCase();
    return { ...PROVIDERS[provider], clientId: env[prefix + '_CLIENT_ID'], secret: env[prefix + '_CLIENT_SECRET'] };
  }
  function enabled(provider) {
    const c = config(provider);
    return Boolean(c.clientId && (provider === 'kakao' || c.secret));
  }
  function prune() {
    for (const map of [states, results]) for (const [key, value] of map) if (value.expires <= Date.now()) map.delete(key);
  }
  app.get('/api/auth/providers', (req, res) => res.json({ providers: Object.keys(PROVIDERS).map(id => ({ id, enabled: enabled(id) })) }));
  app.get('/api/auth/social-result', (req, res) => {
    res.set('Cache-Control', 'no-store');
    prune();
    const key = cookieValue(req, 'sw_oauth_result');
    const result = results.get(key);
    results.delete(key);
    res.clearCookie('sw_oauth_result', cookieOptions);
    if (!result) return res.status(401).json({ error: '로그인 결과가 만료되었습니다. 다시 시도해주세요.' });
    res.json(result.auth);
  });
  app.get('/api/auth/:provider/start', (req, res) => {
    const provider = req.params.provider;
    if (!Object.hasOwn(PROVIDERS, provider)) return res.sendStatus(404);
    const target = safeReturn(req.query.return);
    if (!enabled(provider)) return res.redirect('/login.html?error=unavailable&return=' + encodeURIComponent(target));
    prune();
    if (states.size >= 5000) return res.status(429).send('잠시 후 다시 시도해주세요.');
    const state = crypto.randomBytes(32).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    states.set(state, { provider, target, verifier, expires: Date.now() + 10 * 60 * 1000 });
    res.cookie('sw_oauth_state', state, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
    const c = config(provider);
    const params = new URLSearchParams({ response_type: 'code', client_id: c.clientId, redirect_uri: origin + '/api/auth/' + provider + '/callback', state });
    if (provider === 'google') {
      params.set('scope', 'openid email profile');
      params.set('code_challenge_method', 'S256');
      params.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
    }
    res.set('Cache-Control', 'no-store');
    res.redirect(c.authorize + '?' + params);
  });
  app.get('/api/auth/:provider/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const provider = req.params.provider;
    if (!Object.hasOwn(PROVIDERS, provider)) return res.sendStatus(404);
    prune();
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const item = states.get(state);
    const cookie = cookieValue(req, 'sw_oauth_state') || '';
    // A forged callback must not consume a legitimate browser's pending state.
    if (!item || item.provider !== provider || cookie !== state) return res.redirect('/login.html?error=expired');
    states.delete(state);
    res.clearCookie('sw_oauth_state', cookieOptions);
    try {
      if (req.query.error || typeof req.query.code !== 'string') throw new Error('Login canceled');
      const c = config(provider);
      const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: c.clientId, code: req.query.code, redirect_uri: origin + '/api/auth/' + provider + '/callback', state });
      if (c.secret) body.set('client_secret', c.secret);
      if (provider === 'google') body.set('code_verifier', item.verifier);
      const tokenResponse = await fetcher(c.token, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || !token.access_token) throw new Error('Token exchange failed');
      const profileResponse = await fetcher(c.profile, { headers: { Authorization: 'Bearer ' + token.access_token }, signal: AbortSignal.timeout(15000) });
      const profile = await profileResponse.json();
      if (!profileResponse.ok) throw new Error('Profile fetch failed');
      let identity;
      if (provider === 'google') identity = { subject: profile.sub, email: profile.email_verified ? profile.email : '', name: profile.name };
      if (provider === 'naver') identity = { subject: profile.resultcode === '00' ? profile.response?.id : null, email: profile.response?.email, name: profile.response?.name || profile.response?.nickname };
      if (provider === 'kakao') identity = { subject: profile.id, email: profile.kakao_account?.is_email_verified ? profile.kakao_account.email : '', name: profile.kakao_account?.profile?.nickname || profile.properties?.nickname };
      const auth = userStore.socialLogin({ provider, ...identity });
      const resultKey = crypto.randomBytes(32).toString('hex');
      results.set(resultKey, { auth, expires: Date.now() + 60000 });
      res.cookie('sw_oauth_result', resultKey, { ...cookieOptions, maxAge: 60000 });
      res.redirect('/login.html?social=complete&return=' + encodeURIComponent(item.target));
    } catch {
      res.redirect('/login.html?error=social_failed&return=' + encodeURIComponent(item.target));
    }
  });
}
module.exports = { registerOAuthRoutes, safeReturn };
