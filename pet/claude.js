// 펫이 내 컴퓨터의 Claude Code(`claude -p`)에 질문을 넘기는 부분.
// - 가볍게 실행: 펫에서는 ECC 플러그인을 끄고 Sonnet 5.5를 쓰며, Notion 위치를 미리 알려 준다.
// - 실시간 표시: stream-json으로 받아 진행 상황(도구 사용)과 답 글자를 생기는 대로 넘긴다.

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..'); // AI-개인-비서 폴더: CLAUDE.md와 Skill이 있는 곳
const MODEL = 'claude-sonnet-5-5';
// 펫에서만 끄는 플러그인. Code 탭에서는 그대로 쓴다.
const PET_SETTINGS = JSON.stringify({ enabledPlugins: { 'ecc@ecc': false } });

// Notion 데이터베이스 구조. 매번 조회하지 않도록 미리 알려 준다 (notion-setup Skill이 만든 그대로).
const SCHEMAS = {
  todo: '할 일 (제목 title, 카테고리 select[학습/개발/취업], 상태 select[할 일/진행 중/완료], 마감일 date, 우선순위 select[높음/보통/낮음])',
  log: '학습 로그 (제목 title, 날짜 date, 배운 개념 text, 개발 진행 text, 지원 활동 text, 회고 text, 공부 시간(시간) number)',
  concepts: '개념 사전 (개념명 title, 단계 number, 분야 select, 이해도 number, 다음 복습일 date, 참고 링크 url)',
  trends: '트렌드 노트 (제목 title, 발표일 date, 분야 select[모델/에이전트/도구·프로토콜/연구/기타], 요약 text, 왜 중요한가 text, 출처 url)',
  jobs: '지원 현황 (회사 title, 직무 text, 지원일 date, 진행 단계 select[준비/지원/서류/면접/결과], 공고 링크 url, 지원 경로 select[회사 홈페이지/채용 플랫폼/추천/기타], 메모 text)',
};

function petPrompt() {
  const lines = [
    '지금 너는 바탕화면 펫의 말풍선 안에서 답한다. 말풍선은 좁으니 짧게 답하고, 제목(#)은 쓰지 않는다.',
    '빠르게 답하기 위한 규칙:',
    '- 아래 Notion 정보를 그대로 쓴다. data/notion.json을 읽거나 Notion 데이터베이스 구조를 fetch하지 않는다.',
    '- Notion 조회는 query-data-sources의 view 모드({"mode":"view","view_url":"view://..."})만 쓴다. rows와 SQL 모드는 무료 요금제에서 시간당 한도가 있어 쓰지 않는다. view는 전체 행을 주므로 필요한 것은 결과를 보고 직접 거른다.',
    '- 여러 곳을 볼 때는 한 번에 병렬로 호출한다. 한도 오류가 나면 다시 시도하지 말고 바로 알린다.',
    '- 페이지를 만들 때는 아래 collection의 data_source_id를 부모로 쓴다.',
    '- 답할 내용이 정해지면 먼저 답을 쓰고, Notion 저장이나 파일 갱신처럼 사용자가 기다릴 필요 없는 일은 그 뒤에 한다.',
  ];
  try {
    const ids = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'data/notion.json'), 'utf8'));
    for (const [key, desc] of Object.entries(SCHEMAS)) {
      if (ids[key]?.data_source) lines.push(`- ${desc}: 조회 ${ids[key].view || '(view 없음)'} / 쓰기 ${ids[key].data_source}`);
    }
  } catch {
    lines.push('- data/notion.json이 없다. Notion을 써야 하면 notion-setup Skill을 먼저 제안한다.');
  }
  return lines.join('\n');
}

function findClaude() {
  const candidates = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', path.join(process.env.HOME || '', '.local/bin/claude')];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  try {
    return execFileSync('/bin/zsh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

// 도구 이름 → 말풍선에 보여줄 진행 상황
function statusFor(tool) {
  if (tool === 'Skill') return '메뉴 절차를 확인하는 중…';
  if (tool === 'ToolSearch') return '필요한 도구를 꺼내는 중…';
  if (/notion-(query|search|fetch)/.test(tool)) return 'Notion에서 기록을 확인하는 중…';
  if (/notion-(create|update)/.test(tool)) return 'Notion에 기록하는 중…';
  if (tool === 'WebSearch') return '웹에서 검색하는 중…';
  if (tool === 'WebFetch') return '출처 페이지를 읽는 중…';
  if (tool === 'Agent' || tool === 'Task') return '자료를 꼼꼼히 확인하는 중…';
  if (tool === 'Read' || tool === 'Glob' || tool === 'Grep') return '파일을 확인하는 중…';
  if (tool === 'Write' || tool === 'Edit') return '진도를 저장하는 중…';
  return '작업하는 중…';
}

function explain(message) {
  if (/not logged in|log ?in|auth/i.test(message)) return '로그인이 필요해요. 터미널에서 `claude auth login`을 실행해 주세요.';
  return `문제가 생겼어요: ${message.slice(0, 200)}`;
}

/**
 * Claude Code에 질문 하나를 보낸다.
 * onEvent({type:'status', text}) / onEvent({type:'delta', text})로 진행 상황과 답 글자를 넘긴다.
 * 결과: { ok, text, sessionId, ms }
 */
function askClaude({ text, sessionId = null, onEvent = () => {} }) {
  const claude = findClaude();
  if (!claude) {
    return Promise.resolve({ ok: false, text: 'Claude Code를 찾지 못했어요. 터미널에서 `npm install -g @anthropic-ai/claude-code`로 설치해 주세요.' });
  }
  const args = [
    '-p', text,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', MODEL,
    '--settings', PET_SETTINGS,
    '--append-system-prompt', petPrompt(),
  ];
  if (sessionId) args.push('--resume', sessionId);

  const started = Date.now();
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` };
    const child = spawn(claude, args, { cwd: PROJECT_ROOT, env });
    let buffer = '';
    let stderr = '';
    let streamed = ''; // 생기는 대로 받은 답 글자 (여러 단계의 글을 모두 이어 붙임)
    let newSession = sessionId;
    let result = null;

    const handle = (msg) => {
      if (msg.session_id) newSession = msg.session_id;
      if (msg.type === 'stream_event') {
        const ev = msg.event || {};
        if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          onEvent({ type: 'status', text: statusFor(ev.content_block.name || '') });
        } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'text' && streamed && !streamed.endsWith('\n')) {
          streamed += '\n\n';
          onEvent({ type: 'delta', text: '\n\n' });
        } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          streamed += ev.delta.text;
          onEvent({ type: 'delta', text: ev.delta.text });
        }
      } else if (msg.type === 'result') {
        result = msg;
      }
    };

    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        try {
          handle(JSON.parse(line));
        } catch {
          /* 한 줄이 JSON이 아니면 건너뛴다 */
        }
      }
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => resolve({ ok: false, text: explain(String(err.message || err)), ms: Date.now() - started }));
    child.on('close', (code) => {
      const ms = Date.now() - started;
      if (!result) return resolve({ ok: false, text: explain(stderr || `claude exited with code ${code}`), sessionId: newSession, ms });
      if (result.is_error) return resolve({ ok: false, text: explain(result.result || stderr || '알 수 없는 오류'), sessionId: newSession, ms });
      resolve({ ok: true, text: streamed.trim() || result.result || '', sessionId: newSession, ms });
    });
  });
}

module.exports = { askClaude, PROJECT_ROOT, MODEL };
