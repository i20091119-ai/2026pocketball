/* app.js — 화면 전환, 게임 루프, 뷰(월드→화면) 변환, 입력, 소리, 무조작 복귀 */
(function (global) {
  'use strict';

  const FIXED_DT = 1 / 120;
  const IDLE_MS = 90 * 1000;   // 무조작 시 홈으로 돌아가는 시간

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const App = {
    modes: {}, mode: null, screen: 'home',
    view: { scale: 1, ox: 0, oy: 0 },
    dpr: 1, cw: 0, ch: 0,
    lastInput: performance.now(),
  };

  const Sound = global.Sound;
  App.sound = Sound;

  /* ---------- 뷰 ---------- */
  function resize() {
    App.dpr = Math.min(2, window.devicePixelRatio || 1);
    App.cw = window.innerWidth; App.ch = window.innerHeight;
    canvas.width = Math.round(App.cw * App.dpr); canvas.height = Math.round(App.ch * App.dpr);
    canvas.style.width = App.cw + 'px'; canvas.style.height = App.ch + 'px';
    if (App.mode) App.view = computeView(App.mode.worldRect());
  }
  function area() {
    const s = document.querySelector('.screen.active');
    let top = 0, bottom = 0;
    if (s) {
      const t = s.querySelector('.bar.top'), b = s.querySelector('.bar.bottom');
      if (t) top = t.getBoundingClientRect().height;
      if (b) bottom = b.getBoundingClientRect().height;
    }
    return { x: 0, y: top, w: App.cw, h: Math.max(60, App.ch - top - bottom) };
  }
  function computeView(rect) {
    const a = area(), pad = 10;
    const s = Math.min((a.w - 2 * pad) / rect.w, (a.h - 2 * pad) / rect.h);
    return { scale: s, ox: a.x + (a.w - rect.w * s) / 2 - rect.x * s, oy: a.y + (a.h - rect.h * s) / 2 - rect.y * s };
  }
  App.toWorld = (sx, sy) => ({ x: (sx - App.view.ox) / App.view.scale, y: (sy - App.view.oy) / App.view.scale });
  App.snapView = () => { if (App.mode) App.view = computeView(App.mode.worldRect()); };

  /* ---------- 화면 전환 ---------- */
  App.go = function (name) {
    if (App.mode && App.mode.leave) App.mode.leave();
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    App.screen = name;
    App.mode = App.modes[name] || null;
    if (App.mode) { App.mode.enter(); App.view = computeView(App.mode.worldRect()); }
    document.getElementById('help').classList.remove('active');
    if (App.mode && !helpSeen[name] && App.autoHelp !== false) App.showHelp(name);
    App.lastInput = performance.now();
  };
  /* ---------- 하는 법 안내 ---------- */
  const helpSeen = {};
  let helpStep = 0, helpItems = [];
  function renderHelpStep() {
    helpItems.forEach((li, i) => li.classList.toggle('cur', i === helpStep));
    const dots = document.getElementById('help-dots');
    dots.innerHTML = helpItems.map((_, i) => `<i class="${i === helpStep ? 'on' : i < helpStep ? 'done' : ''}"></i>`).join('');
    document.getElementById('help-prev').hidden = helpStep === 0;
    document.getElementById('help-close').textContent = helpStep === helpItems.length - 1 ? '이해했어요! 시작' : '다음 →';
  }
  App.showHelp = function (name) {
    const modal = document.getElementById('help');
    modal.querySelectorAll('.help-page').forEach(p => p.classList.toggle('active', p.dataset.for === name));
    helpItems = Array.from(modal.querySelectorAll('.help-page.active .steps li'));
    helpStep = 0; renderHelpStep();
    modal.classList.add('active');
    helpSeen[name] = true;
  };
  document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () => App.showHelp(b.dataset.help)));
  document.getElementById('help-close').addEventListener('click', () => {
    if (helpStep < helpItems.length - 1) { helpStep++; renderHelpStep(); }
    else document.getElementById('help').classList.remove('active');
  });
  document.getElementById('help-prev').addEventListener('click', () => { if (helpStep > 0) { helpStep--; renderHelpStep(); } });
  App.resetHelp = () => { for (const k in helpSeen) delete helpSeen[k]; };

  /* ---------- 관리자: 길게 누르기(3초)로 열기, 전시 종료 ---------- */
  const adminModal = document.getElementById('admin');
  let holdTimer = null;
  document.querySelectorAll('[data-admin-hold]').forEach(el => {
    const start = e => { clearTimeout(holdTimer); holdTimer = setTimeout(() => { adminModal.classList.add('active'); document.getElementById('admin-fallback').hidden = true; }, 3000); };
    const cancel = () => clearTimeout(holdTimer);
    el.addEventListener('pointerdown', start);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, cancel));
    el.addEventListener('contextmenu', e => e.preventDefault());
  });
  document.getElementById('admin-cancel').addEventListener('click', () => adminModal.classList.remove('active'));
  document.getElementById('admin-home').addEventListener('click', () => { adminModal.classList.remove('active'); App.resetHelp(); App.go('home'); });
  document.getElementById('admin-exit').addEventListener('click', () => {
    window.close(); // 이 페이지는 이동 기록이 하나뿐이라 브라우저 규칙상 스크립트로 닫을 수 있다
    setTimeout(() => { document.getElementById('admin-fallback').hidden = false; }, 400);
  });

  App.msg = function (text, cls) {
    const el = document.querySelector('.screen.active .msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'msg' + (cls ? ' ' + cls : '');
  };
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { Sound.ensure(); App.go(b.dataset.go); }));
  document.addEventListener('click', e => { if (e.target.closest('button')) { Sound.ensure(); Sound.tap(); } }, true);
  const soundBtn = document.getElementById('btn-sound');
  soundBtn.addEventListener('click', () => { Sound.on = !Sound.on; soundBtn.textContent = Sound.on ? '🔊 소리 켜짐' : '🔇 소리 꺼짐'; });

  /* ---------- 입력 ---------- */
  let activePointer = null;
  canvas.addEventListener('pointerdown', e => {
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    Sound.ensure();
    if (App.mode && App.mode.onDown) App.mode.onDown(App.toWorld(e.clientX, e.clientY), e);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== activePointer) return;
    if (App.mode && App.mode.onMove) App.mode.onMove(App.toWorld(e.clientX, e.clientY), e);
  });
  const up = e => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (App.mode && App.mode.onUp) App.mode.onUp(App.toWorld(e.clientX, e.clientY), e);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  window.addEventListener('pointerdown', () => { App.lastInput = performance.now(); }, true);
  window.addEventListener('keydown', () => { App.lastInput = performance.now(); }, true);
  window.addEventListener('resize', resize);

  /* ---------- 루프 ---------- */
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (App.mode) {
      acc += dt * (App.mode.timeScale || 1);
      let n = 0;
      while (acc >= FIXED_DT && n < 40) { App.mode.update(FIXED_DT); acc -= FIXED_DT; n++; }
      if (n >= 40) acc = 0;
      // 뷰를 목표 뷰로 부드럽게
      const tv = computeView(App.mode.worldRect()), v = App.view, k = 1 - Math.pow(0.002, dt);
      v.scale += (tv.scale - v.scale) * k; v.ox += (tv.ox - v.ox) * k; v.oy += (tv.oy - v.oy) * k;
      ctx.setTransform(App.dpr, 0, 0, App.dpr, 0, 0);
      ctx.clearRect(0, 0, App.cw, App.ch);
      ctx.setTransform(App.dpr * v.scale, 0, 0, App.dpr * v.scale, App.dpr * v.ox, App.dpr * v.oy);
      App.mode.render(ctx, now / 1000);
    } else {
      ctx.setTransform(App.dpr, 0, 0, App.dpr, 0, 0);
      ctx.clearRect(0, 0, App.cw, App.ch);
    }
    if (App.screen !== 'home' && now - App.lastInput > IDLE_MS) { App.resetHelp(); App.go('home'); }
    requestAnimationFrame(frame);
  }

  App.start = function () {
    resize();
    App.go('home');
    requestAnimationFrame(frame);
  };

  /* 새총 조준: 누른 곳(start)에서 당긴 곳(end)의 반대 방향으로 발사, 당긴 거리만큼 세게 */
  App.TAP_DIST = 6; // 이보다 짧게 움직이면 '톡 누름'으로 본다
  App.aimDrag = function (start, end, tableW) {
    if (!start || !end) return null;
    const dx = start.x - end.x, dy = start.y - end.y;
    const d = Math.hypot(dx, dy);
    if (d < App.TAP_DIST) return null;
    const power = Math.max(0, Math.min(1, (d - App.TAP_DIST) / (tableW * 0.42)));
    return { dx: dx / d, dy: dy / d, power, d };
  };

  global.App = App;
})(window);
