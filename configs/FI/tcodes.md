# FI - Financial Accounting Transaction Codes
# FI - 재무 회계 트랜잭션 코드

## Master Data
| TCode | System | Description |
|-------|--------|-------------|
| FS00 | ECC/S4 | G/L Account Master (Chart of Accounts) / G/L 계정 마스터 |
| FK01 | ECC | Create Vendor (Accounting) / 공급업체 생성 (회계) — S/4HANA: Use BP |
| FK02 | ECC | Change Vendor (Accounting) / 공급업체 변경 (회계) — S/4HANA: Use BP |
| FD01 | ECC | Create Customer (Accounting) / 고객 생성 (회계) — S/4HANA: Use BP |
| FD02 | ECC | Change Customer (Accounting) / 고객 변경 (회계) — S/4HANA: Use BP |
| BP | S4 | Maintain Business Partner / 비즈니스 파트너 유지 |
| AS01 | ECC/S4 | Create Asset Master / 자산 마스터 생성 |
| AS02 | ECC/S4 | Change Asset Master / 자산 마스터 변경 |
| AS03 | ECC/S4 | Display Asset Master / 자산 마스터 조회 |

## Document Entry (General Ledger)
| TCode | System | Description |
|-------|--------|-------------|
| FB50 | ECC/S4 | Enter G/L Account Document / G/L 계정 문서 입력 |
| F-02 | ECC/S4 | Enter G/L Account Posting / G/L 계정 전기 |
| F-03 | ECC/S4 | Clear G/L Account / G/L 계정 정리 |
| FBCJ | ECC/S4 | Cash Journal / 현금 분개 |
| F-65 | ECC/S4 | Park G/L Account Document / G/L 계정 문서 파킹 |

## Accounts Payable
| TCode | System | Description |
|-------|--------|-------------|
| FB60 | ECC/S4 | Enter Vendor Invoice / 공급업체 송장 입력 |
| FB65 | ECC/S4 | Enter Vendor Credit Memo / 공급업체 대변 메모 입력 |
| F-53 | ECC/S4 | Post Vendor Payment / 공급업체 지급 전기 |
| F-44 | ECC/S4 | Clear Vendor / 공급업체 정리 |
| F110 | ECC/S4 | Automatic Payment Run / 자동 지급 실행 |
| MRBR | ECC/S4 | Release Blocked Invoices / 블록된 송장 해제 |

## Accounts Receivable
| TCode | System | Description |
|-------|--------|-------------|
| FB70 | ECC/S4 | Enter Customer Invoice / 고객 송장 입력 |
| FB75 | ECC/S4 | Enter Customer Credit Memo / 고객 대변 메모 입력 |
| F-28 | ECC/S4 | Post Incoming Payment / 수신 지급 전기 |
| F-32 | ECC/S4 | Clear Customer / 고객 정리 |
| F150 | ECC/S4 | Dunning Run / 독촉 실행 |

## Period Closing
| TCode | System | Description |
|-------|--------|-------------|
| F.16 | ECC/S4 | G/L: Balance Carried Forward / G/L 잔액 이월 |
| F.05 | ECC/S4 | Foreign Currency Valuation / 외화 평가 |
| F101 | ECC/S4 | Recurring Entries / 반복 전기 |
| AJRW | ECC/S4 | Asset Fiscal Year Change / 자산 회계 연도 변경 |
| AJAB | ECC/S4 | Year-End Closing for Assets / 자산 연말 결산 |

## Configuration
| TCode | System | Description |
|-------|--------|-------------|
| OB41 | ECC/S4 | Define Posting Keys / 전기 키 정의 |
| OB53 | ECC/S4 | Define Retained Earnings Account / 이익 잉여금 계정 정의 |
| OBB8 | ECC/S4 | Define Terms of Payment / 지급 조건 정의 |
| FBKP | ECC/S4 | Maintain Accounting Config / 회계 설정 유지 |
| OB52 | ECC/S4 | Open and Close Periods / 기간 개설/마감 |

## Reporting
| TCode | System | Description |
|-------|--------|-------------|
| FS10N | ECC/S4 | G/L Account Balance / G/L 계정 잔액 (S/4HANA: FAGLL03H preferred) |
| FAGLL03H | S4 | G/L Account Line Items (New) / G/L 계정 항목 (신규) |
| FBL1N | ECC/S4 | Vendor Line Items / 공급업체 항목 (S/4HANA: FAGLL03H preferred) |
| FBL3N | ECC/S4 | G/L Account Line Items / G/L 계정 항목 (S/4HANA: FAGLL03H preferred) |
| FBL5N | ECC/S4 | Customer Line Items / 고객 항목 (S/4HANA: FAGLL03H preferred) |
| S_ALR_87012284 | ECC/S4 | G/L Account Balances / G/L 계정 잔액 목록 |
| F.01 | ECC/S4 | Financial Statements / 재무제표 |
| S_ALR_87012178 | ECC/S4 | Vendor Balance List / 공급업체 잔액 목록 |

## Monitoring
| TCode | System | Description |
|-------|--------|-------------|
| SM35 | ECC/S4 | Batch Input Monitor / 배치 입력 모니터 |
| F.19 | ECC/S4 | GR/IR Clearing Account Regrouping / GR/IR 정산계정 재분류 |
| FBV0 | ECC/S4 | Post Parked Documents / 파킹 문서 전기 |
| FBRA | ECC/S4 | Reset Cleared Items / 정리 항목 재설정 |
