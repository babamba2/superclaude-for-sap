# SD Module Enhancements / SD 모듈 확장

## Overview / 개요

The SD (Sales & Distribution) module provides one of SAP's richest enhancement landscapes, heavily leveraging form-based user exits in addition to classic exits, BAdIs, and VOFM routines.
SD(영업 및 유통) 모듈은 SAP에서 가장 풍부한 확장 환경을 제공하며, 전통적 출구와 BAdI 외에도 폼 기반 사용자 출구와 VOFM 루틴을 적극 활용합니다.

- Classic Customer Exits (CMOD/SMOD) / 전통적 고객 출구
- BAdIs (Business Add-Ins) / 비즈니스 애드인
- Enhancement Spots / 확장 스팟
- **Form-based User Exits (include programs)** / 폼 기반 사용자 출구 (핵심)
- **VOFM Routines** (copy control, pricing, requirements) / VOFM 루틴
- Custom Fields / 커스텀 필드
- S/4HANA CDS/RAP Extensions

---

## 1. Classic Customer Exits (CMOD/SMOD) / 전통적 고객 출구

| Name | System | Description / 설명 | Usage / 용도 |
|------|--------|--------------------|--------------|
| V45A0001 | ECC/S4 | Sales order: update data / 판매 주문 업데이트 데이터 | Enhance VBAK/VBAP fields |
| V45A0002 | ECC/S4 | Predefine sold-to party / 판매처 사전 정의 | Determine sold-to |
| V45A0003 | ECC/S4 | Collective number / 공동 번호 | Custom order grouping |
| V45A0004 | ECC/S4 | Copy item number from reference / 참조 문서에서 품목 복사 | Item numbering rules |
| V45E0001 | ECC/S4 | Schedule lines: update / 스케줄 라인 업데이트 | Schedule line logic |
| V45E0002 | ECC/S4 | Schedule lines: data transfer / 스케줄 라인 데이터 전송 | Copy schedule data |
| V45P0001 | ECC/S4 | Purchase requisition from sales / 판매에서 구매 요청 | Third-party order PR |
| V45S0001 | ECC/S4 | Variant configuration / 변형 구성 | Configurator integration |
| V46H0001 | ECC/S4 | Credit check / 신용 검사 | Custom credit check |
| V60A0001 | ECC/S4 | Billing: customer fields / 청구 고객 필드 | Custom fields in billing |
| V60A0002 | ECC/S4 | Billing: update / 청구 업데이트 | Billing post-processing |
| V50PSTAT | ECC/S4 | Delivery status / 배송 상태 | Custom delivery status |
| V50Q0001 | ECC/S4 | Delivery monitor / 배송 모니터 | VL10 modifications |
| SDAPO001 | ECC/S4 | APO integration / APO 통합 | CIF integration |
| V02V0001 | ECC/S4 | Shipping: route determination / 배송 경로 결정 | Route derivation |
| V02V0002 | ECC/S4 | Shipping: delivery grouping / 배송 그룹화 | Delivery split logic |
| V02V0003 | ECC/S4 | Shipping: material / 배송 자재 | Material shipping data |
| V02V0004 | ECC/S4 | Shipping: fields / 배송 필드 | Shipping field mods |
| V02V0005 | ECC/S4 | Shipping: procedure / 배송 절차 | Shipping unit processing |

---

## 2. BAdIs / 비즈니스 애드인

