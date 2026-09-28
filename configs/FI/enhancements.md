# FI Module Enhancements / FI 모듈 확장

## Overview / 개요

The FI (Financial Accounting) module uses a distinctive enhancement landscape including Business Transaction Events (BTEs), Validations/Substitutions (GGB0/GGB1), and the Coding Block for account-assignment field extensions.
FI(재무 회계) 모듈은 BTE(비즈니스 트랜잭션 이벤트), 검증/대체(GGB0/GGB1), Coding Block을 포함한 고유한 확장 체계를 사용합니다.

- Classic Customer Exits (CMOD/SMOD) / 전통적 고객 출구
- **BTE (Business Transaction Events)** — FI primary framework / FI의 핵심 프레임워크
- BAdIs / 비즈니스 애드인
- **Coding Block extension (OXK3)** / 코딩 블록 확장
- **Validations / Substitutions (GGB0 / GGB1 / OB28 / OBBH)** / 검증 및 대체
- S/4HANA ACDOCA Extensions / Universal Journal 확장

---

## 1. Classic Customer Exits (CMOD/SMOD) / 전통적 고객 출구

| Name | System | Description / 설명 | Usage / 용도 |
|------|--------|--------------------|--------------|
| RFKORIEX | ECC/S4 | Correspondence / 통신 | Correspondence types |
| F050S001 | ECC/S4 | FI IDoc outbound / FI IDoc 송신 | IDoc data fill |
| F050S002 | ECC/S4 | FI IDoc inbound / FI IDoc 수신 | Inbound IDoc processing |
| F050S003 | ECC/S4 | FI IDoc segment / FI IDoc 세그먼트 | Custom segments |
| F050S004 | ECC/S4 | FI IDoc status / FI IDoc 상태 | Status processing |
| F050S005 | ECC/S4 | FI IDoc reference / FI IDoc 참조 | Reference mapping |
| F050S006 | ECC/S4 | FI IDoc user fields / FI IDoc 사용자 필드 | User-defined fields |
| F050S007 | ECC/S4 | FI IDoc clearing / FI IDoc 정리 | Clearing processing |
| F180A001 | ECC/S4 | Report RFGOOB00 / 리포트 RFGOOB00 | Balance sheet reporting |
| SAPLFACI | ECC/S4 | Asset accounting / 자산 회계 | AA custom logic |
| SAPLF051 | ECC/S4 | FI documents / FI 문서 | Document processing |
| FARC0002 | ECC/S4 | Archiving / 아카이빙 | FI archive extension |

---

## 2. BTE — Business Transaction Events (CRITICAL for FI) / BTE (FI 핵심)

BTE is the primary enhancement mechanism for FI, managed in transaction **FIBF**.
BTE는 FI 모듈의 주요 확장 방식이며 트랜잭션 **FIBF**에서 관리됩니다.

| Event | System | Description / 설명 |
|-------|--------|--------------------|
| 00001025 | ECC/S4 | Document check after posting / 전기 후 문서 검사 |
| 00001030 | ECC/S4 | Document posting (before update) / 문서 전기 (업데이트 전) |
| 00001050 | ECC/S4 | Document post (after update) / 문서 전기 (업데이트 후) |
| 00001120 | ECC/S4 | Document check before posting / 전기 전 문서 검사 |
| 00001130 | ECC/S4 | Document reversal / 문서 역전기 |
| 00001320 | ECC/S4 | Document: validation at item level / 품목 레벨 검증 |
| 00001650 | ECC/S4 | Dunning letter generation / 독촉장 생성 |
| 00001680 | ECC/S4 | Payment medium format / 지급 매체 포맷 |
| 00001810 | ECC/S4 | Payment: enhanced item info / 지급 품목 정보 확장 |
| 00001820 | ECC/S4 | Bank statement processing / 은행 명세 처리 |
| 00001830 | ECC/S4 | Treasury: document posting / Treasury 전기 |
| 00001863 | ECC/S4 | Payment method supplement / 지급 방법 보충 |
| 00002210 | ECC/S4 | Payment proposal edit / 지급 제안 편집 |
| 00002310 | ECC/S4 | Payment run additional info / 지급 실행 추가 정보 |

BTE types: **Publish & Subscribe** (notification) and **Process Interface** (substitution). Use FIBF to link Function Module to event.
BTE 유형: Publish & Subscribe (알림) 및 Process Interface (대체). FIBF에서 Function Module을 이벤트에 연결.

---

## 3. BAdIs / 비즈니스 애드인

| Name | System | Description / 설명 | Usage / 용도 |
|------|--------|--------------------|--------------|
| FI_HEADER_SUB_1100 | ECC/S4 | Document header subscreen / 문서 헤더 서브스크린 | Custom header fields in FB01 |
| BADI_FDCB_SUBBST | ECC/S4 | Payment program / 지급 프로그램 | F110 enhancements |
| ACC_DOCUMENT | ECC/S4 | Document validation / 문서 검증 | Accounting doc validation |
| FI_RES_ITEM_CURRENCY | ECC/S4 | Residual item currency / 잔여 품목 통화 | Partial payment currency |
| FI_AUTHORITY_ITEM | ECC/S4 | Authorization at item level / 품목 권한 | Item-level auth check |
| FAGL_RWIN_COMP_CHECK | ECC/S4 | New GL component check / 신 GL 구성 검사 | New GL validations |
| FAGL_090909_DERIVE | ECC/S4 | Segment derivation / 세그먼트 도출 | Segment logic |
| FAA_DC_CUSTOMER | ECC/S4 | Asset accounting depreciation / 자산 회계 감가상각 | Custom depreciation |
| FAA_EE_CUSTOMER | ECC/S4 | Asset custom fields / 자산 커스텀 필드 | AA custom field handling |
| BADI_ACC_DOC | ECC/S4 | Accounting document / 회계 문서 | Accounting doc logic |
| AC_QUANTITY_GET | ECC/S4 | Quantity determination / 수량 결정 | FI quantity logic |
| FIEB_CHANGE_BS_DATA | ECC/S4 | Bank statement data change / 은행 명세 데이터 변경 | EBS custom logic |

