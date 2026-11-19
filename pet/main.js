// 바탕화면 펫: 투명하고 항상 위에 떠 있는 창. 질문은 내 컴퓨터의 Claude Code(`claude -p`)에 넘긴다.
// API 키 없이, Claude 구독 계정으로 로그인된 Claude Code를 쓴다. (호출 방식은 claude.js)

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { askClaude, PROJECT_ROOT } = require('./claude');

const CLOSED = { width: 170, height: 190 };
const OPEN = { width: 380, height: 620 };
const MARGIN = 24;

const DATA = path.join(PROJECT_ROOT, 'data');
const TRENDS_READY = path.join(DATA, 'trends-ready.json'); // 미리 준비해 둔 최신 트렌드
const PET_STATE = path.join(DATA, 'pet-state.json'); // 마지막으로 미리 준비한 날짜

const TREND_REQUEST = '5번 최신 트렌드 메뉴: trend-catchup Skill로 다음 트렌드를 알려줘.';

let win;
let sessionId = null; // 대화를 이어가기 위한 Claude Code 세션 ID
let busy = false;
let pendingContext = null; // 미리 준비한 트렌드를 보여준 뒤, 다음 질문에 함께 넘길 내용
let prefetching = null; // 트렌드를 미리 준비하는 중이면 그 Promise

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

function place(size) {
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({
    x: workArea.x + workArea.width - size.width - MARGIN,
    y: workArea.y + workArea.height - size.height - MARGIN,
    width: size.width,
    height: size.height,
  });
}

function send(event) {
  if (win && !win.isDestroyed()) win.webContents.send('progress', event);
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

  // 화면 쪽 로그와 오류를 터미널에 보여준다.
  win.webContents.on('console-message', (e) => console.log(`[화면] ${e.message}`));
  win.webContents.on('preload-error', (_e, p, err) => console.log(`[preload 오류] ${err}`));

  if (process.env.PET_SELFTEST) selfTest();
  else maybePrefetchTrends();
}

// ── 최신 트렌드 미리 준비 ─────────────────────────────────────────
// 하루에 한 번, 펫을 켤 때 뒤에서 다음 트렌드를 준비해 둔다. 버튼을 누르면 바로 보여준다.
function maybePrefetchTrends() {
  if (fs.existsSync(TRENDS_READY)) return; // 아직 안 본 준비분이 있다
  if (readJson(PET_STATE)?.lastPrefetch === today()) return; // 오늘은 이미 준비했다
  prefetchTrends();
}

function prefetchTrends() {
  if (prefetching) return prefetching;
  console.log('[트렌드] 미리 준비 시작');
  prefetching = askClaude({ text: TREND_REQUEST }).then((res) => {
    console.log(`[트렌드] 미리 준비 ${res.ok ? '완료' : '실패'} (${Math.round((res.ms || 0) / 1000)}초)`);
    writeJson(PET_STATE, { ...(readJson(PET_STATE) || {}), lastPrefetch: today() });
    if (res.ok && res.text) writeJson(TRENDS_READY, { preparedAt: new Date().toISOString(), text: res.text });
    prefetching = null;
    return res;
  });
  return prefetching;
}

ipcMain.handle('trends', async () => {
  if (prefetching) {
    send({ type: 'status', text: '준비하던 트렌드를 마무리하는 중…' });
    await prefetching;
  }
  const ready = readJson(TRENDS_READY);
  if (ready?.text) {
    fs.rmSync(TRENDS_READY, { force: true });
    pendingContext = ready.text;
    return { ok: true, text: ready.text, prepared: true };
  }
  return ask(TREND_REQUEST); // 준비분이 없으면 지금 바로 찾는다
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
    const res = await askClaude({ text: prompt, sessionId, onEvent: send });
    if (res.sessionId) sessionId = res.sessionId;
    console.log(`[질문] ${res.ok ? '완료' : '실패'} ${Math.round((res.ms || 0) / 1000)}초`);
    return res;
  } finally {
    busy = false;
  }
}

ipcMain.handle('ask', (_e, text) => ask(text));
ipcMain.handle('set-open', (_e, open) => place(open ? OPEN : CLOSED));
ipcMain.handle('reset', () => {
  sessionId = null;
  pendingContext = null;
  return true;
});
ipcMain.handle('quit', () => app.quit());

