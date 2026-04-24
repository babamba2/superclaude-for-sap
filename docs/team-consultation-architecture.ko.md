# sc4sap — 팀 컨설테이션 아키텍처

> Claude Code agent teams를 sc4sap의 멀티 전문가 협의 워크플로에 적용하기 위한 설계 문서. 상태: **draft**, ask-consultant 프로토타입 착수 대기.

## 1. 문제 정의

현재 멀티 컨설턴트를 쓰는 스킬들 (`ask-consultant`, `create-program`, `compare-programs`, `analyze-symptom`, `analyze-code`)은 모두 같은 패턴을 공유:

```
main thread ─┬─> consultant_A (고립)
             ├─> consultant_B (고립)
             └─> consultant_C (고립)
                        │
                        v
                  sap-writer (사후 합성) ── "A는 X라고, B는 Y라고 말함"
```

- 각 컨설턴트는 **서로의 답을 모른 채** 응답.
- 합성은 **post-hoc 조립**이지 라이브 조율이 아님.
- 컨설턴트끼리 의견이 충돌해도 writer는 **불일치를 보고**할 뿐, **해소**할 수 없음.
- Claude Code 플랫폼 제약: sub-agent는 `Agent()`를 호출할 수 없음 — 컨설턴트가 다른 컨설턴트를 직접 부를 수 없음 (0.6.8에서 revert됨, `CHANGELOG.md` 참조).

Agent teams (Claude Code 실험적 기능, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)가 빠진 채널을 제공함: **팀원끼리 `SendMessage`로 lead를 거치지 않고 직접 통신 가능**.

## 2. 공통 흐름 — Lead ↔ Team

```
                         사용자
                          │
                          v
              ┌─────────────────────────┐
              │  Lead (Claude Code      │  ← 메인 세션, 호출한 스킬
              │  메인 세션)              │
              └──────────┬──────────────┘
                         │ TeamCreate + Agent(team_name=...) × N
                         v
         ┌───────────────────────────────────────┐
         │     Team / 공유 task list             │
         │                                       │
         │   ┌─────────┐   ┌─────────┐   ┌─────┐ │
         │   │Member_A │◄─►│Member_B │◄─►│ ... │ │  ← SendMessage 피어 ↔ 피어
         │   └─────────┘   └─────────┘   └─────┘ │     (main 릴레이 없음)
         │        │             │          │     │
         │        └─────────────┼──────────┘     │
         │                      v                │
         │             consensus.md (40-)        │  ← 팀원이 여기에 작성
         └──────────────────────┬────────────────┘
                                │ lead가 최종 상태 읽음
                                v
                      ┌─────────────────┐
                      │ Lead: 중재       │  ← lead가 합의 추출,
                      │   + 포매팅        │     잔여 불일치 표기,
                      └─────────────────┘     사용자에게 반환
```

- Lead = 호출한 스킬을 실행하는 Claude Code 세션 (frontmatter `model:`은 선언적; `skill-model-architecture.md` 참조).
- Members = `Agent(..., team_name="...")`로 스폰되는 sc4sap 에이전트.
- `~/.claude/tasks/<team-name>/` 아래 task list가 공유 스크래치패드.
- **팀원은 추가 에이전트를 스폰할 수 없음** — single-dispatch와 동일한 `Agent()` 제약. 협의 범위는 유한해야 함.
- **이름 주소지정은 ephemeral** — `name=`으로는 활성 중일 때만 도달 가능; 턴을 넘겨 재지정하려면 spawn 반환의 UUID 필요.

## 3. 팀 타입 — 4종

### Type A — Cross-Module Consultant Panel (크로스모듈 컨설턴트 패널)

**구성**: 2-3명의 `sap-{module}-consultant` (대등한 피어) + 필요 시 `sap-bc-consultant`.

**목적**: 크로스모듈 질문에 대한 비즈니스 계층 합의.

**적용 스킬**:
- `/sc4sap:ask-consultant` — 2개 이상 모듈 매칭 AND (주제가 경계를 넘거나 답변이 갈릴 때).
- `/sc4sap:create-program` Phase 1A (모듈 인터뷰) — 활성 모듈 ≥ 2.
- `/sc4sap:create-program` Phase 2 (플래닝) — 스펙이 크로스모듈 접점 선언.
- `/sc4sap:compare-programs` Step 4b — 샘플셋이 2개 이상 모듈 걸침.

**협의 스타일**: 대칭형. 각자 POSITION 제시 → 피어 CHALLENGE → REFINEMENT → CONCUR / ESCALATE.

