# SD - Sales and Distribution SPRO Configuration
# SD - 영업 및 유통 SPRO 설정

## Enterprise Structure
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Sales Organization | V_TVKO | Sales Organization definition (Sales Org → Company Code mapping) / 판매 조직 정의 (Sales Org → Company Code mapping) |
| Define Distribution Channel | V_TVTW | Distribution Channel definition / 유통 채널 정의 |
| Define Division | V_TSPA | Division definition / 제품군(사업부) 정의 |
| Assign Sales Organization to Company Code | V_BUKRS_ASSIGN | Assign Sales Organization to Company Code / 판매 조직을 회사코드에 배정 |
| Assign Distribution Channel to Sales Organization | V_TVKOV | Assign Distribution Channel to Sales Organization / 유통 채널을 판매 조직에 배정 |
| Assign Division to Sales Organization | V_TVKOS | Assign Division to Sales Organization / 사업부를 판매 조직에 배정 |
| Set up Sales Area | V_TVTA | Sales Area setup (Sales Org + Dist. Channel + Division) / 판매 영역 설정 (Sales Org + Dist. Channel + Division) |
| Assign Sales Office to Sales Area | V_TVBUR_KO | Assign Sales Office to Sales Area / 판매 사무소를 판매 영역에 배정 |
| Define Sales Group | V_TVKGR | Sales Group definition / 판매 그룹 정의 |

## Master Data
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Account Groups for Customers | V_T077D | Customer Account Groups definition / 고객 계정 그룹 정의 |
| Define Number Ranges for Customers | T077D / TONR | Number Ranges for Customers / 고객 번호 범위 설정 |
| Assign Number Ranges to Customer Account Groups | V_T077D | Assign Number Ranges to Customer Account Groups / 번호 범위를 고객 그룹에 배정 |
| Define Customer-Material Info Record | V_KNMT | Customer-Material Info Record definition / 고객-자재 정보 레코드 정의 |
| Define Partner Functions | V_TPAR | Partner Functions definition (SP, SH, BP, PY) / 파트너 기능 정의 (SP, SH, BP, PY) |
| Define Partner Determination Procedures | V_TPAER | Partner Determination Procedures definition / 파트너 결정 절차 정의 |
| Set Material Types for Sales | V_TMVST | Material Types for Sales / 판매용 자재 유형 설정 |
| Define Item Categories for Sales Documents | V_TVAPt | Item Categories for Sales Documents definition / 판매 문서 항목 범주 정의 |

## Basic Functions
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Blocking Reasons | V_TVV1 | Sales Blocking Reasons definition / 판매 블록 이유 정의 |
| Define Incompletion Procedures | V_TVUVK | Incompletion Procedures definition / 불완전 절차 정의 |
| Assign Incompletion Procedures to Sales Document Types | V_TVUVK_A | Assign Incompletion Procedures to Sales Document Types / 불완전 절차를 판매 문서 유형에 배정 |
| Define Text Types for Sales Documents | V_TTXID | Text Types for Sales Documents definition / 판매 문서 텍스트 유형 정의 |
| Configure Output Determination | V_TNAPR | Output Determination configuration (Output Condition Tables) / 출력 결정 설정 (Output Condition Tables) |
| Define Credit Management Control | V_T691F | Credit Management Control / 신용 관리 통제 설정 |
| Define Risk Categories | V_T691C | Credit Risk Categories definition / 신용 위험 범주 정의 |
| Configure Availability Check | V_MTVFP | Availability Check configuration / 가용성 검사 설정 |
| Define Checking Groups | V_TMVFU | Checking Groups definition / 검사 그룹 정의 |

## Transaction/Document Config
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Sales Document Types | V_TVAK | Sales Document Types definition (OR, QT, CR, DR...) / 판매 문서 유형 정의 (OR, QT, CR, DR...) |
| Define Number Ranges for Sales Documents | VN01 / T180 | Number Ranges for Sales Documents / 판매 문서 번호 범위 |
| Define Item Categories for Sales Documents | V_TVAPT | Item Categories for Sales Documents (TAN, TAD, TANN...) / 판매 문서 항목 범주 (TAN, TAD, TANN...) |
| Assign Item Categories | V_TVAPZ | Item Category Assignment rules / 항목 범주 배정 규칙 |
| Define Schedule Line Categories | V_TVEP | Schedule Line Categories definition (CP, CN...) / 납품 일정 행 범주 정의 (CP, CN...) |
| Assign Schedule Line Categories | V_TVEPZ | Assign Schedule Line Categories / 납품 일정 행 범주 배정 |
| Define Delivery Document Types | V_TVSB | Delivery Document Types definition (LF, LR...) / 납품 문서 유형 정의 (LF, LR...) |
| Define Billing Document Types | V_TVFK | Billing Document Types definition (F2, G2, L2...) / 청구 문서 유형 정의 (F2, G2, L2...) |
| Define Order Reasons | V_TVGR2 | Order Reasons definition / 주문 이유 정의 |
| Define Rejection Reasons | V_TVAG | Rejection Reasons definition / 거부 이유 정의 |

