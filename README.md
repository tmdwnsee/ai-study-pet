# AI 개인 비서

MCP와 Agent Skill로 만드는 개인 비서. AI 학습, 최신 트렌드, 프로젝트, 취업 지원을 한곳에서 돕는다.
**별도 API 비용 없이**, 이미 쓰고 있는 Claude 앱의 Code 탭에서 이 폴더를 열어 실행한다.

## 쓰는 법

1. Claude 앱 → Code 탭에서 이 폴더(`AI-개인-비서`)로 새 세션을 연다.
2. `/hi`를 입력하면 비서가 인사하고 메뉴를 보여준다.
3. 번호를 입력하거나 그냥 말을 건다. 예: "카카오에 AI 엔지니어로 지원했어"

```
   ∧＿∧
  ( ´ ▽ ` )  안녕하세요! 오늘은 무엇을 도와드릴까요?
  /    つ

1. 할 일
2. 개념 공부  (2단계에서 완성돼요)
3. 퀴즈  (3단계에서 완성돼요)
4. 프로젝트  (4단계에서 완성돼요)
5. 최신 트렌드
6. 취업 지원 회사 목록
w. 하루 정리
```

## 바탕화면 펫

바탕화면 오른쪽 아래에 항상 떠 있는 펫 비서. 클릭하면 인사하고 메뉴와 입력창이 나온다.

- 켜기: `펫 켜기.command`를 더블클릭 (처음 한 번은 macOS가 열지 물을 수 있음)
- 끄기: 말풍선 오른쪽 위의 **끄기**
- 옮기기: 펫 아래 `· · ·`이나 말풍선 윗줄을 끌기
- 질문은 내 컴퓨터의 Claude Code(`claude -p`)가 이 폴더에서 처리한다. API 키 없이 Claude 구독 계정으로 동작하며, 구독 사용량 한도를 함께 쓴다.
- 처음 한 번 필요한 것: `npm install -g @anthropic-ai/claude-code`, `claude auth login`, `pet` 폴더에서 `npm install`
- 펫이 쓸 수 있는 도구는 `.claude/settings.json`에 정해 둔 것뿐이다 (Notion 삭제 도구는 빠져 있음).

## 구조

```
AI-개인-비서/
├── CLAUDE.md              # 비서의 성격, 사용자 정보, 메뉴 규칙 (Claude가 자동으로 읽음)
├── .claude/skills/        # 메뉴별 절차 (Agent Skill)
│   ├── hi/                # 인사와 메뉴
│   ├── today/             # 1. 할 일
│   ├── trend-catchup/     # 5. 최신 트렌드 (1년 전부터 시간순)
│   ├── job-tracker/       # 6. 취업 지원 회사 목록, 지원 기록 자동 메모, 이력서 다듬기
│   ├── wrapup/            # w. 하루 정리
│   └── notion-setup/      # Notion 데이터베이스 5개 처음 만들기
├── pet/                   # 바탕화면 펫 (Electron): main.js, index.html, renderer.js, style.css
├── 펫 켜기.command         # 더블클릭으로 펫 켜기
├── docs/concepts/         # 단계별 개념 노트
└── data/                  # progress.json(현재 단계), notion.json(DB 링크), trends.json(트렌드 진도)
```

## Notion 연결하기

1. Claude 앱의 **설정 → 커넥터**에서 **Notion**을 연결하고 Notion 계정으로 로그인한다. (무료, 토큰 필요 없음)
2. 이 폴더로 세션을 열고 "노션 설정해줘"라고 말하면, 비서가 데이터베이스 5개(할 일, 학습 로그, 개념 사전, 트렌드 노트, 지원 현황)를 만든다.

## 단계

기한은 없다. 한 단계의 개념을 익히고 '동작 확인'이 되면 다음 단계로 넘어간다.

| 단계 | 익힐 개념 | 만들 것 | 동작 확인 |
| --- | --- | --- | --- |
| 1 | 토큰, 컨텍스트 윈도우, 트랜스포머, 샘플링, 프롬프트 | CLAUDE.md, Skill 6개, Notion 커넥터 연결, 바탕화면 펫(완료) | 펫이나 `/hi` 메뉴에서 할 일 조회와 지원 기록 저장이 된다 |
| 2 | LLM API 구조, MCP와 Skill 구조, 에이전트 루프 | 펫 알림(마감 임박, 새 트렌드), `explain-concept` | 마감이 가까우면 펫이 먼저 말을 건다 |
| 3 | 임베딩, 벡터 DB, 청킹, RAG | `study-engine` MCP 서버(Python FastMCP, SQLite, 무료 로컬 임베딩), `review-quiz` | 퀴즈 결과로 다음 복습일이 계산된다 |
| 4 | 에이전트 패턴, Eval, LLM-as-judge | Skill 품질 Eval(서브에이전트 채점), 면접 모드, `project-coach` | Skill 수정 전후 점수가 나온다 |
| 5 | 비용과 지연, 캐싱, 모니터링, 파인튜닝 선택 기준 | 테스트, GitHub Actions CI | CI가 통과한다 |
| 6 | 시스템 디자인 면접 | README, 구조도, 데모 영상, 블로그 글 | 저장소를 이력서에 링크할 수 있다 |
