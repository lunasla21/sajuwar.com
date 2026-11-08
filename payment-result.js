(() => {
  const params = new URLSearchParams(location.search), $ = id => document.getElementById(id);
  const body = { orderId: params.get('orderId'), paymentKey: params.get('paymentKey'), amount: Number(params.get('amount')) };
  $('retry').addEventListener('click', confirm);
  async function confirm() {
    $('retry').hidden = true; $('progress').hidden = false;
    try {
      const token = localStorage.getItem('sajuwar_auth_token');
      if (!token) throw new Error('로그인이 만료되었습니다. 내 작전실에서 로그인 후 결제 내역을 확인해주세요.');
      if (!body.orderId || !body.paymentKey || !params.has('amount')) throw new Error('결제 정보가 없습니다. 구매내역을 확인해주세요.');
      const r = await fetch('/api/payments/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      history.replaceState(null, '', '/payment-result.html');
      $('title').textContent = data.testMode ? '테스트 결제가 완료됐어요' : '나의 작전이 열렸어요';
      $('message').textContent = data.testMode ? '실제 청구와 리포트 이용권 지급은 이루어지지 않았습니다.' : '결제가 완료되었습니다. 생년월일시를 입력하고 리포트를 확인하세요.';
      if (data.accessUrl && data.accessUrl.startsWith('/') && !data.accessUrl.startsWith('//')) { $('next').href = data.accessUrl; $('next').textContent = '구매한 리포트 열기 →'; }
    } catch (error) { $('title').textContent = '결제 확인이 필요해요'; $('message').textContent = error.message; $('retry').hidden = false; }
    finally { $('progress').hidden = true; }
  }
  if (params.get('failed') === '1') {
    history.replaceState(null, '', '/payment-result.html');
    $('title').textContent = '결제가 완료되지 않았어요'; $('message').textContent = '결제가 취소되었거나 승인되지 않았습니다. 주문 화면에서 다시 진행할 수 있어요.'; $('progress').hidden = true; $('next').href = '/payment.html'; $('next').textContent = '주문 화면으로 돌아가기';
  } else confirm();
})();
