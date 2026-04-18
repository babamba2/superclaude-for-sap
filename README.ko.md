<p align="center">
  <img src="sc4sap.png" alt="SuperClaude for SAP" width="720"/>
</p>

<p align="center">
  <a href="README.md">English</a> | 한국어 | <a href="README.ja.md">日本語</a> | <a href="README.de.md">Deutsch</a>
</p>

# SuperClaude for SAP (sc4sap)

> SAP ABAP 개발을 위한 Claude Code 플러그인 — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private) 지원

[![MCP server on npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![Plugin version](https://img.shields.io/badge/sc4sap-v0.2.4-6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## sc4sap이란?

SuperClaude for SAP은 Claude Code를 풀스택 SAP 개발 어시스턴트로 변환합니다. [MCP ABAP ADT 서버](https://github.com/babamba2/abap-mcp-adt-powerup) (150+ 툴)를 통해 SAP 시스템에 연결하여 클래스/함수모듈/리포트/CDS 뷰/Dynpro/GUI 스테이터스 등 ABAP 객체를 직접 생성·조회·수정·삭제합니다.

## 핵심 기능

| 기능 | 설명 |
|------|------|
| 🔌 **자동 MCP 설치** | `/sc4sap:setup` 중 `abap-mcp-adt-powerup` 자동 설치/설정/연결테스트. 수동 MCP 배선 불필요. |
| 🏗️ **자동 프로그램 생성기** | ABAP 프로그램 엔드-투-엔드 생성: Main + Include 컨벤션, OOP/Procedural, 풀 ALV + Docking, Dynpro + GUI 스테이터스, Text Elements, ABAP Unit — 플랫폼 인식(ECC / S4 On-Prem / Cloud). |
| 🔍 **프로그램 분석** | MCP로 ABAP 객체 읽기 → Clean ABAP / 성능 / 보안 리뷰, 또는 Functional/Technical Spec 역공학 (Markdown/Excel). |
| 🧪 **코드 분석** | `/sc4sap:analyze-code` — `sap-code-reviewer` 전용 정적 리뷰: Clean ABAP / 성능 / 보안 / SAP 표준 준수. 심각도별 이슈와 구체적 수정 제안. |
| 🔀 **프로그램 비교** | `/sc4sap:compare-programs` — 같은 비즈니스 시나리오를 공유하지만 모듈(MM/CO)·국가(KR/EU)·Persona(컨트롤러/창고)로 분화된 2~5개 ABAP 프로그램을 컨설턴트 관점에서 10개 차원으로 비교 → Markdown 리포트. |
| 🩺 **운영 진단** | 운영 트리아지 루프: ST22 덤프, SM02, /IWFND/ERROR_LOG, 프로파일러 트레이스, 로그, where-used — 모두 Claude에서. |
| ♻️ **CBO 재사용** | Z-패키지 1회 인벤토리 → `create-program` / `program-to-spec`이 기존 CBO 자산 우선 재사용. 브라운필드에 필수. |
| 🧷 **CBO Extension 인식 (CMOD / GGB1·2 / BAdI / APPEND)** | 사용자 익스짓(CMOD), 치환·검증(GGB1/GGB2), BAdI 구현, APPEND Structure 인벤토리. `create-program` / BAPI 호출 시 기존 Extension 필드(예: BAPI `EXTENSIONIN` / 테이블 append) 우선 재사용; 덤프·장애 대응 시 Extension 포인트를 1순위 용의자로 검토. |
| 🏭 **산업 컨텍스트** | 14개 산업 레퍼런스 (retail, fashion, cosmetics, tire, automotive, pharma, F&B, chemical, electronics, construction, steel, utilities, banking, public-sector). |
| 🌏 **국가/로컬라이제이션** | 15개 국가 + EU-common (KR/JP/CN/US/DE/GB/FR/IT/ES/NL/BR/MX/IN/AU/SG). e-인보이스, 뱅킹, 페이롤, 세제. |
| 🧩 **활성 모듈 인식** | 교차 모듈 통합 힌트: MM + PS 활성 → MM CBO에 WBS 필드 자동 제안; SD + CO 활성 → CO-PA 파생. [상세 →](common/active-modules.md) |
| 🤝 **모듈 컨설테이션** | `sap-analyst` / `sap-critic` / `sap-planner` / `sap-architect`가 업무 판단 필요 시 14개 모듈 컨설턴트 + 1개 BC 컨설턴트에 위임. |

## 문서

- 📦 **[설치 및 설정 →](docs/INSTALLATION.ko.md)** — 요구사항, 설치 옵션, 위저드 단계, 블록리스트 설정
- 🎯 **[기능 상세 →](docs/FEATURES.ko.md)** — 25개 에이전트, 18개 스킬, MCP 툴, RFC 백엔드, 훅, 데이터 추출 정책
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

이 프로젝트는 **허예찬**님의 [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode)에서 영감을 받았습니다. 멀티 에이전트 오케스트레이션 패턴, Socratic 딥 인터뷰 게이팅, 지속적 루프 개념, 전체적인 플러그인 철학이 모두 그 작업에서 유래합니다.

**fr0ster**님의 [**mcp-abap-adt**](https://github.com/fr0ster/mcp-abap-adt)는 저희 커스터마이즈된 MCP 서버(`abap-mcp-adt-powerup`)를 구축하는 데 크게 기여했습니다. 선구적인 ADT-over-MCP 작업 — 요청 쉐이핑, 엔드포인트 커버리지, 객체 I/O — 이 저희가 자체 서버를 설계·확장할 때 의존한 개념적 토대가 되었습니다.

## 라이선스

[MIT](LICENSE)
