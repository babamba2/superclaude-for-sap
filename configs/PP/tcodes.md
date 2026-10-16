# PP - Production Planning Transaction Codes
# PP - 생산 계획 트랜잭션 코드

## Master Data
| TCode | System | Description |
|-------|--------|-------------|
| CR01 | ECC/S4 | Create Work Center / 작업장 생성 |
| CR02 | ECC/S4 | Change Work Center / 작업장 변경 |
| CR03 | ECC/S4 | Display Work Center / 작업장 조회 |
| CA01 | ECC/S4 | Create Routing / 라우팅 생성 |
| CA02 | ECC/S4 | Change Routing / 라우팅 변경 |
| CA03 | ECC/S4 | Display Routing / 라우팅 조회 |
| CS01 | ECC/S4 | Create Bill of Materials / BOM 생성 |
| CS02 | ECC/S4 | Change Bill of Materials / BOM 변경 |
| CS03 | ECC/S4 | Display Bill of Materials / BOM 조회 |
| CS11 | ECC/S4 | Display BOM Level by Level / BOM 레벨별 조회 |
| CS15 | ECC/S4 | Where-Used List for Material / 자재 사용처 목록 |

## Production Planning
| TCode | System | Description |
|-------|--------|-------------|
| MD01 | ECC/S4 | Run MRP (Total Planning) / MRP 실행 (전체 계획) |
| MD02 | ECC/S4 | Run MRP (Single Item, Multi-Level) / MRP 실행 (단일 품목, 다중 레벨) |
| MD03 | ECC/S4 | Run MRP (Single Item, Single Level) / MRP 실행 (단일 레벨) |
| MD04 | ECC/S4 | Stock/Requirements List / 재고/소요량 목록 |
| MD05 | ECC/S4 | MRP List / MRP 목록 |
| MD06 | ECC/S4 | MRP List (Collective) / MRP 목록 (집합) |
| MD07 | ECC/S4 | Current Stock/Requirements List / 현재 재고/소요량 목록 |
| MD61 | ECC/S4 | Create Planned Independent Requirements / 독립 소요 계획 생성 |

## Production Orders
| TCode | System | Description |
|-------|--------|-------------|
| CO01 | ECC/S4 | Create Production Order / 제조 오더 생성 |
| CO02 | ECC/S4 | Change Production Order / 제조 오더 변경 |
| CO03 | ECC/S4 | Display Production Order / 제조 오더 조회 |
| CO11N | ECC/S4 | Production Order Confirmation (Single) / 제조 오더 확인 (단일) |
| CO15 | ECC/S4 | Production Order Confirmation (Collective) / 제조 오더 확인 (집합) |
| COHV | ECC/S4 | Mass Processing Production Orders / 제조 오더 대량 처리 |
| COOIS | ECC/S4 | Production Order Information System / 제조 오더 정보 시스템 |
| CO41 | ECC/S4 | Collective Conversion of Planned Orders / 계획 오더 집합 전환 |

## Capacity Planning
| TCode | System | Description |
|-------|--------|-------------|
| CM01 | ECC/S4 | Work Center Load / 작업장 부하 |
| CM21 | ECC/S4 | Capacity Leveling (Individual) / 용량 평준화 (개별) |
| CM25 | ECC/S4 | Capacity Planning Table / 용량 계획 테이블 |

## Configuration
| TCode | System | Description |
|-------|--------|-------------|
| OP43 | ECC/S4 | Setup Group Categories / 셋업 그룹 범주 |
| OMD0 | ECC/S4 | Define MRP Controller / MRP 담당자 정의 |
| OPJN | ECC/S4 | Define Order Types (PP) / 주문 유형 정의 |
| OPJ8 | ECC/S4 | Maintain Operation Control Key / 공정 제어 키 유지 |
| OPK4 | ECC/S4 | Define Confirmation Parameters / 확인 매개변수 정의 |
| OPL8 | ECC/S4 | Plant Parameters for Orders / 주문에 대한 플랜트 매개변수 |
| OPUZ | ECC/S4 | Control Key for Routing Operations / 라우팅 공정 관리 키 |

## Reporting
| TCode | System | Description |
|-------|--------|-------------|
| COOIS | ECC/S4 | Production Order Info System / 제조 오더 정보 시스템 |
| MB52 | ECC/S4 | Warehouse Stocks / 창고 재고 |
| CS12 | ECC/S4 | Multilevel BOM Explosion / 다중 레벨 BOM 전개 |
| MD45 | ECC/S4 | Planning Result Overview / 계획 결과 개요 |

## Monitoring
| TCode | System | Description |
|-------|--------|-------------|
| CO24 | ECC/S4 | Missing Parts Information System / 누락 부품 정보 시스템 |
| MDVP | ECC/S4 | Pegged Requirements / 종속 소요량 |
| CO27 | ECC/S4 | Picking List / 피킹 목록 |
| COGI | ECC/S4 | Automatic Goods Movements Error Log / 자동 재고 이동 오류 로그 |
