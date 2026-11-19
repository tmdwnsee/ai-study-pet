const bubble = document.getElementById('bubble');
const log = document.getElementById('log');
const petEl = document.getElementById('pet');
const form = document.getElementById('form');
const input = document.getElementById('input');
const menuButtons = [...document.querySelectorAll('#menu button')];
const sendButton = form.querySelector('button');

let open = false;
let thinking = false;
let greeted = false;

function setMood(mood) {
  petEl.className = mood;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return '좋은 아침이에요!';
  if (h < 18) return '안녕하세요!';
  return '오늘 하루 어땠어요?';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 답변의 간단한 마크다운(굵게, 코드, 목록, 줄바꿈)만 보여준다.
function render(text) {
  const lines = escapeHtml(text.trim()).split('\n');
  let html = '';
  let inList = false;
  let table = null; // 마크다운 표의 행들
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r));
    html += '<table>' + rows.map((r, i) => {
      const cells = r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    }).join('') + '</table>';
    table = null;
  };
  for (const raw of lines) {
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      if (inList) { html += '</ul>'; inList = false; }
      (table ||= []).push(raw.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'));
      continue;
    }
    flushTable();
    const line = raw
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
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

function addMessage(who, text, isError = false) {
  const div = document.createElement('div');
  div.className = `msg ${who}${isError ? ' error' : ''}`;
  if (who === 'pet') div.innerHTML = render(text);
  else div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
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
      addMessage('pet', `${greeting()} 오늘은 무엇을 도와드릴까요?\n아래 메뉴를 누르거나 하고 싶은 말을 입력해 주세요.`);
      greeted = true;
    }
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
  if (res.ok) {
    msg.body.innerHTML = render(msg.raw.trim() || res.text || '(빈 답이 왔어요)');
    setMood('happy');
    setTimeout(() => !thinking && setMood('idle'), 1000);
  } else {
    msg.div.classList.add('error');
    msg.body.innerHTML = render(res.text || '문제가 생겼어요.');
  }
  log.scrollTop = log.scrollHeight;
}

petEl.addEventListener('click', toggle);
document.getElementById('close').addEventListener('click', toggle);
document.getElementById('quit').addEventListener('click', () => window.pet.quit());
document.getElementById('reset').addEventListener('click', async () => {
  await window.pet.reset();
  log.innerHTML = '';
  greeted = false;
  addMessage('pet', '새 대화를 시작할게요. 무엇을 도와드릴까요?');
  greeted = true;
});

menuButtons.forEach((b) =>
  b.addEventListener('click', () => ask(b.dataset.prompt, b.textContent, b.dataset.kind || 'ask'))
);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = '';
  ask(text);
});
