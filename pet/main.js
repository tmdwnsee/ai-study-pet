// 바탕화면 펫: 투명하고 항상 위에 떠 있는 창. 질문은 내 컴퓨터의 Claude Code(`claude -p`)에 넘긴다.
// API 키 없이, Claude 구독 계정으로 로그인된 Claude Code를 쓴다.

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..'); // AI-개인-비서 폴더: CLAUDE.md와 Skill이 있는 곳
const CLOSED = { width: 170, height: 190 };
const OPEN = { width: 380, height: 620 };
const MARGIN = 24;

const PET_PROMPT =
  '지금 너는 바탕화면 펫의 말풍선 안에서 답한다. 말풍선은 좁으니 짧게 답한다. ' +
  '마크다운 표 대신 짧은 목록을 쓰고, 제목(#)은 쓰지 않는다.';

let win;
let sessionId = null; // 대화를 이어가기 위한 Claude Code 세션 ID
let busy = false;

function findClaude() {
  const candidates = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', path.join(process.env.HOME, '.local/bin/claude')];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  try {
    return execFileSync('/bin/zsh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
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
}

// PET_SELFTEST=1 npm start: 펫을 스스로 클릭해 보고 결과를 출력한 뒤 종료한다.
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
  if (process.env.PET_SELFTEST === 'ask') {
    const res = await win.webContents.executeJavaScript(`window.pet.ask('테스트입니다. "안녕하세요"라고만 답해 주세요.')`);
    console.log('[자체 테스트] 질문 결과', JSON.stringify(res));
  }
  app.quit();
}

ipcMain.handle('set-open', (_e, open) => place(open ? OPEN : CLOSED));

ipcMain.handle('reset', () => {
  sessionId = null;
  return true;
});

ipcMain.handle('quit', () => app.quit());

ipcMain.handle('ask', async (_e, text) => {
  if (busy) return { ok: false, text: '아직 앞의 질문을 생각하고 있어요. 조금만 기다려 주세요.' };
  const claude = findClaude();
  if (!claude) return { ok: false, text: 'Claude Code를 찾지 못했어요. 터미널에서 `npm install -g @anthropic-ai/claude-code`로 설치해 주세요.' };

  const args = ['-p', text, '--output-format', 'json', '--append-system-prompt', PET_PROMPT];
  if (sessionId) args.push('--resume', sessionId);

  busy = true;
  try {
    const out = await run(claude, args);
    const result = JSON.parse(out);
    if (result.session_id) sessionId = result.session_id;
    if (result.is_error) return { ok: false, text: result.result || '문제가 생겼어요.' };
    return { ok: true, text: result.result || '' };
  } catch (err) {
    return { ok: false, text: explain(String(err.message || err)) };
  } finally {
    busy = false;
  }
});

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` };
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (stdout.trim()) resolve(stdout);
      else reject(new Error(stderr || `claude exited with code ${code}`));
    });
  });
}

function explain(message) {
  if (/log ?in|auth/i.test(message)) return '로그인이 필요해요. 터미널에서 `claude auth login`을 실행해 주세요.';
  return `문제가 생겼어요: ${message.slice(0, 200)}`;
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
