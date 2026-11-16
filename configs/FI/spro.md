# FI - Financial Accounting SPRO Configuration
# FI - 재무 회계 SPRO 설정

## Enterprise Structure
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Company | V_T880 | Company definition (top-level legal entity) / 회사 정의 (최상위 법인 단위) |
| Define Company Code | V_T001 | Company Code definition / 회사코드 정의 |
| Assign Company Code to Company | V_T001_BUKRS | Assign Company Code to Company / 회사코드를 회사에 배정 |
| Define Business Area | V_TGSB | Business Area definition / 사업 영역 정의 |
| Define Credit Control Area | V_T014 | Credit Control Area definition / 신용 통제 영역 정의 |
| Assign Company Code to Credit Control Area | V_T014_ZU | Assign Company Code to Credit Control Area / 신용 통제 영역을 회사코드에 배정 |
| Define Functional Area | V_TFKB | Functional Area definition / 기능 영역 정의 |

## General Ledger
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Chart of Accounts | V_T004 | Chart of Accounts definition / 계정 과목 체계 정의 |
| Assign Chart of Accounts to Company Code | V_T001_KOA | Assign Chart of Accounts to Company Code / 계정 과목 체계를 회사코드에 배정 |
| Define Account Groups (G/L) | V_T077S | G/L Account Groups definition / G/L 계정 그룹 정의 |
| Define Retained Earnings Account | V_T030X | Retained Earnings Account definition / 이익 잉여금 계정 정의 |
| Create G/L Accounts in Chart of Accounts | SKA1 | Create G/L Accounts in Chart of Accounts / 계정 과목 체계에 G/L 계정 생성 |
| Define Fiscal Year Variant | V_T009 | Fiscal Year Variant definition / 회계 연도 변형 정의 |
| Assign Fiscal Year Variant to Company Code | V_T001_GJ | Assign Fiscal Year Variant to Company Code / 회계 연도 변형을 회사코드에 배정 |
| Define Posting Period Variant | V_T010O | Posting Period Variant definition / 전기 기간 변형 정의 |
| Open and Close Posting Periods | V_T001B | Open and Close Posting Periods / 전기 기간 개설/마감 |
| Define Field Status Groups | V_T004F | Field Status Groups definition / 필드 상태 그룹 정의 |
| Define Field Status Variants | V_T004V | Field Status Variants definition / 필드 상태 변형 정의 |

## Accounts Payable (AP)
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Account Groups for Vendors | V_T077K | Vendor Account Groups definition / 공급업체 계정 그룹 정의 |
| Define Number Ranges for Vendor Accounts | T077K | Number Ranges for Vendor Accounts / 공급업체 계정 번호 범위 |
| Define Document Types (AP) | V_T003 | AP Document Types definition (KR, KZ, KG...) / AP 문서 유형 정의 (KR, KZ, KG...) |
| Define Tolerance Groups for Employees | V_T043T | Tolerance Groups for Employees definition / 직원 허용 오차 그룹 정의 |
| Configure Automatic Payment Program | V_T042 | Automatic Payment Program configuration / 자동 지급 프로그램 설정 |
| Define Payment Methods | V_T042Z | Payment Methods definition / 지급 방법 정의 |
| Define House Banks | V_T012 | House Banks definition / 주거래 은행 정의 |
| Define Bank Accounts | V_T012K | Bank Accounts definition / 은행 계좌 정의 |

## Accounts Receivable (AR)
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Account Groups for Customers | V_T077D | Customer Account Groups definition / 고객 계정 그룹 정의 |
| Define Number Ranges for Customer Accounts | T077D | Number Ranges for Customer Accounts / 고객 계정 번호 범위 |
| Define Document Types (AR) | V_T003_AR | AR Document Types definition (DR, DZ, DG...) / AR 문서 유형 정의 (DR, DZ, DG...) |
| Define Interest Calculation Types | V_T056 | Interest Calculation Types definition / 이자 계산 유형 정의 |
| Configure Dunning Procedure | V_T047 | Dunning Procedure configuration / 독촉 절차 설정 |
| Define Dunning Levels | V_T047S | Dunning Levels definition / 독촉 수준 정의 |

## Asset Accounting (AA)
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Copy Reference Chart of Depreciation | V_T096 | Copy Reference Chart of Depreciation / 감가상각 체계 복사 |
| Assign Chart of Depreciation to Company Code | V_T093C | Assign Chart of Depreciation to Company Code / 감가상각 체계를 회사코드에 배정 |
| Define Asset Classes | V_ANKT | Asset Classes definition / 자산 클래스 정의 |
| Define Depreciation Areas | V_T090 | Depreciation Areas definition / 감가상각 영역 정의 |
| Define Depreciation Keys | V_T090NA | Depreciation Keys definition / 감가상각 키 정의 |
| Set Maximum Amount for Low-Value Assets | V_T090NA_LVA | Maximum Amount for Low-Value Assets / 소액 자산 최대 금액 설정 |

## Tax Configuration
| Config Name | Table/View | Description |
|------------|-----------|-------------|
| Define Tax Procedure | V_T683_TAX | Tax Procedure definition / 세금 절차 정의 |
| Define Tax Codes | V_T007A | Tax Codes definition / 세금 코드 정의 |
| Assign Tax Codes for Non-Taxable Transactions | V_T007B | Tax Codes for Non-Taxable Transactions / 비과세 거래 세금 코드 배정 |
| Define Tax Accounts | V_OBCN | Tax Accounts definition / 세금 계정 정의 |

## Value tables (assistant choices)
Read by `scripts/assist/values.mjs` for `/sc4sap:assist`: the codes a write action asks for, offered as numbered choices from the connected system. Customizing tables only (Class = DD02L-CONTFLAG C / G, checked on an ECC 7.40 system 2026-11-16). Text table key = SPRAS + key field.

| Value | System | Table/View | Key field | Filter | Text table | Text field | Text filter | Class | Used by | Description |
|---|---|---|---|---|---|---|---|---|---|---|
| FI_REVERSAL_REASON | ECC, S4 | T041C | STGRD | | T041CT | TXT40 | | C / C | FI.DOC.REVERSE.reason | Reversal reasons |
| FI_PAYMENT_BLOCK | ECC, S4 | T008 | ZAHLS | | T008T | TEXTL | | C / C | FI.ITEM.SET_PAYMENT_BLOCK.block_key | Payment block keys |
| FI_DOCUMENT_TYPE | ECC, S4 | T003 | BLART | | T003T | LTEXT | | C / C | FI.GL.POST.doc_type | Accounting document types |
