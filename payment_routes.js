const crypto = require('crypto');
function registerPaymentRoutes(app, { orderStore, requireLogin, env = process.env, fetcher = fetch }) {
  const inFlight = new Set();
  const clientKey = env.SAJUWAR_TOSS_CLIENT_KEY || '';
  const secretKey = env.SAJUWAR_TOSS_SECRET_KEY || '';
  const testMode = clientKey.startsWith('test_ck_') && secretKey.startsWith('test_sk_');
  const liveMode = clientKey.startsWith('live_ck_') && secretKey.startsWith('live_sk_') && env.SAJUWAR_TOSS_LIVE_ENABLED === 'true';
  const enabled = testMode || liveMode;
  const origin = new URL(env.SAJUWAR_PUBLIC_URL || 'https://www.sajuwar.com').origin;
  app.get('/api/payments/config', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ enabled, clientKey: enabled ? clientKey : '', testMode, bankEnabled: Boolean(env.SAJUWAR_BANK_NAME && env.SAJUWAR_BANK_ACCOUNT && env.SAJUWAR_BANK_HOLDER) });
  });
  app.post('/api/payments/orders', (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;
    if (!enabled) return res.status(503).json({ error: '카드결제 준비 중입니다.' });
    if (req.body.terms_accepted !== true) return res.status(400).json({ error: '주문 내용과 이용약관을 확인해주세요.' });
    try {
      const contact = { email: String(user.email || req.body.email || '').trim(), phone: String(user.phone || req.body.phone || '').trim() };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || !/^[\d+() -]{8,20}$/.test(contact.phone)) return res.status(400).json({ error: '이메일과 연락처를 확인해주세요.' });
      // Resume the same unpaid order on retries; never create duplicate paid rights.
      const existing = orderStore.findUserOrders({ user_id: user.id }).find(o => o.product_id === req.body.product_id && o.status !== orderStore.ORDER_STATUS.CANCELED);
      let order;
      if (existing) {
        if (existing.status === orderStore.ORDER_STATUS.CONFIRMED) return res.status(409).json({ error: '이미 구매한 리포트입니다. 내 작전실에서 확인해주세요.' });
        if (existing.payment_method !== 'toss' || existing.payment_mode !== (testMode ? 'test' : 'live')) return res.status(409).json({ error: '기존 주문이 있습니다. 내 작전실에서 확인해주세요.' });
        order = existing;
      } else {
        order = orderStore.createBankTransferOrder({ product_id: req.body.product_id, application: req.body.application, terms_accepted: true, payment_method: 'toss', payment_mode: testMode ? 'test' : 'live', user_id: user.id, name: user.name, ...contact });
      }
      res.json({ orderId: order.id, orderName: order.product_name, amount: { currency: 'KRW', value: order.amount }, customerKey: user.id, customerName: user.name, customerEmail: contact.email,
        successUrl: origin + '/payment-result.html', failUrl: origin + '/payment-result.html?failed=1', testMode });
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });
  app.post('/api/payments/confirm', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const user = requireLogin(req, res);
    if (!user) return;
    if (!enabled) return res.status(503).json({ error: '카드결제 준비 중입니다.' });
    const { orderId, paymentKey, amount } = req.body;
    const order = typeof orderId === 'string' ? orderStore.findOrder(orderId) : null;
    if (!order || order.user_id !== user.id) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
    if (testMode && order.test_payment_done && order.payment_key_hash === crypto.createHash('sha256').update(String(paymentKey)).digest('hex') && amount === order.amount) return res.json({ ok: true, testMode: true });
    if (order.payment_method !== 'toss' || order.payment_mode !== (testMode ? 'test' : 'live') || order.status === orderStore.ORDER_STATUS.CANCELED) return res.status(409).json({ error: '결제할 수 없는 주문입니다.' });
    if (typeof paymentKey !== 'string' || !paymentKey || paymentKey.length > 200 || !Number.isSafeInteger(amount) || amount !== order.amount) return res.status(400).json({ error: '결제 정보가 주문과 일치하지 않습니다.' });
    const paymentKeyHash = crypto.createHash('sha256').update(paymentKey).digest('hex');
    if (order.status === orderStore.ORDER_STATUS.CONFIRMED) {
      if (order.payment_key_hash !== paymentKeyHash) return res.status(409).json({ error: '결제 정보가 일치하지 않습니다.' });
      return res.json({ ok: true, accessUrl: orderStore.PRODUCTS[order.product_id].accessUrl });
    }
    if (inFlight.has(orderId)) return res.status(409).json({ error: '결제 확인 중입니다. 잠시 후 다시 확인해주세요.' });
    inFlight.add(orderId);
    try {
      const paymentResponse = await fetcher('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST', signal: AbortSignal.timeout(30000),
        headers: { Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'), 'Content-Type': 'application/json', 'Idempotency-Key': 'sajuwar-confirm-' + orderId },
        body: JSON.stringify({ orderId, paymentKey, amount: order.amount }),
      });
      const payment = await paymentResponse.json();
      if (!paymentResponse.ok) return res.status(400).json({ error: '결제가 승인되지 않았습니다. 결제 내역을 확인 후 다시 시도해주세요.' });
      if (payment.orderId !== order.id || payment.totalAmount !== order.amount || payment.paymentKey !== paymentKey || payment.status !== 'DONE') return res.status(409).json({ error: '결제 승인 정보를 확인할 수 없습니다. 고객지원으로 문의해주세요.' });
      const verified = orderStore.updateOrder(order.id, o => ({ ...o, payment_key_hash: paymentKeyHash, payment_approved_at: payment.approvedAt, pg_method: payment.method }));
      // Test charges never grant production report access.
      if (testMode) {
        orderStore.updateOrder(order.id, o => ({ ...o, status: orderStore.ORDER_STATUS.CANCELED, canceled_at: new Date().toISOString(), test_payment_done: true }));
        return res.json({ ok: true, testMode: true });
      }
      orderStore.activatePurchase(verified);
      res.json({ ok: true, accessUrl: orderStore.PRODUCTS[order.product_id].accessUrl });
    } catch { res.status(502).json({ error: '결제 확인이 지연되고 있습니다. 다시 확인 버튼을 눌러주세요.' }); }
    finally { inFlight.delete(orderId); }
  });
}
module.exports = { registerPaymentRoutes };
