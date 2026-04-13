[English](README.md) | 한국어

# SuperClaude for SAP (sc4sap)

> SAP On-Premise S/4HANA ABAP 개발을 위한 Claude Code 플러그인

[![npm version](https://img.shields.io/npm/v/superclaude-for-sap?color=cb3837)](https://www.npmjs.com/package/superclaude-for-sap)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## sc4sap란?

SuperClaude for SAP는 Claude Code를 풀스택 SAP 개발 어시스턴트로 변환합니다. [MCP ABAP ADT 서버](https://github.com/babamba2/abap-mcp-adt-powerup)(150+ 도구)를 통해 SAP 시스템에 직접 연결하여 클래스, 펑션 모듈, 리포트, CDS 뷰 등의 ABAP 오브젝트를 생성/조회/수정/삭제할 수 있습니다.

## 요구사항

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-서버_필수-FF6600)

| 요구사항 | 상세 |
|----------|------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI 설치 (Max/Pro 구독 또는 API 키) |
| **SAP 시스템** | On-Premise S/4HANA (ADT 활성화) |
| **MCP 서버** | [abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup) 설정 완료 |

## 기능

### 24개 SAP 전문 에이전트

| 분류 | 에이전트 |
|------|----------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — 시스템 관리, 트랜스포트 관리, 진단 |
| **모듈 (13)** | SD, MM, FI, CO, PP, PM, QM, TR, HCM, WM, TM, Ariba, BW |

### 14개 스킬

| 스킬 | 설명 |
|------|------|
| `sc4sap:setup` | 플러그인 설정 + SPRO 컨피그 자동 생성 |
| `sc4sap:autopilot` | 자율 실행 파이프라인 |
| `sc4sap:ralph` | SAP 검증 포함 지속 루프 |
| `sc4sap:ralplan` | 합의 기반 기획 |
| `sc4sap:team` | 병렬 에이전트 협업 실행 |
| `sc4sap:teams` | CLI 팀 런타임 (tmux 기반) |
| `sc4sap:ask` | 적절한 에이전트에 질문 라우팅 |
| `sc4sap:deep-interview` | 소크라테스식 요구사항 수집 |
| `sc4sap:hud` | SAP 시스템 상태 HUD 표시 |
| `sc4sap:mcp-setup` | MCP ABAP ADT 서버 설정 가이드 |
| `sc4sap:doctor` | 플러그인 + MCP + SAP 연결 진단 |
| `sc4sap:release` | CTS 트랜스포트 릴리즈 워크플로우 |
| `sc4sap:create-object` | ABAP 오브젝트 생성 (하이브리드 모드) |
| `sc4sap:analyze-code` | ABAP 코드 분석 및 개선 |

### SPRO 컨피그 참조

13개 SAP 모듈 전체에 대한 내장 참조 데이터:

```
configs/{MODULE}/
  ├── spro.md       # SPRO 설정 테이블/뷰
  ├── tcodes.md     # 트랜잭션 코드
  ├── bapi.md       # BAPI/FM 참조
  └── workflows.md  # 개발 워크플로우
```

**모듈**: SD, MM, FI, CO, PP, PM, QM, TR, HCM, WM, TM, Ariba, BW

### SAP 특화 훅

- **SPRO 자동 주입** — Haiku LLM이 사용자 입력을 분류하여 관련 모듈 SPRO 컨피그를 자동 주입
- **트랜스포트 검증** — MCP ABAP Create/Update 전 트랜스포트 존재 여부 확인
- **자동 활성화** — 오브젝트 생성/수정 후 ABAP 활성화 자동 트리거
- **구문 검사** — ABAP 에러 발생 시 시맨틱 분석 자동 실행

## 설치

```bash
# 마켓플레이스에서 설치
claude plugin install sc4sap

# 또는 소스에서 설치
git clone https://github.com/babamba2/superclaude-for-sap.git
cd superclaude-for-sap
npm install && npm run build
```

## 설정

```bash
# MCP 연결 설정 및 SPRO 컨피그 생성
/sc4sap:setup
```

실행 시:
1. MCP ABAP ADT 서버 연결 확인
2. S/4HANA 시스템에서 SPRO 컨피그 파일 자동 생성
3. 훅 및 에이전트 설정

## 빠른 시작

```bash
# ABAP 클래스 생성
/sc4sap:create-object

# 기존 코드 분석
/sc4sap:analyze-code

# 트랜스포트 릴리즈
/sc4sap:release

# 자율 개발 모드
/sc4sap:autopilot
```

## 사용 예시

**ABAP 클래스 생성 & 단위 테스트**
```
판매 오더 검증 클래스 ZCL_SD_ORDER_VALIDATOR를 생성해줘.
여신 체크, 납품일 검증, 가격 검증 메서드를 포함하고
각 메서드에 대한 ABAP Unit 테스트도 만들어줘.
```

**크로스 모듈 통합 분석**
```
SD 빌링(VF01)과 FI 회계전표 전기 간의 연동 포인트를 분석해줘.
빌링에서 회계 전기까지 어떤 BAPI와 User Exit이 관여하는지 보여줘.
```

**모듈 컨설턴트 워크플로우**
```
FI 컨설턴트로서 자동지급 프로그램(F110)을 통한 거래처 은행이체
지급 설정을 도와줘. 필요한 마스터 데이터, SPRO 설정, 커스텀 개발은?
```

## 기술 스택

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![MCP](https://img.shields.io/badge/MCP_SDK-Protocol-FF6600)

## 로드맵

- **v0.1.0** (현재) — 24 에이전트, 14 스킬, 13 모듈 컨피그 포함 코어 플러그인
- **v0.2.0** (예정) — RAP 지원, 멀티 시스템 (Dev/QA/Prod)

## 저자

백승현 (paek seunghyun)

## 라이선스

[MIT](LICENSE)
