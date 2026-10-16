# PP Module Enhancements / PP 모듈 확장

Production Planning (PP) enhancement catalog covering classic customer exits (CMOD/SMOD), BAdIs, enhancement spots, custom fields, and S/4HANA extensibility.

생산 계획(PP) 모듈의 클래식 사용자 출구(CMOD/SMOD), BAdI, 확장 스폿, 사용자 정의 필드 및 S/4HANA 확장성 카탈로그.

---

## 1. Overview / 개요

SAP PP offers multiple enhancement mechanisms depending on release and use case:

SAP PP는 릴리스 및 사용 사례에 따라 다양한 확장 메커니즘을 제공합니다:

- **Classic Customer Exits (CMOD/SMOD)** — Legacy function module exits, still active in ECC and S/4HANA.
- **BAdIs (Business Add-Ins)** — Object-oriented, supported on both ECC and S/4HANA.
- **Enhancement Spots / Implicit & Explicit Enhancements** — Modern framework (NetWeaver 7.0+).
- **Custom Fields / Append Structures** — Extend standard tables (CI_* include structures).
- **S/4HANA Extensions (CDS / RAP / Key User Extensibility)** — Cloud-ready extensibility.

클래식 사용자 출구는 ECC 및 S/4HANA 모두 유효하며, 신규 개발은 BAdI/확장 스폿을 권장합니다.

---

## 2. Classic Customer Exits (CMOD/SMOD) / 클래식 사용자 출구

| Name | System | Description | Usage |
|---|---|---|---|
| PPCO0001 – PPCO0023 | ECC/S4 | Production order processing exits / 생산 오더 처리 출구 | Order create/change/release logic |
| CONFPP01 – CONFPP06 | ECC/S4 | Production order confirmation / 생산 오더 확인 | Validation & update at confirmation |
| CONFPS01 – CONFPS05 | ECC/S4 | Project confirmation / 프로젝트 확인 | PS confirmation enhancements |
| COBL0001 – COBL0002 | ECC/S4 | Account assignment / 계정 배정 | Customize CO account assignment fields |
| PCSD0001 – PCSD0008 | ECC/S4 | BOM (Bill of Materials) / 자재 명세서 | BOM create/change/explode logic |
| PLM_AUDIT | ECC/S4 | Audit management / 감사 관리 | PLM audit enhancements |
| MDKP0001 | ECC/S4 | MRP result / MRP 결과 | Modify MRP run result |
| MDPQ0001 | ECC/S4 | MRP list / MRP 목록 | Customize MRP list (MD04/MD05) |
| M61X0001 | ECC/S4 | MRP material selection / MRP 자재 선택 | EXIT_SAPMM61X_001: exclude materials from the planning run by a user exit key (MD01/MDBT) |
| MRP00001 – MRP00003 | ECC/S4 | MRP planning run / MRP 계획 실행 | Extend planning run |
| PLAS0001 | ECC/S4 | Task list / 작업 목록 | Routing / task list logic |
| PPPIPI01 – PPPIPI09 | ECC/S4 | Process industry / 프로세스 산업 | Process order enhancements |
| STATTEXT | ECC/S4 | Status text / 상태 텍스트 | Customize status display |
| LMEXF001 | ECC/S4 | Factory calendar / 공장 달력 | Calendar customization |

---

## 3. BAdIs / BAdI

