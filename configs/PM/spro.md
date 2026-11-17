# PM - Plant Maintenance SPRO Configuration
# PM - 설비 관리 SPRO 설정

## Enterprise Structure
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Maintenance Plant | V_T001W | Maintenance Plant definition / 유지보수 플랜트 정의 |
| Define Maintenance Planning Plant | V_T399A | Maintenance Planning Plant definition / 유지보수 계획 플랜트 정의 |
| Assign Maintenance Planning Plant to Maintenance Plant | V_T001W_IW | Assign Maintenance Planning Plant to Maintenance Plant / 유지보수 계획 플랜트를 유지보수 플랜트에 배정 |
| Define Business Area for PM | V_TGSB_PM | Business Area definition for PM / PM용 사업 영역 정의 |

## Technical Objects (Master Data)
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Functional Location Categories | V_T370C | Functional Location Category definition / 기능 위치 범주 정의 |
| Define Structure Indicators for FL | V_T370K | Structure Indicator definition for Functional Location / 기능 위치 구조 표시자 정의 |
| Configure Functional Location Hierarchy | V_T370S | Functional Location Hierarchy configuration / 기능 위치 계층 설정 |
| Define Equipment Categories | V_T370E | Equipment Category definition / 설비 범주 정의 |
| Define Object Types | V_T370O | Object Type definition / 개체 유형 정의 |
| Define ABC Indicators | V_T370A | ABC Indicator definition / ABC 표시자 정의 |
| Configure Measuring Points | V_T352A | Measuring Point configuration / 측정점 설정 |
| Define Characteristics for Technical Objects | V_CABN | Characteristic definition for Technical Objects / 기술 개체 특성 정의 |

## Maintenance Processing
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Order Types (PM) | V_T003O_PM | PM Order Type definition (PM01, PM02, PM03...) / PM 주문 유형 정의 (PM01, PM02, PM03...) |
| Define Maintenance Activity Types | V_T353I | Maintenance Activity Type definition / 유지보수 활동 유형 정의 |
| Define Priority Types | V_T356 | Priority Type definition / 우선순위 유형 정의 |
| Define Notification Types | V_T351 | Notification Type definition (M1, M2, S1...) / 알림 유형 정의 (M1, M2, S1...) |
| Define Catalog Profiles | V_T352B | Catalog Profile definition / 카탈로그 프로파일 정의 |
| Configure Catalogs and Code Groups | V_T353 | Catalog and Code Group configuration / 카탈로그 및 코드 그룹 설정 |
| Define Damage/Cause Codes | V_T357G | Damage / Cause Code definition / 손상/원인 코드 정의 |
| Configure Settlement Profile for PM | V_OKOA_PM | Settlement Profile configuration for PM / PM용 정산 프로파일 설정 |

## Preventive Maintenance
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Maintenance Strategies | V_T355 | Maintenance Strategy definition / 유지보수 전략 정의 |
| Define Maintenance Packages | V_T356P | Maintenance Package definition / 유지보수 패키지 정의 |
| Configure Scheduling Indicators | V_T355I | Scheduling Indicator configuration / 일정 계획 표시자 설정 |
| Define Cycle Sets | V_T356C | Cycle Set definition / 사이클 세트 정의 |
| Configure Call Object Parameters | V_T356K | Call Object Parameter configuration / 호출 개체 매개변수 설정 |

## Work Center / Resources
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Work Center Categories for PM | V_TC24_PM | Work Center Category definition for PM / PM용 작업장 범주 정의 |
| Define Qualification Types | V_T628 | Qualification Type definition / 자격 유형 정의 |
| Define Personnel Work Centers | V_TC24_HR | Personnel Work Center definition / 인사 작업장 정의 |
| Configure Capacities for PM | V_TC23_PM | Capacity configuration for PM / PM용 용량 설정 |

## Controlling Integration
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Maintenance Cost Centers | V_CSKS_PM | Maintenance Cost Center definition / 유지보수 원가 센터 정의 |
| Configure WBS Element Integration | V_PRPS_PM | WBS Element Integration configuration / WBS 요소 통합 설정 |
| Define Activity Types for PM | V_CSLA_PM | Activity Type definition for PM / PM용 활동 유형 정의 |

## Value tables (assistant choices)
Read by `scripts/assist/values.mjs` for `/sc4sap:assist`: the codes a write action asks for, offered as numbered choices from the connected system. Customizing tables only (Class = DD02L-CONTFLAG C / G, checked on an ECC 7.40 system 2026-11-16). Text table key = SPRAS + key field.

| Value | System | Table/View | Key field | Filter | Text table | Text field | Text filter | Class | Used by | Description |
|---|---|---|---|---|---|---|---|---|---|---|
| PM_NOTIFICATION_TYPE | ECC, S4 | TQ80 | QMART | QMTYP = '01' | TQ80_T | QMARTX | | C / C | PM.NOTIF.CREATE.qmart | Maintenance notification types (category 01) |
| PM_ORDER_TYPE | ECC, S4 | T003O | AUART | AUTYP = '30' | T003P | TXT | | C / C | PM.ORD.CREATE.auart | Maintenance order types (category 30) |
