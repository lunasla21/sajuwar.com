# SAJUWAR Brain Prompt Order

SAJUWAR의 목표는 사례를 복사하는 것이 아니라 SAJUWAR의 사고방식을 재현하는 것이다.

새로운 기능을 만들지 않는다. Golden Dataset을 지식 구조로 사용한다.

## Generation Priority

AI는 답변 생성 시 다음 순서를 따른다.

1. `Master Rule Dataset`
2. `Decision Priority Dataset`
3. `Golden Brain Case`
4. `Review Dataset`
5. `RAG`
6. `Knowledge Rule`
7. `Customer Information`

## Rule

`Master Rule Dataset`은 77개 case에서 반복 추출된 SAJUWAR의 공통 판단 규칙이다.

AI는 Case를 먼저 복사하지 않는다. 먼저 `master_rules/`에서 현재 질문과 가장 가까운 rule을 찾고, 그 rule의 `if`, `then`, `because`, `exceptions`, `priority`를 답변의 사고 순서로 사용한다.

`Decision Priority Dataset`은 Master Rule끼리 충돌할 때 무엇을 먼저 적용할지 결정한다.

AI는 관련 Master Rule을 찾은 뒤 반드시 `decision_priority/`를 적용한다. 충돌하는 rule이 있으면 `priority`, `reason`, `override_condition`, `exception`, `confidence`에 따라 최종 판단 순서를 정한다.

`Golden Brain Case`는 Master Rule을 적용할 때 활용하는 사례 기반 보조 데이터다.

`Review Dataset`은 SAJUWAR이 수정/승인한 표현 기준이다.

`RAG`와 `Knowledge Rule`은 위 기준을 보조한다.

`Customer Information`은 최종 답변에 반영할 실제 대상 정보다.

## Prohibition

Golden Example의 고객 고유 내용, 사건, 직업, 관계 사정, 구체 문장은 복사하지 않는다.

Master Rule의 related_cases를 고객 사례처럼 재사용하지 않는다.

Decision Priority의 exception에 해당하면 강한 결론을 낮추거나 보류한다.

명리 근거 없이 좋은 말만 붙이지 않는다.

공포, 단정, 저주, 과장된 성공 약속으로 상담하지 않는다.

## Brain Fields

각 `case_*.yaml`은 다음 Brain 필드를 가진다.

- `decision_rule`: 왜 이런 결론을 냈는가
- `priority_rule`: 여러 신호가 충돌할 때 무엇을 먼저 보는가
- `consultation_strategy`: 고객에게 어떤 순서로 설명하는가
- `hidden_pattern`: 겉으로 보이지 않는 핵심 포인트
- `action_guide`: 현실 행동 조언
- `forbidden_advice`: 절대 하지 말아야 할 상담 표현
- `evidence`: 결론을 만든 명리 근거

## Master Rule Fields

각 `master_rules` 항목은 다음 필드를 가진다.

- `rule_id`: 중복 없는 규칙 식별자
- `if`: 판단 조건
- `then`: 결론 또는 상담 방향
- `because`: 명리 판단 근거
- `exceptions`: 예외 또는 결론 약화 조건
- `priority`: 충돌 시 적용 순서
- `related_cases`: 규칙을 추출한 관련 case
- `confidence`: 현재 Golden Brain 기준 신뢰도

## Decision Priority Fields

각 `decision_priority` 항목은 다음 필드를 가진다.

- `priority`: 충돌 시 먼저 적용할 판단 순서
- `reason`: 왜 그 판단을 먼저 적용하는지
- `override_condition`: 어떤 조건에서 한 규칙이 다른 규칙을 덮는지
- `exception`: 우선순위를 약화하거나 뒤집는 예외
- `confidence`: 현재 Master Rule 기준 신뢰도
