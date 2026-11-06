# sc4sap 설치 가이드 (처음 쓰는 분용)

← [README로 돌아가기](../README.ko.md) · [English](GETTING-STARTED.md) · 자세한 설정 옵션은 [설치 및 설정](INSTALLATION.ko.md)

Claude Code를 처음 쓰는 분을 위한 단계별 안내예요. 위에서부터 순서대로 따라 하면 돼요.

> **Windows 기준 · 약 30~40분**

## 순서

- [ ] [0. 시작 전 준비물](#0-시작-전-준비물)
- [ ] [1. PowerShell 실행 권한](#1-powershell-실행-권한-열기)
- [ ] [2. Git 설치](#2-git-설치)
- [ ] [3. Node.js 설치](#3-nodejs-설치)
- [ ] [4. Claude Code 설치](#4-claude-code-설치)
- [ ] [5. 로그인](#5-로그인)
- [ ] [6. 작업 폴더 만들기](#6-작업-폴더-만들기)
- [ ] [7. sc4sap 플러그인 설치](#7-sc4sap-플러그인-설치)
- [ ] [8. SAP 연결 설정](#8-sap-연결-설정)
- [ ] [9. 동작 확인](#9-동작-확인)
- [문제 해결](#문제-해결) · [업데이트하는 법](#업데이트하는-법)

---

## 0. 시작 전 준비물

설치 전에 아래 항목을 챙겨 두세요.

| 항목 | 내용 |
|---|---|
| PC | Windows 10 / 11. 관리자 권한이 있으면 편해요. |
| Claude 구독 | Claude Pro 또는 Max 요금제예요. 회사에서 Team / Enterprise를 쓰면 그 계정도 돼요. API 키로도 쓸 수 있어요. |
| SAP 시스템 | ECC 6.0, S/4HANA On-Premise, S/4HANA Cloud 중 하나예요. ADT가 켜져 있어야 해요. |
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

✅ 준비물을 모두 챙겼어요.

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
| 원인을 모르겠어요 | `/sc4sap:sap-doctor`를 실행하고 결과를 Claude에게 보여 주세요. |

## 업데이트하는 법

Claude Code 입력창에서 실행해요.

```
/plugin marketplace update sc4sap
/plugin install sc4sap
```

업데이트 후에는 Claude Code를 다시 시작해요.

> 🔒 **안전 장치** — QA·PRD 프로필에서는 객체 생성·수정·삭제가 두 겹으로 막혀요. 민감한 테이블의 데이터 조회도 기본으로 차단돼요.
