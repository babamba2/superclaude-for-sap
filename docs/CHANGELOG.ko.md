# 변경 이력

← [README로 돌아가기](../README.ko.md) · [설치](INSTALLATION.ko.md) · [기능](FEATURES.ko.md)

sc4sap의 모든 주요 변경사항이 여기에 기록됩니다. 전체 릴리즈 노트는 [GitHub Releases](https://github.com/babamba2/superclaude-for-sap/releases) 참고.

이 프로젝트는 [Semantic Versioning](https://semver.org/)과 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식을 따릅니다.

---

## [미출시]

_아직 미출시 변경사항 없음._

---

## [0.6.1] - 2026-04-21

### 추가
- **`/sc4sap:setup` 멀티 프로필 인식** — 위저드에 Step 0 (레거시 감지 + 프로필 부트스트랩)와 전용 프로필 생성 플로우 (`skills/setup/wizard-step-04-profile-creation.md`) 추가. 0.6.0 이전 `<project>/.sc4sap/sap.env` 사용자는 `sap-profile-cli.mjs migrate`로 자동 마이그레이션; 신규 설치는 `~/.sc4sap/profiles/<alias>/` 아래 첫 프로필을 OS 키체인 연동 비밀번호 저장으로 생성.
- **Tier 게이트 Step 9** — ABAP 유틸리티 설치 (`ZMCP_ADT_UTILS`, `ZCL_S4SAP_CM_*`, OData/ZRFC 클래스) 는 `SAP_TIER=DEV`에서만 실행. QA/PRD 프로필은 설치 거부 + CTS import 가이드 출력; DEV 설치는 `SAP_URL+SAP_CLIENT` 기준으로 sibling 프로필 간 중복 제거 (`~/.sc4sap/profiles/<alias>/.abap-utils-installed` sentinel).
- **Step 12 PreToolUse 2중 훅** — `.claude/settings.json` (프로젝트 레벨) 에 `block-forbidden-tables.mjs`와 `tier-readonly-guard.mjs` **모두** 설치, 각각 스모크 테스트 수행.
- **공유 프로필 resolver** (`scripts/lib/profile-resolve.mjs`) — `resolveSapEnvPath`, `resolveConfigJsonPath`, `resolveArtifactBase`, `readActiveSapEnv`, `readActiveConfigJson`, `readDotenv`, `normalizeTier`. HUD / 훅 / 스크립트가 사용하는 active-profile → `~/.sc4sap/profiles/<alias>/` 해석 패턴 일원화.
- **Gap-plan 문서** (`docs/multi-profile-setup-gap.md`) — `multi-profile-design.md` + `-implementation-plan.md`의 자매 문서; setup 스킬 리트로핏을 위한 5개 결정 기록.
- **활성 모듈 인식** (`common/active-modules.md`) — 교차 모듈 통합 매트릭스. `SAP_ACTIVE_MODULES` 환경변수 + `config.json`의 `activeModules`가 `create-program`, `create-object`, `analyze-cbo-obj`, 컨설턴트 에이전트에서 통합 필드 제안을 구동. 예: MM 오브젝트 + PS 활성 → WBS 필드(`PS_POSID` / `AUFNR`) 자동 제안.
- **Fix #3 `handleUpdateDomain.ts`** — 핸들러 속성명을 `AdtDomain.update()`의 snake_case 기대값과 일치시킴(`value_table`, `fixed_values`, `conversion_exit`, `sign_exists`). 이전엔 silent drop.
- **Fix #4 `core/domain/update.ts`** (mcp-abap-adt-clients) — `<doma:valueTableRef>` 자체 닫는 경우를 위해 `patchXmlElementAttribute` → `patchXmlBlock`. 이제 완전한 `adtcore:uri` + `adtcore:type` + `adtcore:name` 속성 생성.

### 변경
- **멀티 프로필 모드 아티팩트 경로** — `extract-spro.mjs`, `extract-customizations.mjs`, 소비 스킬들이 `<project>/.sc4sap/` 직접이 아닌 `<project>/.sc4sap/work/<activeAlias>/` 아래로 기록 (`common/multi-profile-artifact-resolution.md` 기준). 레거시 (`active-profile.txt` 없는 경우) fallback 유지.
- **`rfc-backend-selection.md`** — `soap` / `native` / `gateway` / `odata` / `zrfc` 백엔드의 모든 `SAP_RFC_*` env 키를 활성 프로필 env (`~/.sc4sap/profiles/<alias>/sap.env`)에 기록하고 프로젝트 폴더에는 절대 기록하지 않음. `odata` / `zrfc` bootstrap 순서 노트 유지.
- **`handleCreateTable.ts`** — Create 직후 MANDT 기반 transparent table 스켈레톤(`key mandt : mandt not null`) 자동 주입. SAP 백엔드의 기본 CDS 스타일 `key client : abap.clnt` 대체. 첫 사용자가 UpdateTable에서 `ExceptionResourceAlreadyExists`를 더 이상 겪지 않음.
- **`handleUpdateTable.ts`** — `ddl_code` 스키마 description에 MANDT 예시 + annotation 보존 가이드 추가.

### 수정
- **`sap-profile-cli.mjs list`/`show` 비밀번호 노출** — 프로필 env가 plaintext fallback 상태 (키체인 사용불가) 일 때 `passwordRef` 필드에 원본 비밀번호 그대로 노출됨. 이제 non-keychain 값은 `"plaintext (masked)"` 리터럴 반환; `keychain:…` 레퍼런스는 그대로 통과.
- **마이그레이션 후 HUD ENV 상태** — `sc4sap-status.mjs::sapEnvPresent / readConfig / activeTransport / systemInfo / sproCacheAge` 모두 `<project>/.sc4sap/…`만 보고 있어서 멀티프로필 마이그레이션 후 동작 안 함. 이제 활성 프로필 pointer 우선 해석, 레거시 fallback 유지.
- **`block-forbidden-tables.mjs` 프로필 불일치** — 활성 프로필 `config.json`이 다른 값을 가져도 훅이 기본 `standard`만 리포트 — 레거시 프로젝트 `config.json`만 읽고 있었기 때문 (마이그레이션으로 삭제됨). 이제 활성 프로필의 config.json 읽음.
- **`code-simplifier.mjs`**와 **`sap-option-tui.mjs`** — 각각 Stop 훅과 standalone TUI가 레거시 프로젝트 경로만 읽던 것을 공유 프로필 헬퍼 경유로 해석하도록 수정.

### 문서
- **`INSTALLATION.md` / `.ko.md` / `.ja.md` / `.de.md`** — 4개 언어 버전 모두 0.6.0 멀티 프로필 setup 기준으로 재작성. "멀티 프로필 아키텍처" 섹션 추가, 위저드 표를 12 → 14 step (Step 0 + Step 13 HUD) 확장, 3-레이어 방어 (L1a 행추출 훅 + L1b tier 훅 + L2 MCP 서버 가드) 문서화, 설정 완료 후 프로필 관리 + 롤백 레시피 추가.
- README 분할 — 메인 페이지는 슬림 (핵심 기능 + 제작자 + 기여자). 설치/상세기능/히스토리를 `docs/INSTALLATION.md` / `docs/FEATURES.md` / `docs/CHANGELOG.md` (이 파일)로 이동.

---

## 릴리즈 이력

이전 릴리즈는 [Git 태그 히스토리](https://github.com/babamba2/superclaude-for-sap/tags)와 [GitHub Releases](https://github.com/babamba2/superclaude-for-sap/releases) 참고.

### 버전 체계

sc4sap은 `v{MAJOR}.{MINOR}.{PATCH}` 형식:
- **MAJOR** — 스킬 API, 구성 스키마, 최소 SAP/Claude Code 버전에 대한 breaking change
- **MINOR** — 새 스킬, 새 에이전트, 새 common 규칙, 하위 호환 기능 추가
- **PATCH** — 버그 수정, 문서 전용 변경, 비-breaking 리팩토링

### 호환성

- **Claude Code**: >= 2.x
- **Node.js**: >= 20.0.0
- **SAP**: ECC 6.0 / S/4HANA On-Premise / S/4HANA Cloud (Public & Private)
- **MCP 서버**: 번들된 `abap-mcp-adt-powerup` (`/sc4sap:setup`이 자동 설치, 릴리즈별 버전 고정)

---

← [README로 돌아가기](../README.ko.md)