```
     [MM]◄─────►[CO]
        \       /
         \     /
          \   /
           [FI]
```

### Type B — Coder ↔ Consultant Pair/Panel (코더 ↔ 컨설턴트 쌍/패널)

**구성**: 작업자 1명 (`sap-executor` 또는 `sap-code-reviewer`) + 1-2명의 `sap-{module}-consultant`.

**목적**: 작성 중인 코드 산출물을 모듈 best-practice에 **즉시** 검증 (사후 아님).

**적용 스킬**:
- `/sc4sap:create-program` Phase 4 (구현) — executor가 여러 모듈에 걸친 코드 작성.
- `/sc4sap:analyze-code` — reviewer가 14 차원 리뷰 중 business-alignment 차원(§ 1-2 업무 타당성, § 13 크로스모듈 사이드이펙트)에 컨설턴트 라이브 인풋.

**협의 스타일**: 작업자 중심.
- 작업자가 DRAFT (코드 스니펫 + 의도) 게시.
- 컨설턴트가 CHALLENGE (패턴 위반 지적) 또는 CONCUR.
- 작업자가 REFINEMENT (수정된 draft) → 전원 CONCUR 또는 lead로 ESCALATE까지 반복.

```
     [executor]
       ↕    ↕
    [MM]   [CO]
```

### Type C — Incident Triage Team (인시던트 트리아지 팀)

**구성**: `sap-debugger` (팀 내 리드) + `sap-bc-consultant` + 1-2명의 `sap-{module}-consultant`.

**목적**: 기술 렌즈(BC: 커널 / update-task / RFC / transport) + 업무 렌즈(모듈: 업무 흐름, TCode 목적, 커스터마이징)를 섞어서 근본 원인 분석.

**적용 스킬**:
- `/sc4sap:analyze-symptom` — 덤프 / 증상이 Z/Y 객체를 거치며 모듈 컨텍스트가 얽힐 때 (순수 커널 이슈는 제외).

**협의 스타일**: debugger 중심. debugger가 증거(덤프, 트레이스, where-used) 수집 → BC가 기술 렌즈 공유 → 모듈이 업무 렌즈 공유 → debugger가 가설 좁힘 → 두 렌즈 모두 살아남는 가설 하나 남을 때까지 반복.

```
     [debugger]
      ↕     ↕
    [BC]   [module]
```

### Type D — Interview Synthesis Team (인터뷰 합성 팀)

**구성**: `sap-analyst` + `sap-architect` + 1-2명의 `sap-{module}-consultant`.

**목적**: 인터뷰 중 업무 요건 ↔ 기술 타당성 라이브 크로스체크. 스펙 확정 전에 검증.

**적용 스킬**:
- `/sc4sap:create-program` Phase 1A ↔ 1B 브릿지 — 현재는 순차(1A 모듈 인터뷰, 1B 프로그램 구조 인터뷰). 팀화하면 컨설턴트가 "이 요건이면 ALV보다 CDS+Fiori가 맞다"를 턴 내 즉시 제기 가능.

**협의 스타일**: analyst 주도.
- analyst가 QUESTION (업무 의도) 게시.
- consultant가 ANSWER (모듈 관점의 해석) 게시.
- architect가 FEASIBILITY (기술 경로 + 비용) 게시.
- 한 스펙 차원에 대해 3자 CONCUR 시까지 반복, 다음 차원으로 이동.

```
     [analyst]
        │
        v
    [consultant]──►[architect]
        ▲                │
        └────────────────┘
```

## 4. 메시지 프로토콜

모든 팀 타입이 공유하는 최소 어휘. 팀원은 메시지 첫 줄에 타입을 선언해서 피어가 파싱할 수 있게 함.

| Type | Sender | Content |
|---|---|---|
| `POSITION` | 모든 팀원 | 현재 입장: `assumption`, `recommendation`, `confidence` (high/med/low), `rule-cites` (예: `spro-lookup.md §SD.pricing`) |
| `CHALLENGE` | 모든 팀원 | 다른 팀원의 `POSITION`을 지칭해 구체적 불일치 + 근거(출처 인용 권장) 제시 |
| `REFINEMENT` | 모든 팀원 | 받은 챌린지에 응답하며 자신의 `POSITION` 업데이트; 어느 챌린지에 대응하는지 참조 필수 |
| `CONCUR` | 모든 팀원 | 피어의 현재 `POSITION`을 수용; 조건부 동의 옵션 |
| `ESCALATE` | 모든 팀원 | 팀 내에서 합의 불가 선언; lead가 중재하거나 팀 확장해야 함 |

