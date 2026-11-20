# sc4sap 설치 가이드 (처음 쓰는 분용)

← [README로 돌아가기](../README.ko.md) · [English](GETTING-STARTED.md) · 자세한 설정 옵션은 [설치 및 설정](INSTALLATION.ko.md)

Claude Code를 처음 쓰는 분을 위한 단계별 안내예요. 위에서부터 순서대로 따라 하면 돼요.

> **Windows 기준 · 약 30~40분**

## 순서

- [ ] [0. 시작 전 준비물](#0-시작-전-준비물)
- **SAP 서버 준비 (Basis 담당자)**
  - [ ] [B1. 웹 포트 열기 (가장 먼저)](#b1-웹-포트-열기-가장-먼저)
  - [ ] [B2. ICF 서비스 활성화](#b2-icf-서비스-활성화)
  - [ ] [B3. 계정 권한](#b3-계정-권한)
  - [ ] [B4. 시스템·계정 설정](#b4-시스템계정-설정)
- **내 PC 설치**
- [ ] [1. PowerShell 실행 권한](#1-powershell-실행-권한-열기)
- [ ] [2. Git 설치](#2-git-설치)
- [ ] [3. Node.js 설치](#3-nodejs-설치)
- [ ] [4. Claude Code 설치](#4-claude-code-설치)
- [ ] [5. 로그인](#5-로그인)
- [ ] [6. 작업 폴더 만들기](#6-작업-폴더-만들기)
- [ ] [7. sc4sap 플러그인 설치](#7-sc4sap-플러그인-설치)
- [ ] [8. SAP 연결 설정](#8-sap-연결-설정)
- [ ] [B5. Gateway 서비스 등록](#b5-gateway-서비스-등록)
- [ ] [B6. 프로필 내용 확인](#b6-프로필-내용-확인)
- [ ] [9. 동작 확인](#9-동작-확인)
- [ ] [B7. 연결 검증 (자세히)](#b7-연결-검증-자세히)
- [문제 해결](#문제-해결) · [업데이트하는 법](#업데이트하는-법)

---

## 0. 시작 전 준비물

설치 전에 아래 항목을 챙겨 두세요.

| 항목 | 내용 |
|---|---|
| PC | Windows 10 / 11. 관리자 권한이 있으면 편해요. |
| Claude 구독 | Claude Pro 또는 Max 요금제예요. 회사에서 Team / Enterprise를 쓰면 그 계정도 돼요. API 키로도 쓸 수 있어요. |
| SAP 시스템 | ECC 6.0 또는 S/4HANA On-Premise예요. ADT가 켜져 있어야 해요. |
| SAP 접속 정보 | 서버 주소(URL), 클라이언트 번호, 사용자 ID, 비밀번호, 언어예요. |
| 인터넷 | github.com, npmjs.org, claude.ai에 접속돼야 해요. 회사망에서 막히면 IT 부서에 확인하세요. |

<details>
<summary>SAP URL이 뭔지 모르겠다면</summary>

Eclipse ADT에서 쓰는 주소와 같아요. 보통 `https://서버이름:44300` 같은 모양이에요. Basis 담당자에게 "ADT 접속 URL"을 물어보세요.
</details>

<details>
<summary>ADT가 켜져 있는지 확인하는 법</summary>

SAP GUI에서 `SICF`를 실행해요. `/sap/bc/adt` 서비스가 활성 상태면 돼요. 권한이 없으면 Basis 담당자에게 요청하세요.
</details>

> **회사 SAP 서버에 처음 연결한다면** 아래 [B1~B4](#b1-웹-포트-열기-가장-먼저)를 Basis 담당자에게 먼저 요청하세요. 특히 **B1 웹 포트**가 열려야 나머지를 시험할 수 있어요. 설치(DEV 서버)는 한 번만 하고, QA·PRD 서버에는 트랜스포트로 반영해요.

✅ 준비물을 모두 챙겼어요.

---

## B1. 웹 포트 열기 (가장 먼저)

**[BC]** sc4sap은 SAP 서버의 **웹(HTTP/HTTPS) 포트**로 접속해요. SAP GUI 포트(32xx)나 RFC 포트(33xx)는 쓰지 않아요. 이 포트가 막혀 있으면 B2 이후를 다 해 둬도 접속 시험을 할 수 없어요.

### 포트 번호 규칙

SAP 포트는 보통 **앞자리 + 인스턴스 번호**예요. 아래 예시는 인스턴스 번호가 `00`인 서버예요.

| 용도 | 규칙 | 예시 (인스턴스 00) |
|---|---|---|
| SAP GUI | 32 + 번호 | 3200 |
| RFC | 33 + 번호 | 3300 |
| **웹 HTTP (sc4sap이 씀)** | **80 + 번호** | **8000** |
| 웹 HTTPS (sc4sap이 씀) | 443 + 번호 | 44300 |

규칙과 다른 번호를 쓰는 서버도 있어요. 실제 번호는 아래 1단계에서 확인해요.

### 여는 순서

| 단계 | 누가 | 할 일 | 확인 방법 |
|---|---|---|---|
| 1 | BC | 서버에 웹 포트가 있는지 확인해요. `SMICM` → 이동 → 서비스 | HTTP(또는 HTTPS) 행에 포트 번호가 있고 활성 상태예요. |
| 2 | BC | 없으면 포트를 추가해요. `RZ10`에서 `icm/server_port_<n>` = `PROT=HTTP,PORT=8000` → ICM 재시작 | 1단계 화면에 새 행이 보여요. |
| 3 | BC · 네트워크 담당 | 방화벽에서 개발자 PC → 서버 IP·웹 포트를 허용해요. | — |
| 4 | 개발자 | PC에서 접속을 확인해요. (아래 명령) | `TcpTestSucceeded : True` |

```powershell
Test-NetConnection sapdev.example.com -Port 8000
```

> **Basis 담당자에게 이렇게 요청하세요** "SAP 서버의 웹 포트(80 + 인스턴스 번호, 또는 HTTPS 443 + 인스턴스 번호)를 개발자 PC에서 접속할 수 있게 해 주세요."

### 웹 포트를 열 수 없을 때: RFC(NCo) 방식

웹 포트 대신 **RFC 포트(33 + 인스턴스 번호)**로 접속하는 방식이에요. 개발자 PC의 SAP .NET Connector(NCo)를 써요.

| 항목 | 웹 포트 방식 | NCo 방식 |
|---|---|---|
| 포트 | 웹 80NN / 443NN | RFC 33NN |
| ICF 노드 (B2) | 필요 | 필요 없음 |
| Gateway 서비스 등록 (B5) | 필요 | 필요 없음 |
| `S_SERVICE` | 필요 | 필요 없음 |
| `S_ADT_RES` | 필요 | **똑같이 필요** (RFC로 들어와도 ADT가 검사해요) |
| `S_RFC` | ADT용 + Z 함수 | 같음 + `SADT_REST` (RFC로 ADT 호출) |
| Z 함수 설치·이송 | DEV 설치 → QA 이송 | 같음 |
| 개발자 PC | 제한 없음 | Windows + NCo 설치 |

> **NCo는 사용자마다 직접 설치해야 해요.** NCo(SAP Connector for Microsoft .NET 3.1)는 SAP 라이선스 프로그램이라 sc4sap이 대신 배포할 수 없어요. SAP Support Portal(Software Downloads)에서 받고, 다운로드 권한이 있는 S-user 계정이 필요해요. S-user가 없으면 회사 Basis 담당자에게 설치 파일이나 설치를 요청하세요. SAP GUI와 함께 이미 설치된 PC도 있어요.

| 그 밖의 제약 | 내용 |
|---|---|
| Windows PC만 | Mac·Linux에서는 쓸 수 없어요. 이런 PC는 웹 포트 방식만 돼요. |
| 서버 직접 접속만 | 앱 서버 주소 + 인스턴스 번호로만 접속해요. 메시지 서버(로그온 그룹), SAProuter, SNC는 지원하지 않아요. |
| 암호화 | SNC를 쓰지 않아서 RFC 통신이 암호화되지 않아요. 사내망에서만 쓰세요. Basis 담당자와 확인하세요. |
| Z 함수 버전 | `ZMCP_ADT_DISPATCH`에 NCo용 기능(`FM_PROXY`)이 있어야 해요. 최신 소스로 설치하면 들어 있어요. |
| 권한은 줄지 않음 | `S_ADT_RES`와 조회·개발 권한은 웹 포트 방식과 같아요. 줄어드는 건 ICF·Gateway·`S_SERVICE`뿐이에요. |

---

## B2. ICF 서비스 활성화

**[BC]** 트랜잭션 `SICF`에서 아래 노드를 활성화해요. 상위 노드가 꺼져 있으면 하위 노드도 동작하지 않아요.

| 노드 | 필요 | 용도 |
|---|---|---|
| `/default_host/sap`, `/default_host/sap/bc` | 필수 | 상위 노드 |
| `/default_host/sap/bc/adt` | 필수 | ADT 경로 (모든 읽기·쓰기). CSRF 토큰은 `/sap/bc/adt/core/discovery`에서 받아요. |
| `/default_host/sap/opu/odata` | 필수 | OData 경로 (화면·GUI 상태·텍스트 풀·덤프) |

---

## B3. 계정 권한

**[BC]** SAP 표준 역할 `SAP_BC_DWB_ABAPDEVELOPER`를 복사해서 시작하고, 아래 권한을 보강해요. 서버마다 다를 수 있으니 Basis 담당자가 확인하세요.

### 기본 권한 (모든 사용자)

| 권한 객체 | 필드와 값 | 용도 | 쓰기 계정 | 읽기 전용 계정 |
|---|---|---|---|---|
| `S_ADT_RES` | `URI` = `/sap/bc/adt/*` | ADT 접근 | 필요 | 필요 |
| `S_RFC` | `RFC_TYPE` = FUGR, `RFC_NAME` = `SADT*`, `SDTX`, `SYST`, `RFC1`, `ACTVT` = 16 | ADT 내부 RFC | 필요 | 필요 |
| `S_RFC` (추가) | `RFC_NAME` = `ZMCP_ADT_UTILS` | 디스패처·텍스트 풀·DDIC 함수 호출 | 필요 | 필요 |
| `S_SERVICE` | `ZMCP_ADT_SRV` 서비스 | OData 경로 호출 | 필요 | 필요 |
| `S_DEVELOP` | `DEVCLASS` = `$TMP`, `Z*`, `Y*` · `OBJTYPE` = PROG, CLAS, INTF, FUGR, DEVC 등 · `OBJNAME` = `Z*`, `Y*` · `ACTVT` = 01, 02, 03, 06, 07, 16 | 01 생성 · 02 변경 · 03 조회 · 06 삭제 · 07 활성화 · 16 실행 | 전체 | 03만 |
| `S_TRANSPRT` | `TTYPE` = DTRA, TASK · `ACTVT` = 01, 02, 03 | 트랜스포트 조회·생성·지정 | 전체 | 03만 |
| `S_TABU_DIS`, `S_TABU_NAM` | 조회할 테이블 그룹·이름, `ACTVT` = 03 | 테이블 조회 | 필요 | 필요 |
| ST22 조회 권한 | — | 덤프 조회 | 선택 | 선택 |

### Gateway 등록 권한 (등록 담당 개발자 1명)

B5의 Gateway 등록을 개발자가 직접 하려면 필요해요. 표준 개발자 역할에는 없어요. 등록은 서버당 한 번이라 담당자 한 명에게만 주면 돼요.

| 권한 객체 | 필드와 값 | 용도 |
|---|---|---|
| `S_TCODE` | `/IWBEP/REG_SERVICE`, `/IWFND/MAINT_SERVICE`, `/IWFND/CACHE_CLEANUP`, `/IWFND/ERROR_LOG`, `SEGW`, `SICF` | 등록·캐시 정리·오류 로그 |
| `/IWBEP/SB` | 프로젝트 `ZMCP_ADT` (또는 `Z*`), 활동 전체 | SEGW로 등록하는 대안 경로 |
| `S_DEVELOP` (추가) | `OBJTYPE` = Gateway 저장소 객체(서비스·모델·서비스 그룹 등) · `OBJNAME` = `ZMCP_ADT*` · `ACTVT` = 01, 02, 03 | Gateway 카탈로그 항목 생성 |
| `S_ICF_ADM` | `ZMCP_ADT_SRV` 노드 | ICF 노드 활성화 |
| `S_TRANSPRT` | `ACTVT` = 01, 02 | 이송 가능한 패키지에 등록할 때만 |

---

## B4. 시스템·계정 설정

**[BC]**

| 항목 | 필요한 상태 | 안 되어 있으면 |
|---|---|---|
| 개발자 키 | 사용자에게 개발자 키가 등록돼 있음 | Z 객체 쓰기 실패 |
| 시스템 변경 옵션 | 고객 네임스페이스(Z/Y)와 로컬 객체 수정 가능 | 쓰기 실패 |
| 클라이언트 설정 | 리포지토리·크로스 클라이언트 객체 변경 허용 | 쓰기 실패 |
| 사용자 유형 | 대화 사용자 또는 서비스 사용자 | 로그인 실패 |
| 비밀번호 상태 | 초기 비밀번호가 아님 (SAP GUI로 한 번 로그인해서 바꿔요) | HTTP 로그인 실패 |

---

## 1. PowerShell 실행 권한 열기

Windows는 기본으로 PowerShell 스크립트 실행을 막아 둬요. 이걸 열지 않으면 Claude Code 설치와 `claude`, `npm` 명령이 오류로 멈춰요.

**① PowerShell 열기**

1. 키보드에서 <kbd>Win</kbd> 키를 누르고 "PowerShell"을 입력해요.
2. **Windows PowerShell**을 클릭해요.
3. 관리자 권한으로 열려면 오른쪽 클릭 후 **관리자 권한으로 실행**을 눌러요.

**② 현재 설정 확인**

```powershell
Get-ExecutionPolicy -List
```

`CurrentUser`와 `LocalMachine`이 둘 다 `Undefined`나 `Restricted`면 막혀 있는 상태예요.

**③ 권한 열기 — 둘 중 하나를 실행해요**

방법 A — 내 계정만 (관리자 권한 필요 없음, 권장)

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

방법 B — PC 전체 (관리자 권한 PowerShell에서)

```powershell
Set-ExecutionPolicy -Scope LocalMachine -ExecutionPolicy RemoteSigned
```

확인 질문이 나오면 <kbd>Y</kbd>(또는 <kbd>A</kbd>)를 입력하고 <kbd>Enter</kbd>를 눌러요.

**④ 다시 확인**

```powershell
Get-ExecutionPolicy
```

성공하면 `RemoteSigned`가 나와요.

<details>
<summary>RemoteSigned가 뭔가요?</summary>

내 PC에서 만든 스크립트는 실행하고, 인터넷에서 받은 스크립트는 서명된 것만 실행해요. 개발자 PC에서 흔히 쓰는 설정이에요.
</details>

<details>
<summary>"그룹 정책에 의해 재정의되었습니다" 오류가 나오면</summary>

회사가 정책으로 막아 둔 상태예요. 직접 바꿀 수 없어요. IT 부서에 "PowerShell 실행 정책 RemoteSigned 허용"을 요청하세요.
</details>

✅ 실행 정책이 `RemoteSigned`로 나와요.

---

## 2. Git 설치

Claude Code와 sc4sap이 내부에서 Git을 써요. Windows에서는 꼭 필요해요.

1. [git-scm.com/download/win](https://git-scm.com/download/win)에서 설치 파일을 받아요.
2. 설치 화면은 모두 기본값으로 두고 **Next**만 눌러요.
3. 설치가 끝나면 **새 PowerShell 창**을 열고 확인해요.

```powershell
git --version
```

성공하면 `git version 2.xx.x` 같은 글자가 나와요.

✅ Git 설치를 마쳤어요.

---

## 3. Node.js 설치

sc4sap의 SAP 연결 서버(MCP)가 Node.js로 돌아가요. **버전 20 이상**이 필요해요.

1. [nodejs.org](https://nodejs.org)에서 **LTS** 버전을 받아요.
2. 설치 화면은 기본값 그대로 진행해요.
3. 열려 있던 PowerShell 창은 닫아요. 새 창을 열어 확인해요.

```powershell
node --version
npm --version
```

성공하면 `v20` 이상의 숫자가 나와요. 예: `v22.11.0`

✅ Node.js 설치를 마쳤어요.

---

## 4. Claude Code 설치

Claude Code는 터미널에서 쓰는 Claude예요. sc4sap은 그 위에 얹는 플러그인이에요.

방법 A — 공식 설치 스크립트 (권장)

```powershell
irm https://claude.ai/install.ps1 | iex
```

방법 B — npm으로 설치 (방법 A가 회사망에서 막힐 때)

```powershell
npm install -g @anthropic-ai/claude-code
```

설치가 끝나면 PowerShell 창을 닫고 새로 열어요. 그다음 확인해요.

```powershell
claude --version
```

성공하면 버전 번호가 나와요.

<details>
<summary>"claude는 인식되지 않습니다"가 나오면</summary>

PowerShell 창을 다시 열어 보세요. 그래도 안 되면 PC를 재시작해요.
</details>

✅ Claude Code 설치를 마쳤어요.

---

## 5. 로그인

처음 실행하면 로그인 화면이 나와요.

```powershell
claude
```

1. 테마(색상)를 고르라고 나와요. 방향키로 고르고 <kbd>Enter</kbd>를 눌러요.
2. 로그인 방식에서 **Claude account with subscription**을 골라요. API 키를 쓰면 **Anthropic Console**을 골라요.
3. 브라우저가 열려요. Claude 계정으로 로그인하고 승인을 눌러요.
4. 터미널로 돌아오면 입력창(`>`)이 보여요.

> **잘 됐는지 확인** — 입력창에 `안녕`이라고 써 보세요. 대답이 오면 성공이에요.
>
> **나가는 법** — `/exit`를 입력하거나 <kbd>Ctrl</kbd> + <kbd>C</kbd>를 두 번 눌러요.

✅ 로그인을 마쳤어요.

---

## 6. 작업 폴더 만들기

sc4sap은 실행한 폴더에 작업 기록을 저장해요. 전용 폴더를 하나 만들어 두세요.

```powershell
mkdir $HOME\Documents\sap-work
cd $HOME\Documents\sap-work
claude
```

> **앞으로는 항상 이렇게 시작해요** — PowerShell을 열고 `cd $HOME\Documents\sap-work` 다음에 `claude`를 실행해요.

<details>
<summary>폴더를 신뢰하겠냐고 물으면</summary>

**Yes, proceed**를 골라요. 내 작업 폴더라서 괜찮아요.
</details>

✅ 작업 폴더에서 Claude Code를 열었어요.

---

## 7. sc4sap 플러그인 설치

> ⚠️ 이제부터는 **Claude Code 입력창(`>`)** 에 입력해요. PowerShell 명령이 아니에요.

**① 마켓플레이스 등록**

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
```

**② 플러그인 설치**

```
/plugin install sc4sap
```

설치 범위를 물으면 **User**(모든 폴더에서 사용)를 고르면 편해요.

**③ Claude Code 다시 시작**

1. `/exit`로 나가요.
2. 같은 폴더에서 `claude`를 다시 실행해요.

> **설치 확인** — 입력창에 `/sc4sap`까지만 입력해 보세요. `/sc4sap:setup` 같은 목록이 뜨면 성공이에요.

✅ 플러그인 설치를 마쳤어요.

---

## 8. SAP 연결 설정

설정 마법사가 한 번에 질문을 하나씩 해요. 대답만 하면 돼요.

```
/sc4sap:setup
```

**마법사 흐름**

```
SAP 버전·산업 → MCP 서버 자동 설치 → 접속 정보 입력 → 연결 테스트 → 보안 훅 설치 → 완료
```

**자주 묻는 질문과 답**

| 질문 | 이렇게 답하세요 |
|---|---|
| SAP 버전 | `S4` 또는 `ECC`. ABAP 릴리스는 SAP GUI 메뉴 **시스템 → 상태**에서 볼 수 있어요. 예: `757` |
| 산업 | 회사 업종을 목록에서 골라요. 잘 모르면 가장 가까운 것을 골라요. |
| 프로필 이름 (alias) | `국가코드-용도` 형식을 권장해요. 예: `KR-DEV` |
| Tier | 개발 서버면 `DEV`. 품질은 `QA`, 운영은 `PRD`예요. QA·PRD는 자동으로 읽기 전용이 돼요. |
| SAP_URL | ADT 접속 주소예요. 예: `https://sapdev.example.com:44300` |
| SAP_CLIENT | 클라이언트 번호예요. 예: `100` |
| 사용자 / 비밀번호 | 평소 SAP 로그인 정보예요. 비밀번호는 Windows 자격 증명 관리자에 안전하게 저장돼요. |
| RFC 백엔드 | 모르면 기본값(`soap`)을 그대로 써요. |
| ABAP 유틸 객체 설치 | DEV에서만 물어봐요. 트랜스포트 요청 번호가 필요할 수 있어요. |
| SPRO 추출 / 커스터마이징 인벤토리 | 처음에는 <kbd>N</kbd>을 눌러 건너뛰어도 돼요. 나중에 따로 실행할 수 있어요. |

<details>
<summary>권한 승인 창이 뜨면</summary>

Claude가 파일을 쓰거나 명령을 실행할 때 허락을 구해요. 설정 중에는 **Yes**를 골라도 돼요.
</details>

<details>
<summary>중간에 "MCP 재연결"을 하라고 하면</summary>

입력창에 `/mcp`를 입력해요. 목록에서 `sap` 서버를 골라 **Reconnect**를 눌러요.
</details>

✅ 설정 마법사를 끝냈어요.

---

## B5. Gateway 서비스 등록

**[개발자]** OData 경로를 쓰려면 `ZMCP_ADT_SRV` 서비스를 등록해야 해요. 백엔드(`/IWBEP`)와 프런트엔드(`/IWFND`) **두 곳 모두** 등록해야 동작해요. 웹 포트 대신 NCo 방식(B1)을 쓰면 이 단계는 필요 없어요.

### 시작 전 확인

- `/sc4sap:setup`(8단계)으로 아래 객체가 준비돼 있어야 해요.
  - SEGW 프로젝트 `ZMCP_ADT` — 유형 "Service with SAP Annotations". setup 중에 SAP GUI에서 직접 만들어요.
  - 클래스 `ZCL_ZMCP_ADT_MPC_EXT`, `ZCL_ZMCP_ADT_DPC_EXT` — setup이 소스를 넣고 활성화해요.
  - 함수 `ZMCP_ADT_DISPATCH`, `ZMCP_ADT_TEXTPOOL` — RFC 가능 상태여야 해요. setup이 안내하면 SE37에서 "원격 호출 가능"을 체크해요.
- B2의 `/default_host/sap/opu/odata` 노드가 켜져 있어야 해요.
- B3의 Gateway 등록 권한이 있어야 해요.

### 입력할 값

| 필드 | 값 |
|---|---|
| 서비스 이름 · 외부 서비스 이름 | `ZMCP_ADT_SRV` |
| 모델 이름 | `ZMCP_ADT_MDL` |
| 버전 | `0001` |
| 네임스페이스 | 비워 둠 |
| 모델 제공 클래스 | `ZCL_ZMCP_ADT_MPC_EXT` |
| 데이터 제공 클래스 | `ZCL_ZMCP_ADT_DPC_EXT` |
| 시스템 별칭 | `LOCAL` (같은 서버 안에서 호출, RFC 대상 `NONE`) |
| 패키지 | 클래스와 같은 패키지 또는 `$TMP` |

### 등록 순서

1. **백엔드 등록** — `/IWBEP/REG_SERVICE` → 등록 → 위 값 입력 → 저장
2. **프런트엔드 등록** — `/IWFND/MAINT_SERVICE` → 서비스 추가 → 시스템 별칭 `LOCAL`, 외부 서비스 이름 `ZMCP_ADT_SRV` → 서비스 가져오기 → 선택한 서비스 추가 → 패키지 지정
3. **ICF 노드 활성화** — `SICF` → `/default_host/sap/opu/odata/sap/ZMCP_ADT_SRV` → 서비스 활성화
4. **캐시 정리** — `/IWFND/CACHE_CLEANUP` → 모델 캐시 정리 → 실행

> **대안 경로** `/IWBEP/SB` 권한이 있으면 1단계 대신 SEGW를 써도 돼요. SEGW에서 `ZMCP_ADT` 열기 → 런타임 객체 생성(F6) → 활성화 → 서비스 등록(시스템 별칭 `LOCAL`). 그다음 2~4단계는 똑같이 해요.

### 등록 확인

브라우저에서 아래 주소를 열어요.

```
https://sapdev.example.com:44300/sap/opu/odata/sap/ZMCP_ADT_SRV/$metadata?sap-client=100
```

- `<edmx:Edmx>`로 시작하는 XML이 나오면 정상이에요.
- XML 안에 `FunctionImport Name="Dispatch"`와 `ComplexType Name="DispatchResult"`가 있어야 해요.

### 문제 해결

| 증상 | 원인 | 조치 |
|---|---|---|
| `$metadata`가 404 | ICF 노드가 꺼져 있거나 프런트엔드 등록이 빠짐 | 등록 순서 3단계(SICF), 2단계(서비스 추가) |
| `$metadata`는 200인데 호출하면 500 | 백엔드(`/IWBEP`) 등록이 빠짐 (`/IWFND/MAINT_SERVICE`의 백엔드 서비스 탭이 비어 있음) | 1단계 실행 → 프런트엔드 서비스 삭제 후 다시 추가 |
| 등록 후에도 500 | 예전 모델 캐시가 남아 있음 | `/IWFND/CACHE_CLEANUP` 실행, `ZMCP_ADT_FLUSH_CACHE`를 `P_FLUSH`로 실행 |
| 원인을 모르는 500 | ABAP 예외가 OData 오류에 가려짐 | 응답의 트랜잭션 ID로 `/IWFND/ERROR_LOG` 확인, `ZMCP_ADT_FLUSH_CACHE`를 `P_DIAG`로 실행 |
| 401 | 인증 실패 | 계정·비밀번호 확인, 초기 비밀번호 상태인지 확인 |

> **비상용 옵션** `ZMCP_ADT_FLUSH_CACHE`의 `P_REG`는 백엔드 테이블에 직접 값을 넣어요. 일부 값이 빠질 수 있으니, 위 순서로 등록할 수 있으면 쓰지 마세요.

---

## B6. 프로필 내용 확인

**[개발자]** 접속 정보는 `~/.sc4sap/profiles/<별칭>/sap.env`에 저장돼요. `/sc4sap:setup`이 대신 만들어 줘요. 비밀번호는 파일이 아니라 Windows 자격 증명 관리자에 저장돼요. 값을 고칠 때는 `/sc4sap:sap-option`을 써요.

| 키 | 예시 값 | 설명 |
|---|---|---|
| `SAP_URL` | `https://sapdev.example.com:44300` | 서버 주소 |
| `SAP_CLIENT` | `100` | 로그인 클라이언트 |
| `SAP_AUTH_TYPE` | `basic` | Basic 인증 |
| `SAP_USERNAME` | `SC4SAP_DEV01` | 로그인 계정 (예시) |
| `SAP_PASSWORD` | (자격 증명 관리자) | 파일에 쓰지 않아요 |
| `SAP_LANGUAGE` | `KO` | 로그온 언어 |
| `SAP_SYSTEM_TYPE` | `onprem` | 온프레미스 서버 |
| `SAP_VERSION` | `ECC` 또는 `S4` | ECC면 ECC 전용 처리 방식을 써요 |
| `ABAP_RELEASE` | `740` | BASIS 릴리스 숫자 |
| `SAP_TIER` | `DEV` | QA·PRD로 두면 쓰기가 막혀요 |
| `SAP_RFC_BACKEND` | `odata` | OData 경로 사용 (NCo 방식이면 `nco`) |
| `SAP_RFC_ODATA_SERVICE_URL` | `https://sapdev.example.com:44300/sap/opu/odata/sap/zmcp_adt_srv` | OData 서비스 주소 |
| `SAP_RFC_ODATA_CSRF_TTL_SEC` | `600` | CSRF 토큰 재사용 시간(초) |
| `MCP_BLOCKLIST_PROFILE` | `minimal` | 보호 테이블 차단 수준 |
| `MCP_BLOCKLIST_EXTEND` | `ZHR*` | 추가로 막을 테이블 |

> **보호 테이블은 sc4sap이 따로 막아요.** BKPF, KNA1 같은 테이블은 조회 전에 사용자 승인을 받아요. SAP 권한이 있어도 sc4sap의 차단이 먼저 적용돼요.

---

## 9. 동작 확인

마지막으로 상태를 점검해요.

```
/sc4sap:sap-doctor
```

모두 통과하면 설치 완료예요. 이제 써 볼 차례예요.

**처음 써 보기 좋은 명령**

| 하고 싶은 일 | 입력 예시 |
|---|---|
| 프로그램 분석 | `/sc4sap:analyze-code ZMY_REPORT` |
| 프로그램 스펙 문서 | `/sc4sap:program-to-spec ZMY_REPORT` |
| 모듈 컨설턴트에게 질문 | `/sc4sap:ask-consultant 납품 생성 시 여신 체크는 어디서 설정해?` |
| 덤프 원인 분석 | `/sc4sap:analyze-symptom 어제 ST22 덤프 봐줘` |
| 새 프로그램 만들기 | `/sc4sap:create-program` |
| 설정 보기·변경 | `/sc4sap:sap-option` |

> 명령 없이 그냥 한국어로 물어봐도 돼요. 예: "ZMY_REPORT 소스 읽고 무슨 프로그램인지 설명해줘"

✅ `sap-doctor` 점검을 통과했어요.

---

## B7. 연결 검증 (자세히)

sap-doctor가 실패하거나 어느 경로가 막혔는지 알고 싶을 때 이 순서로 확인해요. Claude Code 입력창에 그대로 말하면 돼요.

| 순서 | Claude에게 이렇게 요청 | 확인하는 것 |
|---|---|---|
| 1 | "MARA 테이블 검색해 줘" | ADT 경로 (B1·B2·B3) |
| 2 | "SAPLSPO1 프로그램의 GUI 상태 보여 줘" | OData → `ZMCP_ADT_DISPATCH` 경로 (B5) |
| 3 | `/sc4sap:sap-doctor` | ADT·OData 종합 점검 |
| 4 | "$TMP에 테스트 프로그램 만들고, 고치고, 활성화한 뒤 지워 줘" | 쓰기 권한 (쓰기 계정만, DEV에서만) |

> **1번만 되고 2번이 안 되면** ADT는 열렸고 OData 경로가 막힌 거예요. B5의 등록 확인과 문제 해결을 보세요.

---

## 문제 해결

자주 막히는 지점이에요.

| 증상 | 해결 |
|---|---|
| `claude` / `node` / `git`을 인식하지 못해요 | PowerShell 창을 닫고 새로 열어요. 그래도 안 되면 PC를 재시작해요. |
| 스크립트 실행이 막혀 있다는 오류 | [1단계](#1-powershell-실행-권한-열기)를 다시 확인해요. `Get-ExecutionPolicy`가 `RemoteSigned`여야 해요. 그룹 정책으로 막혔으면 IT 부서에 요청하세요. |
| npm 설치가 멈추거나 실패해요 | 회사 프록시나 방화벽 때문일 수 있어요. IT 부서에 npmjs.org·github.com 접속을 요청하세요. |
| `/sc4sap:setup`이 목록에 없어요 | Claude Code를 완전히 닫았다가 다시 열어요. `/plugin`에서 sc4sap이 설치됐는지 확인해요. |
| SAP 연결 테스트 실패 (401) | 사용자 ID·비밀번호·클라이언트를 확인해요. `/sc4sap:sap-option`에서 고칠 수 있어요. |
| SAP 연결 테스트 실패 (403 / 404) | SICF의 `/sap/bc/adt`가 꺼져 있거나 ADT 권한이 없어요. Basis 담당자에게 요청하세요. |
| 인증서(SSL) 오류 | 사내 인증서를 쓰는 서버일 수 있어요. 오류 메시지를 Claude에게 그대로 붙여 넣고 물어보세요. |
| 비밀번호를 바꿨는데 예전 값으로 접속해요 | Claude Code를 완전히 종료한 뒤 다시 실행해요. 연결 서버는 시작할 때 비밀번호를 읽어요. |
| `UserPromptSubmit hook ... keyword-detector.mjs / skill-injector.mjs timed out` 메시지가 나오거나, setup이 SAP 비밀번호를 채팅으로 물어요 | 옛 sc4sap(0.6.59 이전)이 설치돼 있어요. 지금 버전에는 이 훅이 없고, 비밀번호는 마스킹된 PowerShell 창에서 받아요. [업데이트하는 법](#업데이트하는-법)대로 업데이트하고 다시 시작한 뒤 `/plugin`에서 버전을 확인하세요. 그래도 훅이 남으면 다른 플러그인(예: oh-my-claudecode)의 훅이에요. |
| 원인을 모르겠어요 | `/sc4sap:sap-doctor`를 실행하고 결과를 Claude에게 보여 주세요. |

## 업데이트하는 법

Claude Code 입력창에서 실행해요.

```
/plugin marketplace update sc4sap
/plugin install sc4sap
```

업데이트 후에는 Claude Code를 다시 시작해요.

> 🔒 **안전 장치** — QA·PRD 프로필에서는 객체 생성·수정·삭제가 두 겹으로 막혀요. 민감한 테이블의 데이터 조회도 기본으로 차단돼요.