// ── 자체 테스트 ───────────────────────────────────────────────────
// PET_SELFTEST=1 npm start      펫을 스스로 클릭해 보고 결과를 출력한 뒤 종료
// PET_SELFTEST=ask npm start    + 짧은 질문 하나
// PET_SELFTEST=today npm start  + '할 일' 메뉴를 실행해 걸린 시간 출력
async function selfTest() {
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const probe = () =>
    win.webContents.executeJavaScript(
      `JSON.stringify({ petApi: typeof window.pet, hidden: document.getElementById('bubble').hidden,
        bubbleHeight: document.getElementById('bubble').offsetHeight, inner: [innerWidth, innerHeight] })`
    );
  console.log('[자체 테스트] 시작 크기', JSON.stringify(win.getBounds()), await probe());
  await win.webContents.executeJavaScript(`document.getElementById('pet').click()`);
  await wait(800);
  console.log('[자체 테스트] 클릭 후 크기', JSON.stringify(win.getBounds()), await probe());
  const mode = process.env.PET_SELFTEST;
  if (mode === 'shots') {
    // 표정마다 펫 창을 이미지로 저장한다 (PET_SHOT_DIR 폴더). 움직임은 멈춘 상태로 찍는다.
    await win.webContents.executeJavaScript(`document.getElementById('close').click()`);
    await wait(500);
    await win.webContents.executeJavaScript(
      `document.head.insertAdjacentHTML('beforeend', '<style>*{animation:none!important}</style>')`
    );
    for (const mood of ['idle', 'happy', 'thinking']) {
      await win.webContents.executeJavaScript(`petEl.className = '${mood}'`);
      await wait(300);
      const img = await win.webContents.capturePage();
      const file = path.join(process.env.PET_SHOT_DIR || __dirname, `pet-${mood}.png`);
      fs.writeFileSync(file, img.toPNG());
      console.log('[자체 테스트] 저장', file, JSON.stringify(img.getSize()));
    }
  }
  if (mode === 'trends') {
    const prepStart = Date.now();
    await prefetchTrends();
    console.log(`[자체 테스트] 트렌드 미리 준비 ${((Date.now() - prepStart) / 1000).toFixed(1)}초, 준비 파일 ${fs.existsSync(TRENDS_READY) ? '있음' : '없음'}`);
  }
  if (mode === 'ask' || mode === 'today' || mode === 'trends') {
    const button = mode === 'ask' ? null : mode === 'today' ? '#menu button:first-child' : '#menu button[data-kind="trends"]';
    const seen = new Set();
    const started = Date.now();
    let firstEvent = null;
    if (button) {
      await win.webContents.executeJavaScript(`document.querySelector('${button}').click()`);
    } else {
      await win.webContents.executeJavaScript(`window.__selfAsk = window.pet.ask('테스트입니다. "안녕하세요"라고만 답해 주세요.')`);
    }
    // 화면에 진행 상황이나 글자가 처음 나타난 때와, 답이 끝난 때를 잰다.
    for (let i = 0; i < 600; i++) {
      await wait(250);
      const s = JSON.parse(await win.webContents.executeJavaScript(
        `JSON.stringify({ status: document.querySelector('.msg.pet:last-child .status')?.textContent || '',
          body: document.querySelector('.msg.pet:last-child .body')?.textContent || '',
          busy: document.querySelector('#form button').disabled })`
      ));
      if (s.status && s.busy) seen.add(s.status);
      if (!firstEvent && (s.status || s.body)) {
        firstEvent = Date.now();
        console.log(`[자체 테스트] 첫 표시 ${((firstEvent - started) / 1000).toFixed(1)}초: ${s.status || s.body.slice(0, 30)}`);
      }
      if (!s.busy && i > 2) {
        console.log(`[자체 테스트] 답 완료 ${((Date.now() - started) / 1000).toFixed(1)}초: ${s.body.slice(0, 80).replace(/\n/g, ' ')}`);
        console.log(`[자체 테스트] 화면에 보인 진행 상황: ${[...seen].join(' → ') || '(없음)'}`);
        break;
      }
    }
  }
  app.quit();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