**라운드 상한**: 기본 **3 라운드** (POSITION → CHALLENGE → REFINEMENT/CONCUR). 3라운드 후 전원 CONCUR 안 되면 자동 ESCALATE.

**예시 교환 (Type A, ask-consultant)**:

```
Round 1 (POSITION):
  MM:  assumption=EKKO 기반 PO 흐름; recommendation=GR은 MIGO;
       confidence=high; rule-cites=configs/MM/tcodes.md §2
  FI:  assumption=3-way match 강제; recommendation=MIGO 이후 MIRO;
       confidence=high; rule-cites=configs/FI/tcodes.md §1

Round 2 (CHALLENGE):
  FI → MM: "MIGO 선행 → MIRO는 GR/IR 클리어링 필요; .sc4sap/config.json의
          industry 설정이 허용하는지?" rule-cites=industry/kr.md

Round 2.5 (REFINEMENT):
  MM: assumption 갱신 — industry 플래그 확인 선행;
      recommendation은 industry.kr_strict_gr=false 조건부

Round 3 (CONCUR):
  FI: 조건부 recommendation에 CONCUR
  MM: CONCUR

→ lead 추출: "industry.kr_strict_gr=false이면 MIGO → MIRO, 아니면 수동 GR 역전 후 MIRO-only"
```

## 5. 공유 task list 스키마

`~/.claude/tasks/<team-name>/` 아래 평평한 파일 구조 (inspectable):

```
00-charter.md             ← lead 게시: 질문, 환경, 팀원, 제약, 라운드 상한
10-<member>-position.md        ← 라운드 1: 각자 POSITION
20-<member>-challenge-<target>.md  ← 라운드 2: 챌린지 (대상 이름 포함)
30-<member>-refinement.md      ← 라운드 2.5: 갱신된 입장
40-consensus.md           ← 라운드 3: CONCUR 요약 OR ESCALATE + 잔여 이슈
99-lead-arbitration.md         ← ESCALATE 시에만 — lead의 최종 결정
```

**이점**:
- 각 파일이 원자 메시지 하나 → grep/감사 용이.
- Lead가 `40-consensus.md` 하나만 읽어도 결과 아티팩트 확보.
- 재생 가능: 이후 세션이 협의 과정을 복원할 수 있음.

## 6. Gating logic — 언제 팀을 꾸릴 것인가

팀 구성은 **비쌈** (N개 컨텍스트 윈도우 + 다중 라운드 메시징). 기본은 single-dispatch. 아래 조건일 때만 팀 escalate:

```
form_team = (member_count ≥ 2)
            AND (
                 크로스모듈 주제
              OR 첫 패스 응답 불일치
              OR 사용자 명시 요청
              OR 틀렸을 때 비용 > 협의 비용
            )
```

스킬별 구체 트리거:

| 스킬 | 트리거 |
|---|---|
| `ask-consultant` | 라우팅이 2+ 모듈 매칭 AND (질문에 크로스모듈 키워드 OR 첫 POSITION 불일치) |
| `create-program` Phase 1A | `config.json.activeModules.length ≥ 2` AND 스펙이 크로스모듈 접점 언급 |
| `create-program` Phase 2 | Phase 1A가 미해결 트레이드오프 플래그 |
| `create-program` Phase 4 | executor가 작성한 코드가 2+ 모듈의 테이블/FM 건드림 |
| `compare-programs` Step 4b | 샘플셋이 2+ 모듈 걸침 |
| `analyze-code` | reviewer가 § 1-2(업무) 소견 중 크로스모듈 건 ≥ 1 발견 |
| `analyze-symptom` | 덤프/증상이 Z/Y 객체에 기인 AND 영향 모듈 ≠ BC 단독 |
| `create-program` 1A↔1B | 스펙 차원 중 analyst/architect/consultant 입장이 첫 패스에 충돌하는 것 ≥ 1 |
| `program-to-spec` | **N/A — 해당 없음**. 단일 객체 read-only 역공학으로 크로스모듈 합성·작성 충돌·인시던트 triage 모두 없음. 향후 고려: `GetWhereUsed` 그래프가 2+ 모듈에 걸치고 사용자가 L3/L4 depth 선택 시 Type A 적용 가능 (컨설턴트가 Step 3에서 크로스모듈 관심사 주석). 현재 scope 아님. |

## 7. 플랫폼 제약 (Claude Code)

설계를 제한하는 하드 리미트:

- **팀원은 sub-agent 스폰 불가**: nested team 없음; 팀원이 `Agent()` 호출 못함. 더 깊은 추론 필요 시 lead로 ESCALATE.
- **팀원은 독립 컨텍스트 윈도우**: 대화 히스토리 공유 안 됨. 각 spawn 프롬프트에 charter 전체(질문 + 환경 + 규칙)를 포함해야 함.
- **이름 주소지정은 ephemeral**: `name=`으로는 활성 중일 때만 도달. 턴을 넘겨 재지정하려면 `Agent()` spawn 반환의 UUID 필요.
- **자동 합의 메커니즘 없음**: lead가 `40-consensus.md`를 읽고 최종 출력을 포매팅해야 함. 팀은 협의 메커니즘이지 의사결정 메커니즘이 아님.
- **한 lead당 팀 1개** (Claude Code 문서상 실험적 제약).

## 8. 단계별 롤아웃

ROI × 리스크 순으로 우선순위. 한 번에 전체 스킬에 적용 금지.

### Phase 0 — 설계 (본 문서)
- 분류, 프로토콜, 스키마, gating, 제약 정리.
- 플랫폼 제약은 `project_v067_enforcement_broken.md`에서 확인된 사실과 정합.

### Phase 1 — `ask-consultant` 프로토타입 (Type A 한정)
- 선택적 `teamMode` 경로 추가: § 6 gating 충족 시 트리거.
- 기존 isolated-parallel 경로는 fallback으로 유지.
- 계측: 토큰 비용, 라운드 수, CONCUR vs ESCALATE 비율, 지연.
- 종료 기준: 실제 크로스모듈 질문 ≥ 3건을 양 경로로 실행; 3건 중 ≥ 2건에서 팀 경로가 측정 가능한 더 나은 답.

### Phase 2 — 프로토타입 평가
- 팀 vs 레거시 비교: 정확도(수동 채점), 토큰 비용, 사용자 만족도.
- 팀 경로가 레거시 대비 < 1.5배 토큰으로 더 나은 답 → 계속.
- 그렇지 않으면: gating 조정(임계 상향) 또는 프로토콜 정제(라운드 축소).

### Phase 3 — 프로토콜 정제
- 프로토타입 학습에 따라 라운드 상한, 메시지 스키마, task 파일 레이아웃 조정.
- 본 문서 갱신.

### Phase 4 — Type A 확장
- `/sc4sap:create-program` Phase 1A / Phase 2.
- `/sc4sap:compare-programs` Step 4b.

### Phase 5 — Type B 확장 (Coder ↔ Consultant)
- `/sc4sap:create-program` Phase 4 (in-loop 검증).
- `/sc4sap:analyze-code` (§ 1-2 + § 13 차원).

### Phase 6 — Type C 확장 (Incident Triage)
- `/sc4sap:analyze-symptom`.

### Phase 7 — Type D 확장 (Interview Synthesis)
- `/sc4sap:create-program` Phase 1A ↔ 1B 브릿지.

## 9. ask-consultant 프로토타입 전 해결할 open question

Phase 4 진입 전에 답해야 할 것:

1. **Charter 크기**: `00-charter.md`가 토큰을 과하게 쓰지 않으면서 팀원이 충분한 컨텍스트(환경, 설정, 질문)를 갖도록 하려면 얼마나 상세해야 하나?
2. **라운드 상한**: 3이 충분한가, 아니면 크로스모듈 SAP 논쟁은 보통 4-5라운드 필요한가?
3. **Escalation 경로**: lead가 중재할 때 팀을 확장(컨설턴트 추가)해야 하나, 아니면 한 쪽을 선택하면 되나?
4. **레거시 fallback**: teamMode는 항상 opt-in(명시적 사용자 키워드)인가, 아니면 § 6 gating에 따라 auto-trigger인가?
5. **비용 회계**: 팀 토큰 비용을 response prefix에 노출 (`[Model: ... · Team: 3 members × 3 rounds · 52k tokens]`)?
6. **응답 포맷**: 사용자에게 원 협의 과정(감사용)을 보여주나, 최종 합의만 보여주나?

## 10. 관련 문서

- [`skill-model-architecture.md`](skill-model-architecture.md) — 스킬 / 페이즈별 모델 할당 (설계 의도)
- [`../common/model-routing-rule.md`](../common/model-routing-rule.md) — Sonnet / Opus / Haiku 라우팅 + Response Prefix + Phase Banner 규약
- [`../CHANGELOG.md`](../CHANGELOG.md) 0.6.8 — 팀 접근을 정당화하는 플랫폼 제약
- [`../skills/ask-consultant/SKILL.md`](../skills/ask-consultant/SKILL.md) — Phase 1 프로토타입 대상
- [`team-consultation-architecture.md`](team-consultation-architecture.md) — English original
