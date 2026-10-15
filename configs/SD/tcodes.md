# SD - Sales and Distribution Transaction Codes
# SD - 영업 및 유통 트랜잭션 코드

## Master Data
| TCode | System | Description |
|-------|--------|-------------|
| XD01 | ECC | Create Customer (Centrally) / 고객 생성 (중앙) — S/4HANA: Use BP |
| XD02 | ECC | Change Customer (Centrally) / 고객 변경 (중앙) — S/4HANA: Use BP |
| XD03 | ECC | Display Customer (Centrally) / 고객 조회 (중앙) — S/4HANA: Use BP |
| VD01 | ECC | Create Customer (Sales Area) / 고객 생성 (판매 영역) — S/4HANA: Use BP |
| VD02 | ECC | Change Customer (Sales Area) / 고객 변경 (판매 영역) — S/4HANA: Use BP |
| VD03 | ECC | Display Customer (Sales Area) / 고객 조회 (판매 영역) — S/4HANA: Use BP |
| BP | S4 | Maintain Business Partner / 비즈니스 파트너 유지 |
| VD51 | ECC/S4 | Create Customer-Material Info Record / 고객-자재 정보 레코드 생성 |
| VD52 | ECC/S4 | Change Customer-Material Info Record / 고객-자재 정보 레코드 변경 |
| VK11 | ECC/S4 | Create Condition Record / 조건 레코드 생성 |
| VK12 | ECC/S4 | Change Condition Record / 조건 레코드 변경 |
| VK13 | ECC/S4 | Display Condition Record / 조건 레코드 조회 |

## Sales Order Processing
| TCode | System | Description |
|-------|--------|-------------|
| VA01 | ECC/S4 | Create Sales Order / 판매 주문 생성 |
| VA02 | ECC/S4 | Change Sales Order / 판매 주문 변경 |
| VA03 | ECC/S4 | Display Sales Order / 판매 주문 조회 |
| VA11 | ECC/S4 | Create Inquiry / 문의 생성 |
| VA21 | ECC/S4 | Create Quotation / 견적 생성 |
| VA41 | ECC/S4 | Create Contract / 계약 생성 |
| VA51 | ECC/S4 | Create Item Proposal / 항목 제안 생성 |
| VOV8 | ECC/S4 | Define Sales Document Types / 판매 문서 유형 정의 |
| VOV4 | ECC/S4 | Assign Item Categories / 항목 범주 배정 |
| VOV6 | ECC/S4 | Define Schedule Line Categories / 납품 일정 행 범주 정의 |

## Delivery
| TCode | System | Description |
|-------|--------|-------------|
| VL01N | ECC/S4 | Create Outbound Delivery / 출고 납품 생성 |
| VL02N | ECC/S4 | Change Outbound Delivery / 출고 납품 변경 |
| VL03N | ECC/S4 | Display Outbound Delivery / 출고 납품 조회 |
| VL10A | ECC/S4 | Create Delivery (Due List) / 납품 생성 (기한 목록) |
| VL10B | ECC/S4 | Create Delivery for Purchase Order / 구매 주문에 대한 납품 생성 |
| VL06O | ECC/S4 | Outbound Delivery Monitor / 출고 납품 모니터 |
| VL60 | ECC/S4 | Delivery Reconciliation / 납품 조정 |

## Billing
| TCode | System | Description |
|-------|--------|-------------|
| VF01 | ECC/S4 | Create Billing Document / 청구 문서 생성 |
| VF02 | ECC/S4 | Change Billing Document / 청구 문서 변경 |
| VF03 | ECC/S4 | Display Billing Document / 청구 문서 조회 |
| VF04 | ECC/S4 | Maintain Billing Due List / 청구 기한 목록 유지 |
| VF11 | ECC/S4 | Cancel Billing Document / 청구 문서 취소 |
| VFX3 | ECC/S4 | Release Billing Docs for Accounting / 회계에 청구 문서 전기 |

## Configuration
| TCode | System | Description |
|-------|--------|-------------|
| SPRO | ECC/S4 | SAP Project Reference Object / SAP 프로젝트 기준 개체 |
| OVX5 | ECC/S4 | Define Sales Organization / 판매 조직 정의 |
| OVXG | ECC/S4 | Set up Sales Areas / 판매 영역 설정 |
| OVA8 | ECC/S4 | Automatic Credit Control / 자동 신용 통제 |
| OVZ2 | ECC/S4 | Availability Check with ATP / ATP 가용성 검사 |
| V/06 | ECC/S4 | Maintain Condition Types / 조건 유형 유지 |
| V/07 | ECC/S4 | Maintain Access Sequences / 접근 순서 유지 |
| V/08 | ECC/S4 | Maintain Pricing Procedures / 가격 결정 절차 유지 |
| OVKK | ECC/S4 | Pricing Procedure Determination / 가격 결정 절차 결정 |

## Reporting
| TCode | System | Description |
|-------|--------|-------------|
| VA05 | ECC/S4 | List of Sales Orders / 판매 주문 목록 |
| VF05 | ECC/S4 | List of Billing Documents / 청구 문서 목록 |
| VL06 | ECC/S4 | Delivery Monitor / 납품 모니터 |
| V.02 | ECC/S4 | Incomplete Orders List / 불완전 주문 목록 |
| VKM1 | ECC/S4 | Blocked Sales Documents (Credit) / 신용 블록된 판매 문서 |
| SD70 | ECC/S4 | SD Statistics Report / SD 통계 보고서 |
| MCTA | ECC/S4 | SIS: Customer Analysis / SIS: 고객 분석 |
| MCTC | ECC/S4 | SIS: Product Analysis / SIS: 제품 분석 |

## Monitoring
| TCode | System | Description |
|-------|--------|-------------|
| VKM3 | ECC/S4 | Released Sales Orders / 해제된 판매 주문 |
| VKM5 | ECC/S4 | Blocked Deliveries (Credit) / 신용 블록된 납품 |
| V23 | ECC/S4 | Sales Documents Blocked for Billing / 청구 블록된 판매 문서 |
| VF31 | ECC/S4 | Output from Billing / 청구 출력 |
| VL71 | ECC/S4 | Output from Deliveries / 납품 출력 |
