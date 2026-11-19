const bubble = document.getElementById('bubble');
const log = document.getElementById('log');
const petEl = document.getElementById('pet');
const petWrap = document.getElementById('pet-wrap');
const badge = document.getElementById('status');
const form = document.getElementById('form');
const input = document.getElementById('input');
const menuButtons = [...document.querySelectorAll('#menu button')];
const sendButton = form.querySelector('button');

let open = false;
let thinking = false;
let greeted = false; // 이번에 켠 뒤 인사를 했는지
let alerts = []; // 펭집사가 먼저 알려 줄 것들 [{kind, text}]

function setMood(mood) {
  petEl.className = mood;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return '좋은 아침이에요! 오늘은 무엇을 도와드릴까요?';
  if (h < 18) return '안녕하세요! 무엇을 도와드릴까요?';
  return '오늘 하루 어땠어요? 남은 일을 같이 챙겨 볼까요?';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 링크: [글자](주소)와 그냥 적힌 주소를 누를 수 있는 링크로 바꾼다. (이미 escape된 글자에 적용)
function linkify(line) {
  const saved = [];
  const keep = (html) => `\u0000${saved.push(html) - 1}\u0000`;
  let out = line.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) =>
    keep(`<a href="${url}" title="${url}">${label}</a>`)
  );
  out = out.replace(/https?:\/\/[^\s<)\]]+/g, (url) => {
    const clean = url.replace(/[.,;:!?]+$/, '');
    return keep(`<a href="${clean}" title="${clean}">${clean}</a>`) + url.slice(clean.length);
  });
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i) => saved[Number(i)]);
}

// 답변의 간단한 마크다운(굵게, 코드, 링크, 목록, 표, 줄바꿈)만 보여준다.
function render(text) {
  const lines = escapeHtml(text.trim()).split('\n');
  let html = '';
  let inList = false;
  let table = null; // 마크다운 표의 행들
  const inline = (s) => linkify(s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>'));
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r));
    html += '<table>' + rows.map((r, i) => {
      const cells = r.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const tag = i === 0 ? 'th' : 'td';
      return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    }).join('') + '</table>';
    table = null;
  };
  for (const raw of lines) {
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      if (inList) { html += '</ul>'; inList = false; }
      (table ||= []).push(raw.trim());
      continue;
    }
    flushTable();
    const line = inline(raw);
    const item = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (item) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${item[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    html += line.trim() ? `${line}<br>` : '<br>';
  }
  flushTable();
  if (inList) html += '</ul>';
  return html.replace(/(<br>)+$/, '');
}

// ── 대화 기록: 펭집사를 껐다 켜도 남도록 저장한다 (최근 60개) ─────────────
const HISTORY_KEY = 'pet-history';
const HISTORY_MAX = 60;
let history = [];

function loadHistory() {
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    history = [];
  }
}

function saveHistory() {
  history = history.slice(-HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* 저장 공간 문제는 무시하고 화면만 보여준다 */
  }
}

