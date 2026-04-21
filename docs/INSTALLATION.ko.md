# 설치 및 설정

← [README로 돌아가기](../README.ko.md)

## 요구사항

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP ECC](https://img.shields.io/badge/SAP-ECC_6.0-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA Cloud](https://img.shields.io/badge/SAP-S%2F4HANA_Cloud-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-Auto--Installed-FF6600)

| 항목 | 상세 |
|------|------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI 설치 완료 (Max/Pro 구독 또는 API 키) |
| **SAP 시스템** | **SAP ECC 6.0** / **S/4HANA On-Premise** / **S/4HANA Cloud (Public & Private)** — ADT 활성화됨 |

> **MCP 서버** ([abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup))는 `/sc4sap:setup` 중 **자동 설치·설정**됩니다 — 수동 사전 설치 불필요.

## 설치

> **Note** — sc4sap은 **아직 공식 Claude Code 플러그인 마켓플레이스에 등록되지 않았습니다**. 당분간은 이 저장소를 커스텀 마켓플레이스로 추가한 뒤 플러그인을 설치하세요.

### 옵션 A — 커스텀 마켓플레이스로 추가 (권장)

Claude Code 세션 안에서:

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
/plugin install sc4sap
```

업데이트:

```
/plugin marketplace update babamba2/superclaude-for-sap
/plugin install sc4sap
```

### 옵션 B — 소스에서 설치

```bash
git clone https://github.com/babamba2/superclaude-for-sap.git
cd superclaude-for-sap
npm install && npm run build
```

그 후 Claude Code에서 `/plugin marketplace add <로컬-경로>`로 로컬 플러그인 디렉토리를 지정.

## 설정

```bash
# 설정 스킬 실행 — 위저드가 한 번에 한 질문씩 안내
/sc4sap:setup
```

### 서브커맨드

```bash
/sc4sap:setup                # 전체 위저드 (기본)
/sc4sap:setup doctor         # /sc4sap:sap-doctor로 라우팅
/sc4sap:setup mcp            # /sc4sap:mcp-setup으로 라우팅
/sc4sap:setup spro           # SPRO 설정 자동 추출만
/sc4sap:setup customizations # Z*/Y* 확장/증설 인벤토리만
```

### 멀티 프로필 아키텍처 (0.6.0+)

sc4sap은 같은 Claude Code 세션 안에서 여러 SAP 연결 (Dev / QA / Prod × N 법인) 을 지원합니다.

```
~/.sc4sap/                                    ← 사용자 홈 (저장소 간 공유)
└── profiles/
    ├── KR-DEV/{sap.env, config.json}         ← 연결당 프로필 1개
    ├── KR-QA/ {sap.env, config.json}
    └── KR-PRD/{sap.env, config.json}

<project>/.sc4sap/                            ← 프로젝트 루트 (engagement 스코프)
├── active-profile.txt                        ← "KR-DEV"
└── work/
    ├── KR-DEV/{program, cbo, customizations, ...}
    └── KR-PRD/{...}
```

Tier enum (`DEV` / `QA` / `PRD`)은 readonly 강제의 기준: QA/PRD는 `Create*` / `Update*` / `Delete*`를 두 레이어에서 차단 — PreToolUse 훅 (L1, wire 이전) + MCP 서버 자체 가드 (L2, 우회 불가). QA/PRD 프로필은 9단계 ABAP 유틸 설치도 **거부** — 대응 DEV 프로필에서 설치 후 CTS로 이관하세요.

비밀번호는 OS 키체인 (Windows Credential Manager / macOS Keychain / Linux libsecret) 에 `@napi-rs/keyring`으로 저장됩니다. 키체인 사용 불가 환경 (headless / Docker / 옵셔널 의존성 미설치) 에서는 자동으로 프로필 env에 plaintext fallback 되며 사용자에게 경고를 표시합니다.

전체 디자인: [`multi-profile-design.md`](multi-profile-design.md). 아티팩트 해석 규칙: [`../common/multi-profile-artifact-resolution.md`](../common/multi-profile-artifact-resolution.md).

### 위저드 단계

위저드는 **한 번에 한 질문**만 합니다 — 전체 설문지를 한꺼번에 던지지 않음. 기존 프로필 값이 있으면 보여주고 Enter로 유지 가능.

| # | 단계 | 내용 |
|---|------|------|
| **0** | **레거시 감지 + 프로필 부트스트랩** | 모든 질문 **이전**에 실행. `sap-profile-cli.mjs detect-legacy` 호출. 0.6.0 이전 `<project>/.sc4sap/sap.env`가 있으면 → 마이그레이션 플로우로 라우팅 (`alias` + `tier` 입력 → `sap-profile-cli.mjs migrate` → `sap.env.legacy`로 아카이브 → 프로젝트 `config.json` 삭제 → `active-profile.txt`에 새 프로필 기록 → 5단계부터 재개). 레거시도 없고 프로필도 없으면 → 신규 설치로 1단계 진행. 프로필이 이미 있으면 → 스위치 vs 추가 생성 선택 |
| 1 | **버전 확인** | Claude Code 버전 호환성 검증 |
| 2 | **SAP 버전 + 산업** | `S4` / `ECC` 선택, ABAP 릴리즈 입력, 15개 산업 메뉴에서 선택. SPRO 테이블/BAPI/TCode + ABAP 문법 게이팅 + 산업별 구성 패턴을 구동 |
| 3 | **MCP 서버 설치** | `abap-mcp-adt-powerup`을 `<PLUGIN_ROOT>/vendor/abap-mcp-adt/`에 클론+빌드. 이미 설치됐으면 스킵 (`--update`로 갱신) |
| **4** | **프로필 생성 + SAP 연결** | `alias` (`^[A-Z0-9_-]+$`, `{ISO-COUNTRY}-{TIER}` 권장 예: `KR-DEV`), `SAP_TIER` (`DEV`/`QA`/`PRD`), 선택적 same-company 메타 복사, 그다음 연결 필드 (`SAP_URL`, `SAP_CLIENT`, `SAP_AUTH_TYPE`, `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_LANGUAGE`, `SAP_SYSTEM_TYPE`) 를 한 번에 하나씩 수집. 실제 쓰기는 `sap-profile-cli.mjs add`가 수행 → 프로필 env를 `~/.sc4sap/profiles/<alias>/`에, 비밀번호를 OS 키체인에, pointer `<project>/.sc4sap/active-profile.txt=<alias>`를 기록. `<project>/.sc4sap/sap.env`와 `<project>/.sc4sap/config.json`은 **절대 생성되지 않음** |
| 4bis | **RFC 백엔드 선택** | `soap` / `native` / `gateway` / `odata` / `zrfc` 중 선택. 모든 `SAP_RFC_*` 키는 활성 프로필 env에 기록. [RFC 백엔드](FEATURES.ko.md#-rfc-백엔드-선택) 참고 |
| 5 | **MCP 재연결** | `/mcp` 실행. 서버의 `ReloadProfile` 툴이 pointer + 프로필 env를 읽고 (키체인 해석 포함) 캐시된 연결을 갱신 — Claude Code 재시작 불필요 |
| 6 | **연결 테스트** | SAP 대상 `GetSession` 왕복 |
| 7 | **시스템 정보 확인** | 시스템 ID, 클라이언트, 사용자, 언어 표시. `~/.sc4sap/profiles/<alias>/config.json → systemInfo`에 기록 (프로젝트 폴더 아님) |
| 8 | **ADT 권한 체크** | `GetInactiveObjects`로 ADT 권한 검증 |
| **9** | **ABAP 유틸 객체 생성 (tier 게이트)** | **DEV만 설치 가능.** `ZMCP_ADT_UTILS` FG + `ZIF_S4SAP_CM` / `ZCL_S4SAP_CM_*` ALV OOP 핸들러 (+ 4bis에서 OData/ZRFC 선택 시 관련 클래스) 생성. 시스템 dedup 키는 `SAP_URL + SAP_CLIENT` — 같은 시스템에 대한 sibling DEV 프로필이 이미 설치했으면 재사용. **QA / PRD**에서는 설치 **거부**하고 CTS import 가이드 출력 — 대응 DEV 시스템에서 설치 후 표준 TMS 루트로 이관 |
| 10 | **프로필 `config.json` 최종화** | `sapVersion`, `abapRelease`, `industry`, `activeModules`, `namingConvention`, `blocklistProfile`, `activeTransport`를 `~/.sc4sap/profiles/<alias>/config.json`에 기록. 프로젝트 `.sc4sap/`에는 멀티 프로필 모드에서 `config.json`이 **존재하지 않음** |
| 11 | **SPRO 추출 (선택)** | `y/N` — 토큰 비용 크지만 `<project>/.sc4sap/work/<alias>/spro-config.json` 캐시가 이후 토큰 사용을 크게 줄임 |
| 11b | **커스터마이징 인벤토리 (선택)** | `y/N` — `Z*`/`Y*` 확장 + 어펜드 구조 스캔. `<project>/.sc4sap/work/<alias>/customizations/{MODULE}/{enhancements,extensions}.json`에 저장 |
| **12** | **🔒 PreToolUse 훅 (필수)** | `.claude/settings.json`에 `block-forbidden-tables.mjs` (행추출 가드) **및** `tier-readonly-guard.mjs` (tier 기반 변이 가드) **두 개 모두** 설치 (`node scripts/install-hooks.mjs --project`). 양쪽 스모크 테스트 실행. 이 단계 성공 없이는 setup 미완료 |
| 13 | **HUD 상태 줄** | `~/.claude/settings.json`에 sc4sap 상태 줄 등록. 재시작 후 HUD가 `{alias} [{tier}] {🔒 if readonly}` + 토큰 사용량 표시 |

> **다계층 방어 — 3개 enforcement 레이어**
> - **L1a (12단계, 행 추출)** — Claude Code `PreToolUse` 훅. 프로필은 `~/.sc4sap/profiles/<alias>/config.json → blocklistProfile`. 민감 테이블 `GetTableContents` / `GetSqlQuery` 차단
> - **L1b (12단계, tier)** — Claude Code `PreToolUse` 훅. 매 호출마다 활성 프로필의 `SAP_TIER` 재읽기 (stateless). QA/PRD에서 변이 차단
> - **L2 (MCP 서버, 우회 불가)** — `abap-mcp-adt-powerup` 내부 가드. 행 추출은 `sap.env → MCP_BLOCKLIST_PROFILE`; tier는 `ReloadProfile` 시점에 설정된 `@readonly(tier)` 데코레이터. 훅이 빠지거나 잘못 설정돼도 발동
>
> L1 훅은 IO/parse 에러 시 OPEN fail; L2 MCP 가드는 항상 활성. 권장 기본값: L1a `strict`, MCP 서버 블록리스트 `standard`.

## 설정 완료 후

### 프로필 작업

- 활성 시스템 전환: `/sc4sap:sap-option switch <alias>` (또는 인터랙티브 피커 — `AskUserQuestion` 사용, tier + 허용 툴 매트릭스 프리뷰)
- 법인/tier 추가: `/sc4sap:sap-option add` (위저드: alias → tier → 선택적 same-company 메타 복사 → 연결 + 키체인 비밀번호 캡처)
- 프로필 목록: `/sc4sap:sap-option list` — alias, tier 배지, 호스트, 활성 프로필 `●` 표시
- 제거 / 로테이션 / 영구삭제: `/sc4sap:sap-option remove|edit|purge` — soft-delete는 `~/.sc4sap/profiles/.trash/<alias>-<ts>/`에 7일 자동 purge
- Tier는 불변 — 변경하려면 remove + add

### 상태 점검 & 유지보수

- 상태 점검: `/sc4sap:sap-doctor`
- 자격증명 로테이션 / 산업 변경 / L2 MCP 블록리스트 조정: `/sc4sap:sap-option`
- SPRO 재추출: `/sc4sap:setup spro` (활성 프로필 필요)
- 커스터마이징 인벤토리 재실행: `/sc4sap:setup customizations` (활성 프로필 필요)

### 마이그레이션 롤백 (0.6.0 업그레이드 되돌리기)

```bash
mv .sc4sap/sap.env.legacy .sc4sap/sap.env
rm .sc4sap/active-profile.txt
rm -rf ~/.sc4sap/profiles/<alias>
# 비밀번호를 키체인에 저장했다면 (plaintext fallback이 아닌 경우):
echo '{"service":"sc4sap","account":"<alias>/<user>"}' \
  | node "$CLAUDE_PLUGIN_ROOT/scripts/sap-profile-cli.mjs" keychain-delete
```

---

함께 보기: [기능 상세 →](FEATURES.ko.md) · [변경 이력 →](CHANGELOG.ko.md)
