// 자체 테스트: PET_SELFTEST=<모드> npm start
// 기록은 임시 폴더(ai-pet-selftest)에 남아 실제 대화 기록과 위치를 건드리지 않는다.
//   1        펫을 클릭해 말풍선이 열리는지
//   ask      + 짧은 질문 하나
//   today    + '할 일' 메뉴, 걸린 시간과 진행 상황
//   trends   + 트렌드 미리 준비 후 버튼
//   shots    표정별 화면 저장 (PET_SHOT_DIR)
//   newline  입력창 줄바꿈
//   move     옮긴 위치 기억
//   links    링크 변환
//   history  껐다 켜도 대화 기록 유지
//   alerts   마감·복습 알림 (Notion 확인 포함)

module.exports = async function selfTest({ win, app, fs, path, prefetchTrends, checkAlerts, TRENDS_READY }) {
  const mode = process.env.PET_SELFTEST;
  const js = (code) => win.webContents.executeJavaScript(code);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...args) => console.log('[자체 테스트]', ...args);
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    const file = path.join(process.env.PET_SHOT_DIR || __dirname, `pet-${name}.png`);
    fs.writeFileSync(file, img.toPNG());
    log('저장', file);
  };

  await new Promise((r) => win.webContents.once('did-finish-load', r));
  // 이전 테스트의 대화 기록을 지우고 깨끗한 화면에서 시작한다.
  await js(`localStorage.clear()`);
  win.reload();
  await new Promise((r) => win.webContents.once('did-finish-load', r));

  if (mode === 'move') {
    // 펭집사를 왼쪽 위로 옮긴 뒤, 말풍선을 열고 닫아도 그 자리에 있는지 본다.
    win.setPosition(300, 200);
    win.emit('moved');
    await wait(600);
    const corner = () => { const b = win.getBounds(); return `${b.x + b.width},${b.y + b.height}`; };
    const before = corner();
    await js(`document.getElementById('pet').click()`);
    await wait(600);
    const opened = corner();
    await js(`document.getElementById('close').click()`);
    await wait(600);
    log(`오른쪽 아래 모서리: 옮긴 뒤 ${before} / 열었을 때 ${opened} / 닫은 뒤 ${corner()}`);
    return app.quit();
  }

  if (mode === 'links') {
    const html = await js(`render('출처: [arXiv](https://arxiv.org/abs/2512.02556), 공식 블로그 https://example.com/post. 끝')`);
    log('변환 결과', html);
    await js(`document.getElementById('pet').click()`);
    await wait(500);
    await js(`addMessage('pet', '출처: [arXiv](https://arxiv.org/abs/2512.02556)')`);
    const navigated = await js(`(() => { const a = document.querySelector('#log a'); a.click(); return location.href; })()`);
    log('링크를 눌러도 펫 화면 유지:', navigated.endsWith('index.html'));
    return app.quit();
  }

  if (mode === 'history') {
    await js(`document.getElementById('pet').click()`);
    await wait(500);
    await js(`addMessage('me', '기록 테스트: 첫 줄\\n둘째 줄'); addMessage('pet', '네, **기억**해 둘게요.')`);
    win.reload();
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await wait(300);
    const restored = await js(`JSON.stringify([...document.querySelectorAll('#log .msg')].map(m => m.className.replace('msg ', '') + ':' + m.textContent.slice(0, 20)))`);
    log('다시 켠 뒤 화면', restored);
    return app.quit();
  }

  if (mode === 'badge') {
    // Notion 확인 없이 알림 배지가 화면에 보이는지만 본다.
    await js(`showAlerts([{ kind: 'deadline', text: '테스트 알림' }])`);
    await wait(800);
    log('배지 위치', await js(`(() => { const b = document.getElementById('status'); const r = b.getBoundingClientRect();
      return JSON.stringify({ display: getComputedStyle(b).display, x: r.x, y: r.y, w: r.width, h: r.height, win: [innerWidth, innerHeight],
        wrap: document.getElementById('pet-wrap').getBoundingClientRect().toJSON() }); })()`));
    await shot('badge');
    return app.quit();
  }

  if (mode === 'alerts') {
    const started = Date.now();
    const items = await checkAlerts();
    log(`알림 확인 ${((Date.now() - started) / 1000).toFixed(1)}초`, JSON.stringify(items));
    const badge = await js(`JSON.stringify({ text: document.getElementById('status').textContent, on: document.getElementById('status').classList.contains('on') })`);
    log('배지', badge);
    await shot('alert-badge');
    await js(`document.getElementById('pet').click()`);
    await wait(600);
    const said = await js(`[...document.querySelectorAll('#log .msg.pet')].map(m => m.textContent).join(' / ')`);
    log('말풍선을 열자 한 말', said);
    await shot('alert-open');
    return app.quit();
  }

  const probe = () =>
    js(`JSON.stringify({ petApi: typeof window.pet, hidden: document.getElementById('bubble').hidden,
        bubbleHeight: document.getElementById('bubble').offsetHeight, inner: [innerWidth, innerHeight] })`);
  log('시작 크기', JSON.stringify(win.getBounds()), await probe());
  await js(`document.getElementById('pet').click()`);
  await wait(800);
  log('클릭 후 크기', JSON.stringify(win.getBounds()), await probe());

  if (mode === 'shots') {
    await js(`document.getElementById('close').click()`);
    await wait(500);
    await js(`document.head.insertAdjacentHTML('beforeend', '<style>*{animation:none!important}</style>')`);
    for (const mood of ['idle', 'happy', 'thinking']) {
      await js(`petEl.className = '${mood}'`);
      await wait(300);
      await shot(mood);
    }
  }

  if (mode === 'newline') {
    // 실제 키보드처럼 keyDown → char('\r') → keyUp 순서로 보낸다.
    const key = (keyCode, modifiers = []) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    };
    await js(`input.focus()`);
    for (const ch of 'first line') win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    key('Enter', ['shift']);
    for (const ch of 'second line') win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    await wait(300);
    log('입력창', await js(`JSON.stringify({ value: input.value, height: input.offsetHeight })`));
    await shot('newline');
  }

  if (mode === 'trends') {
    const prepStart = Date.now();
    await prefetchTrends();
    log(`트렌드 미리 준비 ${((Date.now() - prepStart) / 1000).toFixed(1)}초, 준비 파일 ${fs.existsSync(TRENDS_READY) ? '있음' : '없음'}`);
  }

  if (mode === 'ask' || mode === 'today' || mode === 'trends') {
    const button = mode === 'ask' ? null : mode === 'today' ? '#menu button:first-child' : '#menu button[data-kind="trends"]';
    const seen = new Set();
    const started = Date.now();
    let firstEvent = null;
    if (button) await js(`document.querySelector('${button}').click()`);
    else await js(`window.__selfAsk = window.pet.ask('테스트입니다. "안녕하세요"라고만 답해 주세요.')`);
    // 화면에 진행 상황이나 글자가 처음 나타난 때와, 답이 끝난 때를 잰다.
    for (let i = 0; i < 600; i++) {
      await wait(250);
      const s = JSON.parse(await js(
        `JSON.stringify({ status: document.querySelector('.msg.pet:last-child .status')?.textContent || '',
          body: document.querySelector('.msg.pet:last-child .body')?.textContent || '',
          busy: document.querySelector('#form button').disabled })`
      ));
      if (s.status && s.busy) seen.add(s.status);
      if (!firstEvent && (s.status || s.body)) {
        firstEvent = Date.now();
        log(`첫 표시 ${((firstEvent - started) / 1000).toFixed(1)}초: ${s.status || s.body.slice(0, 30)}`);
      }
      if (!s.busy && i > 2) {
        log(`답 완료 ${((Date.now() - started) / 1000).toFixed(1)}초: ${s.body.slice(0, 80).replace(/\n/g, ' ')}`);
        log(`화면에 보인 진행 상황: ${[...seen].join(' → ') || '(없음)'}`);
        break;
      }
    }
  }
  app.quit();
};
