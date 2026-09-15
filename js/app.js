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

  /* ---------- 소리 (첫 터치 후에만 생성) ---------- */
  const Sound = {
    ctx: null, on: true,
    ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    tone(freq, dur, vol, type) {
      if (!this.on || !this.ctx) return;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    },
    click(v) { this.tone(900 + Math.random() * 300, 0.06, Math.min(0.25, 0.05 + v * 0.2), 'triangle'); },
    cushion(v) { this.tone(220, 0.08, Math.min(0.2, 0.04 + v * 0.15), 'sine'); },
    pocket() { this.tone(160, 0.25, 0.25, 'sine'); setTimeout(() => this.tone(120, 0.2, 0.2, 'sine'), 60); },
    success() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 0.18, 'triangle'), i * 90)); },
    fail() { this.tone(200, 0.25, 0.15, 'sawtooth'); },
  };
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
    App.lastInput = performance.now();
  };
  App.msg = function (text, cls) {
    const el = document.querySelector('.screen.active .msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'msg' + (cls ? ' ' + cls : '');
  };
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { Sound.ensure(); App.go(b.dataset.go); }));
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
    if (App.screen !== 'home' && now - App.lastInput > IDLE_MS) App.go('home');
    requestAnimationFrame(frame);
  }

  App.start = function () {
    resize();
    App.go('home');
    requestAnimationFrame(frame);
  };

  /* 조준 도우미: 공에서 터치 지점 방향으로, 거리에 따라 세기 */
  App.aimFrom = function (ball, p, tableW) {
    const dx = p.x - ball.x, dy = p.y - ball.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return null;
    const power = Math.max(0, Math.min(1, (d - ball.r * 2) / (tableW * 0.55)));
    return { dx: dx / d, dy: dy / d, power, d };
  };

  global.App = App;
})(window);
