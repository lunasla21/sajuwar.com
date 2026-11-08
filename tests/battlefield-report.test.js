const { test } = require('node:test');
const assert = require('node:assert/strict');
const report = require('../battlefield-report');
const pillars = {year:'戊辰',month:'己丑',day:'丁酉',hour:'壬寅'};
test('battlefield uses real pillar elements and keeps hour-day-month-year ordering', () => {
  const m = report.model({pillars});
  assert.deepEqual(m.units.map(p=>p.key), ['hour','day','month','year']);
  assert.deepEqual(m.scores, {목:1,화:1,토:4,금:1,수:1});
  assert.equal(m.weighted, false); assert.deepEqual(m.leaders, ['토']);
  assert.deepEqual(m.month.hidden, ['己','癸','辛']); assert.equal(m.season, '겨울의 전장');
  assert.equal(m.day.stem, '丁');
});
test('weighted scores come from the server evidence and are never invented from raw counts', () => {
  const m = report.model({pillars,analysisEvidence:'오행 참고점수(글자 수가 아닌 월지 가중·지장간 포함): 토 6.55 > 화 3.20 > 금 3.20 > 수 2.00 > 목 1.00'});
  assert.equal(m.weighted, true); assert.equal(m.scores.토, 6.55); assert.equal(m.scores.화, 3.2);
  const incomplete = report.model({pillars,analysisEvidence:'오행 참고점수(예시): 토 6.55'});
  assert.equal(incomplete.weighted, false); assert.equal(incomplete.scores.토, 4);
});
test('unknown birth time removes hour forces and hidden items', () => {
  const m = report.model({pillars}, {timeUnknown:true});
  assert.equal(m.units[0].stem, ''); assert.deepEqual(m.units[0].hidden, []);
  assert.equal(Object.values(m.scores).reduce((a,b)=>a+b,0),6);
  assert.equal(m.scores.수,0); assert.equal(m.scores.목,0);
});
test('chapter diagrams follow the actual topic, not descriptive words after the heading', () => {
  assert.equal(report.chapterKind('이 사주의 전쟁터 — 원국과 지장간을 펼쳐 판세를 요약'), 'field');
  assert.equal(report.chapterKind('월령과 일간 — 계절 속에서 일간이 실제로 살아 있는 방식'), 'season');
  assert.equal(report.chapterKind('숨겨놓은 무기 — 지장간이 현실에서 발동하는 조건'), 'hidden');
  assert.equal(report.chapterKind('다음 해의 전쟁 명령'), 'next-year');
});
test('timing diagrams show calculated labels; missing data does not invent a forecast', () => {
  const m = report.model({pillars,sewoon:{list:[{year:2027,ganji:'丁未'},{year:2028,ganji:'戊申'}]},daewoon:{list:[{startAge:7,endAge:16,ganji:'庚寅'}]}});
  assert.match(report.diagram('timing',m),/2027/); assert.match(report.diagram('timing',m),/丁未/);
  assert.match(report.diagram('cycles',m),/7–16세/);
  assert.match(report.diagram('timing',report.model({pillars})),/임의의 상승·하락 그래프를 만들지 않습니다/);
});
test('new layout retains report text, escapes input and gives each chapter an image', () => {
  const container = {innerHTML:'',classList:{add(){}},querySelectorAll(){return []}};
  const raw='제목: 테스트\n\n1. 전쟁터\n원문 A <script>alert(1)</script>\n\n2. 지장간 아이템\n원문 B\n\n10. 결론\n원문 C';
  const parsed=report.parseReport(raw); assert.equal(parsed.chapters.length,3);
  report.render(container,{pillars,result:raw});
  assert.match(container.innerHTML,/원문 A &lt;script&gt;/); assert.ok(!container.innerHTML.includes('<script>'));
  assert.match(container.innerHTML,/원문 B/); assert.match(container.innerHTML,/원문 C/);
  assert.equal((container.innerHTML.match(/class="battle-chapter"/g)||[]).length,3);
  assert.equal((container.innerHTML.match(/<svg /g)||[]).length,5);
});

test('long prose is divided for readability without dropping sentences', () => {
  const sentences = Array.from({length:12}, (_,i)=>`${i+1}번째 문장에는 원국의 근거와 현실 행동에 대한 설명이 충분히 들어 있습니다.`);
  const paragraphs=report.readableParagraphs([sentences.join(' ')]);
  assert.ok(paragraphs.length>1); assert.equal(paragraphs.join(' '),sentences.join(' '));
  assert.equal(report.chapterKind('재물운과 돈의 아이템'), 'resources');
});
