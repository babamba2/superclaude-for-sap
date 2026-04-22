# 세션 체크포인트 · 2026-04-23 · program-to-spec 이미지 파이프라인 개편

## 세션 목적
sc4sap 플러그인의 `/sc4sap:program-to-spec`가 xlsx 스펙을 만들 때 **조회화면 + ALV 레이아웃을 PNG로 embed**하는 기능이 실전(driver 복사 위치)에서 한 번도 동작하지 않던 구조적 버그를 발견하고 수정 + 병렬화 + fallback 자동화.

## 사용자 요청 타임라인
1. (초반) "entire 로그인 상태?" / "entire 바인딩" → `entire/checkpoints/v*` 브랜치에 세션 맥락을 바인딩하는 운영 규칙으로 합의 (memory: `feedback_entire_checkpoints.md`)
2. `.claude/` 폴더는 git 제외 규칙 저장 (memory: `feedback_git_exclude_claude.md`)
3. 로컬 `Hotfix` 브랜치에 `origin/active` pull → fast-forward merge 완료 (screen-image-renderer.mjs 이번에 Hotfix에 합류)
4. program-to-spec 이미지 생성이 왜 동작 안 하는지 원인 파악
5. A+B 대응 (템플릿 자동 이미지 파이프라인 + fallback wireframe 승격) 처리
6. 전체 언어 × L1~L4에 적용 + 병렬 처리로 확장
7. 스모크 테스트(A안) → renderer path lookup 버그 발견 → 수정 → PNG 2장 embed 성공 검증
8. 배포 범위 확인 (현재는 내 로컬에만, 다른 사용자 적용은 publish 필요)
9. 임시저장 요청 (이 체크포인트)

## 수행한 작업 (파일별)

### `scripts/spec/screen-image-renderer.mjs` (+72 / -18)
- `spawnSync` → **async `spawn`** (Promise 기반, 30s timeout, SIGKILL cleanup)
- `renderScreenImages` — Selection + ALV를 **`Promise.all`로 병렬** 렌더 (wall-clock ~6s → ~5.4s)
- `findBrowser` 에 Edge x64 경로 `C:\Program Files\Microsoft\Edge\Application\msedge.exe` 추가
- 한쪽 실패해도 다른 쪽 계속 (try/catch per-branch)

### `scripts/spec/rich-xlsx-template.mjs` (+310 / -22)
- TODO 상수 3개 신설: `SHEET_TITLE`, `SELECTION_IMAGE_SPEC`, `ALV_IMAGE_SPEC`
- Fallback wireframe 함수 3개 신설: `renderSelectionWireframe`, `renderAlvWireframe`, `distributeAlvColumns`
- `screensSheet({ hasSelectionImg, hasAlvImg })` 파라미터화 + body 승격 (주석 → 실코드)
- `build()` 개선: image anchor 분석 + sheetName mismatch 경고
- 파일 끝: `async buildImages()` + top-level `await` 추가
- **buildImages() 내 renderer path lookup** — driver가 어느 위치에 복사돼도 `screen-image-renderer.mjs`를 스스로 찾음 (hereDir → walk-up scripts/spec/ → cwd fallback). `node:path`, `node:url` import 추가.

### `skills/program-to-spec/SKILL.md` (+7 / -11)
- `<Inputs_And_Screens_Rendering>` 블록 재작성: v8.1 universal (모든 언어 × L1~L4) + 병렬 렌더 + fallback 자동 + localise 주의사항

### `skills/program-to-spec/workflow-steps.md` (+13 / -6)
- Step 3.5 Sub-step 2: "parallel" + "all languages L1~L4" 명시
- Step 4 Sub-step 2: driver TODO 블록 정리 (SHEETS_DATA / SCREEN_PARAMS / SELECTION_IMAGE_SPEC / ALV_IMAGE_SPEC / SHEET_TITLE / INPUTS_SHEET_NAME). "Per-spec driver MUST import renderScreenImages" 조항 제거 (이제 템플릿이 자동)

### 메모리 저장 (2건)
- `feedback_git_exclude_claude.md` — `.claude/` git 제외 규칙
- `feedback_entire_checkpoints.md` — 커밋 시 `entire/checkpoints/v<N>` 브랜치에 세션 요약 별도 커밋·푸시 절차

## 검증 결과 (스모크)

### 테스트 환경
- `.sc4sap/specs/_smoke/smoke-driver.mjs` — 템플릿 복사 + SMOKE_PO_INQUIRY 샘플 데이터 채움
- 샘플: MM 구매오더 조회 Report + ALV
- `INPUTS_SHEET_NAME = '입력 및 화면'` (로컬라이즈 테스트 겸용)

### 1차 (path lookup 전) → wireframe fallback 확인
- `[screen-images] renderer error: Cannot find module '...\_smoke\screen-image-renderer.mjs'`
- **B안 완벽 동작**: Row 1 title + Row 3-10 selection wireframe + Row 19-23 ALV wireframe + Row 49+ paramsBlock
- sheet order 정상 (Overview → Data Model → 입력 및 화면), sheetName mismatch 경고 발생 안 함