function drawMessage(who, text, isError = false) {
  const div = document.createElement('div');
  div.className = `msg ${who}${isError ? ' error' : ''}`;
  if (who === 'pet') div.innerHTML = render(text);
  else if (who === 'divider') div.textContent = text;
  else div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function addMessage(who, text, isError = false) {
  history.push({ who, text, error: isError || undefined });
  saveHistory();
  return drawMessage(who, text, isError);
}

function restoreHistory() {
  loadHistory();
  if (!history.length) return;
  for (const m of history) drawMessage(m.who, m.text, m.error);
  drawMessage('divider', '여기까지 지난 대화예요');
}

// ── 먼저 말 걸기: 마감, 복습, 새 트렌드 알림 ────────────────────────────
function showAlerts(items) {
  alerts = items || [];
  badge.textContent = alerts.length ? String(alerts.length) : '';
  badge.classList.toggle('on', alerts.length > 0);
  petWrap.classList.toggle('has-alert', alerts.length > 0);
}

window.pet.onAlerts((items) => showAlerts(items));

function tellAlerts() {
  if (!alerts.length) return;
  const lines = alerts.map((a) => `- ${a.text}`).join('\n');
  addMessage('pet', `먼저 챙겨 드릴게요.\n${lines}`);
  window.pet.alertsSeen();
  showAlerts([]);
}

function setBusy(busy) {
  thinking = busy;
  menuButtons.forEach((b) => (b.disabled = busy));
  sendButton.disabled = busy;
  setMood(busy ? 'thinking' : 'idle');
}

async function toggle() {
  open = !open;
  await window.pet.setOpen(open);
  bubble.hidden = !open;
  if (open) {
    if (!greeted) {
      addMessage('pet', `${greeting()}\n아래 메뉴를 누르거나 하고 싶은 말을 입력해 주세요.`);
      greeted = true;
    }
    tellAlerts();
    if (!thinking) {
      setMood('happy');
      setTimeout(() => !thinking && setMood('idle'), 1000);
    }
    input.focus();
  }
}

// 답을 기다리는 동안 채워 나가는 말풍선: 위에는 진행 상황, 아래에는 생기는 대로 받은 답
let current = null;

function startPetMessage() {
  const div = document.createElement('div');
  div.className = 'msg pet';
  div.innerHTML = '<div class="status">생각하는 중…</div><div class="body"></div>';
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return { div, status: div.querySelector('.status'), body: div.querySelector('.body'), raw: '' };
}

window.pet.onProgress((event) => {
  if (!current) return;
  if (event.type === 'status') {
    current.status.textContent = event.text;
  } else if (event.type === 'delta') {
    current.raw += event.text;
    current.body.innerHTML = render(current.raw);
  }
  log.scrollTop = log.scrollHeight;
});

async function ask(text, label = text, kind = 'ask') {
  if (thinking || !text.trim()) return;
  addMessage('me', label);
  setBusy(true);
  current = startPetMessage();
  const res = kind === 'trends' ? await window.pet.trends() : await window.pet.ask(text);
  const msg = current;
  current = null;
  setBusy(false);
  msg.status.remove();
  const answer = res.ok ? msg.raw.trim() || res.text || '(빈 답이 왔어요)' : res.text || '문제가 생겼어요.';
  msg.body.innerHTML = render(answer);
  if (res.ok) {
    setMood('happy');
    setTimeout(() => !thinking && setMood('idle'), 1000);
  } else {
    msg.div.classList.add('error');
  }
  history.push({ who: 'pet', text: answer, error: !res.ok || undefined });
  saveHistory();
  log.scrollTop = log.scrollHeight;
}

// 말풍선 안의 링크는 기본 브라우저로 연다.
log.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  window.pet.openLink(a.getAttribute('href'));
});

petEl.addEventListener('click', toggle);
document.getElementById('close').addEventListener('click', toggle);
document.getElementById('quit').addEventListener('click', () => window.pet.quit());
document.getElementById('reset').addEventListener('click', async () => {
  await window.pet.reset();
  log.innerHTML = '';
  history = [];
  saveHistory();
  addMessage('pet', '새 대화를 시작할게요. 무엇을 도와드릴까요?');
  greeted = true;
});

menuButtons.forEach((b) =>
  b.addEventListener('click', () => ask(b.dataset.prompt, b.textContent, b.dataset.kind || 'ask'))
);

// 입력창: 줄 수에 맞춰 높이를 늘린다 (최대 높이는 style.css)
function fitInput() {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

function submitInput() {
  const text = input.value;
  if (!text.trim() || thinking) return;
  input.value = '';
  fitInput();
  ask(text);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  submitInput();
});

// Enter: 보내기 / Shift+Enter: 줄바꿈. 한글 조합 중의 Enter는 보내지 않는다.
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    submitInput();
  }
});
input.addEventListener('input', fitInput);

restoreHistory();
