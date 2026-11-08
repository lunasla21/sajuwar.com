(async () => {
  const $ = id => document.getElementById(id);
  const token = localStorage.getItem('sajuwar_auth_token') || '';
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const message = $('message');
  let products = [], user, config, order, bank;
  const descriptions = {
    premium_report: ['원국의 전장과 핵심 무기', '지장간에 숨은 보조 능력과 활용 조건', '대운·세운의 흐름과 실행 전략'],
    premium_ai_report: ['나의 원국과 핵심 무기', '연간 흐름과 월별 기회·주의 구간', '재물·직업·관계의 행동 전략'],
    master_intelligence_report: ['원국 정밀 분석과 숨은 아이템', '10년 대운과 장기 전장 지도', '중요한 선택과 타이밍 전략'],
    compatibility_report: ['두 사람의 강점과 관계 흐름', '반복되는 충돌과 소통 지점', '함께 선택할 행동 가이드'],
    saju_lecture: ['사주전쟁 강의 이용권', '강의 구성과 이용 안내는 강의 페이지에서 확인하세요.'],
  };
  const selected = () => products.find(p => p.id === $('productId').value);
  const money = amount => amount.toLocaleString('ko-KR') + '원';
  const returnPath = () => '/payment.html?product=' + encodeURIComponent($('productId').value);
  function saveDraft() { sessionStorage.setItem('sajuwar_checkout_draft', JSON.stringify({ email: $('buyerEmail').value, phone: $('buyerPhone').value, application: $('application').value })); }
  function render() {
    const p = selected(); if (!p) return;
    $('selectedProductName').textContent = p.name;
    $('amount').textContent = money(p.amount);
    $('description').replaceChildren(...(descriptions[p.id] || []).map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    $('loginLink').href = '/login.html?return=' + encodeURIComponent(returnPath());
    history.replaceState(null, '', returnPath());
    $('cardButton').disabled = !user || !config.enabled;
    $('cardButton').textContent = config.enabled ? (config.testMode ? '테스트 카드 · 간편결제' : '카드 · 간편결제로 ' + money(p.amount) + ' 결제') : '카드 · 간편결제 준비 중';
    $('cardNote').textContent = config.enabled ? (config.testMode ? '테스트 결제입니다. 실제 청구와 리포트 이용권 지급은 이루어지지 않습니다.' : '결제 승인 후 구매한 리포트를 이용할 수 있어요.') : '카드 · 간편결제 서비스는 준비 중입니다.';
    $('bankButton').disabled = !user || !config.bankEnabled;
    if (!config.bankEnabled) $('bankButton').textContent = '무통장입금 준비 중';
  }
  function valid() {
    if (!user) { location.href = $('loginLink').href; return false; }
    return $('paymentForm').reportValidity();
  }
  async function jsonRequest(url, body) {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) { const error = new Error(data.error || '요청을 처리하지 못했습니다.'); error.order = data.order; throw error; }
    return data;
  }
  function payload() { return { product_id: selected().id, email: $('buyerEmail').value.trim(), phone: $('buyerPhone').value.trim(), application: $('application').value.trim(), terms_accepted: $('consent').checked }; }
  function showDeposit() {
    $('checkout').hidden = true; $('depositPanel').hidden = false;
    const rows = [['주문번호', order.id], ['상품명', order.product_name], ['입금금액', money(order.amount)], ['은행', bank.bankName], ['계좌번호', bank.accountNumber], ['예금주', bank.accountHolder]];
    $('bankDetails').replaceChildren(...rows.flatMap(([key, value]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; return [dt, dd]; }));
    $('depositorName').value = order.depositor_name || user.name;
    window.scrollTo(0, 0);
  }
  let sdkPromise;
  function loadSDK() {
    if (window.TossPayments) return Promise.resolve();
    if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://js.tosspayments.com/v2/standard'; s.onload = resolve; s.onerror = () => { sdkPromise = null; s.remove(); reject(new Error('결제창을 불러오지 못했습니다. 다시 시도해주세요.')); }; document.head.append(s); });
    return sdkPromise;
  }
  $('paymentForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!valid() || !config.enabled) return;
    $('cardButton').disabled = true; message.textContent = '결제창을 준비하고 있습니다…';
    try {
      saveDraft(); await loadSDK();
      const data = await jsonRequest('/api/payments/orders', payload());
      const payment = window.TossPayments(config.clientKey).payment({ customerKey: data.customerKey });
      await payment.requestPayment({ method: 'CARD', amount: data.amount, orderId: data.orderId, orderName: data.orderName, customerName: data.customerName, customerEmail: data.customerEmail, successUrl: data.successUrl, failUrl: data.failUrl, card: { flowMode: 'DEFAULT' } });
    } catch (error) { message.textContent = error.code === 'USER_CANCEL' ? '결제가 취소되었습니다. 다시 진행할 수 있어요.' : error.message; }
    finally { $('cardButton').disabled = !config.enabled; }
  });
  $('bankButton').addEventListener('click', async () => {
    if (!valid() || !config.bankEnabled) return;
    $('bankButton').disabled = true; message.textContent = '';
    try { const data = await jsonRequest('/api/orders/bank-transfer', payload()); order = data.order; bank = data.bankAccount; showDeposit(); }
    catch (error) {
      if (error.order?.payment_method === 'bank_transfer' && error.order.status !== '확인완료') { order = error.order; showDeposit(); }
      else message.textContent = error.message;
    } finally { $('bankButton').disabled = false; }
  });
  $('depositButton').addEventListener('click', async () => {
    const depositor = $('depositorName').value.trim();
    if (!depositor) { $('depositMessage').textContent = '입금자명을 입력해주세요.'; return; }
    $('depositButton').disabled = true;
    try { await jsonRequest('/api/orders/' + encodeURIComponent(order.id) + '/deposit-complete', { depositor_name: depositor }); $('depositMessage').textContent = '입금 확인 대기로 접수되었습니다. 관리자 확인 후 이용 가능합니다.'; }
    catch (error) { $('depositMessage').textContent = error.message; $('depositButton').disabled = false; }
  });
  try {
    const [catalogResponse, configResponse, meResponse] = await Promise.all([fetch('/api/products'), fetch('/api/payments/config'), token ? fetch('/api/auth/me', { headers }) : Promise.resolve(null)]);
    if (!catalogResponse.ok || !configResponse.ok) throw new Error('상품 정보를 불러오지 못했습니다. 새로고침해주세요.');
    const catalog = await catalogResponse.json(); products = catalog.products; bank = catalog.bankAccount; config = await configResponse.json();
    if (meResponse?.ok) user = (await meResponse.json()).user;
    else if (token) { localStorage.removeItem('sajuwar_auth_token'); localStorage.removeItem('sajuwar_user'); }
    $('productId').replaceChildren(...products.map(p => new Option(p.name + ' · ' + money(p.amount), p.id)));
    const requested = new URLSearchParams(location.search).get('product');
    if (products.some(p => p.id === requested)) $('productId').value = requested;
    $('productId').disabled = false;
    let draft = {}; try { draft = JSON.parse(sessionStorage.getItem('sajuwar_checkout_draft') || '{}'); } catch {}
    $('buyerEmail').value = user?.email || draft.email || ''; $('buyerPhone').value = user?.phone || draft.phone || ''; $('application').value = draft.application || sessionStorage.getItem('sajuwar_pending_application') || '';
    $('authGate').hidden = Boolean(user); $('contactFields').hidden = !user;
    $('buyerEmail').readOnly = Boolean(user?.email); $('buyerPhone').readOnly = Boolean(user?.phone);
    for (const id of ['buyerEmail','buyerPhone','application']) $(id).addEventListener('input', saveDraft);
    $('productId').addEventListener('change', render); render();
  } catch (error) { message.textContent = error.message; }
})();