### 2차 (path lookup 후) → PNG embed 성공
- `[smoke] buildImages (parallel PNG render): 5.381s` (Edge 2개 병렬)
- `images.length = 2 (B3, B19)` · `Wrote ... (3 sheets, 2 images)`
- xlsx 내부: `xl/media/image1.png` (11.8KB, 900×328 Selection) + `image2.png` (8.4KB, 900×184 ALV), `xl/drawings/drawing1.xml` 두 oneCellAnchor (col=1/row=2 + col=1/row=18 = B3 + B19 정확)

## 발견한 구조적 버그 (수정 완료)
원 v8 코드 `rich-xlsx-template.mjs` 주석의 예시 `await import('./screen-image-renderer.mjs')` 는 **현재 실행 중인 파일(driver) 기준 상대경로**로 해석됨. workflow-steps.md는 driver를 `.sc4sap/specs/_drivers/{OBJECT}-{date}.mjs`로 복사하라고 지시하는데, 그 위치에는 renderer 파일이 없어 import가 **항상 실패**했을 것. 이전 push에도 같은 이슈 존재.

→ 이번 수정 후 driver가 어디에 복사돼도 renderer를 스스로 찾음. 이 구조 개선은 **배포되기 전까진 다른 사용자에게 적용되지 않음** (각자 플러그인 캐시는 v0.6.2로 stuck).

## 현재 git 상태 (임시저장 직전)
- 브랜치: `Hotfix` (HEAD = `17c3fbc chore(release): 0.6.5`, origin/active와 동일)
- 수정 파일 4개 (tracked): 위 4개 파일
- Untracked: `.sc4sap/specs/_smoke/smoke-driver.mjs`, `.sc4sap/specs/_smoke/smoke-po-inquiry.xlsx`, `.omc/checkpoints/session-20260423-0003-*.md` (← 이 파일)
- stash@{0}: `.claude/settings.local.json` (이미 파일로 복구됨 — 필요 시 drop)

## 이어서 할 작업 (남은 액션)

### 즉시 선택 가능 (사용자 판단)
- **a) xlsx 눈 확인**: `.sc4sap/specs/_smoke/smoke-po-inquiry.xlsx`를 Excel로 열어서 PNG 2장이 제대로 embed돼 보이는지 + 시각적으로 읽기 편한지 확인
- **b) 정식 release**: `package.json` + `.claude-plugin/plugin.json` 버전 0.6.2 → 0.6.6 bump → marketplace.json 업데이트 → git tag v0.6.6 → push → npm publish (또는 marketplace release) → 사용자가 `/plugin update sc4sap`로 받음
- **c) 로컬 플러그인 캐시 수동 복사**: `.claude/plugins/cache/sc4sap/sc4sap/0.6.2/` 아래 3개 파일 (`scripts/spec/screen-image-renderer.mjs`, `scripts/spec/rich-xlsx-template.mjs`, `skills/program-to-spec/{SKILL.md,workflow-steps.md}`)을 현재 프로젝트 소스로 덮어써서 `/sc4sap:program-to-spec ZMMR1001` 즉시 실전 검증. 정식 publish 전까지의 임시 조치
- **d) 스모크 파일 정리**: `.sc4sap/specs/_smoke/*` 삭제 + 필요 시 `.gitignore`에 `.sc4sap/` 추가 검토
- **e) Socratic interview 재개**: `/sc4sap:program-to-spec ZMMR1001` 를 처음 받을 때 해야 했던 4-Q bundled AskUserQuestion (Audience / Format / Depth / Language) 실행

### 후속 개선 아이디어
- Edge/Chrome 외 **순수 Node SVG→PNG 라이브러리** (예: `@resvg/resvg-js`) 도입 검토 → headless browser 종속 완전 제거, CI/서버 환경 친화. 단, dependency 추가 (약 8MB prebuilt binary)
- `scripts/spec/rich-xlsx-template.mjs`가 1100줄 이상 — scripts/ 는 200-line cap 대상 아니지만 가독성 위해 `screens-wireframe.mjs` 등으로 분리 고려
- `SCREEN_PARAMS` 헤더 현재 영문 (Field/Type/Required/Default/Description) — KO/JA 스펙에서 localise 하려면 `PARAMS_HEADERS` 상수 추가

## 다음 세션 resume 방법
1. 이 파일 읽기: `.omc/checkpoints/session-20260423-0003-program-to-spec-image-pipeline.md`
2. git 상태: `git log --oneline Hotfix | head -5` (최근 WIP commit 확인)
3. 워킹트리의 `.sc4sap/specs/_smoke/` 아직 있는지 확인 — 있으면 정리 여부 결정
4. 위 "이어서 할 작업" 중 원하는 옵션 선택해서 진행

## 관련 메모리
- `feedback_entire_checkpoints.md` — 이 체크포인트 절차 자체
- `feedback_git_exclude_claude.md` — `.claude/` 제외
- `feedback_xlsx_style_v8.md` — v8 grey+yellow 팔레트, PNG embed 위치 (B3/B19)
- `feedback_xlsx_no_truncation.md` — cell 절단 금지 규칙
- `feedback_program_to_spec_opener.md` — 4-Q bundled opener