| Name | System | Description | Usage |
|---|---|---|---|
| WORKORDER_UPDATE | ECC/S4 | Production order changes / 생산 오더 변경 | Intercept order create/change |
| WORKORDER_STATUS | ECC/S4 | Status changes / 상태 변경 | Status-driven logic |
| WORKORDER_GOODSMVT | ECC/S4 | Order goods movements / 오더 자재 이동 | Customize GR/GI on orders |
| MD_CHANGE_MRP_DATA | ECC/S4 | MRP result modification / MRP 결과 수정 | Adjust planning output |
| MD_ADD_ELEMENTS | ECC/S4 | Add custom MRP elements / 사용자 정의 MRP 요소 추가 | Inject custom elements to MD04 |
| MD_MRP_LIST | ECC/S4 | MRP list modification / MRP 목록 수정 | MD05 list enhancements |
| MD_DISPOSITION | ECC/S4 | Planning run / 계획 실행 | Control planning behavior |
| MD_PLDORD_SELECT | ECC/S4 | Planned order selection / 계획 오더 선택 | Customize planned order filter |
| CO_CONF_UPDATE | ECC/S4 | Confirmation / 확인 | Extend confirmation update |
| BACKFLUSH_BADI | ECC/S4 | Backflush / 역플러시 | Backflush logic |
| ROUTING_MAINTAIN | ECC/S4 | Routing / 라우팅 | Routing maintenance |
| CS_BOM_EXPLOSION | ECC/S4 | BOM explosion / BOM 전개 | Customize BOM explosion |
| BADI_BOM_CHANGE | ECC/S4 | BOM change / BOM 변경 | BOM change logic |
| ATP_ADAPTER | ECC/S4 | Availability check / 가용성 검사 | ATP customization |
| CO_ACCOUNT_ASSIGN | ECC/S4 | Order account assignment / 오더 계정 배정 | Account assignment logic |
| CO_PRODORD_UPDATE | ECC/S4 | Production order header / 생산 오더 헤더 | Header update logic |
| BADI_MATERIAL_CHECK | ECC/S4 | Material validation / 자재 검증 | Validate material in PP |

---

## 4. Enhancement Spots (Modern) / 확장 스폿 (현대식)

| Name | System | Description | Usage |
|---|---|---|---|
| ES_SAPLCOZF | ECC/S4 | Order processing framework / 오더 처리 프레임워크 | Implicit & explicit enhancements for order logic |
| ES_SAPLCOBP | ECC/S4 | Order BAPI framework / 오더 BAPI 프레임워크 | BAPI-level enhancements |

---

## 5. Module-Specific Special Enhancements / 모듈 특수 확장

- **SAPLCOBT includes**: `EXIT_SAPLCOBT_001` — Order type default / 오더 유형 기본값
- **SAPLCOZV**: Scheduling / 일정 관리
- **SAPLMP01**: MRP logic / MRP 로직
- **Pegging**: BAdI `MD_PEG_BADI` — Pegging customization / 페깅 사용자 정의
- **Capacity planning**: `EXIT_RM61T903_001`, BAdI `CAPACITY_PLAN` — 용량 계획
- **Process industry**:
  - BAdI `PI_SHEET_LOG` — PI sheet logging / PI 시트 로깅
  - BAdI `WORKORDER_PI` — Process order-specific / 프로세스 오더 전용

---

## 6. Custom Fields / Append Structures / 사용자 정의 필드

| Include | Table | Description |
|---|---|---|
| CI_AUFK | AUFK | Order master header / 오더 마스터 헤더 |
| CI_AFKO | AFKO | Order header (PP) / 오더 헤더 |
| CI_AFPO | AFPO | Order item / 오더 품목 |
| CI_AFVC | AFVC | Order operation / 오더 작업 |
| CI_STKO | STKO | BOM header / BOM 헤더 |
| CI_STPO | STPO | BOM item / BOM 품목 |
| CI_MDKP | MDKP | MRP header / MRP 헤더 |

---

## 7. S/4HANA Extensions (CDS / RAP) / S/4HANA 확장

- **CDS Views**:
  - `I_ManufacturingOrder` — Manufacturing order interface view
  - `I_BillOfMaterial` — BOM interface view
- **aMRP (advanced MRP on S/4HANA)** — BAdIs exposed in `/SAPAPO/` namespace
- **Production planning** migrated from SAP APO → S/4HANA embedded PP/DS
- **Key User Extensibility** (Fiori) — Custom fields/logic for manufacturing apps
- **RAP** — Build custom manufacturing order extensions via Behavior Definitions

---

## 8. Recommended Approach / 권장 접근 방식

1. **BAdIs > CMOD customer exits** — prefer object-oriented BAdIs.
2. **MRP customization** — use `MD_CHANGE_MRP_DATA` rather than `MDKP0001`.
3. **Order changes** — use `WORKORDER_UPDATE` / `CO_PRODORD_UPDATE`.
4. **S/4HANA** — leverage CDS extensions + Key User Extensibility before classic exits.
5. **Custom fields** — use CI_* append structures; for S/4 prefer Custom Fields app.

BAdI를 우선 사용하고, MRP 결과 변경에는 `MD_CHANGE_MRP_DATA`를 권장합니다. S/4HANA에서는 CDS 확장 및 키 사용자 확장성을 먼저 고려하세요.
