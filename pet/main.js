// 바탕화면 펫(펭집사): 투명하고 항상 위에 떠 있는 창. 질문은 내 컴퓨터의 Claude Code(`claude -p`)에 넘긴다.
// API 키 없이, Claude 구독 계정으로 로그인된 Claude Code를 쓴다. (호출 방식은 claude.js)

const { app, BrowserWindow, ipcMain, screen, shell, Notification } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { askClaude, PROJECT_ROOT } = require('./claude');

const SELFTEST = process.env.PET_SELFTEST;
// 자체 테스트는 따로 떨어진 곳에 기록해, 실제 대화 기록과 위치를 건드리지 않는다.
if (SELFTEST) app.setPath('userData', path.join(os.tmpdir(), 'ai-pet-selftest'));

const CLOSED = { width: 170, height: 190 };
const OPEN = { width: 380, height: 620 };
const MARGIN = 24;

const DATA = path.join(PROJECT_ROOT, 'data');
const TRENDS_READY = path.join(DATA, 'trends-ready.json'); // 미리 준비해 둔 최신 트렌드
const PET_STATE = SELFTEST ? path.join(app.getPath('userData'), 'pet-state.json') : path.join(DATA, 'pet-state.json');

const TREND_REQUEST = '5번 최신 트렌드 메뉴: trend-catchup Skill로 다음 트렌드를 알려줘.';
const ALERT_INTERVAL = 3 * 60 * 60 * 1000; // 마감·복습 확인 주기: 3시간

let win;
let isOpen = false;
let busy = false;
let pendingContext = null; // 미리 준비한 트렌드를 보여준 뒤, 다음 질문에 함께 넘길 내용
let prefetching = null; // 트렌드를 미리 준비하는 중이면 그 Promise
let alerts = []; // 지금 알려 줄 것들 [{key, kind, text}]

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (현지 시간)

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

// 펫 상태(위치, 대화 세션, 알림 본 기록 등)는 data/pet-state.json 하나에 모은다.
const state = readJson(PET_STATE) || {};
function saveState(patch) {
  Object.assign(state, patch);
  writeJson(PET_STATE, state);
}

// 대화 세션: 같은 날이면 이어 가고, 날이 바뀌면 새로 시작한다(대화가 너무 길어져 느려지지 않게).
let sessionId = state.sessionDate === today() ? state.sessionId || null : null;

// ── 창 위치: 오른쪽 아래 모서리를 기준점으로 기억한다 ─────────────────────
// 말풍선을 열면 창이 위·왼쪽으로 커지므로, 모서리를 고정해 두면 펭집사가 제자리에 있다.
function anchor() {
  if (state.anchor) return state.anchor;
  const { workArea } = screen.getPrimaryDisplay();
  return { right: workArea.x + workArea.width - MARGIN, bottom: workArea.y + workArea.height - MARGIN };
}

function place(size) {
  const a = anchor();
  const { workArea: wa } = screen.getDisplayNearestPoint({ x: Math.round(a.right) - 1, y: Math.round(a.bottom) - 1 });
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  win.setBounds({
    x: Math.round(clamp(a.right - size.width, wa.x, wa.x + wa.width - size.width)),
    y: Math.round(clamp(a.bottom - size.height, wa.y, wa.y + wa.height - size.height)),
    width: size.width,
    height: size.height,
  });
}

let moveTimer = null;
function rememberPosition() {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    const b = win.getBounds();
    saveState({ anchor: { right: b.x + b.width, bottom: b.y + b.height } });
  }, 300);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    ...CLOSED,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    acceptFirstMouse: true, // 다른 창을 쓰다가도 첫 클릭에 바로 반응
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  place(CLOSED);
  win.loadFile('index.html');
  win.on('moved', rememberPosition); // 사용자가 끌어서 옮긴 뒤

  // 펫 창 안에서 다른 페이지로 넘어가지 않게 하고, 링크는 기본 브라우저로 연다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openLink(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // 화면 쪽 로그와 오류를 터미널에 보여준다.
  win.webContents.on('console-message', (e) => console.log(`[화면] ${e.message}`));
  win.webContents.on('preload-error', (_e, p, err) => console.log(`[preload 오류] ${err}`));
  win.webContents.on('did-finish-load', () => send('alerts', alerts));

  if (SELFTEST) {
    require('./selftest')({ win, app, fs, path, prefetchTrends, checkAlerts, TRENDS_READY });
  } else {
    maybePrefetchTrends();
    setTimeout(checkAlerts, 5000);
    setInterval(checkAlerts, ALERT_INTERVAL);
  }
}

