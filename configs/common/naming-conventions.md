# Common - ABAP Naming Conventions
# 공통 - ABAP 명명 규칙

All custom ABAP objects MUST follow these naming conventions. Customer namespace uses `Z` (standard) or `Y` (temporary/prototype) prefix.
모든 커스텀 ABAP 오브젝트는 아래 명명 규칙을 따라야 합니다. 커스텀 네임스페이스는 `Z`(표준) 또는 `Y`(임시/프로토타입) 접두사를 사용합니다.

## General Rules / 공통 규칙

| Rule | Description |
|------|-------------|
| Prefix | `Z` (customer standard) or `Y` (temporary/prototype) — never modify SAP-delivered objects without enhancements |
| Case | UPPERCASE only (ABAP is case-insensitive, but convention is uppercase) |
| Character set | Letters (A-Z), digits (0-9), underscore (`_`) — no other special characters |
| Max length | 30 characters (most objects); 8 characters (package); 40 (class method) |
| Namespace pattern | `Z{MODULE}_{OBJECT_TYPE}_{NAME}` recommended for clarity |
| Avoid | Generic names (ZTEST, ZTEMP, ZDUMMY), Hungarian notation inside ABAP code |

## Module Codes / 모듈 코드

Use these 2-3 letter module codes as the second segment (`Z{MODULE}_...`):

| Code | Module |
|------|--------|
| SD | Sales and Distribution / 영업 및 유통 |
| MM | Materials Management / 자재 관리 |
| FI | Financial Accounting / 재무 회계 |
| CO | Controlling / 관리 회계 |
| PP | Production Planning / 생산 계획 |
| PM | Plant Maintenance / 설비 관리 |
| QM | Quality Management / 품질 관리 |
| HR / HCM | Human Capital Management / 인적 자본 관리 |
| WM | Warehouse Management / 창고 관리 |
| EWM | Extended Warehouse Management (S/4) |
| TM | Transportation Management / 운송 관리 |
| TR | Treasury / 재무(자금) |
| BW | Business Warehouse / 비즈니스 웨어하우스 |
| AR | Ariba integration |
| BC | Basis / 기반 |
| CA | Cross-Application / 공통 |

## Object-Specific Naming / 오브젝트별 명명 규칙

Per-type naming patterns (classes, interfaces, programs, function groups, data dictionary, UI/Dynpro, OData/RAP, enhancements, configuration, IDoc/ALE) are maintained in the companion file **[naming-conventions-objects.md](naming-conventions-objects.md)**. Consult it before creating any ABAP object.

## Code-Level Naming / 코드 레벨 명명

### Variables / 변수

| Prefix | Type | Example |
|--------|------|---------|
| `LV_` | Local Variable (scalar) | `LV_ORDER_NUMBER` |
| `LS_` | Local Structure | `LS_ORDER_HEADER` |
| `LT_` | Local Internal Table | `LT_ORDER_ITEMS` |
| `LR_` | Local Reference (object ref) | `LR_ORDER_HANDLER` |
| `LO_` | Local Object (instance ref) | `LO_ORDER` |
| `GV_` | Global Variable | `GV_CLIENT` (avoid globals where possible) |
| `GS_`, `GT_`, `GR_`, `GO_` | Global Structure/Table/Ref/Object | `GT_ORDER_CACHE` |
| `IV_` | Importing parameter (scalar) | `IV_ORDER_ID` |
| `IS_` | Importing Structure | `IS_ORDER_HEADER` |
| `IT_` | Importing internal Table | `IT_ORDER_ITEMS` |
| `EV_`, `ES_`, `ET_`, `ER_` | Exporting parameters | `EV_RESULT`, `ES_ORDER` |
| `CV_`, `CS_`, `CT_` | Changing parameters | `CV_STATUS` |
| `RV_`, `RS_`, `RT_`, `RR_` | Returning | `RV_TOTAL_AMOUNT` |
| `MV_`, `MS_`, `MT_`, `MR_`, `MO_` | Member (class attribute) | `MV_ORDER_ID`, `MO_LOGGER` |

### Constants / 상수

| Prefix | Description | Example |
|--------|-------------|---------|
| `GC_` | Global Constant | `GC_STATUS_NEW` |
| `LC_` | Local Constant | `LC_DEFAULT_CLIENT` |
| `CO_` | Interface/Class Constant | `CO_MAX_ITEMS` |

### Types / 타입

| Prefix | Description | Example |
|--------|-------------|---------|
| `TY_` | Local Type | `TY_ORDER_HEADER` |
| `TY_T_` | Local Table Type | `TY_T_ORDER_ITEMS` |
| `TY_S_` | Local Structure Type | `TY_S_ORDER_LINE` |

### Methods / 메서드

- Use verbs: `GET_`, `SET_`, `CREATE_`, `DELETE_`, `CALCULATE_`, `CHECK_`, `VALIDATE_`, `PROCESS_`, `CONVERT_`, `BUILD_`
- Private methods: no additional prefix; public methods use same style; static methods same
- Events: `ON_{EVENT}` (handler methods)
- Example: `GET_ORDER_DETAIL`, `CALCULATE_TAX`, `ON_VALUE_CHANGED`

### Forms (ABAP Subroutines - legacy) / 폼 (레거시)

- Pattern: `F01_{NAME}` / `FORM_{NAME}` / verb-based
- Example: `FORM GET_ORDER_DATA`, `FORM F01_READ_CUSTOMER`
- Modern ABAP prefers class methods over FORMs

## Special Prefixes / 특수 접두사 (예약됨)

| Prefix | Owner | Do NOT use |
|--------|-------|-----------|
| A, B, C, D, ... X | SAP standard | Customer modifications need key |
| Z | Customer namespace | ✅ Safe for custom development |
| Y | Customer namespace (alt) | ✅ Safe for temp/prototype |
| /namespace/ | Registered namespace | Requires SAP namespace registration |
| `SAPL` + FG | Function Group main pool | Auto-generated |
| `SAPM` + program | Module pool | Use `SAPMZ...` for custom |

## Validation Rules / 검증 규칙

Before creating any object, verify:

1. **Name starts with `Z` or `Y`** (customer namespace)
2. **Name is uppercase** (no lowercase letters)
3. **Only A-Z, 0-9, _** (no hyphens, spaces, special chars)
4. **Max length respected** (30 chars for most; check specific type)
5. **Not reserved** (not matching SAP reserved names)
6. **Not generic** (avoid `ZTEST`, `ZTEMP`, `ZDUMMY`, `Z1`, `ZAAA`)
7. **Descriptive** (name communicates purpose)
8. **Module code included** when applicable (`Z{MODULE}_...`)
9. **Package assignment correct** (not `$TMP` for transportable objects)

## Recommended Approach / 권장 접근

- Follow the `Z{MODULE}_{TYPE}_{NAME}` pattern for maximum clarity
- For classes, always use `ZCL_`, `ZIF_`, `ZCX_` type prefixes
- For local objects inside programs, use `LCL_`, `LIF_`, `LTCL_`
- Avoid `Y` prefix for production code — reserve for prototypes that will be renamed
- Respect character limits — truncate the `{NAME}` portion if needed, never the prefix
- In S/4HANA, follow RAP naming for OData/Fiori artifacts: `Z_I_`, `Z_C_`, `Z_SD_`, `Z_SB_`, `Z_BP_`
