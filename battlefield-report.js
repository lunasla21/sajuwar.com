(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SajuBattleReport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const elements = ['목','화','토','금','수'];
  const colors = {목:'#58d7a0',화:'#ff6a45',토:'#e8bc63',금:'#dce8fc',수:'#77a7ff'};
  const hanja = {목:'木',화:'火',토:'土',금:'金',수:'水'};
  const names = {목:'숲의 진영',화:'불의 진영',토:'대지의 진영',금:'강철의 진영',수:'물의 진영'};
  const stems = {甲:'목',乙:'목',丙:'화',丁:'화',戊:'토',己:'토',庚:'금',辛:'금',壬:'수',癸:'수'};
  const branches = {寅:'목',卯:'목',巳:'화',午:'화',辰:'토',戌:'토',丑:'토',未:'토',申:'금',酉:'금',亥:'수',子:'수'};
  const hidden = {子:['癸'],丑:['己','癸','辛'],寅:['甲','丙','戊'],卯:['乙'],辰:['戊','乙','癸'],巳:['丙','戊','庚'],午:['丁','己'],未:['己','丁','乙'],申:['庚','壬','戊'],酉:['辛'],戌:['戊','辛','丁'],亥:['壬','甲']};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value).toFixed(2).replace(/\.00$/, '');
  function model(data = {}, profile = {}) {
    const unknown = profile.timeUnknown === true || data.timeUnknown === true;
    const pillars = data.pillars || {};
    const order = [['hour','시주','미래의 자리'],['day','일주','나의 본진'],['month','월주','계절의 전장'],['year','년주','출발의 배경']];
    const units = order.map(([key,label,role]) => {
      const value = key === 'hour' && unknown ? '미상' : String(pillars[key] || '');
      const stem = stems[value[0]] ? value[0] : '', branch = branches[value[1]] ? value[1] : '';
      return { key,label,role,value,stem,branch,stemElement:stems[stem],branchElement:branches[branch],hidden:hidden[branch] || [] };
    });
    const scores = Object.fromEntries(elements.map(e => [e, 0]));
    for (const unit of units) { if (unit.stemElement) scores[unit.stemElement]++; if (unit.branchElement) scores[unit.branchElement]++; }
    let weighted = false;
    const evidence = String(data.analysisEvidence || '').split('\n').find(line => line.startsWith('오행 참고점수('));
    if (evidence) {
      const matches = [...evidence.matchAll(/([목화토금수])\s+(\d+(?:\.\d+)?)/g)];
      if (new Set(matches.map(m => m[1])).size === 5 && matches.length === 5) { for (const m of matches) scores[m[1]] = Number(m[2]); weighted = true; }
    }
    const maximum = Math.max(...Object.values(scores));
    const leaders = maximum > 0 ? elements.filter(e => Math.abs(scores[e] - maximum) < .001) : [];
    const day = units.find(p => p.key === 'day');
    const month = units.find(p => p.key === 'month');
    const season = '寅卯辰'.includes(month.branch || '!') ? '봄의 전장' : '巳午未'.includes(month.branch || '!') ? '여름의 전장' : '申酉戌'.includes(month.branch || '!') ? '가을의 전장' : '亥子丑'.includes(month.branch || '!') ? '겨울의 전장' : '월지 확인 필요';
    return { units, scores, weighted, leaders, maximum, day, month, season, unknown,
      scoreLabel: weighted ? '월지 가중·지장간을 포함한 참고점수' : '천간·지지에 드러난 글자 분포',
      years: Array.isArray(data.sewoon?.list) ? data.sewoon.list : [],
      cycles: Array.isArray(data.daewoon?.list) ? data.daewoon.list : [] };
  }
  const text = (x,y,value,size=12,color='#eee5d4',anchor='middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-size="${size}" font-family="sans-serif">${escape(value)}</text>`;
  const line = (x,y,x2,y2,color='#9a815a',dash=false) => `<path d="M${x} ${y}L${x2} ${y2}" stroke="${color}" stroke-width="1.5" ${dash?'stroke-dasharray="4 5"':''} opacity=".7"/>`;
  function shield(x,y,element,size=40,label='') {
    const color = colors[element] || '#a99672';
    return `<g data-element="${escape(element || '')}"><path d="M${x-size/2} ${y-size*.54}L${x+size/2} ${y-size*.54}V${y+size*.07}L${x} ${y+size*.57}L${x-size/2} ${y+size*.07}Z" fill="#0d141c" stroke="${color}" stroke-width="1.6"/>${text(x,y+5,hanja[element] || '·',size*.48,color)}${label?text(x,y+size*.95,label,11,color):''}</g>`;
  }
  function svg(label, content, height=220) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 ${height}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title><path d="M16 16H72M16 16V52M344 16H288M344 16V52M16 ${height-16}H72M16 ${height-16}V${height-52}M344 ${height-16}H288M344 ${height-16}V${height-52}" fill="none" stroke="#a58d5d" stroke-opacity=".45"/>${content}</svg>`;
  }
  function diagram(kind, m) {
    const own = m.day.stemElement, ownColor = colors[own] || '#d7b96c';
    if (kind === 'field') {
      const points = [[180,36],[297,102],[252,186],[108,186],[63,102]];
      let content = `<circle cx="180" cy="114" r="83" fill="#111d26" fill-opacity=".8" stroke="#b49a68" stroke-opacity=".3"/><circle cx="180" cy="114" r="56" fill="none" stroke="#b49a68" stroke-dasharray="3 6" opacity=".3"/>`;
      elements.forEach((e,i) => { const p=points[i], next=points[(i+1)%5]; content+=line(p[0],p[1],next[0],next[1],colors[e],true); });
      elements.forEach((e,i) => { const [x,y]=points[i]; content+=shield(x,y,e,33,`${e} · ${number(m.scores[e])}`); });
      content += `<circle cx="180" cy="114" r="30" fill="#11151b" stroke="${ownColor}"/>${text(180,111,m.day.stem||'?',25,ownColor)}${text(180,132,'일간 · 나',9,'#c0b49e')}`;
      return svg('내 일간을 중심으로 펼친 목화토금수 다섯 진영의 참고 분포',content,240);
    }
    if (kind === 'forces' || kind === 'training') {
      const maximum = m.maximum || 1;
      let content='';
      elements.forEach((e,i)=>{const y=38+i*33;content+=text(35,y+5,hanja[e],20,colors[e])+`<rect x="68" y="${y-8}" width="215" height="15" rx="2" fill="#1b2530"/><rect x="68" y="${y-8}" width="${215*m.scores[e]/maximum}" height="15" rx="2" fill="${colors[e]}" opacity=".85"/>`+text(315,y+4,number(m.scores[e]),12,colors[e]);});
      return svg(m.scoreLabel,content,220);
    }
    if (kind === 'season') {
      return svg('내 월지와 일간: 계절 속에서 원국의 중심을 읽기',text(180,40,m.season,16,'#e8bc63')+`<path d="M40 152Q180 48 320 152M40 162H320" fill="none" stroke="#8e7958" stroke-dasharray="4 5"/>`+shield(105,109,m.month.branchElement,53,'월지 '+(m.month.branch||'미상'))+line(143,109,216,109,'#d5b77b')+shield(255,109,own,53,'일간 '+(m.day.stem||'미상'))+text(180,194,'같은 무기도 계절에 따라 쓰임이 달라집니다',11,'#b5aa95'));
    }
    if (kind === 'character') {
      return svg('일간과 일지로 보는 나의 본진',`<path d="M100 176L180 30L260 176Z" fill="#1e262d" stroke="${ownColor}" stroke-opacity=".45"/>`+shield(180,105,own,80)+text(180,162,'일간 '+(m.day.stem||'미상')+' · 일지 '+(m.day.branch||'미상'),12,'#e8dfce')+text(180,194,'내가 서 있는 본진에서 전장의 흐름을 읽습니다',11,'#b5aa95'));
    }
    if (kind === 'hidden') {
      let content=''; m.units.forEach((p,i)=>{const x=18+i*83;content+=`<path d="M${x} 54h72v118l-36 15-36-15Z" fill="#111b25" stroke="#6c6559"/>`+text(x+36,78,p.label+' '+(p.branch||'미상'),11,'#d9c69b');p.hidden.forEach((stem,j)=>{content+=`<rect x="${x+15}" y="${90+j*26}" width="42" height="21" rx="3" fill="#1c2732" stroke="${colors[stems[stem]]}"/>`+text(x+36,105+j*26,stem+' '+stems[stem],11,colors[stems[stem]]);});if(!p.hidden.length)content+=text(x+36,125,'미상',11,'#9b9589');});
      return svg('내 사주 각 지지에 실제로 들어 있는 지장간 무기함',content);
    }
    if (kind === 'resources') {
      const target=own ? elements[(elements.indexOf(own)+2)%5] : null;
      return svg('일간이 극하는 오행은 재성: 관계 원리 그림',shield(85,99,own,57,'나의 일간')+line(130,99,227,99,'#e8bc63')+text(180,82,'극하는 관계',10,'#c5b18b')+shield(275,99,target,57,'재성의 오행')+text(180,181,'재성의 존재와 실제 재물의 결과는 다릅니다',11,'#b5aa95')+text(180,199,'원국의 연결과 운의 타이밍을 함께 읽습니다',11,'#b5aa95'));
    }
    if (kind === 'timing' || kind === 'next-year' || kind === 'cycles') {
      const items=kind==='cycles'?m.cycles.slice(0,4):kind==='next-year'?m.years.slice(1,4):m.years.slice(0,3);
      const labels=items.map(p=>({top:kind==='cycles'?`${p.startAge ?? '?'}–${p.endAge ?? '?'}세`:String(p.year),bottom:p.ganji||'',element:stems[String(p.ganji||'')[0]]}));
      let content=line(45,107,315,107,'#8c7b5a',true);
      if (!labels.length) return svg('운의 계산 정보가 없는 경우 타이밍을 임의로 표시하지 않습니다',text(180,106,'운의 계산 정보를 확인해주세요',14,'#b5aa95')+text(180,141,'임의의 상승·하락 그래프를 만들지 않습니다',10,'#9d9588'));
      labels.forEach((p,i)=>{const x=labels.length===1?180:48+i*(264/(labels.length-1));content+=`<circle cx="${x}" cy="107" r="23" fill="#111c27" stroke="${colors[p.element]||'#d7b96c'}"/>`+text(x,112,p.bottom,17,colors[p.element]||'#d7b96c')+text(x,60,p.top,12,'#e1c992');});
      content+=text(180,174,kind==='cycles'?'대운은 전장의 환경을 바꾸는 스위치':'세운은 내 무기를 꺼내 쓰는 타이밍',12,'#c4b18d')+text(180,197,'실제 유불리와 행동은 아래 해석에서 확인하세요',10,'#9d9588');
      return svg(kind==='cycles'?'서버가 계산한 대운의 간지와 연령 구간':'서버가 계산한 연도별 세운 간지',content);
    }
    if (kind === 'alliance') {
      const lead=m.leaders[0] || own;
      return svg('강한 세력에 합류할지 제어할지는 전체 원국으로 판단합니다',shield(180,56,lead,48,'분포상 큰 진영')+line(164,94,93,145,'#58d7a0')+line(196,94,267,145,'#ff6a45')+`<rect x="36" y="146" width="114" height="39" rx="5" fill="#11271f" stroke="#58d7a0"/><rect x="210" y="146" width="114" height="39" rx="5" fill="#2e1d18" stroke="#ff6a45"/>`+text(93,171,'세력을 따른다',13,'#58d7a0')+text(267,171,'세력을 제어한다',13,'#ff9276')+text(180,212,'어느 쪽인지는 점수만으로 확정하지 않습니다',10,'#b5aa95'),232);
    }
    return svg('판세를 읽고 내 무기를 골라 타이밍에 맞춰 실행하는 전략',shield(67,93,m.leaders[0],44,'판세 읽기')+line(96,93,151,93)+shield(180,93,own,44,'내 무기 찾기')+line(209,93,264,93)+`<circle cx="293" cy="93" r="27" fill="#14202d" stroke="#e8bc63"/><path d="M293 74V93L306 102" stroke="#e8bc63" fill="none" stroke-width="2"/>`+text(293,137,'타이밍 선택',11,'#e8bc63')+text(180,189,'무기는 누구에게나 있습니다. 꺼내는 순간이 다릅니다.',11,'#c6b694'));
  }
  function chapterKind(title) {
    title = String(title).split(/\s*[—–]\s*/)[0];
    if (/다음\s*해/.test(title)) return 'next-year';
    if (/월령|계절/.test(title)) return 'season';
    if (/돈|재물|재성/.test(title)) return 'resources';
    if (/지장간|숨겨|숨은|아이템/.test(title)) return 'hidden';
    if (/주도권|오행.*세력|오행전쟁/.test(title)) return 'forces';
    if (/일주|일간|캐릭터/.test(title)) return 'character';
    if (/부족|필요한 기능|건강/.test(title)) return 'training';
    if (/대운/.test(title)) return 'cycles';
    if (/올해|세운|월운|연간/.test(title)) return 'timing';
    if (/관계|연애|동맹|직업|사업/.test(title)) return 'alliance';
    if (/전쟁터|원국|총평|전체/.test(title)) return 'field';
    return 'action';
  }
  function parseReport(value) {
    const lines=String(value||'').replace(/\r\n/g,'\n').split('\n');
    const chapters=[];const intro=[];let current;
    for (const raw of lines) {
      const line=raw.replace(/^\s*#{1,6}\s*/,'').replace(/\*\*/g,'').trim();
      const match=line.match(/^(\d{1,2})[.)、]\s*(\S.*)$/);
      if (match) { current={number:match[1],title:match[2],lines:[]};chapters.push(current); }
      else if (current) current.lines.push(line);
      else if (line && !/^제목\s*[:：]/.test(line)) intro.push(line);
    }
    if (!chapters.length && intro.length) chapters.push({number:'01',title:'나의 전장 브리핑',lines:intro.splice(0)});
    return {intro,chapters};
  }
  function readableParagraphs(lines) {
    return lines.join('\n').split(/\n\s*\n/).filter(p=>p.trim()).flatMap(block=>{
      if (block.length < 300) return [block.trim()];
      const sentences=block.trim().split(/(?<=[.!?。])\s+(?=[가-힣A-Za-z0-9])/u);
      const paragraphs=[]; let buffer='';
      for(const sentence of sentences){if(buffer && buffer.length+sentence.length>240){paragraphs.push(buffer);buffer='';}buffer+=(buffer?' ':'')+sentence;}
      if(buffer)paragraphs.push(buffer);return paragraphs;
    });
  }
  function pillarsHTML(m) {
    return `<section class="natal-command"><div class="battle-section-label"><span>ORIGINAL BATTLEFIELD</span><b>원국 · 네 개의 진영</b></div><div class="battle-pillars">${m.units.map(p=>`<div class="battle-pillar ${p.key==='day'?'own-base':''}" style="--faction:${colors[p.stemElement]||'#797b81'}"><div class="pillar-flag">${escape(p.label)}${p.key==='day'?'<span>본진</span>':''}</div><span class="pillar-role">${escape(p.role)}</span><div class="pillar-glyphs"><div data-element="${escape(p.stemElement||'')}" style="color:${colors[p.stemElement]||'#9a9da3'}"><small>천간</small><strong>${escape(p.stem||'—')}</strong><em>${escape(p.stemElement||'미상')}</em></div><div data-element="${escape(p.branchElement||'')}" style="color:${colors[p.branchElement]||'#9a9da3'}"><small>지지</small><strong>${escape(p.branch||'—')}</strong><em>${escape(p.branchElement||'미상')}</em></div></div><div class="hidden-armory"><small>지장간 · 숨은 무기</small><div>${p.hidden.map(stem=>`<span data-element="${stems[stem]}" style="color:${colors[stems[stem]]}">${stem}</span>`).join('')||'<span>미상</span>'}</div></div></div>`).join('')}</div><p class="battle-footnote">왼쪽부터 시주 → 일주 → 월주 → 년주${m.unknown?' · 출생시간 미상: 시주 제외':''}</p></section>`;
  }
  function render(container, data, profile={}) {
    const m=model(data,profile); const parsed=parseReport(data.result);
    container.classList.add('battle-report-rendered');
    container.innerHTML=`<section class="report-battle-hero"><div class="battle-hero-copy"><span>SAJU WAR · PERSONAL BATTLEFIELD</span><h2>당신의 사주팔자는<br><em>오행의 전쟁터다.</em></h2><p>어떤 세력을 따를 것인가.<br>어떤 세력을 제어할 것인가.<br>내 무기를 꺼낼 타이밍은 언제인가.</p><b>무기는 누구에게나 있다. 승부는 쓰임과 타이밍.</b></div></section>${pillarsHTML(m)}<section class="force-command"><div class="battle-section-label"><span>FIVE FACTIONS</span><b>내 전장의 세력도</b></div><div class="faction-switches" role="group" aria-label="오행별 위치 강조">${elements.map(e=>`<button type="button" data-faction="${e}" aria-pressed="false" style="--faction:${colors[e]}"><b>${hanja[e]}</b><span>${e}</span></button>`).join('')}</div><p class="battle-footnote">오행을 누르면 원국에서 해당 기운의 위치가 강조됩니다.</p><figure class="chapter-image battlefield-overview">${diagram('field',m)}<figcaption>${escape(m.scoreLabel)} · ${m.leaders.length?escape(m.leaders.join('·'))+' 분포가 가장 큽니다':'자료 확인 필요'}</figcaption></figure><div class="force-bars">${elements.map(e=>`<div><span style="color:${colors[e]}">${hanja[e]} ${e}</span><i><b style="width:${m.maximum?m.scores[e]/m.maximum*100:0}%;background:${colors[e]}"></b></i><strong>${number(m.scores[e])}</strong></div>`).join('')}</div><p class="battle-footnote">${m.weighted?'서버 계산 검증표의 참고점수입니다.':'가중치 자료가 없는 저장 리포트이므로, 보이는 천간·지지 글자 수만 표시합니다.'} 이 분포만으로 강약·종격·용신이나 적군·아군을 확정하지 않습니다.</p><div class="strategy-question"><b>따를 것인가, 제어할 것인가?</b><p>강한 오행이 언제나 적은 아닙니다. 월령·뿌리·생극의 연결과 전체 판세를 읽고, 아래 해설에서 전략을 확인하세요.</p><figure class="chapter-image doctrine-diagram">${diagram('alliance',m)}<figcaption>두 가지 전략의 설명도입니다. 어느 전략이 맞는지는 원국 해석으로 판단합니다.</figcaption></figure></div></section>${parsed.intro.length?`<div class="report-intro">${parsed.intro.map(p=>`<p>${escape(p)}</p>`).join('')}</div>`:''}<nav class="chapter-index" aria-label="리포트 목차">${parsed.chapters.map((c,i)=>`<a href="#battle-chapter-${i}"><span>${String(c.number).padStart(2,'0')}</span>${escape(c.title.split(/\s*[—–]\s*/)[0])}<b>↗</b></a>`).join('')}</nav><div class="battle-chapters">${parsed.chapters.map((c,i)=>`<section class="battle-chapter" id="battle-chapter-${i}"><header><span>FIELD BRIEFING · ${String(c.number).padStart(2,'0')}</span><h2>${escape(c.title)}</h2></header><figure class="chapter-image chapter-${chapterKind(c.title)}">${diagram(chapterKind(c.title),m)}<figcaption>${escape(chapterKind(c.title)==='hidden'?'원국에 실제로 포함된 지장간':chapterKind(c.title)==='forces'||chapterKind(c.title)==='training'?m.scoreLabel:'원국·운의 자료를 읽기 위한 설명 그림')}</figcaption></figure><div class="chapter-prose">${readableParagraphs(c.lines).map(p=>`<p>${escape(p.trim())}</p>`).join('')}</div></section>`).join('')}</div><section class="battle-closing"><span>YOUR NEXT MOVE</span><h2>무기는 이미 당신 안에.</h2><p>판세를 읽고, 내 무기를 골라,<br>맞는 타이밍에 움직이세요.</p></section>`;
    container.querySelectorAll('[data-faction]').forEach(button=>button.addEventListener('click',()=>{
      const active=button.getAttribute('aria-pressed')==='true'?'':button.dataset.faction;
      container.querySelectorAll('[data-faction]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.faction===active)));
      container.querySelectorAll('[data-element]').forEach(node=>{node.classList.toggle('faction-dim',Boolean(active)&&node.dataset.element!==active);node.classList.toggle('faction-lit',Boolean(active)&&node.dataset.element===active);});
    }));
    return m;
  }
  return {model,diagram,parseReport,chapterKind,readableParagraphs,render,escape,pillarsHTML};
});
