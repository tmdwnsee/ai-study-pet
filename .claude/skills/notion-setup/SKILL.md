---
name: notion-setup
description: 비서가 쓰는 Notion 데이터베이스 5개(할 일, 학습 로그, 개념 사전, 트렌드 노트, 지원 현황)를 처음 한 번 만들 때 사용. data/notion.json이 없거나 사용자가 Notion 설정을 요청할 때.
---

# Notion 초기 설정

## 시작 전 확인
1. `data/notion.json`이 이미 있으면 만들지 않는다. "이미 준비돼 있어요"라고 알리고 끝낸다.
2. Notion 커넥터 도구를 쓸 수 없으면, README의 'Notion 연결하기'를 안내하고 끝낸다.
3. 데이터베이스를 넣을 페이지를 정한다. 사용자에게 페이지 이름이나 링크를 묻고, 없으면 워크스페이스에 "AI 개인 비서" 페이지를 새로 만들지 묻는다.
4. 만들기 전에 "이 페이지 아래에 데이터베이스 5개를 만들까요?"라고 확인받는다.

## 만들 데이터베이스
Notion 커넥터의 데이터베이스 만들기 도구로 하나씩 만든다. 제목 속성은 표의 첫 항목이다.

| 키 | 이름 | 속성 (이름: 형식) |
| --- | --- | --- |
| todo | 할 일 | 제목: title · 카테고리: select(학습, 개발, 취업) · 상태: select(할 일, 진행 중, 완료) · 마감일: date · 우선순위: select(높음, 보통, 낮음) |
| log | 학습 로그 | 제목: title(예: 2026-11-17 학습 로그) · 날짜: date · 배운 개념: text · 개발 진행: text · 지원 활동: text · 회고: text · 공부 시간(시간): number |
| concepts | 개념 사전 | 개념명: title · 단계: number · 분야: select · 이해도: number(1~5) · 다음 복습일: date · 참고 링크: url |
| trends | 트렌드 노트 | 제목: title · 발표일: date · 분야: select · 요약: text · 왜 중요한가: text · 출처: url |
| jobs | 지원 현황 | 회사: title · 직무: text · 지원일: date · 진행 단계: select(준비, 지원, 서류, 면접, 결과) · 공고 링크: url · 지원 경로: select · 메모: text |

## 저장
만든 데이터베이스의 링크(URL)와, 도구가 돌려준 ID를 `data/notion.json`에 저장한다.

```json
{
  "parent_page": "https://www.notion.so/...",
  "todo": {"url": "https://www.notion.so/...", "id": "..."},
  "log": {"url": "...", "id": "..."},
  "concepts": {"url": "...", "id": "..."},
  "trends": {"url": "...", "id": "..."},
  "jobs": {"url": "...", "id": "..."}
}
```

하나라도 실패하면 만든 것과 실패한 것을 그대로 알리고, 실패한 것만 다시 만들지 묻는다.
끝나면 "1단계 개념 노트 5개를 개념 사전에 넣어 둘까요?"라고 묻고, 동의하면 `docs/concepts/stage1.md`의 다섯 개념을 단계 1, 이해도 비움으로 추가한다.
