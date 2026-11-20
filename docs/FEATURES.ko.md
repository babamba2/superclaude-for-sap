# 기능 상세

← [README로 돌아가기](../README.ko.md) · [설치 →](INSTALLATION.ko.md)

## 목차

- [27개 SAP 전문 에이전트](#27개-sap-전문-에이전트)
- [31개 스킬](#31개-스킬)
- [스킬 — 예시 & 워크플로우](#스킬--예시--워크플로우)
- [일반 채팅 라우팅](#일반-채팅-라우팅)
- [비용 모드 (standard / eco)](#비용-모드-standard--eco)
- [오프라인 프로필](#오프라인-프로필)
- [멀티 환경 프로필 (Dev / QA / Prod)](#-멀티-환경-프로필-dev--qa--prod)
- [MCP ABAP ADT 서버 — 고유 기능](#mcp-abap-adt-서버--고유-기능)
- [공통 규약 (`common/`)](#공통-규약-common)
- [컨텍스트 로딩 아키텍처 (v0.5.2+)](#컨텍스트-로딩-아키텍처-v052)
- [응답 접두사 규약 (v0.5.2+)](#응답-접두사-규약-v052)
- [산업 레퍼런스 (`industry/`)](#산업-레퍼런스-industry)
- [국가 / 현지화 레퍼런스 (`country/`)](#국가--현지화-레퍼런스-country)
- [활성 모듈 연동](#활성-모듈-연동)
- [SAP 플랫폼 인식 (ECC / S4 온프레미스 / 클라우드)](#sap-플랫폼-인식-ecc--s4-온프레미스--클라우드)
- [SPRO 설정 레퍼런스](#spro-설정-레퍼런스)
- [SAP 전용 훅](#sap-전용-훅)
- [🔒 데이터 추출 차단 목록](#-데이터-추출-차단-목록)
- [🚫 `acknowledge_risk` — 필수 규칙](#-acknowledge_risk--필수-규칙)
- [🔀 SAP 연결: 웹 포트, RFC 백엔드, NCo](#-sap-연결-웹-포트-rfc-백엔드-nco)

## 27개 SAP 전문 에이전트

| 분류 | 에이전트 |
|----------|--------|
| **코어 (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **체커 (1)** | `sap-checker` (Haiku) — 좁은 범위 하나에서 탐색 / 검증 / 탐지 작업을 맡는 읽기 전용 분산 작업자예요. 구조화된 줄만 돌려주고, 판단하거나 고치지 않아요. `create-program`, `analyze-code`, `compare-programs`, `stock-cbo`, `cbo-relation-map`, `module-to-process`에서 써요 |
| **Basis (1)** | BC Consultant — 시스템 관리, 이관 관리, 진단 |
| **탐색 (1)** | CBO Stocker — CBO 패키지 인벤토리, where-used 그래프, 재사용 가능 오브젝트 카탈로그 |
| **모듈 (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**위임 맵 (모듈 자문 프로토콜):**
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` → `sap-{module}-consultant` (업무 의미) 또는 `sap-bc-consultant` (시스템 수준)
- `sap-architect` → `## Consultation Needed` → `sap-bc-consultant` (이관 전략, 권한, 성능, 사이징, 패치) 또는 모듈 컨설턴트
- `sap-analyst` / `sap-critic` / `sap-planner`에는 필수 **Country Context** 블록이 더 있어요 (`country/<iso>.md`를 로드해요)
- 코어 에이전트의 **MCP 직접 읽기 권한** — 패키지 / DDIC / 클래스 / 프로그램 / where-used / 런타임 덤프 도구는 읽기 전용이에요. 쓰기 CRUD는 `sap-executor` / `sap-planner` / `sap-writer` / `sap-qa-tester` / `sap-debugger`에만 있어요

## 31개 스킬

| 스킬 | 설명 |
|-------|-------------|
| `sc4sap:setup` | 플러그인 설정 — MCP 서버 자동 설치, SPRO 설정 생성, 차단 목록 훅 설치 |
| `sc4sap:mcp-setup` | MCP ABAP ADT 서버 단독 설치 / 재설정 가이드 |
| `sc4sap:sap-option` | SAP 프로필(접속 정보, RFC 백엔드, 차단 목록, 활성 모듈) 조회 / 수정, **멀티 환경 프로필 관리**(Dev/QA/Prod 전환/추가/삭제), HUD 사용량 한도 |
| `sc4sap:sap-doctor` | 플러그인 + MCP + SAP 진단 (6개 계층) |
| `sc4sap:create-object` | ABAP 오브젝트 생성 (하이브리드 모드 — 이관 요청 + 패키지 확인, 생성, 활성화) |
| `sc4sap:create-program` | ABAP 프로그램 전체 파이프라인 — Main+Include, OOP/Procedural, ALV, Dynpro, Text Element, ABAP Unit |
| `sc4sap:program-to-spec` | ABAP 프로그램을 기능/기술 명세서(Markdown / Excel)로 역설계 |
| `sc4sap:program-to-manual` | 프로그램 하나의 최종 사용자 매뉴얼(HTML 한 개) — 그려 낸 화면 위에 번호 콜아웃으로 시나리오 단계, 확인 포인트, 메시지와 조치를 보여줘요 |
| `sc4sap:compare-programs` | 같은 시나리오를 모듈 / 국가 / 담당자 유형별로 나눠 구현한 ABAP 프로그램 2~5개를 업무 관점에서 나란히 비교 — 컨설턴트용 편집 가능한 HTML 보고서 (판정 매트릭스, 필드 차이, 화면 나란히 보기, 선택 가이드. 버전 관리, 영문 동반 문서) |
| `sc4sap:config-to-document` | 운영 중인 시스템에서 모듈 하나의 커스터마이징을 문서화 (MM 먼저) — IMG 트리를 따르는 HTML 한 개: SM30 스타일 화면에 실제 테이블 값, 이관 이력이 붙은 고객 변경 행, 설정 점검, SAP IMG 문서, `sap-critic`이 검토한 컨설턴트 메모, 메모 · 값 · 변경 이력용 화면 내 편집 모드(`--import`로 편집 내용을 다음 버전에 반영) |
| `sc4sap:interface-mapping-spec` | 인터페이스 매핑 명세서 — 템플릿 레이아웃의 편집 가능한 HTML 한 페이지 (표지, 개정 이력, R / MAPPING이 있는 Source → Target 그리드, 응답 블록, 변환 규칙, 추출 SQL, 필드 가이드). SAP 쪽은 DDIC / RFC 시그니처에서, 신규 인터페이스는 필드 목록 / 컨설턴트 제안에서 가져와요. 상대 시스템 쪽과 변환 규칙은 제안하고, 화면 내 점검이 있어요. 버전 관리, 영문 동반 문서 |
| `sc4sap:smartform-preview` | SmartForm의 예상 출력을 JPG + HTML로 — mm 단위 윈도우, SmartStyle 글꼴, 템플릿 그리드, SE78 그래픽, 샘플 행이 있는 루프. DDIC 타입 크기에 맞춘 가상 샘플 값을 쓰고, 잘리는 셀과 윈도우를 보고해요 (읽기 전용) |
| `sc4sap:smartform-from-pdf` | 인쇄된 양식의 PDF(또는 스크린샷)로 SmartForm 생성 — 선에서 템플릿을, 기존 SmartStyle 포맷으로 텍스트를 만들고, 필드 / 아이템 루프 / 인터페이스는 사용자와 함께 정해요. DEV에 올려 거기서 출력하고 원본 페이지와 비교해 점수를 매겨요 |
| `sc4sap:project-dashboard` | SAP 프로젝트 대시보드 — 프로젝트별 편집 가능한 HTML 한 페이지 (요약, KPI, 마일스톤, WBS / 간트, 리스크 & 결정 사항, 팀, 이력)에 포트폴리오 페이지와 Q-gate 점검이 있는 한 페이지 주간 현황을 더했어요. 모듈 / 개발 컨설턴트별 WRICEF 단계, SAP에서 읽어 오는 실적(이관, 패키지 오브젝트, 덤프) |
| `sc4sap:role-matrix` | 역할 & 권한 워크북 — 업무 역할, PFCG 역할, 역할 × T-code F/C/D, 사용자 × 역할, 권한 오브젝트, SoD 충돌 점검. 신규 설계 또는 SAP에서 읽기(사용자 ID만). 큰 시스템은 시트를 나눠 보여줘요 |
| `sc4sap:analyze-code` | ABAP 코드 분석 (Clean ABAP / 성능 / 보안) |
| `sc4sap:stock-cbo` | 고객 비즈니스 오브젝트(CBO) 인벤토리 스캐너 — 모듈 간 갭 분석 포함 |
| `sc4sap:cbo-relation-map` | 패키지 하나 이상의 고객 오브젝트 관계 맵을 HTML 한 페이지로 — `stock-cbo` 그래프로 그려요. 허브, 사용량, 이름 붙은 그룹, Obsidian 스타일 이웃 보기, TCode까지의 영향, 경로, 테이블 CRUD, 필드 수준 CRUD(Fields 탭, 표준 테이블의 고객 append 포함), 소스 조각, PNG / CSV. 그래프가 없으면 직접 수집해요 (패키지 전체 또는 사용된 TCode. eco = 맵 전용) |
| `sc4sap:analyze-symptom` | SAP 운영 오류/증상 단계별 분석 (덤프, 로그, SAP Note 후보) |
| `sc4sap:ops-health-check` | 운영 보고서 (고객 또는 PMO용 HTML: 요약, 이전 기간 대비 KPI, 덤프 추이, 이슈 & 조치) — 덤프를 묶어 이전 기간과 비교하고, 덤프 난 프로그램을 바꾼 이관, 중단된 잡, 업데이트 오류, 오류 상태 IDoc을 보여줘요. 판정 + 다음 단계 (읽기 전용) |
| `sc4sap:transport-readiness` | QA / PRD 이관 전 이관 요청 CTS 점검 — 열린 태스크, 비활성 오브젝트, 로컬 패키지, 공유 오브젝트(임포트 순서), 미릴리스 DDIC 의존성, SM59 대상 시스템 병합 점검(선택). 요청별 판정 (읽기 전용) |
| `sc4sap:program-test` | DEV 행, QA 행 또는 (요청 시) 운영 행을 테스트 더블로 써서 DEV에서 프로그램을 테스트 (MCP 서버 안에서 마스킹, 운영 테이블마다 확인) — 기대값 먼저 고정, 마스킹된 데이터, 케이스별 ABAP Unit 판정, 변이체 + 변조 점검, NOT_TESTABLE 비율 (이관 없음, 프로그램 변경 없음) |
| `sc4sap:uat-scenarios` | UAT 또는 통합 테스트(SIT) 시나리오 세트 — 컨설턴트 초안, 항목별 제안, T-code 점검, 사이클별 진행 현황, 두 가지 레이아웃의 Excel 내보내기 (SAP에는 읽기 전용) |
| `sc4sap:assist` | 업무 어시스턴트 — 설치된 업무 액션으로 특정 전표를 조회하고 변경해요: 조회 → 미리보기 → 사용자 승인 → 실행 → 전표 번호 (운영: 조회만) |
| `sc4sap:smartform-to-adobe` | **베타 — 출력 품질이 아직 낮아요.** SAP 마이그레이션(CL_SSF_MIGRATION)과 같은 방식으로 SmartForm을 Adobe 양식으로 바꾸는 변환 계획 — 노드 인벤토리, 인터페이스 / 컨텍스트 / 레이아웃, SAP가 예측한 로그, 수동 조치가 필요한 조용한 누락. HTML 보고서 (읽기 전용. SAP 예제 양식은 DEV에서 선택 실행) |
| `sc4sap:adobe-preview` | Adobe 양식(SFP, S/4HANA)의 예상 출력을 HTML / PDF / JPG로 — 인터페이스 DDIC 타입 크기에 맞춘 가상 샘플 값을 써요. DEV에서는 SAP 예제 양식을 SAP 자체 출력과 비교해 점수를 매길 수 있어요 (읽기 전용) |
| `sc4sap:adobe-from-pdf` | 인쇄된 양식의 PDF로 Adobe 양식 생성 — DEV 쓰기 헬퍼 승인을 기다리는 중이라 아직 실행할 수 없어요 |
| `sc4sap:ask-consultant` | 모듈 컨설턴트 에이전트와 사용자가 직접 나누는 Q&A (SD/MM/FI/CO/PP/PS/PM/QM/TR/HCM/WM/TM/BW/Ariba/BC). 읽기 전용 — 설정된 SAP 환경을 따라요. |
| `sc4sap:module-to-process` | 사용자가 실제로 실행하는 TCode(운영 ST03N)로 모듈별 편집 가능한 프로세스 맵 HTML 한 개 — CBO 태스크, 변형, 담당자, 시스템이 있는 표준 L1–L4 백본, L3 시나리오 스윔레인, L4마다 PDD 스타일 태스크 시트(출처가 있는 업무 규칙, 단계, 인터페이스, S/4 전환 메모). 컨설턴트 검토, BPH 대사, 영문 동반 문서는 선택이에요 |
| `sc4sap:eco` | 설정을 바꾸지 않고 스킬 하나를 eco 비용 모드로 실행 — `/sc4sap:eco <skill> <args>` (더 저렴한 서브 에이전트 모델과 effort, 결과물은 같아요) |
| `sc4sap:trust-session` | 내부 전용 — 세션 전체 MCP 권한 부트스트랩 |

## 스킬 — 예시 & 워크플로우

### `/sc4sap:create-object`
하이브리드 모드로 오브젝트 하나를 만들어요. 이관 요청 + 패키지를 대화로 확인한 뒤 생성하고, 뼈대를 만들고, 활성화해요.
```
/sc4sap:create-object
→ "Create a class ZCL_SD_ORDER_VALIDATOR in package ZSD_ORDER"
```
흐름: 타입 추론 → 패키지 + 이관 요청 확인 → MCP `Create*` → 초기 구현 → `GetAbapSemanticAnalysis` → 활성화.

### `/sc4sap:create-program`
대표 프로그램 생성 파이프라인이에요. Main + Include 구성, OOP 또는 Procedural, ALV + Dynpro를 모두 지원해요.
```
/sc4sap:create-program
→ "Make an ALV report for open sales orders, selection screen by sales org + date range"
```
흐름 (Phase 0–8):
- Phase 0 — SAP 버전 사전 점검 + 활성 모듈 로드
- Phase 1A — 모듈 컨설턴트 업무 인터뷰 (산업/국가 사전 점검, 업무 목적, 표준 SAP 대안)
- Phase 1B — `sap-analyst` + `sap-architect` 기술 인터뷰 (7개 차원)
- Phase 2 — CBO + 커스터마이징 재사용 게이트를 거친 계획 수립
- Phase 3 — 명세서 + 사용자 승인
- Phase 3.5 — 실행 모드 게이트 (`auto` / `manual` / `hybrid`)
- Phase 4 — Include 병렬 생성 → 일괄 활성화
- Phase 5 — ABAP Unit
- Phase 6 — 4개 버킷 규약 리뷰 (Sonnet 병렬, MAJOR 발견 시 Opus로 에스컬레이션)
- Phase 7 — 디버그 에스컬레이션
- Phase 8 — 소요 시간 표가 있는 완료 보고서

### `/sc4sap:analyze-code`
```
/sc4sap:analyze-code
→ "Review ZCL_SD_ORDER_VALIDATOR for Clean ABAP violations and SELECT * usage"
```

### `/sc4sap:stock-cbo`
Z 패키지를 훑어 재사용 가능한 자산을 목록으로 만들고, 모듈 간 갭 분석을 해요.
```
/sc4sap:stock-cbo
→ "Scan ZSD_ORDER package for MM module reuse candidates"
```
흐름: `GetPackageTree` → 카테고리 순회 → 빈도 휴리스틱 → 모듈 간 갭 점검 → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.

### `/sc4sap:cbo-relation-map`
`stock-cbo`가 만드는 참조 그래프(`graph.json`)를 패키지마다 독립형 HTML 한 페이지로 그려요. 한국어판과 영문 동반 문서가 함께 나와요. 고객 오브젝트만 나와요. 패키지 안의 멤버와 패키지 밖의 Z / Y / 네임스페이스 오브젝트예요. 표준 오브젝트는 빠져요. 관계는 DDIC 타입 지정, 체크 테이블, 검색 도움말, 값 테이블, 행 타입, 뷰 베이스, 집합 검색 도움말이 있고, 소스에서는 include, 호출, submit, 트랜잭션, 읽기, 쓰기가 있어요. 각 관계에는 DDIC에 명시, 소스에 명시, 추정 중 하나와 해당 DD* 행 또는 소스 줄이 붙어요. Include는 프로그램이나 함수 그룹으로 접어 넣어요. 설명(순회 / 인벤토리), 사용량(`usage-result.json`), 표준 체크 테이블(DD08L, 텍스트로만 표시)은 인벤토리 폴더에 있으면 추가돼요. 개요는 업무 관계 기준 허브(타입 지정 허브는 따로), 사용 횟수, 자동으로 이름 붙인 Louvain 그룹을 보여줘요. 탐색 화면은 Obsidian 그래프처럼 그려요 (캔버스, 마우스를 올리면 이웃이 밝아지고, 확대하면 이름이 서서히 나타나요). 관계 프리셋과 종류, 타입, 베이스, 사용량, 패키지별 필터가 있어요. 사이드 패널에는 TCode까지의 변경 영향과 모든 관계가 ±10줄 소스 조각과 함께 나와요. 경로는 어느 방향이든, 화살표를 따라서든 찾고 대안을 최대 3개 보여줘요. Table CRUD 탭은 테이블마다 누가 생성, 읽기, 수정, 삭제하는지 보여주고, PNG와 CSV로 내보낼 수 있어요. 패키지 여러 개는 한 페이지로 합쳐요 (패키지별 색상). 그래프가 없으면 스킬이 직접 수집해요 — 패키지 전체(standard: `stock-cbo` 전체. eco: Haiku 순회 + Step G만) 또는 사용자가 실제로 실행하는 TCode(`usage-scope.mjs`)예요. 페이지 자체는 SAP를 호출하지 않아요. `build-relation-map.mjs find --base <dir> … --packages <list>`는 그래프를 오프라인으로 찾아 줘요 (패키지 · 범위마다 폴더 하나, 없는 패키지와 모호한 패키지는 이름을 알려줘요). 그래서 호스팅 실행(웹 앱)이 한 단계로 페이지를 만들 수 있어요. `--src`(반복 가능), `--max-bytes`(조각 없이 다시 빌드, 안 되면 exit 3), `--sid`는 이 실행을 위한 옵션이에요.

### `/sc4sap:analyze-symptom`
```
/sc4sap:analyze-symptom
→ "Dump MESSAGE_TYPE_X in ZFI_DEMO_POSTING at line 234 during F110"
```
흐름: `RuntimeListDumps` → `RuntimeAnalyzeDump` → 스택 트레이스 → SAP Note 후보 → 해결 옵션.

### `/sc4sap:program-to-spec`
ABAP 프로그램을 소크라테스식 범위 좁히기로 명세서(Markdown/Excel)로 역설계해요.

### `/sc4sap:program-to-manual`
업무 사용자가 따라 하는 매뉴얼을 써요. 작업마다 시나리오 하나("PO 보내기", "누락된 입고 확인")를 두고, 각 단계를 화면 그림 위에 보여줘요. 선택 화면, 출력 ALV, 팝업, 후속 화면이에요. 번호 콜아웃이 붙고, 소스 검증에서 뽑은 확인 포인트, 필드 레퍼런스, 취할 조치가 있는 메시지, 용어집, 자동 개정 이력이 함께 나와요. 독립형 HTML 파일 한 개예요. 화면에서는 웹 문서, 인쇄하면 단계 하나가 A4 가로 한 페이지예요. 작성자, 팀, 회사, 기밀 고지는 프로필 `config.json` → `manual`에서 가져와요.

### `/sc4sap:uat-scenarios`
모듈이나 프로세스 영역의 UAT 시나리오를 — 또는 모듈 간 end-to-end 흐름의 통합 테스트(SIT)를 (모든 단계에 모듈이 있고 인계마다 넘어온 값을 확인해요) — JSON 세트 하나(`scripts/uat/build-uat.mjs`)로 관리해요. 다시 쓰는 대신 테스트 사이클을 거치며 계속 편집해요. 시나리오에는 프로세스 체인, 프로세스, 태스크가 있어요. STEP 행에는 활동, 시스템(SAP 또는 연계 시스템), T-code, 확인 포인트, 입력 데이터, 기대 출력, 테스트 사용자 ID, 사이클별 결과(pass / fail / blocked), 상태, 후속 조치, 이슈가 있어요. 모듈 컨설턴트가 세트를 초안으로 쓰고, 이후 변경은 패치 연산(`set-scenario`, `set-step`, `add-step`, `remove-step`, `add-scenario`)으로 제안해요. 연산은 목록으로 보여주고 사용자가 승인한 번호만 적용해요. 없는 단계를 가리키는 연산은 이유와 함께 건너뛰어요. SAP 단계의 T-code는 모두 `GetTransaction`으로 확인해요. `check`는 빈틈(T-code나 기대 결과가 없는 단계, 후속 조치가 없는 실패 단계)과 사이클별 진행 현황을 보여줘요. 내보내기는 레이아웃 A(일정, 활동, 시나리오마다 개요와 테스트 절차가 있는 시트)와 레이아웃 B(시나리오마다 헤더 행이 있는 평면 목록과 ID가 담긴 테스트 사용자 시트)가 있어요. 스프레드시트 라이브러리 없이 써요.

**결함과 수정** (`build-uat.mjs defects`). 이슈마다 수정하는 요청(`transports`, `<SID>K<6>` 형식 아무거나)과 재테스트 사이클을 적어요. CTS 점검의 `model.json`이 있으면 결함마다 요청의 CTS 상태와 상태 값을 보여줘요 — 수정 요청 없음, 수정 미점검, 수정 진행 중, 이관 준비 완료(CTS 준비 또는 릴리스됨. QA 임포트는 읽지 않아요), 재테스트 예정, 재테스트 통과 / 실패. 요청 텍스트에 `ISS-0003` 또는 `<SET>/ISS-0003`이 있으면 패치 제안으로 돌아오고, 링크는 만들지 않아요. `<ID>-defects.json`은 프로젝트 대시보드가 읽는 KPI 피드예요 (`uat-defects-open`, `uat-defects-no-fix`, `uat-fix-ready`, `uat-retest-due`, `uat-retest-pass-rate`).

### `/sc4sap:transport-readiness`
STMS를 열기 전에 "이 요청들 오늘 밤에 보내도 돼? 어떤 순서로?"에 답해요. `scripts/transport/build-tr-check.mjs collect`는 요청(번호, 소유자, 또는 `[SD]%` 같은 텍스트 패턴으로 지정)과 그 태스크 · 오브젝트(E070 / E07T / E071, 태스크 오브젝트는 요청에 합쳐요), 다른 열린 요청에 있는 같은 오브젝트, 오브젝트의 패키지(TADIR)와 활성화 상태(시스템이 읽을 수 있으면 DWINACTV, 아니면 접속 사용자의 ADT 비활성 목록 — 부분 결과로 보고해요)를 읽어요. 최근 90일 안에 다른 미릴리스 요청에 있는 고객 DDIC 오브젝트는 이 요청의 코드가 쓰는지도 확인해요 (`GetWhereUsed`). `--target-dest <SM59 destination>`을 주면 `GetRemoteTableContents`(RFC_READ_TABLE, 오브젝트 200개 이하)로 대상 시스템도 읽어요. TADIR(오브젝트가 있는지, 어느 패키지인지), VRSD(각 파트를 마지막으로 바꾼 요청 — 대상 쪽 Transport of Copies는 export만 하므로 건너뛰어요. 소스가 모르는 요청 번호나 다른 날짜로 아는 요청 번호는 대상에서 또는 다른 경로로 한 변경이에요), 코드가 쓰는 고객 DDIC 오브젝트(의존성 행과 D010TAB)의 대상 TADIR을 읽어요. 새 발견 사항 중 *대상에서 변경됨*과 *대상에 없음*은 막고, *대상보다 오래됨*(롤백)과 *대상 읽지 못함*은 경고해요. `build`는 요청마다 판정을 줘요 — blocked (열린 태스크, 비활성 오브젝트, 로컬 패키지, 미릴리스 DDIC 의존성), check (공유 오브젝트, 부분 비활성 목록), ready — 그리고 첫 번째로 할 조치를 알려줘요.

**CAB 변경 노트** (cab 모드). `collect --cab`는 읽기를 하나 더 해요 — 예약 및 릴리스된 잡(TBTCO 상태 S / P)과 그 스텝 프로그램(TBTCP)이에요. `scripts/transport/build-cab-notes.mjs prepare`(오프라인)는 요청마다 카드를 만들어요. 카드에는 오브젝트, 영향 범위, 테스트 증빙, 위험도, 롤백 메모가 들어가요. 영향 범위는 `stock-cbo` CBO 그래프를 관계 맵의 영향 규칙(모든 관계를 먼저 한 단계, 그다음 코드 관계로 최대 6단계)으로 따라가 TCode(ST03N 사용량 포함)까지 가요. 영향받는 프로그램을 실행하는 예약 잡도 함께 보여줘요. 테스트 증빙은 이름이 나온 것만 써요 — 프로젝트 대시보드(WRICEF 요청 또는 오브젝트), 그 대시보드가 주었거나 나열한 UAT 세트(연결된 이슈, 또는 영향받는 T-code의 단계는 추정으로 표시)이고, 각각 세트 ID가 붙어요. 위험도 H / M / L은 고정 규칙으로 정해요. 롤백 메모는 사실만 적고 항상 "no automatic rollback"으로 시작해요 (VRSD의 대상 이전 버전 — 새 요청으로 복원하고, 옛 요청을 다시 임포트하지 마세요. 신규 오브젝트, 테이블 데이터, 커스터마이징, 대상을 읽지 않았으면 *대상 미점검*). 그래프가 없는 패키지는 "없음"이 아니라 *영향 미수집*으로 보여줘요. `sap-writer`가 요청마다 업무 문장 두세 개를 초안으로 쓰고, `save`는 입력에 없는 오브젝트, T-code, 번호가 들어간 문장을 거부해요. 페이지(ko / en, A4 가로)는 사람이 고칠 때까지 텍스트를 *AI 초안*으로 표시해요. CAB 결정과 코멘트는 사람이 직접 입력해요. Save → `import`는 편집한 내용을 유지해요.

### `/sc4sap:ops-health-check`
SM / AMS 운영의 아침 점검이에요. `scripts/ops/build-ops-check.mjs collect`는 기간(기본은 어제부터)과 그 앞의 같은 길이 기간에 대해 다음을 읽어요. 짧은 덤프(`RuntimeListDumps` — ADT 피드, ECC에서는 ST22 목록), 기간 일주일 전부터의 이관 요청과 그 텍스트 · 코드 오브젝트(E070 / E07T / E071), 중단된 잡(TBTCO 상태 A와 첫 스텝의 프로그램), 오류가 난 업데이트 요청(VBHDR), 오류 상태 IDoc(EDIDC)이에요. `build`는 덤프를 런타임 오류와 프로그램별로 묶고, 이전 기간 대비 새 그룹을 표시해요. 그룹 옆에는 마지막 덤프 전에 그 프로그램, include, 함수 그룹, 클래스를 바꾼 요청을 나열해요. 그리고 발견 사항마다 판정(red / amber / green)과 다음 단계를 줘요 — 덤프 그룹은 `/sc4sap:analyze-symptom`, 나머지는 SM37 / SM13 / BD87이에요. BASIS < 7.50에서는 `ZMCP_ADT_DISPATCH` 액션 `TABLE_READ`로 읽어요. 이 액션은 잡, 업데이트, IDoc 헤더 테이블을 이름으로 나열해요 (잡 로그, 업데이트 데이터, IDoc 데이터는 닫혀 있어요). 오래된 디스패처는 이를 거부하고, 이때는 빈 값이 아니라 *읽을 수 없음 — SM37 / SM13 / WE02에서 확인*으로 표시돼요. 업무 전표 내용은 읽지 않아요. 사용자 이름은 세기만 하고 나열하지 않아요. 프로필 산출물 기본 경로의 `ops-check/<to>/` 아래에 독립형 HTML 한 페이지가 나와요 (ko / en / ja, 라이트 / 다크, A4 가로 인쇄).

### `/sc4sap:program-test`
이관이 넘어가기 전에 DEV에서 프로그램을 테스트해요. 프로그램 이름을 주면 스킬이 데이터 소스(기본은 DEV 행. `/sc4sap:sap-option` → *Test data sources*로 저장한 SM59 destination을 통한 QA 또는 운영 행의 마스킹된 샘플도 가능해요)와 비용 모드를 묻고, 뭔가 실행하기 전에 실행 계획을 보여줘요. 단계, 만들 `$TMP` 테스트 프로그램, 사용자에게 묻는 내용이에요. 테스트 케이스와 기대값은 명세서와 소스에서 정해 먼저 고정해요. 행은 프로그램 자체 코드를 ABAP Unit으로 실행하는 `$TMP` 하네스의 테스트 더블이 돼요. 심어 둔 변이체와 변조한 기대값은 실패해야 해요. 케이스별 판정은 ABAP Unit 결과에서 나와요. 보고서는 테스트할 수 없는 케이스의 비율로 시작하고, 모두 통과하면 `/sc4sap:transport-readiness`를 제안해요.

### `/sc4sap:assist`
구체적인 전표에 대한 문장("거래처 100023의 미결 PO", "주문 4711에 청구 보류 설정")을 연결된 시스템의 업무 액션 하나로 바꿔요. 아직 열려 있는 내용은 한 번에 질문 하나씩 물어보고, 조회 결과는 표로 보여줘요. 변경은 SAP 메시지와 함께 전 → 후로 미리 보여주고, 바로 그 미리보기에 대한 사용자의 승인이 있어야만 실행해요. `SAP_TOOL_PROFILE=biz` 또는 `all`과 SAP 쪽 업무 핸들러가 필요해요. 운영 프로필은 조회만 돼요.

### `/sc4sap:smartform-to-adobe`
> **베타 — 출력 품질이 아직 낮아요.** 결과를 믿기 전에 SFP에서 모두 확인하세요.

SAP의 SmartForm 마이그레이션은 바로 저장하고 테스트 모드가 없어요. 이를 실행하기 전에, 스킬이 노드 단위로 마이그레이션이 양식을 어떻게 바꿀지 따져 봐요. 인터페이스, 컨텍스트, 레이아웃, SAP가 예측한 메시지, 메시지 없이 SAP가 버리는 것이에요. 그리고 갭 목록(조용한 누락이 먼저)과 항목별 수동 조치를 담은 HTML 보고서(`adobe-plan-<lang>.html`) 한 개를 써요. DEV의 SAP 예제 SmartForm은 마이그레이션을 새 `$TMP` 오브젝트로 실행할 수 있어요. 마이그레이션된 양식은 `/sc4sap:adobe-preview`로 그려요.

### `/sc4sap:adobe-preview`
출력 프로그램 없이 Adobe 양식(S/4HANA)이 무엇을 인쇄하는지 그려요. 마스터 페이지, 헤더가 반복되는 흐름 테이블, 페이지 나누기, 픽처 절, 리치 텍스트, 이미지를 인터페이스 DDIC 타입 크기에 맞춘 가상 값으로 채워요. HTML은 항상 나오고, PDF와 JPG는 Chrome / Edge가 있으면 나와요. DEV에서는 SAP 예제 양식을 ADS로 출력해 미리보기와 비교해 점수를 매길 수 있어요.

### `/sc4sap:ask-consultant`
모듈 컨설턴트 에이전트에게 바로 하는 질문이에요 ("납품 생성 시 여신 점검은 어디서 설정해?"). 질문은 키워드로 `sap-{module}-consultant`(SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, BW, Ariba, BC)에 라우팅되고, 프로필의 SAP 버전, 산업, 국가, 활성 모듈을 기준으로 답해요. 로컬 SPRO 캐시를 먼저 봐요. 읽기 전용이라 쓰기도 행 추출도 없어요. 구체적인 전표에 대한 질문("미결 PO가 뭐야?")은 같은 턴에 `/sc4sap:assist`로 넘겨요.

### `/sc4sap:compare-programs`
같은 업무 시나리오를 실행하지만 모듈, 국가, 담당자 유형, 시간 범위로 나뉜 프로그램 2~5개를 비교해요. Sonnet / Haiku가 프로그램별 사실을 추출하고, Opus가 한 번 기능 컨설턴트용 비교를 써요. *Differences only*가 있는 판정 매트릭스, 필드 차이, 나란히 놓은 선택 / 출력 화면, 선택 가이드예요. 편집 가능하고 버전 관리되는 HTML 보고서 한 개와 영문 동반 문서가 나와요.

### `/sc4sap:config-to-document`
모듈 하나의 커스터마이징을 시스템에 있는 그대로 문서화해요 (MM 먼저. 다른 모듈은 같은 파이프라인으로). 페이지는 모듈의 IMG 트리를 따라가요. IMG 활동마다 실제 테이블 값을 SM30 스타일 화면으로 그려 보여주고, 고객 이관이 바꾼 행은 이관 이력과 함께 표시해요. 값에 대해 설정 점검을 돌리고, SAP 자체 IMG 문서를 붙여요. 컨설턴트 메모는 모듈 컨설턴트 에이전트가 쓰고 `sap-critic`이 검토해요. 범위(영역, 메모 배치)는 측정한 비용과 함께 처음에 골라요.

### `/sc4sap:interface-mapping-spec`
인터페이스 매핑 명세서를 고전적인 템플릿 레이아웃의 편집 가능한 HTML 한 페이지로 써요. 표지, 개정 이력, 헤더, 변환 규칙과 MAPPING이 있는 Source → Target 그리드, 선택 사항인 동기 응답 블록, 추출 조건, 필드 가이드예요. SAP 쪽은 DDIC(테이블, 구조, 뷰)나 함수 모듈 시그니처에서 읽어요. 신규 인터페이스는 필드 목록이나 모듈 컨설턴트의 제안에서 가져와요. 상대 시스템 쪽은 제안해요. 화면 내 점검이 빈틈을 알려주고, 버전 관리와 영문 동반 문서가 있어요.

### `/sc4sap:module-to-process`
모듈 하나가 시스템에서 어떻게 돌아가는지를 사용자가 실제로 실행하는 T-code로 그려요 (`SAP_USAGE_RFCDEST`를 통한 운영 ST03N 또는 저장된 사용량 목록). 사용된 T-code → 프로그램 → 소스 → 참조 그래프 → 변형이 있는 표준 L1–L4 프로세스 백본이에요. 결과물은 편집 가능한 HTML 한 페이지예요. BPH 테이블, L3 시나리오 스윔레인, 변형 매트릭스, L4 태스크마다 태스크 시트 하나(담당자, 시스템, 소스 줄이 있는 업무 규칙, 단계, 관련 오브젝트, 인터페이스, 전환 메모)가 들어가요. 갭 모드는 기존 맵을 fit / partial / gap 분석으로 바꾸고, 프로젝트 대시보드용 WRICEF 후보를 만들어요.

### `/sc4sap:eco`
`/sc4sap:eco <skill> <args>`는 이번 실행에서만 스킬 하나를 eco 비용 모드로 실행해요 — [비용 모드](#비용-모드-standard--eco)를 보세요.

### `/sc4sap:smartform-preview`
출력 프로그램을 실행하지 않고 SmartForm의 예상 출력을 그려요. `GetSmartFormContent`가 양식, SmartStyle, SE78 그래픽을 읽고, 윈도우를 mm 위치에 맞춰 그려요. 템플릿 그리드(테두리, 음영), 샘플 행이 있는 루프, 인쇄 크기의 그래픽도 함께 그리고, 헤드리스 Chrome / Edge로 JPG로 저장해요. 모든 `&field&`에는 DDIC 타입 크기에 맞춘 가상 샘플 값이 들어가요 (업무 데이터는 쓰지 않아요). 그래서 그림에 실제로 잘리는 곳이 나타나고, 보고서는 내용이 맞지 않는 셀과 윈도우를 나열해요.

### `/sc4sap:smartform-from-pdf`
반대 방향이에요. 인쇄된 양식의 PDF(또는 스크린샷 — 위치는 추정)로 SmartForm을 만들어요. `read-pdf.mjs`는 의존성 없이 페이지를 읽어요 — 모든 텍스트의 위치, 글꼴, 크기, 그리고 선과 이미지예요. `plan-form.mjs`는 선으로 둘러싼 영역을 템플릿으로 바꾸고, 각 텍스트를 그 셀이나 자기 윈도우에 넣어요. 그 글꼴을 출력하는 **기존** SmartStyle의 단락 · 문자 포맷을 써요 (스타일은 만들지 않아요). 메인 스레드가 사용자와 함께 어떤 텍스트가 필드인지, 어떤 그리드 행이 아이템 줄(인터널 테이블 루프)인지, 인터페이스의 DDIC 타입이 무엇인지 정해요 (`shape-form.mjs`). `write-form.mjs`는 Form Builder XML을 써요. 양식은 DEV 시스템에 올리고(`CreateSmartForm`), 거기서 출력하고(`RenderSmartForm`), 출력을 원본 페이지와 비교해 점수를 매겨요 (`compare-layout.mjs`).

### `/sc4sap:project-dashboard`
SAP 프로젝트마다 편집 가능한 페이지 하나, 그리고 전체를 묶은 포트폴리오 페이지예요. 계획은 프로젝트 유형별 템플릿(SAP Activate 신규 구축, S/4 전환, 롤아웃, AMS 릴리스, 소규모 프로젝트)에서 나와요. 진행 상황은 편집 모드에서 PM이 입력하고, 연결된 시스템에서는 읽기 전용으로 가져와요. 이관 요청은 커스터마이징(설정 작업)과 워크벤치(개발 작업)로 나누고, 패키지 오브젝트, 비활성 오브젝트, 오픈 후 덤프도 읽어요. WRICEF 항목은 모두 모듈 컨설턴트와 개발 컨설턴트가 있는 단계를 거쳐 움직여서, 둘 사이의 인계 대기열이 보여요. 팀원은 날짜로 합류하고 떠나요. 떠난 사람의 미결 항목은 재배정 대상으로 표시해요. 헤더 행이 고정된 스프레드시트 스타일 편집은 모바일에서도 돼요.

주간 현황: `build-project-doc.mjs status --project <CODE> [--week-end] [--gate] [--evidence <file>]…`는 한 페이지 현황을 써요 (A4, 인쇄하면 최대 두 페이지, 휴대폰 레이아웃). 전체와 워크스트림별 RAG(PM의 직접 판단 포함), 지난 현황 이후 달라진 점, KPI 변화, 주요 리스크, 필요한 결정, 앞으로 2주의 마일스톤이 들어가요. 해당 주는 모델에 보관하므로(`statusLog`, 26주) 대시보드 페이지가 다음 주 기준선을 가져요. 게이트를 쓰면 각 종료 기준을 넘겨받은 증빙(CTS 점검, UAT 페이지 또는 세트, 운영 보고서, UAT 결함 피드)으로 점검해요. 선택 규칙 태그(`[cts-blocked<=0]`, `[uat-pass:2nd>=95]`, `[defects-open<=3]`, `[wricef>=ut:80]` …)를 쓰고, 판정을 제안해요. PM의 마일스톤 상태는 그대로 유지돼요. 리스크와 결정은 모델 목록이고 자기 탭에서 편집해요. `--refresh`를 주지 않으면 오프라인으로 동작해요.

### `/sc4sap:role-matrix`
역할 & 권한 문서를 편집 가능한 워크북 하나로 만들어요. 점검이 있는 표지, 업무 역할, PFCG 역할, 업무 역할 × T-code 매트릭스(F 전체 / C 변경 / D 조회), 사용자 × 역할 할당, 권한 오브젝트, 사용자별 및 역할 내부 자동 충돌 점검이 있는 SoD 규칙, 변경 이력이에요. 신규 설계에서는 모듈 컨설턴트가 역할, T-code, 권한 오브젝트, SoD 규칙을 제안해요. ST03N 사용량이 있으면 사용자가 실행하는 T-code로 좁혀요. SAP에서 읽을 때는 PFCG 역할 테이블을 읽어요 (수준은 ACTVT에서 추정하고 "?"로 표시). 사용자 할당은 사용자 ID와 유효 기간만 읽어요 — 사용자 마스터, 로그온, 비밀번호 테이블은 절대 읽지 않고, 이름과 부서는 직접 입력해요. 역할 이름은 한 번에 읽는 5,000행 한도를 넘어 범위별로 읽고, 긴 시트는 페이지로 나눠요 (행과 역할 열 50개). 검색, CSV, 붙여넣기는 시트 전체에서 동작해요.

**Triage 모드** — 사용자 한 명이 T-code 하나에서 "권한 없음"을 받았을 때예요. SU53 점검(또는 메시지만 있으면 T-code 시작 점검과 SU24 제안을 추정으로 사용)을 사용자 역할에 대해 권한 인스턴스별로 평가해서 네 가지 판정 중 하나를 내요. A 없음, B 보유하지만 유효하지 않음(프로필 생성 / 사용자 비교), C 오늘 유효하지 않은 할당(종료됨 또는 아직 시작 전), D 불명확이에요. 후보 역할은 최소 권한 순으로 최대 다섯 개 제안하고, 각 역할이 추가할 T-code 수준 SoD 충돌을 함께 보여줘요. HTML 한 페이지와 짧은 티켓 요약이 나와요. 읽기 전용이고, 그 사용자의 역할 할당만 읽어요. PRD 실행은 먼저 물어보고, 사용자 ID는 파일 이름과 제목에 넣지 않아요.

### `/sc4sap:sap-doctor`
플러그인 + MCP + SAP 연결 진단이에요. 뭔가 이상할 때 가장 먼저 실행하세요.

### `/sc4sap:sap-option`
`.sc4sap/sap.env`를 조회하고 수정해요 — 접속 정보, RFC 백엔드, 차단 목록 정책, 활성 모듈이에요. 비밀 값은 가려져요.

## 일반 채팅 라우팅

대부분의 사용자는 슬래시 명령을 입력하는 대신 원하는 것을 말로 설명해요. [`common/skill-router.md`](../common/skill-router.md)의 요약이 세션 시작 때 주입돼요.

- **바로 실행**: 방법 / 이유 / 커스터마이징 질문 → `ask-consultant`. 구체적인 전표(미결 PO, 출고 전기, 릴리스, 보류, 역분개) → `assist` (쓰기 전에 항상 확인해요). 실행 중 덤프나 오류 → `analyze-symptom`. 일일 점검 / 실패한 잡 / 운영 보고서 → `ops-health-check`. 이 요청들을 QA / PRD로 보내도 되는지 → `transport-readiness`. 연결 문제 → `sap-doctor`.
- **한 줄로 제안하고, 승인하면 실행**: 산출물 및 쓰기 스킬 (create-program, program-to-spec, config-to-document, uat-scenarios, …).
- **라우팅하지 않음**: 사용자가 직접 입력한 슬래시 명령, 이미 실행 중인 스킬, 플러그인 자체에 대한 질문.

[`common/intent-router.md`](../common/intent-router.md)는 한 문장을 지식(`ask-consultant`), 조회 또는 액션(`assist`)으로 나눠요. 사용자가 다시 입력할 필요는 없어요.

## 비용 모드 (standard / eco)

| 모드 | 달라지는 점 |
|---|---|
| `standard` (기본) | 쓰인 그대로의 스킬 — 판단은 Opus, 템플릿과 대량 쓰기는 Sonnet, 가져오기 / 검증 / 탐지는 Haiku 체커 |
| `eco` | 더 저렴한 서브 에이전트 모델과 effort, 낮은 메인 스레드 effort. **결과물과 점검은 같아요** (리뷰, 검증 게이트, 안전 단계는 건너뛰지 않아요) |

`/sc4sap:sap-option`(`costMode`, 또는 스킬별 `costModeBySkill`)으로 설정하거나, 한 번만 `/sc4sap:eco <skill> <args>`로 실행하세요. 결정 순서와 스킬별 표는 [`common/cost-mode.md`](../common/cost-mode.md)에 있어요. 모드를 묻는 스킬(예: `program-test`)은 위 방법 중 어느 것으로도 정해지지 않을 때만 물어봐요.

## 오프라인 프로필

`connection: offline`인 프로필은 SAP 연결이 없고 MCP 브리지는 내려가 있어요. 스킬은 각각 **full**(똑같이 동작, 예: `uat-scenarios` — T-code는 미확인으로 표시), **degraded**(시스템 조회 없이, 또는 사용자가 준 파일로 동작, 예: 레퍼런스와 로컬 파일로 답하는 `ask-consultant`, 내려받은 양식 XML을 다루는 `smartform-to-adobe`), **blocked**(중단 안내 줄로 응답) 중 하나예요. 목록과 로컬 지식 순서는 [`common/offline-mode.md`](../common/offline-mode.md)에 있어요.

## 🌐 멀티 환경 프로필 (Dev / QA / Prod)

**다국적 SAP 고객은 법인마다 3계층 시스템 구성을 운영해요** (Sandbox / Dev / QA / Prod. 법인이 여럿인 경우도 많아요: KR, US, DE…). sc4sap은 Claude Code 세션 하나에서 이 모두를 관리할 수 있고, **Dev가 아닌 계층에는 안전장치가 자동으로 걸려요.**

### 프로필 저장 위치

| 위치 | 내용 |
|---|---|
| `~/.sc4sap/profiles/<alias>/sap.env` | 사용자 수준 프로필 정의 (접속, 계층, 산업, 모듈). 모든 저장소가 공유해요. |
| `~/.sc4sap/profiles/<alias>/config.json` | 사용자 수준 프로필별 설정 (네이밍 규칙, systemInfo, activeTransport 이력). |
| `~/.sc4sap/profiles/.trash/` | 소프트 삭제된 프로필. 삭제 7일 뒤 자동으로 비워져요. |
| `<project>/.sc4sap/active-profile.txt` | 프로젝트 수준 포인터 — 이 저장소가 지금 어느 프로필과 통신하는지. |
| `<project>/.sc4sap/work/<alias>/` | 프로필별 프로젝트 산출물 (명세서, CBO 카탈로그, 감사). 교차 보기는 읽기 전용이에요. QA 세션은 Dev가 만든 명세서를 볼 수 있지만, 쓰기는 항상 활성 프로필 아래에 저장돼요. |

### 계층 기반 읽기 전용 강제 (Strict 정책)

`SAP_TIER`는 열거형이에요: `DEV` | `QA` | `PRD`. 표준이 아닌 계층(Sandbox, Staging, Pre-Prod, Training)은 더 안전한 쪽으로 매핑돼요 (예: Staging → PRD).

| 도구 군 | DEV | QA | PRD |
|---|---|---|---|
| `Create*` / `Update*` / `Delete*` (DDIC, ABAP, CDS, BO, SB, MDE, Screen, GUI, Package) | ✓ | ✗ | ✗ |
| `CreateTransport` | ✓ | ✗ | ✗ |
| `RunUnitTest` | ✓ | ✓ | ✗ |
| `RuntimeRunProgramWithProfiling` / `RuntimeRunClassWithProfiling` | ✓ | ✗ | ✗ |
| `Get*` / `Read*` / `Search*` / `RuntimeAnalyze*` / `RuntimeList*` / `ValidateServiceBinding` | ✓ | ✓ | ✓ |

2중 방어:
- **Layer 1 — PreToolUse 훅** (`scripts/hooks/tier-readonly-guard.mjs`)은 `scripts/install-hooks.mjs`로 설치해요. 도구 요청이 나가기 전에 발동하고, LLM이 사용자에게 설명할 수 있는 명확한 거부 사유를 내보내요.
- **Layer 2 — MCP 서버 가드** (`abap-mcp-adt-powerup/src/lib/readonlyGuard.ts`)는 우회할 수 없어요. 사용자가 훅을 끄거나 플러그인 설치를 건너뛰어도, 서버가 QA/PRD에서 변경 도구를 `ERR_READONLY_TIER`로 거부해요. `ReloadProfile`은 항상 허용돼요. 그래서 우회 수단 논란 없이 Dev로 돌아갈 수 있어요.

### 비밀번호용 OS 키체인 (`@napi-rs/keyring`)

프로필에는 `SAP_PASSWORD=keychain:sc4sap/<alias>/<user>`가 저장돼요. 비밀 값이 아니라 참조예요. 실제 값은 OS 자격 증명 저장소에 있어요.

| OS | 백엔드 |
|---|---|
| Windows | Credential Manager |
| macOS | Keychain |
| Linux | libsecret (GNOME Keyring / KWallet) |

구현은 `@napi-rs/keyring`을 써요 — Rust + N-API 사전 빌드 바이너리라 설치 때 `node-gyp` 컴파일이 없고 Node 버전을 올려도 다시 빌드하지 않아요. `optionalDependencies`로 선언돼 있어서, 헤드리스 환경(Docker, CI)은 `SAP_PASSWORD_STORAGE=file`(눈에 띄는 경고와 함께 평문)로 자연스럽게 전환돼요. 기존 평문 `.sc4sap/sap.env` 파일은 첫 업그레이드 때 키체인으로 옮겨져요.

### 프로필 전환, 추가, 삭제

모두 `/sc4sap:sap-option`으로 해요.

- **전환** — 대화형 선택기(기본 `AskUserQuestion` UI)에 프로필별 미리보기 패널이 있고, 접속 정보와 허용 도구 매트릭스를 보여줘요. `active-profile.txt`를 쓰고, MCP 서버에서 `mcp__sap__ReloadProfile`을 호출해요 (Claude Code를 재시작할 필요가 없어요). HUD는 새 `alias [tier] 🔒` 배지로 다시 그려져요.
- **추가** — 마법사가 alias, 계층, 호스트/클라이언트/사용자, 비밀번호를 받아요 (비밀번호는 키체인으로 바로 전달되고 화면에 보이지 않아요). 같은 회사 자동 감지: `KR-DEV`가 있는 상태에서 `KR-QA`를 추가하면 `SAP_INDUSTRY`, `SAP_ACTIVE_MODULES`, `ABAP_RELEASE`, `namingConvention` 블록을 복사할지 물어봐요.
- **삭제** — 확인을 위해 alias를 그대로 입력해야 해요. 완전히 지우지 않고 `.trash/{alias}-{timestamp}/`로 보관해요. 활성 프로필이면 거부해요.
- **수정** — 계층이 아닌 필드를 바꿔요 (실수로 PRD → DEV로 낮추는 일을 막으려고 이 경로에서는 계층을 바꿀 수 없어요). 비밀번호를 수정하면 키체인 항목을 다시 써요.
- **정리(Purge)** — 7일이 지난 `.trash/*`를 영구 삭제해요 (`--all`이면 즉시 전부 비워요).

### 기존 단일 프로필 `sap.env`에서 마이그레이션

멀티 프로필 릴리스로 올리는 기존 사용자는, `.sc4sap/sap.env`는 있는데 `active-profile.txt`가 없는 프로젝트에서 Claude Code를 처음 시작할 때 SessionStart 배너(`scripts/legacy-migration-banner.mjs`)를 봐요. 배너가 `/sc4sap:sap-option`을 안내하고, 거기서 질문 두 개(alias, 계층)의 마이그레이션 마법사가 진행돼요. 기존 파일은 롤백용으로 `sap.env.legacy`로 이름이 바뀌고, 지워지는 데이터는 없어요.

### HUD

상태 표시줄 2번째 줄에 `{alias} [{tier}]`가 나오고, `tier != DEV`이면 🔒가 붙어요. 색은 쓰지 않아요 — 자물쇠 아이콘이 테마와 무관한 단 하나의 신호예요.

```
 KR-DEV [DEV]       SID S4H · client 100 · user DEVELOPER · CTS DEVK904224
 KR-PRD [PRD] 🔒    SID S4P · client 400 · user READER
```

### 관련 파일

- 설계: [`multi-profile-design.md`](multi-profile-design.md)
- 구현 계획: [`multi-profile-implementation-plan.md`](multi-profile-implementation-plan.md)
- CLI: `scripts/sap-profile-cli.mjs` (list / switch / add / remove / migrate / purge / keychain-set / keychain-delete)
- 스킬 동반 문서: `skills/sap-option/profile-management.md`, `skills/sap-option/migration.md`

## MCP ABAP ADT 서버 — 고유 기능

sc4sap은 **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)**(도구 150개 이상)이 뒷받침해요. 일반적인 Class / Program / Table / CDS / FM CRUD에 더해, 대부분의 MCP 서버가 다루지 않는 **클래식 Dynpro 아티팩트의 R/U/C 전체 지원**을 추가했어요.

| 아티팩트 | 지원 범위 |
|----------|----------|
| **Screen (Dynpro)** | `GetScreen` / `CreateScreen` / `UpdateScreen` / `DeleteScreen` — 헤더 + 플로우 로직 전체 왕복 |
| **GUI Status** | `GetGuiStatus` / `CreateGuiStatus` / `UpdateGuiStatus` / `DeleteGuiStatus` — 메뉴 바, 기능 키, 툴바 |
| **Text Element** | `GetTextElement` / `CreateTextElement` / `UpdateTextElement` / `DeleteTextElement` — 텍스트 심볼, 선택 텍스트, 리스트 제목 |
| **Includes** | `GetInclude` / `CreateInclude` / `UpdateInclude` / `DeleteInclude` — Main+Include 규약 |
| **Local defs/macros/tests/types** | 프로그램 안의 로컬 섹션을 따로 편집 |
| **Metadata Extension (CDS)** | `Get/Create/Update/Delete MetadataExtension` — Fiori/UI 어노테이션 레이어링 |
| **Behavior Definition / Implementation (RAP)** | RAP BDEF + BHV 전체 사이클 |
| **Service Definition / Binding** | OData V2/V4 노출 + `ValidateServiceBinding` |
| **Enhancements / BAdI** | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` 탐색 |
| **Runtime & Profiling** | `RuntimeAnalyzeDump`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog`, `RuntimeGetProfilerTraceData`, `RuntimeRunProgramWithProfiling` — Claude에서 하는 ST22 / SM02 / /IWFND/ERROR_LOG / SAT 스타일 프로파일링 |
| **Semantic / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetWhereUsed` |
| **Unit Tests** | ABAP Unit(`CreateUnitTest`)과 CDS Unit(`CreateCdsUnitTest`) 모두 |
| **Transport** | `GetTransport`, `ListTransports`, `CreateTransport` |

## 공통 규약 (`common/`)

스킬 전반에 걸친 작성 규칙은 `common/`에 있어서, 모든 스킬과 에이전트가 같은 지침을 따라요. `CLAUDE.md`는 이 파일들을 가리키는 얇은 인덱스예요.

| 파일 | 다루는 내용 |
|------|--------|
| `clean-code.md` + `clean-code-oop.md` + `clean-code-procedural.md` | 패러다임별로 나눈 Clean ABAP 표준 |
| `include-structure.md` | Main 프로그램 + 조건부 include 세트 (t/s/c/ct/e/o/i/a/f) |
| `oop-pattern.md` | 2-클래스 OOP 분리 (`c`에 `LCL_DATA` + `LCL_ALV`, `e`에 `LCL_EVENT_ALV`) |
| `alv-rules.md` | Full ALV (CL_GUI_ALV_GRID + Docking) 대 SALV + SALV-factory 필드 카탈로그 |
| `text-element-rule.md` | 필수 Text Element — 2단계 언어 규칙 (기본 언어 + `'E'` 안전망) |
| `constant-rule.md` | 필드 카탈로그가 아닌 매직 리터럴은 CONSTANTS 필수 |
| `procedural-form-naming.md` | ALV에 묶인 FORM의 `_{screen_no}` 접미사 |
| `naming-conventions.md` | 프로그램, include, LCL_*, 화면, GUI status 공통 네이밍 |
| `sap-version-reference.md` | ECC와 S/4HANA의 차이 |
| `abap-release-reference.md` | 릴리스별 ABAP 구문 사용 가능 여부 |
| `spro-lookup.md` | SPRO 조회 우선순위 (로컬 캐시 → 정적 → MCP) |
| `data-extraction-policy.md` | 에이전트 거부 프로토콜 + `acknowledge_risk` 필수 규칙 |
| `active-modules.md` | 모듈 간 연동 매트릭스 (MM↔PS, SD↔CO, QM↔PP, …) |
| `context-loading-protocol.md` | 4계층 온디맨드 파일 로딩 (전역 → 역할 → 트리거 → 태스크별) |
| `model-routing-rule.md` | Sonnet / Opus / Haiku 라우팅 + 응답 접두사 규약 + Phase 배너 규약. 스킬 · 단계별 모델 배정은 **[`skill-model-architecture.md`](skill-model-architecture.md)**를 보세요 (설계 의도 — frontmatter `model:`은 선언용이에요). |
| `ok-code-pattern.md` | 화면 OK_CODE 규약 (TOP 변수 하나 → 화면 NAME → PAI 분기. `CASE sy-ucomm`은 쓰지 않아요) |
| `field-typing-rule.md` | DDIC 필드 타입 지정 우선순위 (표준 DE → CBO DE → 신규 DE → 기본 타입) |
| `function-module-rule.md` | FM 소스 규약 (IMPORTING/EXPORTING/TABLES 시그니처를 인라인으로) |
| `transport-client-rule.md` | 모든 `CreateTransport`에는 `sap.env`의 클라이언트를 명시해야 해요 |
| `ecc-ddic-fallback.md` | ECC DDIC 생성: `ZMCP_ADT_DDIC_*`를 통한 MCP 도구 먼저, `$TMP` 헬퍼 리포트는 대체 수단 |
| `cloud-abap-constraints.md` | S/4 Cloud Public의 금지 구문과 클라우드 네이티브 API 대체 |
| `customization-lookup.md` | 기존 Z*/Y* BAdI 구현 / CMOD / form-exit / append 재사용 게이트 |
| `screen-tabstrip.md` | Tabstrip 화면 (STRIP_CTRL + 서브스크린 영역 + 탭 PUSH 행, PBO와 PAI의 `CALL SUBSCREEN`) |
| `skill-router.md` · `intent-router.md` | 일반 채팅 → 알맞은 스킬. `ask-consultant`와 `assist` 사이의 지식 / 조회 / 액션 구분 |
| `cost-mode.md` · `model-dispatch-mode.md` | 비용 모드(standard / eco)와 모델 디스패치 모드(auto / user-defined) |
| `offline-mode.md` | 오프라인 프로필: 스킬별 full / degraded / blocked, 안내 및 중단 줄 |
| `multi-profile-artifact-resolution.md` | 프로필별 산출물 위치. 활성 시스템에 없는 대상 오브젝트는 스킬을 멈춰요 |
| `verification-evidence.md` · `evidence-receipt.md` | 최종 보고서: 완료 기준을 미리 고정하고 요약 전에 증빙을 제시. 영수증(receipt)은 MCP 응답을 보고 스크립트가 결정해요 (`create-program`) |
| `sap-content-as-data.md` | 소스, 텍스트, 덤프, 행, 웹 페이지는 데이터일 뿐 지시가 아니에요. SAP 텍스트는 `<sap-data>` 블록으로 전달해요 |
| `structured-return-repair.md` | 형식이 깨진 에이전트 반환 블록은 같은 에이전트가 한 번 다시 써요. 판정은 바뀌지 않아요 |
| `adobe-forms-verification.md` | Adobe 양식 스킬의 지표와 게이트. SAP 자체 출력과 비교해 측정해요 |
| `humanize-korean.md` | 한국어 문장 다듬기 (연결 쉼표는 항상, 긴 문장은 선택 사항인 humanize-korean 플러그인으로) |
| `team-consultation-protocol.md` | 다중 전문가 에이전트 팀(`teamMode`)을 위한 반환 기반 프로토콜 |

## 컨텍스트 로딩 아키텍처 (v0.5.2+)

sc4sap의 규칙 모음은 커요 — `common/*.md` 25개 이상 + `configs/{MODULE}/*.md` 14개 + 산업/국가 파일 30개 이상이에요. 에이전트를 디스패치할 때마다 모든 파일을 로드하면 토큰이 낭비되고 모델의 주의가 흐려져요. **4계층 컨텍스트 로딩 모델**([`common/context-loading-protocol.md`](../common/context-loading-protocol.md)에 정의)은 "항상 로드하는 안전장치", "역할별 기본", "조건 발동", "태스크별 키트"를 나눠요.

| 계층 | 로드 시점 | 파일 |
|------|-------------|-------|
| **Tier 1 — 전역 필수** | 모든 에이전트, 모든 스킬, 모든 세션 시작 | `data-extraction-policy.md`, `sap-version-reference.md`, `naming-conventions.md` |
| **Tier 2 — 역할 필수** | 에이전트의 역할 그룹별 고정 세트, 세션 시작 | 역할 그룹마다 달라요 (아래 참고) |
| **Tier 3 — 조건부 읽기** | 현재 태스크가 조건에 맞을 때 | ALV → `alv-rules.md` · Procedural → `clean-code-procedural.md` + `ok-code-pattern.md` · `CALL SCREEN` → `ok-code-pattern.md` · ECC → `ecc-ddic-fallback.md` · 산업/국가 설정 → 해당 파일 · 등 |
| **Tier 4 — 태스크별 키트** | 디스패치하는 스킬/단계/버킷이 선언 | `phase4-parallel.md`의 웨이브별, `phase6-review.md`의 §1-§12별 |

### Tier 2 역할 그룹

| 역할 그룹 | 에이전트 | Tier 2가 추가하는 파일 |
|------------|--------|-------------|
| **Code Writer** | `sap-executor`, `sap-qa-tester`, `sap-debugger` | `clean-code.md`, `abap-release-reference.md`, `transport-client-rule.md`, `include-structure.md` (+ 패러다임 파일) |
| **Reviewer** | `sap-code-reviewer`, `sap-critic` | `clean-code.md`, `abap-release-reference.md`, `include-structure.md` (Phase 6에서 버킷별로 좁혀요) |
| **Planner / Architect** | `sap-planner`, `sap-architect` | `include-structure.md`, `active-modules.md`, `customization-lookup.md`, `field-typing-rule.md` |
| **Analyst / Writer** | `sap-analyst`, `sap-writer` | `active-modules.md` |
| **Doc Specialist** | `sap-doc-specialist` | *(없음 — 태스크 기반만)* |
| **Module Consultant** | 모듈 컨설턴트 14명 (SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, BW, Ariba) | `spro-lookup.md`, `customization-lookup.md`, `active-modules.md`, `configs/{MODULE}/*.md` (온디맨드 — 질문에 필요한 파일만) |
| **Basis Consultant** | `sap-bc-consultant` | `transport-client-rule.md`, `configs/common/*.md` |

### 강제 방식

모든 `agents/*.md` 파일은 `<Agent_Prompt>` 맨 위의 `<Mandatory_Baseline>` 블록에 자기 역할 그룹을 선언해요. 에이전트는 어떤 MCP 호출보다 먼저, 세션 시작 때 Tier 1 + Tier 2를 로드해요. 스킬 프롬프트는 Tier 4(태스크별) 추가분만 선언하고, Tier 1+2는 이미 로드된 것으로 봐요. MAJOR 블로커가 있으면 에이전트는 `BLOCKED — context kit insufficient: <list>`를 돌려줘요. 그러면 스킬이 갱신된 키트를 줄 수 있어요.

### 측정된 효과

- 디스패치당 토큰: v0.5.0 이전의 암묵적 전체 로드 방식 대비 −40~−60%.
- `/sc4sap:create-program`의 Opus 사용 비중: −50% (`model-routing-rule.md`의 라우팅 매트릭스).
- Reviewer의 MAJOR 발견 탐지: 개선 — §1-§12 각각이 규칙 파일 12개를 한꺼번에 훑는 대신 관련 규칙 하나만 컨텍스트에 두고 실행돼요.

## 응답 접두사 규약 (v0.5.2+)

스킬이 일으킨 모든 `/sc4sap:*` 응답은 한 줄 접두사로 시작해요. 그래서 어떤 모델이 작업하는지, 어떤 서브 에이전트가 디스패치됐는지 한눈에 볼 수 있어요.

```
[Model: <main-model> · Dispatched: <sub-summary>]
```

예시:

```
[Model: Opus]
— pure main-thread response, no sub-agent dispatches

[Model: Opus · Dispatched: Sonnet×2]
— main thread + two parallel Sonnet executors (Wave 2 G4-prep text bulk)

[Model: Opus · Dispatched: Opus×1 (planner)]
— Phase 2 planner dispatch

[Model: Opus · Dispatched: Sonnet×3 (B3a executor range α/β/γ)]
— Multi-Executor Split per multi-executor-split.md Strategy A
```

이 규약은 모든 `/sc4sap:*` SKILL.md의 `<Response_Prefix>` 블록이 강제하고, 이 블록은 [`common/model-routing-rule.md`](../common/model-routing-rule.md)의 § *Response Prefix Convention*을 가리켜요. 접두사는 스킬이 일으킨 턴에만 적용돼요. 관련 없는 주제로 넘어간 사용자 메시지는 도착한 턴에서 접두사를 빼요.

## 산업 레퍼런스 (`industry/`)

산업 파일 14개를 모든 `sap-*-consultant`가 참고해요. 각 파일은 **Business Characteristics / Key Processes / Master Data / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls**를 다뤄요.

산업: retail, fashion, cosmetics, tire, automotive, pharmaceutical, food-beverage, chemical, electronics, construction, steel, utilities, banking, public-sector.

## 국가 / 현지화 레퍼런스 (`country/`)

국가별 파일 15개 + `eu-common.md` — analyst / critic / planner는 필수예요. **Formats / Tax System / e-Invoicing / Banking / Payroll / Statutory Reporting / SAP Country Version / Pitfalls**를 다뤄요.

| 파일 | 주요 특징 |
|------|-------------------|
| 🇰🇷 `kr.md` | e-세금계산서 (NTS), 사업자등록번호, 주민번호 PII |
| 🇯🇵 `jp.md` | Qualified Invoice System (2023+), Zengin, 法人番号 |
| 🇨🇳 `cn.md` | Golden Tax, 发票/e-fapiao, SAFE FX |
| 🇺🇸 `us.md` | Sales & Use Tax (VAT 없음), 1099, Nexus |
| 🇩🇪 `de.md` | USt, ELSTER, XRechnung / ZUGFeRD, SEPA |
| 🇬🇧 `gb.md` | VAT + MTD, BACS/FPS/CHAPS, 브렉시트 이후 (GB 대 XI) |
| 🇫🇷 `fr.md` | TVA, FEC, Factur-X 2026 |
| 🇮🇹 `it.md` | IVA, FatturaPA / SDI (2019년부터 의무) |
| 🇪🇸 `es.md` | IVA, SII (실시간 4일), TicketBAI |
| 🇳🇱 `nl.md` | BTW, KvK, Peppol, XAF |
| 🇧🇷 `br.md` | NF-e, SPED, CFOP, PIX |
| 🇲🇽 `mx.md` | CFDI 4.0, SAT, Carta Porte, SPEI |
| 🇮🇳 `in.md` | GST, IRN e-invoice, e-Way Bill, TDS |
| 🇦🇺 `au.md` | GST, ABN, STP Phase 2, BAS |
| 🇸🇬 `sg.md` | GST, UEN, InvoiceNow, PayNow |
| 🇪🇺 `eu-common.md` | VIES, INTRASTAT, SEPA, GDPR |

여러 나라에 걸친 롤아웃: 관련된 파일을 모두 로드하고, 국가 간 접점(EU 역내 VAT, 인터컴퍼니, 이전가격, 원천징수)도 함께 보여줘요.

## 활성 모듈 연동

`common/active-modules.md`는 모듈 간 연동 매트릭스를 정의해요. 활성 모듈이 여러 개면 스킬이 연동 필드를 먼저 제안해요.

예: **PS가 활성**인 환경에서 MM PO를 생성하면 계정 지정 범주 `P`/`Q` + `PS_POSID`(WBS 요소)를 제안해요. **CO가 활성**이면 코스트센터 결정을, **QM이 활성**이면 GR 때 검사 로트 자동 생성을 제안해요.

`/sc4sap:setup`(Step 4)이나 `/sc4sap:sap-option modules`로 설정해요. `create-program`, `create-object`, `stock-cbo`, 모든 컨설턴트 에이전트가 사용해요.

## SAP 플랫폼 인식 (ECC / S4 온프레미스 / 클라우드)

`sc4sap:create-program`은 필수 SAP 버전 사전 점검을 실행해요. `.sc4sap/config.json`에서 `sapVersion`과 `abapRelease`를 읽어요.

- **ECC** — RAP/ACDOCA/BP 없음. 구문은 릴리스에 따라 제한돼요
- **S/4HANA On-Premise** — 클래식 Dynpro는 경고. 확장성 우선, 재무는 MATDOC + ACDOCA
- **S/4HANA Cloud (Public)** — **클래식 Dynpro 금지**. RAP + Fiori Elements, `if_oo_adt_classrun`, 또는 SALV만 쓰도록 안내해요. 전체 목록은 `common/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — CDS + AMDP + RAP + Business Partner API 권장

### ECC / BASIS < 7.50 — MCP 도구 호환성 매트릭스

레거시 시스템에서는 활성 프로필에 다음 중 하나가 설정돼 있으면 MCP 서버(`abap-mcp-adt-powerup`)가 자동으로 `AdtClientLegacy`를 거쳐요.

- `SAP_VERSION=ECC` — 프로필을 항상 레거시로 표시
- `ABAP_RELEASE`가 숫자 `< 750` (예: `740`, `731`)
- `SAP_SYSTEM_TYPE=legacy` — 명시적 오버라이드 (하위 호환)

레거시 모드는 BASIS < 7.50에 없는 엔드포인트 일부를 일부러 거부해요. 알 수 없는 404 대신 `"not supported on this SAP system"` 메시지를 분명하게 돌려줘요.

ECC 7.40(BASIS 7.40, SAP_SYSTEM_TYPE=onprem, SAP_VERSION=ECC, ABAP_RELEASE=740)에서 검증한 매트릭스예요.

| 분류 | 도구 | ECC 7.40 | 비고 |
|---|---|---|---|
| Session, Search, Discovery | `GetSession`, `SearchObject`, `GetObjectInfo`, `GetObjectStructure`, `GetInactiveObjects` | ✅ | — |
| 패키지 읽기 | `GetPackageContents`, `GetPackageTree` | ✅ | — |
| 패키지 메타데이터 | `GetPackage` | ❌ | `/sap/bc/adt/packages` 없음 — SE80/SE21 사용 |
| DDIC 읽기 | `GetTable`, `GetStructure`, `GetDataElement`, `GetDomain` | ❌ | `/sap/bc/adt/ddic/{tables,structures,dataelements,domains}`는 7.50에서 추가됨 |
| DDIC 쓰기 (클래식) | `Table`, `Structure`, `DataElement`, `Domain`의 `Create/Update/Delete` | ❌ | 같은 격차 — MCP가 Create를 `ZMCP_ADT_DDIC_*` FM으로 라우팅해요 (setup Step 9a.2, OData 백엔드). 아니면 [`common/ecc-ddic-fallback.md`](../common/ecc-ddic-fallback.md)의 **$TMP 헬퍼 리포트 대체 수단**을 써요 |
| 클래식 뷰 (`VIEW/DV`) | V_T001_CORE 같은 클래식 뷰의 `GetView` | ❌ | ECC 7.40에서 클래식 뷰 엔드포인트가 404 |
| CDS 뷰 (`DDLS/DF`) | `GetView`, `CreateView`, `UpdateView`, `DeleteView` | ✅ | `/sap/bc/adt/ddic/ddl/sources/`는 BASIS 7.40 SP05+부터 있고, CDS DDL이 깔끔하게 활성화돼요 |
| ABAP 소스 | Program, Class, Interface, Include, FunctionGroup, FunctionModule의 `Get/Create/Update/Delete` | ✅ | 읽기/쓰기 전체. `UpdateFunctionModule`은 $TMP 오브젝트의 `transport_request`를 자동으로 `"local"`로 둬요 |
| 분석 | `GetAbapSemanticAnalysis`, `GetAbapAST` | ✅ | 클라이언트 쪽 파싱, SAP 호출 없음 |
| WhereUsed | `GetWhereUsed` | ⚠️ | 클래식 오브젝트만 — `TABL` 대상은 "Unsupported object type"으로 보고해요 |
| Enhancements | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` | ❌ | BASIS < 7.50에서 `/sap/bc/adt/enhancements`가 404 — SE18 / SE19 / CMOD / SMOD 사용 |
| Transport | `ListTransports`, `GetTransport`, `CreateTransport` | ✅ | — |
| Runtime / Dumps | `RuntimeListDumps`, `RuntimeAnalyzeDump`, `RuntimeGetDumpById` | ✅ | ADT를 통한 ST22 |
| Screen / GUI Status | `GetScreen`, `GetGuiStatus`, `GetTextElement` (+ Create/Update) | ℹ️ | RFC로 디스패치 — `SAP_RFC_BACKEND` 사전 점검 필요 (odata / soap) |
| RAP / Behavior / Service / MetadataExt | `*BehaviorDefinition`, `*BehaviorImplementation`, `*ServiceDefinition`, `*ServiceBinding`, `*MetadataExtension` 전부 | ❌ | S/4HANA 전용 — ECC에는 RAP 스택이 없어요 |
| 테이블 내용 | `GetTableContents`, `GetSqlQuery` | ℹ️ | 동작하지만 프로필별 데이터 추출 차단 목록의 제한을 받아요 (§데이터 추출 차단 목록 참고) |

범례: ✅ 전체 지원 · ⚠️ 부분 지원 · ❌ 명확한 오류와 함께 거부 (SAP 플랫폼 한계) · ℹ️ 동작하지만 사전 설정 / 정책에 따라 달라요.

업스트림 참고 (같은 매트릭스, MCP 서버 기준 정본): [`abap-mcp-adt-powerup` README → Legacy (ECC / BASIS < 7.50) Compatibility Matrix](https://github.com/babamba2/abap-mcp-adt-powerup#legacy-ecc--basis--750-compatibility-matrix).

## SPRO 설정 레퍼런스

`configs/{MODULE}/` 아래에 SAP 모듈 14개 전체의 기본 레퍼런스 데이터가 있어요.
- `spro.md` — SPRO 설정 테이블/뷰
- `tcodes.md` — 트랜잭션 코드
- `bapi.md` — BAPI/FM 레퍼런스
- `tables.md` — 주요 테이블
- `enhancements.md` — BAdI / User Exit / BTE / VOFM
- `workflows.md` — 개발 워크플로우

모듈: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW.

### SPRO 로컬 캐시 (토큰 절약)

`/sc4sap:setup spro`는 고객별 SPRO 커스터마이징을 `.sc4sap/spro-config.json`으로 추출해요. 컨설턴트는 `common/spro-lookup.md`를 따라요.
1. 로컬 캐시 → 2. 정적 레퍼런스 → 3. 실시간 MCP 조회 (확인 후).

## SAP 전용 훅

`hooks/hooks.json`에 등록돼요.

| 이벤트 | 훅 | 하는 일 |
|---|---|---|
| SessionStart | `session-start.mjs`, `project-memory-session.mjs`, `legacy-migration-banner.mjs` | 플러그인 규칙과 skill-router 요약. `.sc4sap/project-memory.json`의 프로젝트 환경. 기존 단일 프로필 `sap.env`용 배너 |
| Setup (`init`, `maintenance`) | `setup-init.mjs`, `setup-maintenance.mjs` | `claude --init-only` / `-p --init` 실행 때 `.sc4sap` 구조를 만들어요. `claude -p --maintenance` 실행 때 오래된 상태를 지우고 설정을 점검해요 |
| PreToolUse (SAP 도구) | `permission-approver.mjs` | SAP MCP 호출을 자동 승인해서 파이프라인과 그 에이전트가 호출마다 묻지 않고 돌아가요. 행 데이터 읽기(`GetTableContents`, `GetRemoteTableContents`, `GetSqlQuery`)와 업무 액션(`PreviewBusinessAction`, `ExecuteBusinessAction`)은 예외로, 항상 확인을 물어요 하나만 예외예요. `stock-cbo` 방식의 DD* 리포지토리 메타데이터를 읽는 `GetSqlQuery`는 자동 승인돼요. |
| PreToolUse (행 읽기, 소스 쓰기) | `hooks/block-forbidden-tables.mjs` | 🔒 데이터 추출 차단 목록 (아래) — Create / Update로 작성한 테스트 코드와 CDS 뷰도 대상이에요. 행을 읽을 수 있는 경로이기 때문이에요 |
| PreToolUse (행 읽기) | `program-test/pt-gate.mjs` | program-test 실행 중: 실행의 `mask` 없는 읽기와, 실행 자체 destination 밖의 운영 읽기를 거부해요 |
| PreToolUse (파일 도구) | `evidence/guard.mjs` | 에이전트는 스크립트가 소유한 증빙 파일(영수증, 마스킹된 행, 하네스)을 쓸 수 없어요 |
| PostToolUse (SAP 도구) | `evidence/record.mjs` | MCP 응답을 실행의 증빙 원장에 기록해요 |
| PostToolUseFailure | `post-tool-use-failure.mjs` | 재시도 안내를 위해 실패와 재시도 횟수를 기록해요 |
| SubagentStart / SubagentStop | `subagent-tracker.mjs`, `verify-deliverables.mjs` | 디스패치된 에이전트를 추적해요. 에이전트가 예상 결과물을 남기지 않으면 경고해요 (차단하지는 않아요) |
| Stop / SessionEnd | `context-guard-stop.mjs`, `session-end.mjs` | 컨텍스트가 커지면 세션 새로고침을 제안해요. 세션 요약 로그 |

계층 가드(`scripts/hooks/tier-readonly-guard.mjs`, QA / PRD 읽기 전용)는 `/sc4sap:setup`이 프로젝트 설정에 설치해요 (멀티 환경 프로필 참고).

## 🔒 데이터 추출 차단 목록

`GetTableContents` / `GetSqlQuery`로 민감한 테이블(개인정보, 자격 증명, 급여, 은행, 거래성 재무)의 행 데이터를 가져가지 못하게 하는 다중 방어 계층이에요.

**강제 계층 4개**: L1 에이전트 지침 · L2 `CLAUDE.md`의 전역 지시 · L3 Claude Code `PreToolUse` 훅 · L4 MCP 서버 환경 변수 기반 가드.

**차단 목록 출처**: `exceptions/table_exception.md`가 인덱스이고, 실제 목록은 `exceptions/` 아래 섹션별 파일 11개에 있어요.

| 계층 | 범위 |
|------|----------|
| minimal | 은행/지급, 마스터 데이터 개인정보, 주소, 인증/보안, HR/급여, 세금/정부 ID, 가격/조건, 사용자 정의 `Z*` 개인정보 패턴 |
| standard | + 보호 대상 업무 데이터 (VBAK/BKPF/ACDOCA/VBRK/EKKO/CDHDR/STXH + CDS) |
| strict | + 감사/보안 로그, 커뮤니케이션/워크플로우 |

**동작**: `deny`(차단) 대 `warn`(경고 블록과 함께 진행). 호출에 포함된 테이블 중 하나라도 `deny`면 호출 전체가 차단돼요.

**프로필** (`/sc4sap:setup` 중에 선택): `strict` / `standard` / `minimal` / `custom`. 사이트별 추가 항목은 `.sc4sap/blocklist-extend.txt`에 넣어요.

**설치** (`/sc4sap:setup`이 자동으로 해요. 수동으로는):
```bash
node scripts/install-hooks.mjs            # user-level
node scripts/install-hooks.mjs --project  # project-level
```

**검증**:
```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# Expected: JSON with "permissionDecision":"deny"
```

**L4 서버 쪽 강제** (외부 스크립트를 포함한 모든 클라이언트를 막아요):
```bash
export SC4SAP_POLICY=on
export SC4SAP_POLICY_PROFILE=strict
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md
export SC4SAP_ALLOW_TABLE=TAB1,TAB2  # session emergency exemption (logged)
```

스키마/DDIC 메타데이터(`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`)와 존재 여부 확인은 계속 허용돼요.

## 🚫 `acknowledge_risk` — 필수 규칙

`GetTableContents` / `GetSqlQuery`는 `acknowledge_risk: true`를 받아 ask 계층 게이트를 우회해요. **편의 플래그가 아니라 감사 경계예요.**

1. **첫 호출에는 `acknowledge_risk: true`를 절대 설정하지 마세요** — 훅/서버가 먼저 판단하게 해요
2. **`ask` 응답이 오면** 멈추고 사용자에게 거부 사실을 알려요
3. 테이블과 범위를 밝히고 **명시적인 예/아니오 질문**을 해요
4. 명시적인 긍정 키워드(`yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `confirmed`)가 있을 때만 **`acknowledge_risk: true`로 재시도**해요
5. **모호한 명령은 승인이 아니에요** — `"pull it"`, `"try it"`, `"뽑아봐"`, `"my mistake"`, 침묵
6. **호출별, 테이블별, 세션별** — 승인은 이어지지 않아요

전체 프로토콜: `common/data-extraction-policy.md`.

### ⚠️ "항상 허용" 함정
`GetTableContents` / `GetSqlQuery` 권한 프롬프트가 뜨면 **"Allow once"**를 고르고, **"Always allow"**는 절대 고르지 마세요. "Always allow"를 고르면 Claude Code가 `permissions.allow`에 도구 ID를 추가해서 안전장치가 영구히 꺼져요. 복구: 상위 스킬을 아무거나 다시 실행하세요 — `trust-session` Step 2가 호출할 때마다 `GetTableContents`/`GetSqlQuery` 항목을 찾아 지워요.

## 🔀 SAP 연결: 웹 포트, RFC 백엔드, NCo

sc4sap은 웹 포트(HTTP 80NN / HTTPS 443NN)의 ADT로 SAP와 통신해요. 웹 포트를 열 수 없는 곳에서는 Windows 개발자 PC에서 **SAP .NET Connector(NCo)로 RFC 포트(33NN)**를 통해 접속할 수 있어요. ICF 노드도, Gateway 서비스도, `S_SERVICE`도 필요 없어요. `S_ADT_RES`와 개발 권한은 그대로예요. NCo는 SAP 라이선스 소프트웨어라서 사용자가 각자 설치해야 해요. 애플리케이션 서버 + 인스턴스만 지원해요 (로그온 그룹, SAProuter, SNC는 안 돼요). 자세한 내용: [시작하기 → RFC(NCo)](GETTING-STARTED.ko.md#웹-포트를-열-수-없을-때-rfcnco-방식).

Screen / GUI Status / Text Element 작업은 SAP의 RFC 사용 가능 FM으로 디스패치돼요. 웹 포트에서 쓰는 이관 백엔드는 2가지예요.

| `SAP_RFC_BACKEND` | 방식 | 사용 시기 |
|---|---|---|
| `odata` (기본) | HTTPS OData v2 `ZMCP_ADT_SRV` | 보안이 강화된 Gateway 설치에서도 동작해요. 표준 Gateway 인증(S_SERVICE)을 거쳐요. [docs/odata-backend.md](odata-backend.md) |
| `soap` | HTTPS `/sap/bc/soap/rfc` | `/sap/bc/soap/rfc` ICF 노드가 활성일 때 쓰는 클래식 경로 (운영에서는 점점 비활성화돼요) |

`native`, `gateway`, `zrfc`는 MCP 4.10.0에서 제거됐어요 — MCP 서버는 이 값으로는 시작을 거부해요. `odata` 또는 `soap`으로 바꾸세요.

언제든 `/sc4sap:sap-option`으로 전환하고, MCP를 다시 연결한 뒤 `/sc4sap:sap-doctor`로 확인하세요.

---

← [README로 돌아가기](../README.ko.md) · [설치 →](INSTALLATION.ko.md) · [변경 이력 →](CHANGELOG.ko.md)
