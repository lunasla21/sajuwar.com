// A bounded sample based on the calculated day stem, not a full chart reading.
const TYPES = {
  甲: ['개척형 전략가', '방향을 세우는 추진력', '새로운 길을 열고 목표를 향해 나아가는 힘을 상징합니다. 오늘 시작할 일 하나를 정해보세요.'],
  乙: ['유연형 전략가', '상황에 맞추는 적응력', '환경을 살피며 방법을 바꾸는 힘을 상징합니다. 막힌 일에는 다른 접근 하나를 적어보세요.'],
  丙: ['확장형 전략가', '생각을 드러내는 표현력', '생각과 에너지를 밖으로 전하는 힘을 상징합니다. 전달하고 싶은 생각 하나를 짧게 정리해보세요.'],
  丁: ['집중형 전략가', '작은 신호를 읽는 관찰력', '세부를 살피고 필요한 곳에 집중하는 힘을 상징합니다. 오늘 중요한 한 가지에 시간을 배정해보세요.'],
  戊: ['기반형 전략가', '중심을 지키는 지속력', '흔들리는 상황에서도 기준을 세우는 힘을 상징합니다. 계속 지킬 생활 기준 하나를 골라보세요.'],
  己: ['조율형 전략가', '현실을 다듬는 조정력', '여러 조건을 살피고 실행 가능한 형태로 다듬는 힘을 상징합니다. 복잡한 일을 작은 단계로 나눠보세요.'],
  庚: ['돌파형 전략가', '기준을 세우는 결단력', '불필요한 것을 정리하고 방향을 선택하는 힘을 상징합니다. 미뤄둔 일의 판단 기준을 먼저 적어보세요.'],
  辛: ['정밀형 전략가', '완성도를 높이는 분별력', '작은 차이를 구별하고 기준을 다듬는 힘을 상징합니다. 오늘은 중요한 결과물 한 가지를 점검해보세요.'],
  壬: ['탐색형 전략가', '넓게 연결하는 사고력', '흐름을 탐색하며 여러 가능성을 연결하는 힘을 상징합니다. 선택지 두 개의 차이를 비교해보세요.'],
  癸: ['통찰형 전략가', '맥락을 읽는 섬세함', '작은 단서에서 상황의 맥락을 살피는 힘을 상징합니다. 떠오른 생각 하나를 기록해 구체화해보세요.'],
};
function buildFreePreview({ name, pillars, timeUnknown = false, calendarType = 'solar' }) {
  const stem = String(pillars.day || '')[0];
  const [type, weapon, summary] = TYPES[stem] || ['탐색 중인 전략가', '나의 가능성', '입력 정보를 확인하고 오늘 해볼 작은 행동 하나를 정해보세요.'];
  const basis = `일간 ${stem || '미확인'} 기준의 짧은 미리보기입니다. 전체 원국에 따라 해석은 달라집니다.${timeUnknown ? ' 태어난 시간은 미상으로 처리했습니다.' : ''}`;
  return { access_level: 'preview', preview: { type, weapon, summary, basis },
    result: `${name}님의 전투 유형\n${type}\n핵심 무기: ${weapon}\n${summary}\n${basis}`,
    // Keep calculator fields for older clients; paid timelines/evidence/text are never sent.
    pillars: { ...pillars, ...(timeUnknown ? { hour: '미상' } : {}) }, timeUnknown, calendarType,
    upgrade: { product_id: 'premium_report', amount: 1000, url: '/payment.html?product=premium_report' } };
}
module.exports = { buildFreePreview };