function openLink(url) {
  if (!/^https?:\/\//i.test(url || '')) return;
  if (SELFTEST) return console.log('[자체 테스트] 링크 열기 요청(테스트라 열지 않음):', url);
  shell.openExternal(url);
}

// ── 최신 트렌드 미리 준비 ─────────────────────────────────────────
// 하루에 한 번, 펫을 켤 때 뒤에서 다음 트렌드를 준비해 둔다. 버튼을 누르면 바로 보여준다.
function maybePrefetchTrends() {
  if (fs.existsSync(TRENDS_READY)) return; // 아직 안 본 준비분이 있다
  if (state.lastPrefetch === today()) return; // 오늘은 이미 준비했다
  prefetchTrends();
}

function prefetchTrends() {
  if (prefetching) return prefetching;
  console.log('[트렌드] 미리 준비 시작');
  prefetching = askClaude({ text: TREND_REQUEST }).then((res) => {
    console.log(`[트렌드] 미리 준비 ${res.ok ? '완료' : '실패'} (${Math.round((res.ms || 0) / 1000)}초)`);
    saveState({ lastPrefetch: today() });
    if (res.ok && res.text) {
      writeJson(TRENDS_READY, { preparedAt: new Date().toISOString(), text: res.text });
      refreshAlerts(); // 새 트렌드 준비 알림
    }
    prefetching = null;
    return res;
  });
  return prefetching;
}

ipcMain.handle('trends', async () => {
  if (prefetching) {
    send('progress', { type: 'status', text: '준비하던 트렌드를 마무리하는 중…' });
    await prefetching;
  }
  const ready = readJson(TRENDS_READY);
  if (ready?.text) {
    fs.rmSync(TRENDS_READY, { force: true });
    pendingContext = ready.text;
    refreshAlerts();
    return { ok: true, text: ready.text, prepared: true };
  }
  return ask(TREND_REQUEST); // 준비분이 없으면 지금 바로 찾는다
});

// ── 먼저 말 걸기: 마감 임박, 복습할 개념, 새 트렌드 ─────────────────────────
// Notion 확인은 Claude Code에 맡기되, 날짜 계산과 문구는 여기서 직접 한다(답이 흔들리지 않게).
const ALERT_REQUEST = [
  '알림 확인용 요청이다. Skill은 쓰지 않는다.',
  'Notion 할 일 view와 개념 사전 view를 query-data-sources view 모드로 한 번에 병렬 조회하고,',
  '다른 말 없이 JSON 한 줄만 출력해. 날짜는 YYYY-MM-DD, 없으면 null.',
  '{"todos":[{"title":"","status":"","due":null}],"concepts":[{"name":"","next_review":null}]}',
].join('\n');

let notionAlerts = []; // 마지막 Notion 확인 결과
let checking = false;

function daysUntil(date) {
  const ms = new Date(`${date}T00:00:00`) - new Date(`${today()}T00:00:00`);
  return Math.round(ms / 86400000);
}

function buildNotionAlerts(data) {
  const items = [];
  for (const t of data.todos || []) {
    if (!t?.due || t.status === '완료') continue;
    const d = daysUntil(t.due);
    if (d < 0) items.push({ kind: 'deadline', urgent: true, text: `「${t.title}」 마감이 ${-d}일 지났어요` });
    else if (d === 0) items.push({ kind: 'deadline', urgent: true, text: `오늘 마감: 「${t.title}」` });
    else if (d <= 3) items.push({ kind: 'deadline', text: `${d}일 뒤 마감: 「${t.title}」` });
  }
  const due = (data.concepts || []).filter((c) => c?.next_review && daysUntil(c.next_review) <= 0).map((c) => c.name);
  if (due.length) items.push({ kind: 'review', text: `복습할 개념: ${due.join(', ')}` });
  return items.map((a) => ({ ...a, key: `${today()}|${a.text}` }));
}

function refreshAlerts() {
  const items = [...notionAlerts];
  if (fs.existsSync(TRENDS_READY)) {
    items.push({ kind: 'trend', key: `trend|${readJson(TRENDS_READY)?.preparedAt}`, text: "새 트렌드가 준비됐어요. '최신 트렌드'를 눌러 보세요" });
  }
  const seen = new Set(state.alertsSeen || []);
  alerts = items.filter((a) => !seen.has(a.key));
  send('alerts', alerts);
  return alerts;
}

async function checkAlerts() {
  if (checking) return refreshAlerts();
  checking = true;
  try {
    const res = await askClaude({ text: ALERT_REQUEST });
    const json = res.ok ? res.text.slice(res.text.indexOf('{'), res.text.lastIndexOf('}') + 1) : '';
    try {
      notionAlerts = buildNotionAlerts(JSON.parse(json));
    } catch {
      console.log('[알림] Notion 확인 결과를 읽지 못했어요:', (res.text || '').slice(0, 120));
    }
    const current = refreshAlerts();
    console.log(`[알림] 확인 완료 ${Math.round((res.ms || 0) / 1000)}초, 알림 ${current.length}개`);
    notifyUrgent(current);
    return current;
  } finally {
    checking = false;
  }
}

// 마감이 오늘이거나 지난 일은 하루 한 번 macOS 알림으로도 알려 준다(말풍선이 닫혀 있을 때).
function notifyUrgent(items) {
  const urgent = items.filter((a) => a.urgent);
  if (!urgent.length || isOpen || state.notifiedDate === today() || !Notification.isSupported()) return;
  if (SELFTEST) return console.log('[자체 테스트] macOS 알림 요청(테스트라 띄우지 않음):', urgent.map((a) => a.text).join(' / '));
  new Notification({ title: '펭집사', body: urgent.map((a) => a.text).join('\n') }).show();
  saveState({ notifiedDate: today() });
}

ipcMain.handle('alerts-seen', () => {
  const keys = new Set([...(state.alertsSeen || []).filter((k) => k.startsWith(today()) || k.startsWith('trend|')), ...alerts.map((a) => a.key)]);
  saveState({ alertsSeen: [...keys].slice(-100) });
  alerts = [];
  return true;
});

// ── 일반 질문 ─────────────────────────────────────────────────────
async function ask(text) {
  if (busy) return { ok: false, text: '아직 앞의 질문을 생각하고 있어요. 조금만 기다려 주세요.' };
  busy = true;
  try {
    let prompt = text;
    if (pendingContext) {
      prompt = `(참고: 바로 전에 펫이 미리 준비해 둔 최신 트렌드를 보여줬다. 내용은 아래와 같다.)\n${pendingContext}\n\n사용자: ${text}`;
      pendingContext = null;
    }
    const res = await askClaude({ text: prompt, sessionId, onEvent: (event) => send('progress', event) });
    if (res.sessionId && res.sessionId !== sessionId) {
      sessionId = res.sessionId;
      saveState({ sessionId, sessionDate: today() });
    }
    console.log(`[질문] ${res.ok ? '완료' : '실패'} ${Math.round((res.ms || 0) / 1000)}초`);
    return res;
  } finally {
    busy = false;
  }
}

ipcMain.handle('ask', (_e, text) => ask(text));
ipcMain.handle('open-link', (_e, url) => openLink(url));
ipcMain.handle('set-open', (_e, open) => {
  isOpen = open;
  place(open ? OPEN : CLOSED);
});
ipcMain.handle('reset', () => {
  sessionId = null;
  pendingContext = null;
  saveState({ sessionId: null, sessionDate: null });
  return true;
});
ipcMain.handle('quit', () => app.quit());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