## Pricing/Conditions
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Condition Types | V_T685 | Condition Types definition (PR00, K004, K005...) / 조건 유형 정의 (PR00, K004, K005...) |
| Define Pricing Procedures | V_T683 | Pricing Procedures definition / 가격 결정 절차 정의 |
| Assign Pricing Procedures | V_T683V | Assign Pricing Procedures / 가격 결정 절차 배정 |
| Define Condition Tables | V_T685A | Condition Tables definition / 조건 테이블 정의 |
| Maintain Access Sequences | V_T682 | Maintain Access Sequences / 액세스 순서 유지 |
| Define Customer Pricing Procedure | V_KALKU | Customer Pricing Procedure definition / 고객 가격 결정 절차 정의 |
| Define Document Pricing Procedure | V_TVAK_P | Document Pricing Procedure definition / 문서 가격 결정 절차 정의 |
| Define Statistical Condition Types | V_T685S | Statistical Condition Types definition / 통계 조건 유형 정의 |

## Shipping Configuration
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Shipping Points | V_TVST | Shipping Points definition / 출하 지점 정의 |
| Assign Shipping Points | V_TVSTZ | Assign Shipping Points / 출하 지점 배정 |
| Define Routes | V_TROSD | Routes definition / 경로 정의 |
| Define Route Determination | V_TROUTE | Route Determination configuration / 경로 결정 설정 |
| Define Loading Groups | V_TVLA | Loading Groups definition / 적재 그룹 정의 |
| Define Delivery Priorities | V_TVLP | Delivery Priorities definition / 납품 우선순위 정의 |
| Configure Packing | V_TVPT | Packing configuration / 포장 설정 |
| Define Goods Issue (GI) Tolerances | V_TMVFP | Goods Issue (GI) Tolerances definition / 출고 허용 오차 정의 |

## Output/Printing
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Maintain Output Types for Sales | V_TNAPR_V | Maintain Output Types for Sales / 판매용 출력 유형 유지 |
| Define Condition Tables for Output | V_TNACS | Condition Tables for Output definition / 출력용 조건 테이블 정의 |
| Assign Output Types to Partners | V_TNAPN | Assign Output Types to Partners / 출력 유형을 파트너에 배정 |
| Configure Billing Output | V_TNAPR_F | Billing Output configuration / 청구 출력 설정 |
| Maintain Print Parameters | V_TNAPT | Maintain Print Parameters / 인쇄 매개변수 유지 |

## Value tables (assistant choices)
Read by `scripts/assist/values.mjs` for `/sc4sap:assist`: the codes a write action asks for, offered as numbered choices from the connected system. Customizing tables only (Class = DD02L-CONTFLAG C / G, checked on an ECC 7.40 system 2026-11-16). Text table key = SPRAS + key field.

| Value | System | Table/View | Key field | Filter | Text table | Text field | Text filter | Class | Used by | Description |
|---|---|---|---|---|---|---|---|---|---|---|
| SD_DELIVERY_BLOCK | ECC, S4 | TVLS | LIFSP | | TVLST | VTEXT | | C / C | SD.SO.SET_DELIVERY_BLOCK.reason | Delivery block reasons (VBAK-LIFSK) |
| SD_BILLING_BLOCK | ECC, S4 | TVFS | FAKSP | | TVFST | VTEXT | | C / C | SD.SO.SET_BILLING_BLOCK.reason | Billing block reasons (VBAK-FAKSK) |
| SD_REJECTION_REASON | ECC, S4 | TVAG | ABGRU | | TVAGT | BEZEI | | C / C | SD.SO.REJECT_ITEM.reason | Reasons for rejection (VBAP-ABGRU) |
| SD_PRICING_CONDITION | ECC, S4 | T685 | KSCHL | KVEWE = 'A' AND KAPPL = 'V' | T685T | VTEXT | KVEWE = 'A' AND KAPPL = 'V' | C / C | SD.SO.CHANGE_PRICE.cond_type | Pricing condition types of sales (usage A, application V) |
| LE_SHIPMENT_TYPE | ECC | TVTK | SHTYP | | TVTKT | BEZEI | | G / G | LE.SHP.CREATE.shtyp | Shipment types |
