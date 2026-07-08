# SAJU WAR Bible Review Gate

**Document Type:** Product Governance Rule  
**Applies To:** All new SAJU WAR features, UI changes, AI behavior changes, content systems, monetization flows, and backend architecture changes  
**Priority:** Above feature specs, prompts, UI tickets, implementation tasks, and temporary experiments

---

## 1. Supreme Rule

모든 신규 기능을 개발하기 전에 반드시 6개의 Bible과 충돌 여부를 먼저 검토한다.

충돌이 발견되면 개발을 즉시 진행하지 않는다.

먼저 어떤 Bible의 어떤 원칙과 충돌하는지 명확히 기록하고, Bible 수정안 또는 기능 수정안을 먼저 제안한 뒤 승인된 방향으로 개발한다.

---

## 2. The Six Bibles

SAJU WAR의 제품 판단은 아래 6개 Bible을 기준으로 한다.

1. **Brand Bible / Master Plan**  
   SAJU WAR가 왜 존재하는지, 어떤 브랜드 철학과 세계관으로 성장해야 하는지 정의한다.

2. **Product Bible**  
   각 페이지가 어떤 경험, 감정, UX Flow, UI 구조, AI 역할, 기술 구조로 구현되어야 하는지 정의한다.

3. **AI Constitution**  
   모든 AI 기능이 반드시 지켜야 하는 성격, 말투, 안전 원칙, 금지 표현, 코칭 철학을 정의한다.

4. **Knowledge Bible**  
   SAJU WAR만의 명리 해석 체계, 현대 언어 번역, 실생활 적용 방식, AI 지식 기준을 정의한다.

5. **Experience Bible**  
   사용자가 기능을 소비하는 것이 아니라 자신의 인생을 탐험한다고 느끼게 만드는 감정 곡선, 연출, 사운드, 모션, 게임적 경험을 정의한다.

6. **Development Governance Bible**  
   실제 개발 전 검토 순서, 충돌 판단 기준, 승인 절차, 구현 체크리스트, 배포 전 검증 방식을 정의한다. 이 문서가 Development Governance Bible의 시작점이다.

---

## 3. Mandatory Pre-Development Review

신규 기능, 디자인 변경, AI 프롬프트 변경, DB 구조 변경, 결제/상담/리포트/커뮤니티 변경은 모두 아래 질문을 통과해야 한다.

### 3.1 Brand Conflict Check

- 이 기능은 SAJU WAR를 기존 사주 사이트처럼 보이게 만들지 않는가?
- 사용자가 "사주를 봤다"가 아니라 "내 무기를 찾았다"고 느끼게 하는가?
- 공포, 예언, 운명 확정, 불안 결제를 유도하지 않는가?
- "Find Your Weapon"이라는 핵심 약속을 강화하는가?

### 3.2 Product Conflict Check

- 이 기능은 해당 페이지의 존재 이유와 사용자 목표에 맞는가?
- 기능 설명보다 사용자 감정 흐름이 먼저 설계되었는가?
- Apple처럼 직관적이고, Netflix처럼 몰입되며, Duolingo처럼 지속 사용을 유도하고, ChatGPT처럼 쉽게 이해되는가?
- Wireframe, UI, Animation, Gamification, AI 역할, Backend, Frontend, 예외 처리가 함께 정의되었는가?

### 3.3 AI Constitution Conflict Check

- AI가 점쟁이처럼 말하지 않는가?
- AI가 사용자의 미래를 단정하지 않는가?
- AI가 선택지, 이유, 다음 행동을 함께 제공하는가?
- AI가 의료, 법률, 투자, 죽음, 자살, 우울, 폭력 등 고위험 영역에서 안전 원칙을 지키는가?
- 금지어와 금지 문장 구조를 피하는가?

### 3.4 Knowledge Conflict Check

- 명리 용어를 현대인이 이해할 수 있는 언어로 번역했는가?
- 전통 명리 정의를 그대로 복붙하지 않고 SAJU WAR 철학으로 재해석했는가?
- 해석이 직업, 관계, 사업, 공부, 성장, 선택, 행동으로 연결되는가?
- 모든 해석이 공포가 아니라 전략으로 끝나는가?

### 3.5 Experience Conflict Check

- 기능이 단순 업무가 아니라 경험으로 느껴지는가?
- 사용자의 감정 곡선이 설계되었는가?
- Weapon, Strategy Map, Quest, Academy, AI Report, AI Chat, Community의 세계관과 연결되는가?
- 모션, 사운드, 마이크로 인터랙션, 보상 경험이 과하지 않지만 기억에 남는가?

### 3.6 Development Governance Check

- 구현 범위가 명확한가?
- 기존 코드와 데이터 구조를 망가뜨리지 않는가?
- 배포 후 사용자가 실제 화면에서 변화를 볼 수 있는가?
- 로컬 검증, Git commit, push, 배포 확인 계획이 있는가?

---

## 4. Conflict Levels

### Level 0: No Conflict

6개 Bible과 충돌하지 않는다. 개발을 진행할 수 있다.

### Level 1: Minor Tension

표현, UI 톤, 마이크로카피, 애니메이션 정도의 조정이 필요하다. 기능 개발과 함께 수정 가능하다.

### Level 2: Product Conflict

페이지의 존재 이유, 감정 흐름, UX Flow, AI 역할과 어긋난다. 개발 전에 기능 설계를 수정해야 한다.

### Level 3: Brand or AI Safety Conflict

공포 마케팅, 운명 단정, 불안 결제, 위험 조언, 기존 사주 사이트화, 사용자 자율성 침해가 포함된다. 개발을 중단하고 Bible 수정안 또는 기능 철회안을 먼저 제안한다.

---

## 5. Required Output Before Development

개발자는 신규 기능 작업 전 아래 형식으로 짧게 기록한다.

```md
## Bible Review

Feature:

Reviewed Bibles:
- Brand Bible / Master Plan:
- Product Bible:
- AI Constitution:
- Knowledge Bible:
- Experience Bible:
- Development Governance Bible:

Conflict Level:

Conflicts Found:

Required Bible Update:

Decision:
```

---

## 6. If A Conflict Exists

충돌이 있으면 다음 순서를 따른다.

1. 충돌하는 Bible과 원칙을 명시한다.
2. 왜 충돌인지 사용자 경험 관점에서 설명한다.
3. 기능을 수정해서 해결할 수 있는지 판단한다.
4. 기능 수정으로 해결할 수 없으면 Bible 수정안을 먼저 작성한다.
5. 수정안이 승인되기 전에는 구현하지 않는다.

---

## 7. Implementation Rule

SAJU WAR의 개발 순서는 항상 아래와 같다.

```text
Feature Request
↓
Bible Review
↓
Conflict Decision
↓
Experience Design
↓
UX / UI / AI / Backend Design
↓
Implementation
↓
Local Verification
↓
Commit
↓
Push
↓
Deployment Verification
```

---

## 8. Non-Negotiable Principle

SAJU WAR는 사주 기능을 추가하는 서비스가 아니다.

SAJU WAR는 사용자가 자신의 인생을 전략적으로 이해하고, 자신의 무기를 발견하고, 다음 선택을 더 잘하도록 돕는 경험 시스템이다.

따라서 모든 신규 기능은 반드시 이 질문에 답해야 한다.

**"이 기능은 사용자가 자신의 무기를 더 선명하게 발견하도록 돕는가?"**

답이 불명확하면 아직 개발하지 않는다.