| Name | System | Description / 설명 | Usage / 용도 |
|------|--------|--------------------|--------------|
| BADI_SD_SALES | ECC/S4 | Sales document customer logic / 판매 문서 고객 로직 | Sales order modifications |
| BADI_SD_SALES_ITEM | ECC/S4 | Sales item customer logic / 판매 품목 로직 | Item-level logic |
| BADI_SD_SALES_HEADER | ECC/S4 | Sales header customer logic / 판매 헤더 로직 | Header-level logic |
| SD_SALES_DOCUMENT_CHECK | ECC/S4 | Sales document checks / 판매 문서 검사 | Document validation |
| SD_SALES_DOCUMENT_SAVE | ECC/S4 | Sales document save / 판매 문서 저장 | Post-save logic |
| BADI_SD_V46H0001_CHECK | ECC/S4 | Credit check BAdI / 신용 검사 | Credit logic |
| SD_PARTNER_DETERMINATION | ECC/S4 | Partner determination / 파트너 결정 | Partner role logic |
| PRICING_BADI | ECC/S4 | Pricing enhancement / 가격 결정 확장 | Custom pricing |
| PRICING_HEAD | ECC/S4 | Header pricing / 헤더 가격 결정 | Header pricing override |
| PRICING_ITEM | ECC/S4 | Item pricing / 품목 가격 결정 | Item pricing override |
| BADI_SD_BILLING_ITEM | ECC/S4 | Billing item / 청구 품목 | Billing item mods |
| BADI_SD_BILLING_HEAD | ECC/S4 | Billing header / 청구 헤더 | Billing header mods |
| LE_SHP_DELIVERY_PROC | ECC/S4 | Delivery processing / 배송 처리 | Delivery create/change |
| BADI_LE_SHIPMENT | ECC/S4 | Shipment / 선적 | Shipment doc logic |
| ATP_ADAPTER | ECC/S4 | Availability check / 가용성 검사 | ATP custom logic |
| ADDR_BADI_SD_NAST | ECC/S4 | Output: address determination / 출력 주소 결정 | NAST output address |
| VIEW_CUSTOMER_ENH | ECC/S4 | Customer master enhancement / 고객 마스터 확장 | Custom customer views |

---

## 3. Enhancement Spots / 확장 스팟

| Name | System | Description / 설명 | Usage / 용도 |
|------|--------|--------------------|--------------|
| ES_SAPLV45A | ECC/S4 | Sales order enhancement spot / 판매 주문 확장 스팟 | Container for sales BAdIs |
| ES_SAPLV60A | ECC/S4 | Billing enhancement spot / 청구 확장 스팟 | Container for billing BAdIs |

---

## 4. Module-Specific Special Enhancements / 모듈 특화 확장 (CRITICAL)

### 4.1 Form-Based User Exits (Include Programs) / 폼 기반 사용자 출구

**IMPORTANT**: SD heavily uses include-based user exits in standard programs. These are accessed by editing specific include programs directly. (These remain supported in S/4HANA.)
중요: SD는 표준 프로그램의 include 기반 사용자 출구를 광범위하게 사용합니다.

#### Sales Order (Sales Documents) / 판매 주문

| Include | System | Key Form Routines / 주요 폼 루틴 |
|---------|--------|----------------------------------|
| **MV45AFZZ** | ECC/S4 | `USEREXIT_SAVE_DOCUMENT_PREPARE`, `USEREXIT_SAVE_DOCUMENT`, `USEREXIT_CHECK_VBAK`, `USEREXIT_CHECK_VBAP`, `USEREXIT_MOVE_FIELD_TO_VBAK`, `USEREXIT_MOVE_FIELD_TO_VBAP` |
| **MV45AFZB** | ECC/S4 | `USEREXIT_CHECK_VBKD`, `USEREXIT_CHECK_XVBKD`, `USEREXIT_NUMBER_RANGE`, `USEREXIT_PRICING_PREPARE_TKOMP`, `USEREXIT_PRICING_PREPARE_TKOMK` |
| **MV45AFZD** | ECC/S4 | Customer header fields / 고객 헤더 필드 |
| **MV45AFZF** | ECC/S4 | Additional data check / 추가 데이터 검사 |
| **MV45AFZA** | ECC/S4 | For incompletion / 미완료 체크 |

#### Billing / 청구

| Include | System | Key Form Routines / 주요 폼 루틴 |
|---------|--------|----------------------------------|
| **RV60AFZZ** | ECC/S4 | `USEREXIT_ACCOUNT_PREP_KOMKCV`, `USEREXIT_ACCOUNT_PREP_KOMPCV`, `USEREXIT_NUMBER_RANGE_INV_DATE`, `USEREXIT_FILL_VBRK_VBRP` |
| **RV60AFZB** | ECC/S4 | `USEREXIT_PRICING_PREPARE_TKOMK`, `USEREXIT_PRICING_PREPARE_TKOMP` |
| **RV60AFZC** | ECC/S4 | `USEREXIT_FILL_VBRK_VBRP` additional |
| **RV60AFZD** | ECC/S4 | `USEREXIT_RELI_XACCIT` for accounting |

#### Schedule Lines / 스케줄 라인

| Include | System | Key Form Routines |
|---------|--------|-------------------|
| **MV61AFZA** | ECC/S4 | `USEREXIT_MOVE_FIELD_TO_VBEP` |
| **MV61AFZB** | ECC/S4 | `USEREXIT_CHECK_VBEP` |
| **FV45EFZ1** | ECC/S4 | Scheduling / 스케줄링 |

