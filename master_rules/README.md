# Master Rule Dataset

77개 Golden Brain case에서 반복되는 판단 규칙을 통합한 SAJUWAR Master Rule Dataset이다.

## Priority

Prompt Builder는 답변 생성 시 Case보다 Master Rule을 우선 활용한다.

1. Master Rule Dataset
2. Golden Brain Case
3. Review Dataset
4. RAG
5. Knowledge Rule

## Files

- `all_rules.jsonl`: 전체 Master Rule
- `by_type/*.yaml`: 유형별 Master Rule

## Counts

- total_rules: 401
- 오행: 7
- 십성: 29
- 신강신약: 2
- 용신: 2
- 합충형파해: 44
- 대운: 79
- 세운: 82
- 월운: 79
- 직업: 26
- 재물: 30
- 결혼: 15
- 건강: 6