---

## 4. Coding Block (CRITICAL for FI) / 코딩 블록 (FI 핵심)

The Coding Block extends FI account-assignment fields system-wide — affecting FB01, MIRO, MIGO, and all FI-relevant postings.
Coding Block은 FI 문서의 계정 할당 필드를 시스템 전체에 걸쳐 확장하며, FB01, MIRO, MIGO 및 모든 FI 관련 전기에 영향을 줍니다.

| Object | System | Description / 설명 |
|--------|--------|--------------------|
| **Transaction OXK3** | ECC/S4 | Customer fields in Coding Block / Coding Block의 고객 필드 |
| **Table COBL** | ECC/S4 | Coding Block structure / Coding Block 구조 |
| **Append CI_COBL** | ECC/S4 | Custom fields in coding block / 코딩 블록 커스텀 필드 |
| **CI_COBL_EI_EXTEND** | ECC/S4 | Coding Block external interfaces / 외부 인터페이스 확장 |
| **Transaction FAGL_LEDGER_CUST_GL** | ECC/S4 | New GL ledger assignment / 신 GL 원장 할당 |

---

## 5. Validations / Substitutions (GGB0 / GGB1 / OBBH) / 검증 및 대체

One of FI's most powerful enhancement techniques — rules can be defined **without ABAP code**.
FI의 가장 강력한 확장 기법 — ABAP 코드 없이 규칙 정의 가능.

| Transaction | System | Description / 설명 |
|-------------|--------|--------------------|
| **GGB0** | ECC/S4 | FI Validation maintenance (3 levels: header, item, complete doc) / 검증 유지 (헤더/품목/전체) |
| **GGB1** | ECC/S4 | FI Substitution maintenance (3 levels) / 대체 유지 |
| **OB28** | ECC/S4 | Assign validations to company code / callup point / 검증을 회사코드/콜업포인트에 할당 |
| **OBBH** | ECC/S4 | Assign substitutions to company code / callup point / 대체 할당 |
| **GCX2** | ECC/S4 | User exits in validation/substitution (ABAP) / 검증/대체의 사용자 출구 |

Callup Points: 0001 (Document header), 0002 (Line item), 0003 (Complete document).
콜업 포인트: 0001(문서 헤더), 0002(라인 품목), 0003(전체 문서).

---

## 6. Custom Fields / Append Structures / 커스텀 필드

| Append | Table | System | Description / 설명 |
|--------|-------|--------|--------------------|
| CI_COBL | COBL | ECC/S4 | Coding Block custom fields / 코딩 블록 커스텀 필드 |
| CI_BKPF | BKPF | ECC/S4 | FI document header / FI 문서 헤더 |
| CI_BSEG | BSEG | ECC | FI document line item (ECC) / FI 문서 라인 품목 (ECC) — see ACDOCA in S/4HANA |
| CI_ANLA | ANLA | ECC/S4 | Asset master / 자산 마스터 |

---

## 7. S/4HANA Extensions / S/4HANA 확장

| Artifact | System | Description / 설명 |
|----------|--------|--------------------|
| ACDOCA extension via INCL_EEW_ACDOC | S4 | Universal Journal custom fields / Universal Journal 커스텀 필드 |
| I_JournalEntry | S4 | CDS view for journal entry / 분개 CDS 뷰 |
| I_JournalEntryItem | S4 | CDS view for journal entry item / 분개 품목 CDS 뷰 |
| FINS_ACDOCA_CUSTOM_BADI | S4 | Universal Journal custom BAdI / Universal Journal BAdI |
| Key User Extensibility (Fiori) | S4 | Custom Fields and Logic app / Custom Fields and Logic 앱 |

In S/4HANA, BSEG remains a physical table (entry view) but **ACDOCA is the leading table**; the index tables (BSIS/BSAS, BSID/BSAD, BSIK/BSAK) are compatibility views.
S/4HANA에서 BSEG는 물리 테이블(엔트리 뷰)로 남아있지만 **ACDOCA가 주도 테이블**이며, 인덱스 테이블(BSIS/BSAS, BSID/BSAD, BSIK/BSAK)이 호환성 뷰입니다.

---

## 8. Recommended Approach / 권장 접근 방식

1. **Use BAdIs and BTEs first** — primary modern enhancement path in FI.
   BAdI와 BTE를 우선 사용 — FI의 주요 현대적 확장 경로.
2. **Use GGB0/GGB1 for simple rules** before writing ABAP — zero-code rules are upgrade-safe.
   간단한 규칙은 GGB0/GGB1 사용 — 코드 없이 업그레이드 안전.
3. **Coding Block extension (OXK3)** for FI-wide account-assignment custom fields.
   FI 전반의 계정 할당 커스텀 필드는 OXK3 사용.
4. **In S/4HANA, extend ACDOCA** via INCL_EEW_ACDOC — not BSEG — and prefer Key User Extensibility.
   S/4HANA에서는 BSEG가 아닌 ACDOCA를 INCL_EEW_ACDOC로 확장; Key User Extensibility 우선.
5. **Transaction FIBF** is the central hub for BTE configuration and discovery.
   FIBF는 BTE 구성과 탐색의 중앙 허브.