#### Partner / Delivery / IDoc

| Include | System | Description |
|---------|--------|-------------|
| **LVEDAF0F** | ECC/S4 | IDoc processing / IDoc 처리 |
| **MV50AFZ1** | ECC/S4 | Delivery processing / 배송 처리 |
| **MV50AFZK** | ECC/S4 | Delivery processing additional / 배송 처리 추가 |

### 4.2 VOFM Routines / VOFM 루틴

VOFM transaction provides customer-namespace routines for:
VOFM 트랜잭션은 다음 영역의 고객 네임스페이스 루틴을 제공합니다:

| Category | System | Description / 설명 |
|----------|--------|--------------------|
| Copying requirements | ECC/S4 | Routines 001-999 for copy control / 복사 제어 루틴 |
| Data transfer (VBAK, VBAP, VBRK, VBRP) | ECC/S4 | Custom data transfer between documents / 문서 간 데이터 전송 |
| Requirements for billing | ECC/S4 | Billing split/collective criteria / 청구 분할 기준 |
| Pricing formulas (condition values) | ECC/S4 | Custom price calculation / 사용자 정의 가격 계산 |
| Pricing formulas (condition bases) | ECC/S4 | Custom condition base / 조건 기준 계산 |
| Output requirements | ECC/S4 | Output determination / 출력 결정 |

---

## 5. Validations / Substitutions / 검증 및 대체

SD uses **incompletion procedures** (tx `OVA2`) and BAdIs (e.g., `SD_SALES_DOCUMENT_CHECK`) rather than GGB0/GGB1.
SD는 GGB0/GGB1 대신 미완료 절차(OVA2)와 BAdI를 사용합니다.

---

## 6. Custom Fields / Append Structures / 커스텀 필드

| Append | Table | System | Description / 설명 |
|--------|-------|--------|--------------------|
| CI_VBAK | VBAK | ECC/S4 | Sales header / 판매 헤더 |
| CI_VBAP | VBAP | ECC/S4 | Sales item / 판매 품목 |
| CI_LIKP | LIKP | ECC/S4 | Delivery header / 배송 헤더 |
| CI_LIPS | LIPS | ECC/S4 | Delivery item / 배송 품목 |
| CI_VBRK | VBRK | ECC/S4 | Billing header / 청구 헤더 |
| CI_VBRP | VBRP | ECC/S4 | Billing item / 청구 품목 |
| CI_VBKD | VBKD | ECC/S4 | Business data / 비즈니스 데이터 |
| INCL_EEW_COMM_ITEM_ADD | (comm) | S4 | Communication structure for item (S/4HANA) / 품목 통신 구조 |

---

## 7. S/4HANA Extensions (CDS/RAP) / S/4HANA 확장

| Artifact | System | Description / 설명 |
|----------|--------|--------------------|
| I_SalesOrder | S4 | Sales order CDS view (extensible) / 판매 주문 CDS 뷰 |
| I_SalesOrderItem | S4 | Sales order item CDS view / 판매 주문 품목 CDS 뷰 |
| I_SalesOrderScheduleLine | S4 | Schedule line CDS / 스케줄 라인 CDS |
| I_BillingDocument | S4 | Billing document CDS / 청구 문서 CDS |

Extensible via Key User Extensibility (Fiori Custom Fields and Logic).
Fiori Key User Extensibility를 통해 확장 가능.

---

## 8. Recommended Approach / 권장 접근 방식

1. **Prefer BAdIs over CMOD exits** for new implementations.
   신규 구현 시 BAdI를 CMOD보다 우선 사용.
2. **Use form-based user exits only when BAdI is unavailable** (still common in SD).
   BAdI로 불가능한 경우에만 폼 기반 사용자 출구 사용.
3. **Prefer CDS extensions in S/4HANA** for custom fields instead of append structures where possible.
   S/4HANA에서는 가능한 경우 CDS 확장을 우선 사용.
4. **Use VOFM for copy control and pricing** — configuration-first approach.
   복사 제어와 가격 결정은 VOFM 활용.
5. **Document all user-exit modifications** — these survive upgrades but require retesting.
   모든 사용자 출구 수정은 문서화 및 업그레이드 후 재테스트 필요.
