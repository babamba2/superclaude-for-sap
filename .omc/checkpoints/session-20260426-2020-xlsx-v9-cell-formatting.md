# 세션 체크포인트 2026-04-26 · program-to-spec xlsx v9 cell formatting

**Session ID**: `2c595c1e-f2ec-434d-8892-0265df498e0f`
**Entire checkpoint**: `8d6e4161a0e5`
**Cherry-picked commit on active**: `9af71d9` (origin/active head)
**Original commit on Layout**: `9a4a1a6`

## 사용자 요청

1. `.sc4sap/specs/ZMMRTEST003-수정.xlsx` 참고로 program-to-spec xlsx 양식 변경 + 재출력
2. Processing Logic 시트 하단에 Process Flow Chart 자동 렌더링 (앞으로 모든 program-to-spec 출력에 포함)
3. 셀 서식(높이/너비/음영/테두리) 참고파일과 정확 매칭 (flowchart 영역 제외)
4. Sheet 3 (Inputs & Screens) 도 임의 보류하지 말고 매칭 — 사용자가 임의 판단 지적
5. 커밋 + origin/active 푸시 (단, 팀모드/release 0.6.12 작업 보존)
6. (재검토) entire CLI 동작 정확히 파악 → enable + git checkpoint v3

## 수행한 작업

### 템플릿 변경 (`scripts/spec/rich-xlsx-template.mjs`, +245/-21)

- 신규 셀 스타일 **25** (centered, no border, no fill — flow arrow 행 전용)
- 신규 헬퍼 **`appendProcessFlow(payload, items, opts)`** — 데이터 테이블 끝 + 1행 spacer → 헤딩(스타일 17) → 노드(스타일 21 box / 20 yellow decision / 21 terminal) ↔ ↓(스타일 25) 자동 렌더
- 신규 per-spec 상수: `PROCESS_FLOW`, `PROCESS_FLOW_SHEET` (기본 `'Processing Logic'`), `PROCESS_FLOW_HEADING` (기본 `'Process Flow Chart'`, 다국어 가능)
- **`textSheet(rows, opts)` 시그니처 변경** — `opts.colWidths` 명시 너비 + 연속 동폭 자동 그룹핑(`<col min=4 max=6/>`)
- **Row height 계산은 auto-fit 너비 기준** (explicit colWidths를 줘도 height는 narrow 시점 기준) — REF의 Google Sheets 동작 매치 (col 넓혀도 wrap line 수 유지)
- 상수 변경: `LINE_HEIGHT_PT 17→16.875` + 신규 `HEADER_ROW_HEIGHT=22.5`, `WARNING_ROW_HEIGHT=22.5`, `HEIGHT_BY_LINES = {2:33.75, 3:51, 4:67.5}` lookup table
- screensSheet `cols`: `[A=3, B:E=14, F=50.71, G:P=14, Q=3]` + `r1=30`, WARNINGS 각 행 `ht=22.5`
- `build()` 통합 — 시트명이 PROCESS_FLOW_SHEET면 textSheet 결과에 후처리 자동 적용

### 워크플로 문서 (`skills/program-to-spec/workflow-steps.md`, +3/-0)

- v9 baseline col 룰: B..E와 G..P=14, F=50.71 (Type 컬럼 readability + PNG-primary 트레이드오프 명시)
- PROCESS_FLOW 컨벤션 명시 (`?` decision, `!` terminal, 분기 `→` 인라인, 빈 배열 = no-op)

### 메모리 (전역 `~/.claude/projects/.../memory/`, gitignored)

- `feedback_xlsx_processflow_v9.md` — v9 종합 룰 (flowchart + colWidths + heights + Sheet 3 col F + 임의판단 금지)
- `feedback_dispatch_prompt_helper_leak.md` — generic agent의 dispatch + 본문 양쪽에 스킬 전용 helper/렌더링 지시 박지 말 것
- `feedback_entire_checkpoints.md` 갱신 — entire CLI attached 만으론 자동 기록 안 됨 (`enable` 필요), 분기 명확화

### Git 작업

- Layout 브랜치: `9a4a1a6` (v9 commit, author=tennto)
- origin/active 푸시: cherry-pick으로 v9만 추출 → `9af71d9` (팀모드 Phase 6/7 + release 0.6.12 등 5커밋 보존)
- `entire enable --agent claude-code` 실행 — 7 hooks 설치 (project-level `.claude/settings.json`)
- 본 v3 체크포인트 브랜치 — 세션 메모 + v9 cherry-pick 단일 커밋

### 사용자가 받은 산출물

- `.sc4sap/specs/ZMMRTEST003-20260426-en.xlsx` — v9 적용된 새 spec (7 sheets, 2 PNG, Process Flow Chart 12 노드)

## 결정 사항

| 결정 | 근거 |
|---|---|
| Sheet 1/2/4 col widths 를 REF 값(145.71/97.86/141.29) 그대로 적용 | 사용자 명시 요청 "참고파일대로" |
| Sheet 3 col F=50.71 적용 (workflow-steps.md mandate 갱신) | 사용자 명시 요청 + PNG primary path라 fallback wireframe 트레이드오프 허용 |
| Row height auto-fit 너비 기준 계산 (explicit colWidths 줘도) | REF의 "col 넓혀도 height는 narrow 시점 그대로" Google Sheets 동작 매치 |
| Layout → active는 force push 대신 cherry-pick | active의 팀모드 Phase 6/7 + release 0.6.12 등 5커밋 보존 |
| entire/checkpoints/v2 덮어쓰기 대신 v3 신설 | 04-23 v2 (image pipeline 세션) 보존 |
| `entire enable` 추가 실행 | 다음 세션부터 자동 추적, 수동 attach 의존 제거 |
| sap-writer 본문 / dispatch 프롬프트 수정은 보류 | 일반 룰만 메모리에 박고, program-to-spec owner 영역은 명시 지목 시에만 |

## 남은 이슈 / Follow-up

- [ ] active에 푸시한 `9af71d9` 메시지에 `Entire-Checkpoint:` trailer 추가 안 함 (force push 위험 회피). 다음 커밋부터 trailer 추가 가능 — `Entire-Checkpoint: 8d6e4161a0e5`
- [ ] CHANGELOG.md / package.json version bump 안 함 — 이번은 active push만, release는 별도 작업
- [ ] v9 baseline이 다른 4개 모듈(create-program 등)의 sap-writer 호출에 영향 안 주는지 회귀 테스트 필요
- [ ] 향후 program-to-spec 작업 시: dispatch 프롬프트와 sap-writer 본문에 helper 이름 박지 말 것 (메모리 룰 참조)

## 변경 파일 목록 (origin/main 대비)

```
scripts/spec/rich-xlsx-template.mjs        | +245 / -21
skills/program-to-spec/workflow-steps.md   |   +3 /   0
.omc/checkpoints/session-20260426-2020-xlsx-v9-cell-formatting.md  | NEW (this file)
```
