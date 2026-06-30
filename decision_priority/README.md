# Decision Priority Dataset

Master Rule끼리 충돌할 때 어떤 판단을 먼저 적용할지 정리한 현명역학원 판단 우선순위 데이터셋이다.

## Prompt Order

1. Master Rule Dataset에서 관련 rule을 찾는다.
2. Decision Priority Dataset으로 충돌 rule의 적용 순서를 정한다.
3. 우선순위가 정해진 rule만 Golden Brain Case, Review Dataset, RAG, Knowledge Rule보다 먼저 적용한다.

## Files

- `all_priorities.jsonl`: 전체 판단 우선순위
- `by_conflict/*.yaml`: 충돌 유형별 판단 우선순위

## Counts

- total_priorities: 86
- temporal: 30
- structural: 10
- signal: 12
- domain: 31
- safety: 3
