<p align="center">
  <img src="sc4sap.png" alt="SuperClaude for SAP" width="720"/>
</p>

<p align="center">
  <a href="README.md">English</a> | 한국어 | <a href="README.ja.md">日本語</a> | <a href="README.de.md">Deutsch</a>
</p>

# SuperClaude for SAP (sc4sap)

> SAP ABAP 개발을 위한 Claude Code 플러그인 — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private) 지원

**공식 사이트:** [sc4sap.dev](https://sc4sap.dev)

[![Website](https://img.shields.io/badge/website-sc4sap.dev-0A66C2)](https://sc4sap.dev)
[![MCP server on npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![Plugin version](https://img.shields.io/github/package-json/v/babamba2/superclaude-for-sap/main?label=sc4sap&color=6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## sc4sap이란?

SuperClaude for SAP은 Claude Code를 풀스택 SAP 개발 어시스턴트로 바꿔 줘요. [MCP ABAP ADT 서버](https://github.com/babamba2/abap-mcp-adt-powerup) (150+ 툴)로 SAP 시스템에 연결해요. 그리고 클래스/함수모듈/리포트/CDS 뷰/Dynpro/GUI 스테이터스 등 ABAP 객체를 직접 생성·조회·수정·삭제해요.

## 핵심 기능

| 기능 | 설명 |
|------|------|
| 🔌 **자동 MCP 설치** | `/sc4sap:setup` 중에 `abap-mcp-adt-powerup`을 자동 설치/설정/연결테스트해요. 수동 MCP 배선은 필요 없어요. |
| 🌐 **다중 환경 프로파일 (Dev / QA / Prod)** | 회사별·티어별로 여러 SAP 시스템(`KR-DEV`, `KR-QA`, `KR-PRD`, `US-DEV` 등)을 등록해요. `/sc4sap:sap-option` 으로 세션 중에 즉시 전환해요. **QA / Prod 프로파일은 자동 읽기전용 보호**: PreToolUse 훅과 MCP 서버 가드 2계층이 `Create*/Update*/Delete*`, `CreateTransport`, 코드 실행 도구를 차단해요. 훅을 우회해도 서버 단에서 여전히 거부돼요. 비밀번호는 **OS 자격 증명 저장소** (`@napi-rs/keyring` — Windows Credential Manager / macOS Keychain / libsecret) 에 보관돼요. 그래서 `.sc4sap/` 가 git 에 시크릿을 누출할 위험이 없어요. 산출물(스펙, CBO 카탈로그, 감사)은 프로파일별로 격리돼요. 읽기전용 크로스뷰도 지원해서 QA 세션이 Dev 에서 만든 스펙을 오염시키지 않고 참조할 수 있어요. |
| 🏗️ **자동 프로그램 생성기** | ABAP 프로그램을 엔드-투-엔드로 생성해요. Main + Include 컨벤션, OOP/Procedural, 풀 ALV + Docking, Dynpro + GUI 스테이터스, Text Elements, ABAP Unit. 플랫폼 인식(ECC / S4 On-Prem / Cloud). |
| 🔍 **프로그램 분석** | MCP로 ABAP 객체를 읽은 뒤 Clean ABAP / 성능 / 보안 리뷰를 하거나 Functional/Technical Spec을 역공학해요 (Markdown/Excel). |
| 🧪 **코드 분석** | `/sc4sap:analyze-code` — `sap-code-reviewer` 전용 정적 리뷰예요. Clean ABAP / 성능 / 보안 / SAP 표준 준수를 검토해요. 이슈를 심각도별로 정리하고 구체적인 수정을 제안해요. |
| 🔀 **프로그램 비교** | `/sc4sap:compare-programs` — 2~5개 ABAP 프로그램을 컨설턴트 관점에서 10개 차원으로 비교해요. 대상은 같은 비즈니스 시나리오를 공유하지만 모듈(MM/CO)·국가(KR/EU)·Persona(컨트롤러/창고)로 분화된 프로그램이에요. 결과는 편집 가능한 HTML 리포트(색상 판정 매트릭스·차이만 보기, 필드 차이표, 화면 나란히 비교, 의사결정 가이드, 버전 관리 + 영어판)로 나와요. |
| ⚙️ **설정 → 문서** | `/sc4sap:config-to-document` — 연결된 시스템에 실제로 설정된 모듈 구성을 문서화해요(MM 우선). 결과물은 IMG 트리를 따르는 오프라인 HTML 파일 하나예요. IMG 액티비티별 실제 테이블 값을 SM30 스타일 화면으로 그려요. 고객 트랜스포트로 변경된 행과 트랜스포트 이력, 설정 점검, SAP IMG 문서도 담아요. 모듈 컨설턴트 에이전트가 쓰고 `sap-critic`이 검토한 컨설턴트 노트도 들어가요. SAP에는 읽기 전용이에요. 페이지 안 편집 모드로 컨설턴트가 노트 · 설정값 표 · 변경 이력을 고쳐 다음 버전에 반영할 수 있어요. |
| 🖨️ **스마트폼 미리보기** | `/sc4sap:smartform-preview` — 출력 프로그램이나 테스트 데이터 없이 SmartForm의 예상 출력물을 JPG로 그려요. 윈도우는 실제 mm 위치에 표시해요. SmartStyle 글꼴, 테두리·음영이 있는 템플릿, SE78 그래픽(로고 서명), 예시 행이 들어간 루프까지 보여 줘요. `&필드&`에는 DDIC 타입 길이에 맞춘 가상의 예시 값이 들어가요. 내용이 잘리는 셀과 윈도우는 보고서로 알려 줘요. 읽기 전용이에요. → `smartforms/<FORM>/<FORM>-preview.{jpg,html}` |
| 📄 **PDF로 스마트폼 만들기** | `/sc4sap:smartform-from-pdf` — 출력된 서식의 PDF(또는 스크린샷)로 SmartForm을 만들어요. 괘선 영역은 템플릿이 돼요. 모든 글자는 원본과 같은 위치에 기존 SmartStyle의 가장 가까운 서식으로 배치돼요. 이어서 값은 `&필드&`로, 품목 줄은 내부 테이블 루프로 바꾸고 인터페이스를 추가해요(사용자와 함께 결정). DEV 시스템에 올려 실제로 출력한 뒤 원본 페이지와 점수로 비교해요. → `smartforms/<FORM>/` |
| 📊 **프로젝트 대시보드** | `/sc4sap:project-dashboard` — SAP 프로젝트마다 PM과 PMO가 편집하는 HTML 페이지 하나를 만들어요(요약, KPI, Q-gate 마일스톤, 간트 WBS, 팀, 이력). 모든 프로젝트를 모은 포트폴리오 페이지도 있어요. 신규 구축(SAP Activate), S/4 전환, 롤아웃, AMS 릴리스, 소규모 프로젝트 템플릿을 제공해요. 모듈 컨설턴트와 개발 컨설턴트를 따로 추적해요(WRICEF 단계, 인계 대기열). 실적은 연결된 시스템에서 읽어요(커스터마이징/워크벤치 이관, 패키지 오브젝트, 비활성 오브젝트, 오픈 후 덤프). 인원은 날짜로 투입·철수하고, 철수자의 미결 항목을 표시해요. 모바일에서도 편집돼요. → `projects/<CODE>/` |
| 🔐 **권한 매트릭스** | `/sc4sap:role-matrix` — 프로젝트 권한 설계서를 편집 가능한 HTML 워크북 하나로 만들어요. 점검 결과가 있는 표지, 업무 역할, PFCG 역할, 업무 역할 × T-code 매트릭스(F/C/D), 사용자 × 역할 배정, 권한 오브젝트, SoD 규칙과 자동 충돌 점검, 변경 이력이 들어가요. 새로 설계할 때는 모듈 컨설턴트가 제안해요(ST03N 사용 실적이 있으면 실제 쓰는 T-code로 좁혀요). SAP에서 읽을 때는 역할, T-code, 권한 값, 조직 레벨, 사용자 배정을 가져와요. 사용자는 ID만 읽고 사용자 마스터는 읽지 않아요. 큰 시스템은 페이지로 나눠 보여 줘요. 검색·CSV·붙여넣기는 시트 전체에 적용돼요. SAP에는 쓰지 않아요. → `roles/<CODE>/` |
| 🧭 **S/4HANA 전환 준비 분석** | `/sc4sap:s4-conversion-readiness` — ECC를 S/4HANA로 전환하기 전에 준비할 것을 HTML 보고서 하나로 정리해요. 목표(S/4HANA 2023, 2025, Public Cloud, 비교)를 묻고, 시스템을 읽은 뒤 찾은 근거와 함께 도입을 검토할 확장(EWM, RAP / Fiori elements, Fiori Launchpad, 출력 관리, Integration Suite, Event Mesh)을 물어요. CBO 참조 그래프와 저장된 소스를 단순화 항목 지식 기반과 맞대요. 바뀐 테이블(KONV, VBUK/VBUP, MKPF/MSEG, BSEG 인덱스·합계 테이블 …), 없어진 T-code와 BAPI, BP, Native SQL, HANA 정렬 순서, 40자리 MATNR, PI/PO 프록시, IDoc, 워크플로 이벤트를 찾아요. 영향 받는 테이블의 고객 필드는 DDIC에서 직접 읽어요. 옮길 데이터(MATDOC, ACDOCA, PRCD_ELEMENTS), 확장할 프록시 CDS 뷰(MARC, MBEW, BSIS …), Fiori용 표준 CDS 뷰를 나눠 보여 줘요. 객체마다 등급과 소스 줄, 대략 공수, clean core 등급, 준비 체크리스트가 들어가요. SAP에는 쓰지 않아요. → `conversion/<CODE>/` |
| 🗺️ **모듈 → 프로세스** | `/sc4sap:module-to-process` — 모듈마다 **편집 가능한 HTML 프로세스 맵** 하나를 만들어요. 운영 시스템(ST03N)에서 실제로 쓰는 TCode만 분석하고, 모듈의 여러 패키지 CBO 프로그램을 표준 L1~L4 프로세스에 배치해요(Variant·담당·시스템 포함). L3마다 시나리오 swimlane, L4마다 PDD 형식 Task 시트(소스 근거가 붙은 Business Rule, Step, 관련 객체, 인터페이스, S/4 conversion 메모)를 넣어요. 모듈 컨설턴트 검토, 기존 BPH 대조, 영문판은 선택이에요. `package-to-process`를 대체해요(한 릴리스 동안 redirect) |
| 🩺 **운영 진단** | 운영 트리아지 루프: ST22 덤프, SM02, /IWFND/ERROR_LOG, 프로파일러 트레이스, 로그, where-used — 모두 Claude에서 처리해요. |
| ♻️ **CBO 재사용** | Z-패키지 1회 인벤토리 → `create-program` / `program-to-spec`이 기존 CBO 자산을 우선 재사용해요. 브라운필드에서는 필수예요. |
| 🧷 **CBO Extension 인식 (CMOD / GGB0·1 / BTE / VOFM / BAdI / APPEND)** | 사용자 익스짓(CMOD), 검증·치환(GGB0/GGB1), BTE 펑션 모듈, VOFM 루틴(조건 / 공식 / 데이터 전송), BAdI 구현, APPEND Structure를 인벤토리해요. `create-program` / BAPI 호출 시에는 기존 Extension 필드(예: BAPI `EXTENSIONIN` / 테이블 append)를 우선 재사용해요. 덤프·장애 대응 시에는 Extension 포인트를 1순위 용의자로 검토해요. |
| 🏭 **산업 컨텍스트** | 14개 산업 레퍼런스 (retail, fashion, cosmetics, tire, automotive, pharma, F&B, chemical, electronics, construction, steel, utilities, banking, public-sector). |
| 🌏 **국가/로컬라이제이션** | 15개 국가 + EU-common (KR/JP/CN/US/DE/GB/FR/IT/ES/NL/BR/MX/IN/AU/SG). e-인보이스, 뱅킹, 페이롤, 세제. |
| 🧩 **활성 모듈 인식** | 교차 모듈 통합 힌트를 줘요. MM + PS가 활성이면 MM CBO에 WBS 필드를 자동 제안해요. SD + CO가 활성이면 CO-PA를 파생해요. [상세 →](common/active-modules.md) |
| 🤝 **모듈 컨설테이션** | `sap-analyst` / `sap-critic` / `sap-planner` / `sap-architect`가 업무 판단이 필요할 때 14개 모듈 컨설턴트 + 1개 BC 컨설턴트에 위임해요. 사용자가 직접 질의할 때는 `/sc4sap:ask-consultant`를 써요. 키워드로 SD/MM/FI/CO/PP/PS/PM/QM/TR/HCM/WM/TM/BW/Ariba/BC에 자동 라우팅해요. 답변은 프로젝트에 설정된 SAP 환경(버전·산업·국가·활성 모듈)에 맞춰요. 읽기 전용이에요. |

## 문서

- 📦 **[설치 및 설정 →](docs/INSTALLATION.ko.md)** — 요구사항, 설치 옵션, 위저드 단계, 블록리스트 설정
- 🎯 **[기능 상세 →](docs/FEATURES.ko.md)** — 26개 에이전트, 14개 스킬, MCP 툴, RFC 백엔드, 훅, 데이터 추출 정책
- 📜 **[변경 이력 →](docs/CHANGELOG.ko.md)** — 버전 히스토리와 breaking changes

## Unleashed

<p align="center">
  <a href="sc4sap_unleashed.png">
    <img src="sc4sap_unleashed.png" alt="SC4SAP Unleashed" width="100%"/>
  </a>
</p>

## 제작자

- **paek seunghyun** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/seunghyun-paek-5b83b7183/)

## 기여자

- **김시훈 (Kim Sihun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sihun-kim-27737132b/)

## 감사의 말

이 프로젝트는 **허예찬**님의 [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode)에서 영감을 받았어요. 멀티 에이전트 오케스트레이션 패턴, Socratic 딥 인터뷰 게이팅, 지속적 루프 개념, 전체적인 플러그인 철학이 모두 그 작업에서 유래해요.

**fr0ster**님의 [**mcp-abap-adt**](https://github.com/fr0ster/mcp-abap-adt)는 저희 커스터마이즈된 MCP 서버(`abap-mcp-adt-powerup`)를 구축하는 데 크게 기여했어요. 선구적인 ADT-over-MCP 작업 — 요청 쉐이핑, 엔드포인트 커버리지, 객체 I/O — 이 개념적 토대가 됐어요. 저희는 자체 서버를 설계·확장할 때 이 토대에 의존했어요.

## 라이선스

[MIT](LICENSE)
