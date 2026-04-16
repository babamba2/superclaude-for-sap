[English](README.md) | 한국어 | [日本語](README.ja.md) | [Deutsch](README.de.md)

# SuperClaude for SAP (sc4sap)

> SAP ABAP 개발을 위한 Claude Code 플러그인 — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private) 지원

[![MCP 서버 npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![플러그인 버전](https://img.shields.io/badge/sc4sap-v0.2.4-6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## sc4sap란?

SuperClaude for SAP는 Claude Code를 풀스택 SAP 개발 어시스턴트로 변환합니다. [MCP ABAP ADT 서버](https://github.com/babamba2/abap-mcp-adt-powerup)(150+ 도구)를 통해 SAP 시스템에 직접 연결하여 클래스, 펑션 모듈, 리포트, CDS 뷰, Dynpro, GUI 상태 등의 ABAP 오브젝트를 생성/조회/수정/삭제할 수 있습니다.

### 핵심 기능

| 기능 | 설명 | 스킬 |
|------|------|------|
| **🔌 MCP 자동 설치** | `abap-mcp-adt-powerup`를 자동으로 설치·구성·연결 테스트합니다. MCP 수동 설정이나 `claude_desktop_config.json` 직접 편집이 필요 없습니다 — 자격증명은 `.sc4sap/sap.env`로 저장되고, 훅/블록리스트 레이어도 자동 등록됩니다. | `/sc4sap:setup` |
| **🏗️ 정형화된 프로그램 자동 생성** | sc4sap 컨벤션에 맞춰 ABAP 프로그램을 엔드투엔드로 생성합니다: Main + 조건부 Include(t/s/c/a/o/i/e/f/_tst), OOP/Procedural 분할(`LCL_DATA` / `LCL_ALV` / `LCL_EVENT`), 완전한 ALV(CL_GUI_ALV_GRID + Docking) 또는 SALV, 필수 Text Element · CONSTANTS, Dynpro + GUI Status, ABAP Unit 테스트 — 플랫폼(ECC / S4 On-Prem / Cloud)까지 자동 판단. | `/sc4sap:create-program`, `/sc4sap:autopilot` |
| **🔍 프로그램 분석** | 역방향 지능: MCP로 ABAP 오브젝트를 읽어 Clean ABAP / 성능 / 보안 관점으로 리뷰하거나, 기존 프로그램을 기능/기술 명세서(Markdown · Excel)로 역공학합니다. 소크라테스식 범위 좁히기로 "전부 문서화" 비대화를 방지합니다. | `/sc4sap:analyze-code`, `/sc4sap:program-to-spec` |
| **🩺 유지보수 진단** | 운영 장애 대응: ST22 덤프, SAT 스타일 프로파일러 트레이스, 로그, where-used 그래프를 Claude 안에서 직접 조사하고, 가설을 좁히고, SAP Note 후보를 제시하며, 플러그인/MCP/SAP 연결 건강성까지 진단합니다. | `/sc4sap:analyze-symptom`, `/sc4sap:sap-doctor` |
| **♻️ CBO 재사용 (브라운필드 가속기)** | Customer Business Object (Z 패키지)를 한 번만 인벤토리 — 자주 사용되는 Z 테이블 / FM / 데이터 엘리먼트 / 클래스 / 구조체 / 테이블 타입을 카탈로그화해 `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` 에 저장합니다. `create-program` / `program-to-spec` 이 기획 시점에 이 인벤토리를 로드해 **중복 생성 대신 기존 CBO 자산 재사용을 우선**합니다 — 수백 개의 레거시 Z 오브젝트가 있는 브라운필드 시스템에 필수. | `/sc4sap:analyze-cbo-obj` → `/sc4sap:create-program` |
| **🏭 산업 컨텍스트 (Industry)** | 14개 산업별 레퍼런스 파일(`industry/*.md`) — 리테일 · 패션 · 화장품 · 타이어 · 자동차 · 제약 · 식음료 · 화학 · 전자 · 건설 · 철강 · 유틸리티 · 금융 · 공공. Consultant가 컨피그 분석 · Fit-Gap · 마스터데이터 결정 시 해당 산업 파일을 로드해 비즈니스 특화 패턴 / 함정 / SAP IS 매핑을 반영. | 모든 consultant |
| **🌏 국가 / 로컬라이제이션 (Country)** | 15개 국가별 파일 + `eu-common.md` (KR · JP · CN · US · DE · GB · FR · IT · ES · NL · BR · MX · IN · AU · SG · EU 공통). 날짜/숫자 포맷 · VAT/GST 체계 · 의무 e-invoicing(SDI / SII / MTD / CFDI / NF-e / 세금계산서 / Golden Tax / IRN / Peppol / STP) · 은행 포맷(IBAN / BSB / CLABE / SPEI / PIX / UPI / SEPA / Zengin …) · 급여 로컬라이제이션 · 법정 보고 주기. analyst / critic / planner 필수, 모든 consultant 배선. | 모든 consultant + analyst / critic / planner |
| **🤝 모듈 Consultation (회의 · 위임)** | `sap-analyst` / `sap-critic` / `sap-planner` / `sap-architect`는 모듈 비즈니스 판단이 필요할 때 `## Module Consultation Needed` 블록으로 `sap-{module}-consultant`에 위임. 시스템 레벨 이슈는 `sap-bc-consultant`. 일반 SAP 지식으로 추측 금지. | analyst / critic / planner / architect |

## 요구사항

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP ECC](https://img.shields.io/badge/SAP-ECC_6.0-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA Cloud](https://img.shields.io/badge/SAP-S%2F4HANA_Cloud-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-자동_설치-FF6600)

| 요구사항 | 상세 |
|----------|------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI 설치 (Max/Pro 구독 또는 API 키) |
| **SAP 시스템** | **SAP ECC 6.0** / **S/4HANA On-Premise** / **S/4HANA Cloud (Public & Private)** — ADT 활성화 |

> **MCP 서버** ([abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup))는 `/sc4sap:setup` 실행 시 **자동 설치 및 구성**됩니다 — 수동 사전 설치가 필요 없습니다.

## 설치

> **안내** — sc4sap는 **아직 Claude Code 공식 플러그인 마켓플레이스에 등록되어 있지 않습니다**. 당분간은 이 저장소를 커스텀 마켓플레이스로 등록한 뒤 플러그인을 설치해야 합니다.

### 방법 A — 커스텀 마켓플레이스로 등록 (권장)

Claude Code 세션 안에서 다음을 실행합니다:

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
/plugin install sc4sap
```

추후 업데이트:

```
/plugin marketplace update babamba2/superclaude-for-sap
/plugin install sc4sap
```

### 방법 B — 소스에서 설치

```bash
git clone https://github.com/babamba2/superclaude-for-sap.git
cd superclaude-for-sap
npm install && npm run build
```

이후 `/plugin marketplace add <로컬-경로>`로 로컬 플러그인 디렉터리를 지정합니다.

## 설정

```bash
# 설정 마법사 — 한 번에 하나씩 질문합니다
/sc4sap:setup
```

### 서브커맨드

```bash
/sc4sap:setup                # 전체 마법사 (기본값)
/sc4sap:setup doctor         # /sc4sap:sap-doctor로 라우팅
/sc4sap:setup mcp            # /sc4sap:mcp-setup로 라우팅
/sc4sap:setup spro           # SPRO 컨피그 자동 추출만 실행
/sc4sap:setup customizations # Z*/Y* enhancement + extension 인벤토리만 실행
```

### 마법사 절차

마법사는 **한 번에 하나의 질문만** 던집니다 — 모든 질문을 한꺼번에 묻지 않습니다. `.sc4sap/sap.env` / `.sc4sap/config.json`에 기존 값이 있으면 현재 값을 보여주고 Enter로 유지할 수 있습니다.

| # | 단계 | 내용 |
|---|------|------|
| 1 | **버전 확인** | Claude Code 버전 호환성 검증 |
| 2 | **SAP 시스템 버전 + 산업(Industry)** | (a) `S4` (S/4HANA — BP, MATDOC, ACDOCA, Fiori, CDS) 또는 `ECC` (ECC 6.0 — XK01/XD01, MKPF/MSEG, BKPF/BSEG) 선택. (b) **ABAP Release** 입력 (예: `750`, `756`, `758`). (c) **산업 선택** — 15 옵션 메뉴(리테일 / 패션 / 화장품 / 타이어 / 자동차 / 제약 / 식음료 / 화학 / 전자 / 건설 / 철강 / 유틸리티 / 금융 / 공공 / 기타)에서 하나 선택 — consultant가 매칭되는 `industry/*.md` 로드. SPRO 테이블 / BAPI / TCode + ABAP 문법 범위 + 산업 특화 컨피그 패턴을 모두 결정 |
| 3 | **MCP 서버 설치** | `abap-mcp-adt-powerup`를 `<PLUGIN_ROOT>/vendor/abap-mcp-adt/`로 clone + build. 이미 설치된 경우 건너뜀 (`--update`로 갱신) |
| 4 | **SAP 연결 정보** | 필드별로 한 줄씩 질문 — `SAP_URL`, `SAP_CLIENT`, `SAP_AUTH_TYPE` (`basic` / `xsuaa`), `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_LANGUAGE`, `SAP_SYSTEM_TYPE` (`onprem` / `cloud`), `SAP_VERSION`, `ABAP_RELEASE`, `TLS_REJECT_UNAUTHORIZED` (개발 전용). `.sc4sap/sap.env`에 기록. L4 MCP 서버 블록리스트 변수(`MCP_BLOCKLIST_PROFILE`, `MCP_BLOCKLIST_EXTEND`, `MCP_ALLOW_TABLE`)는 주석 예시로 기록됨 |
| 5 | **MCP 재연결** | `/mcp` 실행을 안내 — 새로 설치된 서버가 기동됨 |
| 6 | **연결 테스트** | `GetSession`으로 SAP 왕복 통신 확인 |
| 7 | **시스템 정보 확인** | System ID, 클라이언트, 유저 표시 |
| 8 | **ADT 권한 점검** | `GetInactiveObjects`로 ADT 접근 권한 검증 |
| 9 | **`ZMCP_ADT_UTILS` 생성** | 필수 유틸리티 Function Group (패키지 `$TMP`, 로컬 전용). `ZMCP_ADT_DISPATCH` (Screen / GUI Status 디스패처)와 `ZMCP_ADT_TEXTPOOL` (Text Pool 읽기/쓰기) 생성 — 둘 다 **RFC-enabled** 및 활성화. 이미 존재하면 생략 |
| 10 | **`config.json` 작성** | 플러그인 측 구성 (`sapVersion` + `abapRelease` — `sap.env`와 동기화) |
| 11 | **SPRO 추출 (선택)** | `y/N` 프롬프트 — 최초 추출은 토큰이 많이 들지만, 이후 `.sc4sap/spro-config.json` 캐시가 반복 개발의 토큰 비용을 크게 절감. 건너뛰어도 `configs/{MODULE}/*.md` 정적 참조로 정상 동작. `scripts/extract-spro.mjs`를 모듈별 병렬 실행 |
| 11b | **🆕 Customization 인벤토리 (선택)** | `y/N` 프롬프트 — 모듈별 `configs/{MODULE}/enhancements.md` 파싱 후 운영 SAP 에서 실제로 고객이 `Z*`/`Y*` 오브젝트로 구현한 표준 Exit 만 색인. `.sc4sap/customizations/{MODULE}/{enhancements,extensions}.json` 에 기록. 저장 규칙: BAdI 는 Z impl 이 존재할 때만, SMOD 는 Z CMOD 프로젝트가 포함할 때만, **GGB0 / GGB1 Substitution / Validation / Rule** (테이블 `GB03`, 모듈별 `APPLAREA` 기준 스코프), **BTE Publish/Subscribe + Process FM** (`TBE24` / `TPS34`, `APPL` 기준 스코프 — FI/CO/PS/TR/AA/PM/SD/HCM), Append Structure + Custom Field 는 별도의 `extensions.json`. `/sc4sap:create-program` (재사용 우선)과 `/sc4sap:analyze-symptom` (표준 Exit 역추적)이 소비 — 이를 통해 에이전트는 병렬 BAdI 를 새로 만드는 대신 기존 `ZGL0001` Substitution 이나 `Z_BTE_1025_*` subscriber FM 의 확장을 권장한다. `scripts/extract-customizations.mjs` 를 모듈별 병렬 실행 |
| 12 | **🔒 블록리스트 훅 (필수)** | **(a)** 프로파일 선택 — `strict` (기본, 전체) / `standard` (PII + 인증 + HR + 거래 재무) / `minimal` (PII + 인증 + HR + Tax) / `custom` (`.sc4sap/blocklist-custom.txt` 사용자 목록). **(b)** `node scripts/install-hooks.mjs` (user-level) 또는 `--project` (project-level)로 설치. **(c)** BNKA 페이로드로 스모크 테스트, `permissionDecision: deny` 확인. **(d)** 최종 훅 엔트리 + extend/custom 파일 상태 출력. 이 단계가 성공해야 setup이 완료됨 |

> **두 개의 블록리스트 레이어는 별도 구성**
> - **L3 (12단계)** — Claude Code `PreToolUse` 훅, 프로파일은 `.sc4sap/config.json` → `blocklistProfile`. MCP 서버 종류와 무관하게 모든 Claude Code 세션에 적용.
> - **L4 (4단계, 선택)** — MCP 서버 내부 가드, 프로파일은 `sap.env` → `MCP_BLOCKLIST_PROFILE`. `abap-mcp-adt-powerup`에만 적용.
>
> 일반 권장: L3 `strict`, L4 `standard`. L3 변경은 `/sc4sap:setup` 재실행; L4 변경은 `/sc4sap:sap-option`.

### 설정 이후

- 건강 점검: `/sc4sap:sap-doctor`
- 자격증명 교체 / L4 블록리스트 조정: `/sc4sap:sap-option`
- SPRO 재추출: `/sc4sap:setup spro`

## 기능

### 25개 SAP 전문 에이전트

| 분류 | 에이전트 |
|------|----------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — 시스템 관리, 트랜스포트 관리, 진단 |
| **모듈 (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**위임 맵 (Module Consultation Protocol):**
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` 출력 → `sap-{module}-consultant` (비즈니스 의미) 또는 `sap-bc-consultant` (시스템 레벨)
- `sap-architect` → `## Consultation Needed` 출력 → Basis 이슈(트랜스포트 전략, 권한, 성능, 사이징, 시스템카피, 패치)는 `sap-bc-consultant`, 모듈 설계 질문은 `sap-{module}-consultant`
- `sap-analyst` / `sap-critic` / `sap-planner`는 추가로 **필수 Country Context** 블록으로 출력 전에 `country/<iso>.md`를 반드시 로드

### 18개 스킬

| 스킬 | 설명 |
|------|------|
| `sc4sap:setup` | 플러그인 설정 — `abap-mcp-adt-powerup` 자동 설치 + SPRO 컨피그 생성 + 블록리스트 훅 설치 |
| `sc4sap:mcp-setup` | MCP ABAP ADT 서버 독립 설치/재설정 가이드 |
| `sc4sap:sap-option` | `.sc4sap/sap.env` 값 조회/수정 (자격증명·RFC 백엔드·블록리스트 프로파일·화이트리스트) |
| `sc4sap:sap-doctor` | 플러그인 + MCP + SAP 연결 진단 (RFC 백엔드 포함 6 계층) |
| `sc4sap:create-object` | ABAP 오브젝트 생성 (하이브리드 모드 — 트랜스포트/패키지 확인 → 생성 → 활성화) |
| `sc4sap:create-program` | ABAP 프로그램 풀 파이프라인 — Main+Include, OOP/Procedural, ALV, Dynpro, Text Elements, ABAP Unit |
| `sc4sap:program-to-spec` | ABAP 프로그램을 기능/기술 명세서(Markdown / Excel)로 역공학 |
| `sc4sap:analyze-code` | ABAP 코드 분석 및 개선 (Clean ABAP / 성능 / 보안) |
| `sc4sap:analyze-cbo-obj` | **Customer Business Object (CBO) 인벤토리** — Z 패키지 스캔 → 빈번 사용 Z 테이블/FM/데이터 엘리먼트/클래스/구조체/테이블 타입을 카탈로그화 → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` 에 저장. `create-program`/`program-to-spec` 이 새 오브젝트 생성 대신 **기존 CBO 자산 재사용 우선** 하도록 유도 |
| `sc4sap:analyze-symptom` | SAP 운영 에러 단계별 증상 분석 (덤프, 로그, SAP Note 후보) |
| `sc4sap:autopilot` | 자율 실행 파이프라인 — 아이디어 → 활성화·테스트 완료 ABAP |
| `sc4sap:ralph` | 구문·활성화·유닛 테스트가 모두 통과할 때까지 자기수정 지속 루프 |
| `sc4sap:ralplan` | 합의 기반 기획 게이트 (analyst / architect / critic 수렴) |
| `sc4sap:deep-interview` | 구현 전 소크라테스식 요구사항 수집 |
| `sc4sap:team` | 병렬 에이전트 협업 실행 (네이티브 Claude Code 팀) |
| `sc4sap:release` | CTS 트랜스포트 릴리즈 워크플로우 (검증, 릴리즈, 임포트 모니터링) |

### MCP ABAP ADT 서버 — 고유 기능

sc4sap은 확장형 ADT MCP 서버인 **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)** (150+ 도구) 위에서 동작합니다. 일반적인 ADT MCP에서 지원하는 Class / Program / Table / CDS / Function Module CRUD 외에, **다른 MCP 서버들이 지원하지 않는 고전 Dynpro 아티팩트까지 전체 Read / Update / Create 커버리지**를 제공합니다:

| 아티팩트 | 조회 | 생성 | 수정 | 삭제 | 비고 |
|----------|------|------|------|------|------|
| **Screen (Dynpro)** | `GetScreen`, `ReadScreen`, `GetScreensList` | `CreateScreen` | `UpdateScreen` | `DeleteScreen` | Dynpro 헤더 + Flow Logic 풀 라운드트립을 MCP JSON으로 주고받음 (대문자 `HEADER` / `FLOW_LOGIC` / `LINE` 키) |
| **GUI Status** | `GetGuiStatus`, `ReadGuiStatus`, `GetGuiStatusList` | `CreateGuiStatus` | `UpdateGuiStatus` | `DeleteGuiStatus` | 메뉴바, 펑션키, 애플리케이션 툴바를 프로그래매틱 생성/수정 |
| **Text Element** | `GetTextElement` | `CreateTextElement` | `UpdateTextElement` | `DeleteTextElement` | Text Symbol, Selection Text, List Heading — Text Element 강제 규칙에 필수 |
| **Includes** | `GetInclude`, `GetIncludesList` | `CreateInclude` | `UpdateInclude` | `DeleteInclude` | Main+Include 규약에 사용 |
| **Local defs/macros/tests/types** | `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes` | — | `UpdateLocalDefinitions`, `UpdateLocalMacros`, `UpdateLocalTestClass`, `UpdateLocalTypes` | `DeleteLocal*` | 프로그램 내부 로컬 섹션을 독립적으로 편집 |
| **Metadata Extension (CDS)** | `GetMetadataExtension` | `CreateMetadataExtension` | `UpdateMetadataExtension` | `DeleteMetadataExtension` | CDS 위 Fiori/UI 어노테이션 레이어링 |
| **Behavior Definition / Implementation (RAP)** | `Get/Read BehaviorDefinition`, `Get/Read BehaviorImplementation` | `Create*` | `Update*` | `Delete*` | RAP BDEF + BHV 전체 사이클 |
| **Service Definition / Binding** | `Get/Read ServiceDefinition`, `Get/Read ServiceBinding`, `ListServiceBindingTypes`, `ValidateServiceBinding` | `Create*` | `Update*` | `Delete*` | OData V2/V4 노출 및 검증 |
| **Enhancements / BAdI** | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` | — | — | — | 확장 포인트 탐색 |
| **런타임 & 프로파일링** | `RuntimeListDumps`, `RuntimeAnalyzeDump`, `RuntimeGetDumpById`, `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`, `RuntimeCreateProfilerTraceParameters`, `RuntimeRunProgramWithProfiling`, `RuntimeRunClassWithProfiling` | — | — | — | ST22 덤프 분석 + SAT 스타일 프로파일링을 Claude 내부에서 수행 |
| **의미 분석 / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetAdtTypes`, `GetTypeInfo`, `GetWhereUsed` | — | — | — | 단순 문법검사보다 풍부한 분석 |
| **Unit Test (ABAP + CDS)** | `GetUnitTest`, `GetUnitTestResult`, `GetUnitTestStatus`, `GetCdsUnitTest`, `GetCdsUnitTestResult`, `GetCdsUnitTestStatus` | `CreateUnitTest`, `CreateCdsUnitTest` | `UpdateUnitTest`, `UpdateCdsUnitTest` | `DeleteUnitTest`, `DeleteCdsUnitTest` | ABAP Unit과 CDS 테스트 프레임워크 모두 지원 |
| **트랜스포트** | `GetTransport`, `ListTransports` | `CreateTransport` | — | — | 트랜스포트 라이프사이클 전체를 MCP에서 |

특히 Dynpro / GUI Status / Text Element CRUD 덕분에 `sc4sap:create-program`의 **고전 UI 파이프라인(ALV + Docking + Selection Screen)을 AI가 엔드투엔드로 자동 구성**할 수 있습니다 — 대부분의 ADT MCP 서버에서는 불가능한 시나리오입니다.

### 공통 규약 (`common/`)

스킬과 에이전트가 동일한 기준을 따르도록 공통 규칙을 `common/` 폴더에 모았습니다. `CLAUDE.md`는 이 파일들을 참조하는 **얇은 인덱스**로 재작성되어 중복이 제거됐습니다.

| 파일 | 내용 |
|------|------|
| `common/clean-code.md` | **통합 Clean ABAP 표준** — 네이밍 · 제어 흐름 · Open SQL · 모듈화 · 테스팅 · 성능 · 보안 · 릴리스 인식 + self-check 체크리스트 |
| `common/include-structure.md` | Main 프로그램 + 조건부 Include (t/s/c/a/o/i/e/f/_tst) |
| `common/oop-pattern.md` | 2-class OOP 분리 (`LCL_DATA` + `LCL_ALV` + 옵션 `LCL_EVENT`) |
| `common/alv-rules.md` | Full ALV (CL_GUI_ALV_GRID + Docking) vs SALV + SALV 팩토리 필드카탈로그 |
| `common/text-element-rule.md` | Text Element 강제 — 하드코딩 리터럴 금지 |
| `common/constant-rule.md` | 필드카탈로그 외 매직 리터럴은 `CONSTANTS` 필수 |
| `common/procedural-form-naming.md` | ALV 관련 Procedural FORM은 `_{screen_no}` 접미사 |
| `common/naming-conventions.md` | 프로그램/Include/LCL/Screen/GUI Status 공통 네이밍 |
| `common/sap-version-reference.md` | ECC vs S/4HANA 차이 (테이블·TCode·BAPI·패턴) |
| `common/abap-release-reference.md` | ABAP 릴리스별 문법 가용성 (인라인 선언·Open SQL 식·RAP 등) |
| `common/spro-lookup.md` | SPRO 조회 우선순위 — 로컬 캐시 → 정적 문서 → MCP |
| `common/data-extraction-policy.md` | 차단 대상 테이블에 대한 에이전트 거부 프로토콜 + **`acknowledge_risk` HARD RULE** (요청별 명시적 승인 필수) |

### 산업 레퍼런스 (`industry/`)

모든 `sap-*-consultant`가 컨피그 분석·Fit-Gap·마스터데이터 결정 전에 참조. 각 파일 구성: **Business Characteristics / Key Processes / Master Data Specifics / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls**.

| 파일 | 산업 |
|------|------|
| `industry/retail.md` | 리테일 (Article, Site, POS, Assortment) |
| `industry/fashion.md` | 패션/어패럴 (Style × Color × Size, AFS/FMS) |
| `industry/cosmetics.md` | 화장품 (Batch, Shelf Life, Channel Pricing) |
| `industry/tire.md` | 타이어 (OE/RE, Mixed Mfg, Mold, Recall) |
| `industry/automotive.md` | 자동차 (JIT/JIS, Scheduling Agreement, PPAP) |
| `industry/pharmaceutical.md` | 제약 (GMP, Serialization, Batch Status) |
| `industry/food-beverage.md` | 식음료 (Catch Weight, FEFO, TPM) |
| `industry/chemical.md` | 화학 (Process, DG, Formula Pricing) |
| `industry/electronics.md` | 전자/하이테크 (VC / AVC, Serial, RMA) |
| `industry/construction.md` | 건설 (PS, POC Billing, Subcontracting) |
| `industry/steel.md` | 철강/금속 (Characteristic-based inventory, Coil, Heat) |
| `industry/utilities.md` | 유틸리티 (IS-U, FI-CA, Device Mgmt) |
| `industry/banking.md` | 금융 (FS-CD, FS-BP, Parallel Ledger) |
| `industry/public-sector.md` | 공공부문 (Funds Mgmt, Grants Mgmt) |

### 국가 / 로컬라이제이션 레퍼런스 (`country/`)

모든 consultant + **analyst / critic / planner 필수**. 각 파일 구성: **포맷(날짜 / 숫자 / 통화 / 전화 / 우편번호 / 타임존) / 언어 & 로케일 / 세제 / e-Invoicing & 법정보고 / 은행 & 결제 / 마스터데이터 특이사항 / 법정보고 / SAP Country Version / 자주 있는 커스터마이징 / Pitfalls**.

| 파일 | 국가 | 핵심 특성 |
|------|------|-----------|
| `country/kr.md` | 🇰🇷 Korea | e-세금계산서 (NTS), 사업자등록번호, 주민번호 PII 규제 |
| `country/jp.md` | 🇯🇵 Japan | 적격청구서(2023+), Zengin, 法人番号 |
| `country/cn.md` | 🇨🇳 China | Golden Tax, 发票 / e-fapiao, 统一社会信用代码, SAFE FX |
| `country/us.md` | 🇺🇸 USA | Sales & Use Tax (VAT 아님), EIN, 1099, ACH, Nexus |
| `country/de.md` | 🇩🇪 Germany | USt, ELSTER, DATEV, XRechnung / ZUGFeRD, SEPA |
| `country/gb.md` | 🇬🇧 UK | VAT + MTD, BACS / FPS / CHAPS, Brexit 후 GB vs XI |
| `country/fr.md` | 🇫🇷 France | TVA, FEC, Factur-X 2026, SIREN / SIRET |
| `country/it.md` | 🇮🇹 Italy | IVA, FatturaPA / SDI (2019+ 필수), Split Payment |
| `country/es.md` | 🇪🇸 Spain | IVA, SII (실시간 4일), TicketBAI, Confirming |
| `country/nl.md` | 🇳🇱 Netherlands | BTW, KvK, Peppol, XAF, G-rekening |
| `country/br.md` | 🇧🇷 Brazil | NF-e, SPED, CFOP, ICMS/IPI/PIS/COFINS, Boleto / PIX |
| `country/mx.md` | 🇲🇽 Mexico | CFDI 4.0, SAT, Complementos, Carta Porte, SPEI |
| `country/in.md` | 🇮🇳 India | GST, IRN e-invoice, e-Way Bill, TDS |
| `country/au.md` | 🇦🇺 Australia | GST, ABN, STP Phase 2, BAS, BSB |
| `country/sg.md` | 🇸🇬 Singapore | GST 9%, UEN, InvoiceNow (Peppol), PayNow |
| `country/eu-common.md` | 🇪🇺 EU 공통 | 국가별 VAT ID 포맷 (VIES), INTRASTAT, ESL, OSS/IOSS, SEPA, GDPR |

`.sc4sap/config.json` → `country` (또는 `sap.env` → `SAP_COUNTRY`, ISO alpha-2 소문자)로 국가 식별. Multi-country 롤아웃은 모든 관련 파일 로드 + 크로스 컨트리 포인트(intra-EU VAT, 법인 간, 이전가격, 원천징수) 부각.

### SAP 플랫폼 인식 (ECC / S4 On-Prem / Cloud)

`sc4sap:create-program`은 모든 단계 전에 **SAP Version Preflight**를 실행합니다. `.sc4sap/config.json`의 `sapVersion`(ECC / S4 On-Prem / S/4HANA Cloud Public / Private)과 `abapRelease`를 확인하고 분기:

- **ECC** — RAP/ACDOCA/BP 불가, 릴리스별 문법 제한 (인라인 선언 <740, CDS <750 등)
- **S/4HANA On-Premise** — 고전 Dynpro 기술적으로 가능하지만 경고, 확장성 우선, 재무는 MATDOC · ACDOCA
- **S/4HANA Cloud (Public)** — **고전 Dynpro 금지**. RAP + Fiori Elements / `if_oo_adt_classrun` / SALV-only로 자동 리다이렉트. 금지 구문 + Cloud 대체 API 전체 목록: `skills/create-program/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — CDS + AMDP + RAP 우선, Business Partner API

### SPRO 컨피그 참조

13개 SAP 모듈 전체에 대한 내장 참조 데이터:

```
configs/{MODULE}/
  ├── spro.md         # SPRO 설정 테이블/뷰
  ├── tcodes.md       # 트랜잭션 코드
  ├── bapi.md         # BAPI/FM 참조
  ├── tables.md       # 주요 테이블
  ├── enhancements.md # BAdI / User Exit / BTE / VOFM
  └── workflows.md    # 개발 워크플로우
configs/common/       # 공통 참조 (IDOC, Factory Calendar, DD* 테이블 등)
```

**모듈**: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW

### SPRO 로컬 캐시 (토큰 절약)

`/sc4sap:setup spro`는 운영 S/4HANA에서 고객사 SPRO 커스터마이징을 `.sc4sap/spro-config.json`에 추출합니다. 모든 consultant 에이전트는 `common/spro-lookup.md` 우선순위를 따릅니다:

1. **Priority 1 — 로컬 캐시** (`.sc4sap/spro-config.json` → `modules.{MODULE}`) — MCP 호출 없음
2. **Priority 2 — 정적 참조** (`configs/{MODULE}/*.md`)
3. **Priority 3 — 실시간 MCP 조회** — 사용자 컨펌 + 토큰 비용 안내 후에만

한 번 추출해두면 이후 모든 세션에서 토큰이 크게 절감됩니다.

### SAP 특화 훅

- **SPRO 자동 주입** — Haiku LLM이 사용자 입력을 분류하여 관련 모듈 SPRO 컨피그를 자동 주입
- **트랜스포트 검증** — MCP ABAP Create/Update 전 트랜스포트 존재 여부 확인
- **자동 활성화** — 오브젝트 생성/수정 후 ABAP 활성화 자동 트리거
- **구문 검사** — ABAP 에러 발생 시 시맨틱 분석 자동 실행
- **🔒 데이터 추출 차단 리스트** — 민감 테이블 행 조회를 `PreToolUse` 훅이 차단 (아래 참조)

### 🔒 데이터 추출 차단 리스트

민감 테이블(개인정보, 인증, 급여, 은행, 거래 재무)의 행 데이터가 `GetTableContents` / `GetSqlQuery`로 추출되는 것을 막는 필수 다계층 방어 체계입니다. sc4sap 에이전트 호출, 사용자 직접 입력, 같은 세션의 다른 플러그인 모두에 적용됩니다.

**4계층 방어**:

| 계층 | 위치 | 역할 |
|------|------|------|
| L1 — 에이전트 지시문 | `common/data-extraction-policy.md`, consultant agents | 차단 대상 조회 시 카테고리 + 이유 + 대안을 안내하며 거부 |
| L2 — 전역 지시 | `CLAUDE.md` "Data Extraction Policy" 블록 | 모든 Claude 세션(직접 프롬프트 포함)에 기본 로드 |
| L3 — Claude Code 훅 | `scripts/hooks/block-forbidden-tables.mjs` (`PreToolUse`) | MCP 호출을 가로채 `deny` 반환 (프로그래매틱 차단) |
| L4 — MCP 서버 (opt-in) | `abap-mcp-adt-powerup` 소스 (`src/lib/policy/blocklist.ts`) | 호출 주체와 무관하게 MCP 서버 내부에서 하드 차단 — `SC4SAP_POLICY=on` 환경변수로 활성화 |

**차단 목록 소스**: `exceptions/table_exception.md`는 **인덱스**이며, 실제 테이블 리스트는 **11개 섹션별 파일**로 분리되어 있어 파일마다 짧고 grep하기 쉽습니다. 훅은 인덱스를 제외한 폴더 내 모든 `*.md`를 자동 스캔합니다.

| Tier | 파일 | 포함 |
|------|------|------|
| minimal | `banking-payment.md` | 은행 / 지급 인증(BNKA, KNBK, LFBK, REGUH, PAYR, CCARD, FPAYH…) |
| minimal | `master-data-pii.md` | Customer / Vendor / BP 마스터 PII (KNA1, LFA1, BUT000, BUT0ID, KNVK…) + 관련 CDS 뷰 (I_Customer, I_Supplier, I_BusinessPartner, I_Employee…) |
| minimal | `addresses-communication.md` | ADR* (주소·이메일·전화·팩스) + CDS (I_Address, I_AddressEmailAddress…) |
| minimal | `auth-security.md` | USR02 패스워드 해시, RFCDES, AGR_1251, SSF_PSE_D + CDS (I_User, I_UserAuthorization…) |
| minimal | `hr-payroll.md` | PA* / HRP* / PCL* 인포타입 & 클러스터 (급여·의료·부양가족 등) |
| minimal | `tax-government-ids.md` | KNAS, LFAS, BUT0TX, Brazil J_1B*, BP 세금 번호 |
| minimal | **`pricing-conditions.md`** | **가격 / 조건 / 리베이트** — KONH, KONP, KONV, KONA, KOTE*, `PRCD_ELEMENT`, `PRCD_COND_HEAD`, `PRCD_COND`, `A###` (A001–A999 접근 테이블) + 가격 CDS (I_PriceCondition, I_PricingProcedure, I_RebateAgreement, I_SalesOrderItemPrice…). **최상위 상업적 리스크** — 유출 시 고객별 할인율 / 마진 노출 |
| minimal | `custom-patterns.md` | PII 성격의 `Z*` / `Y*`, ZHR_*, ZPA_*, ZCUST_*, ZVEND_*, ZKNA_* |
| standard | `protected-business-data.md` | VBAK / BKPF / ACDOCA / VBRK / EKKO / CDHDR / STXH + 거래성 CDS (I_JournalEntry, I_SalesOrder, I_BillingDocument, I_PurchaseOrder, I_Payable, I_Receivable…) |
| strict | `audit-security-logs.md` | BALDAT, SLG1, RSAU_BUF_DATA, SNAP, DBTABLOG |
| strict | `communication-workflow.md` | SAPoffice (SOOD, SOC3), 워크플로우 (SWWWIHEAD, SWWCONT), 브로드캐스트 |

**패턴 문법** — 정확한 이름, `TABLE*` 와일드카드, `TABLExxx` 레거시 와일드카드, `A###` (신규: `#` = 1자리 숫자, `A###`로 A001–A999만 정확히 매칭).

### 🚫 `acknowledge_risk` — HARD RULE

`GetTableContents` / `GetSqlQuery`는 `acknowledge_risk: true` 파라미터로 MCP 서버의 `ask` 게이트를 우회할 수 있습니다. **이 플래그는 편의 플래그가 아니라 감사 경계입니다** — stderr에 로깅되며 사용자가 요청별로 승인을 부여했음을 증명합니다. Agent는 예외 없이 다음 규칙을 따라야 합니다:

1. **첫 호출에 `acknowledge_risk: true` 금지.** 훅 / 서버가 먼저 게이트하도록 둡니다.
2. **`ask` 응답을 받으면 즉시 중단** — 재시도 금지. 사용자에게 거부 사유를 공개합니다.
3. **테이블과 범위를 명시하며 yes/no 질문**을 던집니다.
4. **사용자가 명시적 승인 키워드**를 줄 때만 `acknowledge_risk: true`로 재시도: `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `go ahead` / `confirmed`.
5. **모호한 명령은 승인이 아닙니다** — `"pull it"`, `"try it"`, `"뽑아봐"`, `"가져와봐"`, `"해봐"`, `"my mistake"`, 침묵 포함.
6. **per-call · per-table · per-session.** 이전 승인은 다음 요청에 이월되지 않습니다.

전체 프로토콜: `common/data-extraction-policy.md` → "The `acknowledge_risk` Parameter — HARD RULE".

**2가지 액션 — `deny` vs `warn`**:

- **`deny`** (기본값) — 호출이 즉시 차단되며 SAP에 전송되지 않습니다. 에이전트가 카테고리·이유·대안을 사용자에게 설명합니다.
- **`warn`** — 호출은 진행하되, 응답 앞에 `⚠️ sc4sap blocklist WARNING` 블록이 테이블·카테고리·권장 대안과 함께 붙어 반환됩니다. 업무상 일상적으로 접근하는 카테고리에 적합합니다.

`warn` 기본 카테고리: **Protected Business Data** (VBAK/BKPF/ACDOCA 등)와 **Customer-Specific PII Patterns** (`Z*` 테이블). 그 외는 모두 `deny`. 한 호출이 하나라도 `deny` 테이블을 포함하면 전체가 차단됩니다 (`deny`가 우선).

**프로파일 선택** — `/sc4sap:setup` 시 하나를 반드시 선택:

| 프로파일 | 차단 범위 |
|----------|-----------|
| `strict` (기본 권장) | PII + 인증 + HR + 거래 재무 + 감사 로그 + 워크플로우 |
| `standard` | PII + 인증 + HR + 거래 재무 |
| `minimal` | PII + 인증 + HR + Tax (일반 비즈니스 테이블 허용) |
| `custom` | 내장 목록 무시, `.sc4sap/blocklist-custom.txt` 만 사용 |

모든 프로파일은 `.sc4sap/blocklist-extend.txt`(한 줄에 테이블명/패턴 하나)에 있는 추가 항목도 함께 적용합니다.

**설치** — `/sc4sap:setup`이 **필수 단계로 자동 설치**합니다. 수동 설치:

```bash
node scripts/install-hooks.mjs            # 사용자 레벨 (~/.claude/settings.json)
node scripts/install-hooks.mjs --project  # 프로젝트 레벨 (.claude/settings.json)
node scripts/install-hooks.mjs --uninstall
```

**검증**:

```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# 기대 결과: "permissionDecision":"deny" 를 포함한 JSON
```

차단 대상 테이블이라도 스키마/DDIC 메타데이터(`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`), 존재 확인(`SearchObject`), `GetSqlQuery`를 통한 COUNT/SUM 집계는 허용됩니다. 일회성 예외는 `.sc4sap/data-access-approval-{YYYYMMDD}.md` 파일로 문서화합니다.

**L4 서버측 강제** (직접 JSON-RPC, 다른 LLM, 외부 스크립트 등 모든 호출자 차단):

```bash
# mcp-abap-adt-powerup 시작 시 환경변수로 활성화
export SC4SAP_POLICY=on                    # 또는 strict | standard | minimal | custom
export SC4SAP_POLICY_PROFILE=strict        # 선택 (SC4SAP_POLICY=on일 때 기본값)
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md  # 선택 (추가 목록)
export SC4SAP_ALLOW_TABLE=TAB1,TAB2        # 세션 한정 긴급 예외 (로그 기록)
```

차단된 테이블 호출 시 MCP 서버가 `isError: true`와 카테고리 별 이유를 반환하며, SAP 시스템에는 요청이 전송되지 않습니다.

### 🔀 RFC 백엔드 선택

Screen / GUI Status / Text Element 작업은 SAP 의 RFC FM 을 경유합니다. sc4sap 은 **4 가지 전송 백엔드** 를 제공 — 환경에 맞는 하나 선택:

| `SAP_RFC_BACKEND` | SAP 호출 방식 | 언제 |
|---|---|---|
| `soap` (기본) | HTTPS `/sap/bc/soap/rfc` | 대부분의 환경 — ICF 노드만 활성이면 즉시 동작 |
| `native` | `node-rfc` + NW RFC SDK 직접 RFC | 파워 유저, 최저 지연, 랩탑마다 SDK 필요 |
| `gateway` | sc4sap-rfc-gateway 미들웨어로 HTTPS | 10명+ 팀, 중앙집중식 배포 |
| 🆕 `odata` | OData v2 서비스 `ZMCP_ADT_SRV` | **v0.2.4 신규** — 회사가 `/sap/bc/soap/rfc` 는 막고 OData Gateway 만 허용할 때. `ZMCP_ADT_SRV` 서비스 일회성 Basis 등록 필요. 등록부터 클라이언트 스위칭까지 엔드투엔드 가이드: [`docs/odata-backend.md`](docs/odata-backend.md) |

`/sc4sap:sap-option` 으로 언제든 백엔드 전환, MCP 재연결, `/sc4sap:sap-doctor` 로 검증.

### 🏢 RFC Gateway (기업 배포용)

SAP 개발자 수십 명 규모의 팀을 위해, sc4sap 은 **중앙 RFC Gateway 미들웨어** 배포 방식을 지원합니다. 개발자 노트북에는 SAP NW RFC SDK, MSVC 빌드 도구, S-user SDK 다운로드가 전혀 필요 없습니다. Linux 서버 한 대가 `node-rfc` + SDK 를 운영하고, 모든 MCP 클라이언트는 HTTPS/JSON 으로 이 서버와만 통신합니다.

이런 상황에서 유용:

- 회사 IT 정책이 개발자 머신의 SAP NW RFC SDK 설치를 금지
- SAP Basis 팀이 `/sap/bc/soap/rfc` ICF 노드를 전사적으로 비활성화
- 중앙 집중식 RFC 로깅, 속도 제한, 개발자별 감사 추적이 필요한 경우

각 개발자 노트북에서의 설정:

```
/sc4sap:sap-option
# SAP_RFC_BACKEND=gateway
# SAP_RFC_GATEWAY_URL=https://rfc-gw.company.com
# SAP_RFC_GATEWAY_TOKEN=<팀/개인별 Bearer>
```

Gateway 는 개발자의 SAP 자격증명을 매 요청마다 `X-SAP-*` 헤더로 전달하므로, SAP audit log 에는 **공유 서비스 계정이 아닌 실제 개발자 user 가 그대로 기록**됩니다.

> **비공개 저장소 양해 부탁드립니다.** Gateway 는 SAP 라이선스 NW RFC SDK 를 기반으로 Docker 이미지를 빌드해야 하는데, SDK 재배포가 금지되어 있어 소스 저장소를 **private** 으로 관리합니다. 조직 단위 배포가 필요한 경우 메인테이너에게 연락하여 접근 권한을 받은 뒤, 직접 SDK 를 다운로드(S-user 필요)하고 사내 네트워크에서 이미지를 빌드하는 흐름입니다. 개인 사용자는 기본값 `SAP_RFC_BACKEND=soap` 으로 충분하며, Gateway 는 불필요합니다.

클라이언트 측 구현(`abap-mcp-adt-powerup/src/lib/gatewayRfc.ts`)은 공개되어 있으며, HTTP 계약이 문서화되어 있어 Java / Python / Go 등 다른 언어로도 호환 Gateway 구현이 가능합니다. 저장소 접근 또는 대안 구현에 대한 논의는 메인테이너에게 문의 바랍니다.

## 스킬별 예시 및 동작 방식

각 스킬의 한 줄 호출 예시, 실제 프롬프트 예시, 내부 동작 흐름을 정리했습니다. 스크린샷은 추후 업데이트 예정입니다.

### `/sc4sap:setup`

최초 1회 온보딩: MCP ABAP ADT 서버 설치, SPRO 캐시 추출, 데이터 추출 차단 훅 설치.

```
/sc4sap:setup
```

**동작** — 연결 테스트 → SAP 버전 자동 감지 (ECC / S4 On-Prem / Cloud) → 모듈별 SPRO 추출 → 차단 프로파일 선택 (`strict` / `standard` / `minimal` / `custom`) → `settings.json`에 훅 등록.

> _스크린샷 자리 — 셋업 마법사_

---

### `/sc4sap:create-object`

하이브리드 모드 단일 오브젝트 생성: 트랜스포트 + 패키지를 대화형으로 확인한 뒤 생성 → 초기 코드 작성 → 활성화.

```
/sc4sap:create-object
→ "ZCL_SD_ORDER_VALIDATOR 클래스를 ZSD_ORDER 패키지에 만들어줘"
```

**동작** — 타입 추론 (Class / Interface / Program / FM / Table / Structure / Data Element / Domain / CDS / Service Def / Service Binding) → 패키지·트랜스포트 확인 → MCP `Create*` → 초기 구현 작성 → `GetAbapSemanticAnalysis` → 활성화.

> _스크린샷 자리 — 생성 확인 및 활성화_

---

### `/sc4sap:create-program`

Main + Include 구조, OOP/Procedural, 전체 ALV + Dynpro를 지원하는 플래그십 프로그램 생성 파이프라인.

```
/sc4sap:create-program
→ "미결 판매 오더 ALV 리포트 — 영업조직 + 기간 선택화면으로"
```

**동작** — SAP 버전 Preflight (`.sc4sap/config.json`) → 소크라테스식 인터뷰 → 플래너 스펙 → 사용자 확인 → executor가 Main + 조건부 Include (t/s/c/a/o/i/e/f/_tst) + Screen + GUI Status + Text Element 작성 → qa-tester가 ABAP Unit 작성 → code-reviewer 게이트 → 활성화. 플랫폼별 분기 (ECC / S4 On-Prem / Cloud Public은 고전 Dynpro 금지 → `if_oo_adt_classrun` / SALV / RAP로 자동 리다이렉트).

> _스크린샷 자리 — 파이프라인 + ALV 결과_

---

### `/sc4sap:analyze-code`

기존 ABAP 오브젝트를 MCP로 읽어 `sap-code-reviewer`가 Clean ABAP + 성능 + 보안 기준으로 분류된 findings와 개선안을 반환.

```
/sc4sap:analyze-code
→ "ZCL_SD_ORDER_VALIDATOR의 Clean ABAP 위반과 SELECT * 검토"
```

**동작** — `ReadClass` / `GetProgFullCode` → `GetAbapSemanticAnalysis` + `GetWhereUsed` → sap-code-reviewer 분석 → 카테고리별 리포트 (Clean ABAP / 성능 / 보안 / SAP 표준) → 선택적 자동 수정 루프.

> _스크린샷 자리 — 리뷰 결과 테이블_

---

### `/sc4sap:analyze-cbo-obj`

Customer Business Object (CBO) 인벤토리 스캐너. Z 패키지를 훑어 재사용 가능한 Z 테이블 / FM / 데이터 엘리먼트 / 클래스 / 구조체 / 테이블 타입을 카탈로그화하고 저장 → 이후 제너레이터 (`create-program`, `program-to-spec`) 가 **신규 생성 대신 재사용**을 기본 동작으로 선택.

```
/sc4sap:analyze-cbo-obj
→ "ZSD_ORDER 패키지를 MM 모듈 재사용 후보로 스캔"
```

**동작** — 대상 Z 패키지에 `GetPackageTree` → CBO 카테고리별 `GetObjectsByType` → 빈도 + 용도 휴리스틱 → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` 저장. `create-program` / `program-to-spec` 이 기획 시점에 이 JSON 을 로드하고 `Create*` 전에 **reuse-first** 게이트를 적용.

수백 개의 기존 Z 오브젝트가 있는 브라운필드에 이상적. 패키지당 1회 실행, 이후 수 주간 다운스트림 작업에서 계속 재활용.

> _스크린샷 자리 — CBO 인벤토리 출력_

---

### `/sc4sap:analyze-symptom`

런타임/운영 에러 단계별 조사: 덤프, 로그, SAP Note 후보.

```
/sc4sap:analyze-symptom
→ "F110 실행 중 ZFI_POSTING 234라인에서 MESSAGE_TYPE_X 덤프"
```

**동작** — `RuntimeListDumps` / `RuntimeGetDumpById` / `RuntimeAnalyzeDump` → 스택 파싱 → SAP Note 후보 검색 → 근본 원인 가설 → 조치 옵션 (컨피그 / 코드 / 사용자 조치).

> _스크린샷 자리 — 덤프 분석 + Note 후보_

---

### `/sc4sap:program-to-spec`

기존 ABAP 프로그램을 기능/기술 명세서 (Markdown 또는 Excel)로 역공학. 소크라테스식 범위 좁히기로 "전부 문서화" 비대화를 방지.

```
/sc4sap:program-to-spec
→ "ZSD_ORDER_RELEASE 스펙 — 승인 로직과 BAdI 후킹 중심으로"
```

**동작** — 범위 좁히기 Q&A → `GetProgFullCode` / `ReadClass` / includes 워크 → `GetWhereUsed` + `GetEnhancements` → 구조화된 스펙 (목적 / 선택화면 / 데이터 흐름 / API / Enhancement / 권한) → Markdown 또는 Excel 산출물.

> _스크린샷 자리 — 생성된 스펙 산출물_

---

### `/sc4sap:autopilot`

모호한 아이디어에서 활성화·테스트 완료된 ABAP 오브젝트까지 전체 자율 파이프라인 — `deep-interview` → `ralplan` → 에이전트 파이프라인 → `ralph` 루프.

```
/sc4sap:autopilot
→ "거래처 지급 승인 워크플로우를 커스텀으로 만들어줘"
```

**동작** — deep-interview로 범위 확정 → ralplan 합의 플랜 → sap-planner WRICEF 분해 → sap-executor 오브젝트 생성 → sap-qa-tester 단위테스트 → sap-code-reviewer 게이트 → ralph 루프로 녹색될 때까지 재시도.

> _스크린샷 자리 — 오토파일럿 진행 스트림_

---

### `/sc4sap:ralph`

자가교정 지속 루프: 문법 Clean + 활성화 성공 + 단위테스트 통과 3종 세트가 되면 종료. "어쨌든 되게 해" 케이스에 투입.

```
/sc4sap:ralph
→ "ZMM_GR_POSTING과 포함 Include 전부 활성화 에러 해결"
```

**동작** — 반복: `GetAbapSemanticAnalysis` → 에러 식별 → `UpdateProgram` / `UpdateClass` / `UpdateInclude`로 수정 → 활성화 → 단위테스트 재실행 → 3종 통과 시 종료. 수동 개입 또는 최대 반복 도달 시 취소.

> _스크린샷 자리 — ralph 반복 로그_

---

### `/sc4sap:ralplan`

합의 기반 플래닝 게이트 — 여러 에이전트 관점 (analyst / architect / critic)이 코딩 전에 하나의 플랜으로 수렴. 오토파일럿이 엉뚱한 것을 만드는 상황을 방지.

```
/sc4sap:ralplan
→ "레거시 ZSD_ORDER_RELEASE를 RAP 기반 워크플로우로 재작성 계획"
```

**동작** — sap-analyst가 요구 추출 → sap-architect가 기술 설계 제안 → sap-critic이 반박 → 수렴 반복 → 승인된 플랜이 autopilot / team으로 전달.

> _스크린샷 자리 — ralplan 수렴 디프_

---

### `/sc4sap:deep-interview`

코드 작성 전 소크라테스식 요구사항 수집. 숨은 가정, 엣지케이스, 모듈 간 영향도를 끌어냄.

```
/sc4sap:deep-interview
→ "커스텀 여신 한도 체크가 필요해"
```

**동작** — 초기 의도 → 계층적 질문 (어느 모듈, 어떤 마스터, 타이밍, 에러 UX, 승인자) → 스펙 요약 → 사용자 확인.

> _스크린샷 자리 — 인터뷰 Q&A_

---

### `/sc4sap:team`

병렬 에이전트 협업 실행. 네이티브 Claude Code teams (인프로세스) 사용.

```
/sc4sap:team
→ "이 WRICEF 리스트를 워커 4명에 분배해서 병렬로 빌드"
```

**동작** — 공유 태스크 리스트 → N 워커가 작업 픽업 → 각자 create-object / program / ralph 실행 → 트랜스포트로 병합.

> _스크린샷 자리 — tmux 판 뷰 / 팀 대시보드_

---

### `/sc4sap:release`

CTS 트랜스포트 릴리즈 워크플로우 — 목록, 검증 (Inactive 없음·문법 에러 없음), 릴리즈, 다음 시스템 임포트 확인.

```
/sc4sap:release
→ "DEVK900123 트랜스포트 릴리즈"
```

**동작** — `GetTransport` → 검증 체크리스트 → STMS 릴리즈 → 임포트 상태 모니터링 → 임포트 후 스모크 체크.

> _스크린샷 자리 — 릴리즈 체크리스트_

---

### `/sc4sap:sap-doctor`

플러그인 + MCP + SAP 시스템 진단. 뭔가 이상할 때 가장 먼저 실행. (Claude Code 내장 `/doctor`와의 충돌을 피하기 위해 `doctor`에서 이름이 변경되었습니다.)

```
/sc4sap:sap-doctor
```

**동작** — 플러그인 설치 확인 → MCP 서버 핸드셰이크 → SAP RFC/ADT 연결 → SPRO 캐시 신선도 → 훅 등록 상태 → 차단 훅 활성 여부 → 조치 가능한 리포트.

> _스크린샷 자리 — 진단 리포트_

---

### `/sc4sap:mcp-setup`

`/sc4sap:setup`이 MCP 자동 설치를 건너뛴 경우 (예: 기존 글로벌 MCP 설정) `abap-mcp-adt-powerup`을 개별 설치·재구성하는 가이드.

```
/sc4sap:mcp-setup
```

### `/sc4sap:sap-option`

`.sc4sap/sap.env`에 기록된 값을 대화형으로 조회·수정합니다. SAP 접속 자격증명, TLS 설정, 그리고 행 추출 안전장치인 블록리스트 정책을 포함합니다. 화면 표시 시 비밀번호·시크릿은 자동으로 마스킹되며, 저장 전 Before/After diff를 미리 보여주고 `sap.env.bak` 백업을 남깁니다.

```
/sc4sap:sap-option
```

주요 사용 사례: `SAP_PASSWORD` 로테이션, `SAP_CLIENT` 변경, `MCP_BLOCKLIST_PROFILE` 전환 (`minimal` / `standard` / `strict` / `off`), 감사 로그가 남는 `MCP_ALLOW_TABLE` 예외 테이블 등록, `MCP_BLOCKLIST_EXTEND`에 사이트별 Z-테이블 추가. 저장 후에는 `/mcp` 재연결이 필요합니다.

## 기술 스택

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![MCP](https://img.shields.io/badge/MCP_SDK-Protocol-FF6600)

## Acknowledgments

이 프로젝트는 [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode) (**허예찬**) 플러그인에 감명을 받아 제작되었습니다. 멀티 에이전트 오케스트레이션 패턴, Socratic deep-interview 게이팅, ralph/autopilot 파이프라인, 전체 플러그인 철학 모두 해당 작업에서 영감을 얻었습니다. 깊이 감사드립니다 — sc4sap은 이 작업 없이는 지금의 모습일 수 없었습니다.

번들 MCP 서버(`abap-mcp-adt-powerup`)는 **fr0ster** 님의 [**mcp-abap-adt**](https://github.com/fr0ster/mcp-abap-adt) 프로젝트를 기반으로 합니다. 요청 포맷, 엔드포인트 커버리지, 객체 I/O 등 sc4sap의 모든 도구 호출이 의존하는 ADT-over-MCP의 토대를 그 프로젝트가 마련해 주었습니다. 정말 많은 도움이 되었습니다 — 선구적인 작업을 남겨주신 fr0ster 님께 진심으로 감사드립니다.

## 저자

- **백승현 (paek seunghyun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/seunghyun-paek-5b83b7183/)

## 기여자

- **김시훈 (Kim Sihun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sihun-kim-27737132b/)

## 라이선스

[MIT](LICENSE)
