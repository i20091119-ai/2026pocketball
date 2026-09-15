/* mode-rect.js — 네모 당구대 미션: 1·2·3쿠션 미션, 거울(대칭) 보기, 예측 놀이 */
(function (global) {
  'use strict';
  const { Ball, RectBoundary, World, speedFromPower } = global.Physics;
  const R = global.Render;

  const W = 200, H = 100, BR = 5;
  const LEVEL_MSG = {
    1: '쿠션에 한 번 맞히고 빨간 공을 맞혀 보세요',
    2: '쿠션에 두 번 맞히고 빨간 공을 맞혀 보세요',
    3: '쿠션에 세 번 맞히고 빨간 공을 맞혀 보세요',
  };
  const PREDICT_SPEED = 250;

  const mode = {
    id: 'rect', timeScale: 1,
    world: null, cue: null, red: null,
    level: 1, stars: { 1: false, 2: false, 3: false },
    mirror: false,
    aim: null, drag: null, downAt: 0,
    shot: null, lastShot: null,
    trail: [], marks: [],
    predict: null,   // 예측 놀이: { state:'aim'|'predict'|'shooting'|'result', dir, marker, actual }
    el: {},
  };

  mode.init = function () {
    const world = new World(new RectBoundary(W, H));
    world.friction = 0.3; world.decel = 7;
    mode.cue = new Ball({ id: 'cue', x: 50, y: 50, r: BR, color: '#ffffff' });
    mode.red = new Ball({ id: 'red', x: 150, y: 50, r: BR, color: '#e0362c' });
    world.balls = [mode.cue, mode.red];
    world.onCushion = (b, hit) => {
      if (b !== mode.cue || !mode.shot) return;
      if (!mode.shot.hitRed) mode.shot.cushions++;
      mode.marks.push({ x: hit.x, y: hit.y, n: mode.shot.cushions });
      mode.trail.push({ x: hit.cx, y: hit.cy });
      global.App.sound.cushion(b.speed / 340);
      if (mode.predict && mode.predict.state === 'shooting' && mode.shot.cushions === 2 && !mode.predict.actual) {
        mode.predict.actual = { x: hit.x, y: hit.y };
        mode.finishPredict();
      }
    };
    world.onBallHit = (a, b) => {
      if (!mode.shot) return;
      global.App.sound.click(Math.max(a.speed, b.speed) / 340);
      if ((a === mode.cue || b === mode.cue) && !mode.shot.hitRed && !mode.predict) {
        mode.shot.hitRed = true;
        mode.trail.push({ x: mode.cue.x, y: mode.cue.y });
        mode.judge();
      }
    };
    mode.world = world;

    const $ = id => document.getElementById(id);
    mode.el = { tabs: $('rect-tabs'), mirror: $('rect-mirror'), shuffle: $('rect-shuffle'), replay: $('rect-replay'), fire: $('rect-fire'), reaim: $('rect-reaim') };
    mode.el.tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => mode.setLevel(b.dataset.level)));
    mode.el.mirror.addEventListener('click', () => mode.setMirror(!mode.mirror));
    mode.el.shuffle.addEventListener('click', () => mode.shuffle());
    mode.el.replay.addEventListener('click', () => mode.replay());
    mode.el.fire.addEventListener('click', () => mode.firePredict());
    mode.el.reaim.addEventListener('click', () => mode.startPredict());
  };

  mode.enter = function () {
    mode.timeScale = 1;
    mode.setLevel(mode.level === 'predict' ? 1 : mode.level);
  };
  mode.leave = function () { mode.stopAll(); };
  mode.reset = function () { mode.stars = { 1: false, 2: false, 3: false }; mode.level = 1; mode.mirror = false; };

  mode.stopAll = function () { mode.world.balls.forEach(b => b.stop()); mode.shot = null; mode.aim = null; mode.drag = null; mode.timeScale = 1; };

  mode.setLevel = function (lv) {
    mode.stopAll();
    mode.level = lv === 'predict' ? 'predict' : Number(lv);
    mode.trail = []; mode.marks = [];
    mode.el.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.level === String(lv)));
    if (mode.level === 'predict') {
      mode.world.balls = [mode.cue];
      mode.setMirror(false);
      mode.el.mirror.hidden = true; mode.el.shuffle.hidden = true; mode.el.replay.hidden = true;
      mode.startPredict();
    } else {
      mode.predict = null;
      mode.world.balls = [mode.cue, mode.red];
      mode.el.mirror.hidden = false; mode.el.shuffle.hidden = false; mode.el.replay.hidden = false;
      mode.el.fire.hidden = true; mode.el.reaim.hidden = true;
      if (!mode.world.boundary.contains(mode.red.x, mode.red.y, BR)) { mode.red.x = 150; mode.red.y = 50; }
      global.App.msg(LEVEL_MSG[mode.level]);
    }
    mode.updateTabs();
  };
  mode.updateTabs = function () {
    mode.el.tabs.querySelectorAll('button[data-level]').forEach(b => {
      const lv = Number(b.dataset.level);
      if (lv) b.textContent = (mode.stars[lv] ? '★ ' : '☆ ') + lv + '쿠션';
    });
  };
  mode.setMirror = function (on) {
    mode.mirror = on;
    mode.el.mirror.textContent = on ? '🪞 거울 끄기' : '🪞 거울 켜기';
    mode.el.mirror.classList.toggle('on', on);
  };
  mode.shuffle = function () {
    if (mode.world.anyMoving()) return;
    const rnd = (a, b) => a + Math.random() * (b - a);
    mode.cue.x = rnd(BR + 10, W / 2 - 10); mode.cue.y = rnd(BR + 8, H - BR - 8);
    do { mode.red.x = rnd(W / 2 + 10, W - BR - 10); mode.red.y = rnd(BR + 8, H - BR - 8); } while (Math.hypot(mode.red.x - mode.cue.x, mode.red.y - mode.cue.y) < 30);
    mode.trail = []; mode.marks = []; mode.shot = null;
    global.App.msg(LEVEL_MSG[mode.level]);
  };

  /* ---------- 샷 ---------- */
  mode.shoot = function (dx, dy, speed) {
    mode.lastShot = { snap: mode.world.snapshot(), dx, dy, speed };
    mode.cue.vx = dx * speed; mode.cue.vy = dy * speed;
    mode.shot = { cushions: 0, hitRed: false, done: false };
    mode.trail = [{ x: mode.cue.x, y: mode.cue.y }]; mode.marks = [];
    mode.tick = 0;
    if (mode.level !== 'predict') global.App.msg('공이 굴러가요…');
  };
  mode.replay = function () {
    if (!mode.lastShot || mode.world.anyMoving()) return;
    mode.world.restore(mode.lastShot.snap);
    mode.timeScale = 0.35;
    mode.shoot(mode.lastShot.dx, mode.lastShot.dy, mode.lastShot.speed);
    global.App.msg('🐢 천천히 다시 보기');
  };
  mode.judge = function () {
    const need = mode.level, got = mode.shot.cushions;
    if (got === need) {
      mode.stars[need] = true; mode.updateTabs();
      global.App.msg(`성공! 쿠션 ${got}번 → 빨간 공 🎯  ★ 획득!`, 'good');
      global.App.sound.success();
      mode.confetti = { t: 0, x: mode.cue.x, y: mode.cue.y };
    } else {
      global.App.msg(`빨간 공은 맞혔지만 쿠션은 ${got}번이었어요 (목표 ${need}번)`, 'bad');
      global.App.sound.fail();
    }
    mode.shot.done = true;
  };

  /* ---------- 예측 놀이 ---------- */
  mode.startPredict = function () {
    mode.stopAll();
    mode.predict = { state: 'aim', dir: null, marker: null, actual: null };
    mode.trail = []; mode.marks = [];
    mode.el.fire.hidden = true; mode.el.reaim.hidden = true;
    if (!mode.world.boundary.contains(mode.cue.x, mode.cue.y, BR)) { mode.cue.x = 50; mode.cue.y = 50; }
    global.App.msg('① 끌어서 공을 칠 방향을 정하세요');
  };
  mode.firePredict = function () {
    const p = mode.predict;
    if (!p || p.state !== 'predict' || !p.marker) return;
    p.state = 'shooting';
    mode.el.fire.hidden = true; mode.el.reaim.hidden = true;
    mode.shoot(p.dir.dx, p.dir.dy, PREDICT_SPEED);
    global.App.msg('어디로 튈까요?');
  };
  mode.finishPredict = function () {
    const p = mode.predict;
    p.state = 'result';
    const d = Math.hypot(p.marker.x - p.actual.x, p.marker.y - p.actual.y);
    let text;
    if (d <= 6) { text = '딱 맞았어요! 🎯 거울처럼 튀는 걸 알아냈네요'; global.App.sound.success(); }
    else if (d <= 15) { text = '거의 맞았어요! 👍 조금만 더 거울처럼 생각해 봐요'; global.App.sound.success(); }
    else { text = '조금 빗나갔어요. 쿠션에 들어간 각도와 나온 각도를 비교해 보세요'; global.App.sound.fail(); }
    global.App.msg(text, d <= 15 ? 'good' : 'bad');
    mode.el.reaim.hidden = false; mode.el.reaim.textContent = '🔄 다시 하기';
  };
  function snapToRail(p) {
    const q = mode.world.boundary.inner(BR);
    const cands = [
      { x: Math.min(q.x1, Math.max(q.x0, p.x)), y: q.y0 - BR, d: Math.abs(p.y - q.y0) },
      { x: Math.min(q.x1, Math.max(q.x0, p.x)), y: q.y1 + BR, d: Math.abs(p.y - q.y1) },
      { x: q.x0 - BR, y: Math.min(q.y1, Math.max(q.y0, p.y)), d: Math.abs(p.x - q.x0) },
      { x: q.x1 + BR, y: Math.min(q.y1, Math.max(q.y0, p.y)), d: Math.abs(p.x - q.x1) },
    ];
    cands.sort((a, b) => a.d - b.d);
    return { x: cands[0].x, y: cands[0].y };
  }

  /* ---------- 입력 ---------- */
  mode.onDown = function (p) {
    const world = mode.world;
    if (world.anyMoving()) return;
    if (mode.predict) {
      const s = mode.predict.state;
      if (s === 'predict') { mode.predict.marker = snapToRail(p); mode.el.fire.hidden = false; global.App.msg('② 두 번째로 쿠션에 닿을 곳을 찍었어요. 발사!'); return; }
      if (s !== 'aim') return;
    }
    const b = world.ballAt(p.x, p.y, 1.8);
    if (b) { mode.drag = { ball: b, offx: b.x - p.x, offy: b.y - p.y }; return; }
    mode.aim = p; mode.downAt = performance.now();
  };
  mode.onMove = function (p) {
    if (mode.drag) {
      const b = mode.drag.ball;
      const q = mode.world.boundary.clamp(p.x + mode.drag.offx, p.y + mode.drag.offy, BR);
      if (!mode.world.overlapsAny(q.x, q.y, BR, b)) { b.x = q.x; b.y = q.y; }
      mode.trail = []; mode.marks = [];
      return;
    }
    if (mode.aim) mode.aim = p;
  };
  mode.onUp = function (p) {
    if (mode.drag) { mode.drag = null; return; }
    if (!mode.aim) return;
    const a = global.App.aimFrom(mode.cue, p, W);
    mode.aim = null;
    if (!a || a.d < BR * 1.5 || performance.now() - mode.downAt < 80) return;
    if (mode.predict && mode.predict.state === 'aim') {
      mode.predict.dir = { dx: a.dx, dy: a.dy };
      mode.predict.state = 'predict';
      mode.el.reaim.hidden = false; mode.el.reaim.textContent = '↩ 방향 다시';
      global.App.msg('② 공이 두 번째로 쿠션에 닿을 곳을 찍어 보세요');
      return;
    }
    mode.shoot(a.dx, a.dy, speedFromPower(a.power));
  };

  /* ---------- 업데이트 ---------- */
  mode.update = function (dt) {
    const world = mode.world;
    const wasMoving = world.anyMoving();
    world.step(dt);
    if (mode.shot) {
      mode.tick = (mode.tick || 0) + 1;
      if (mode.tick % 4 === 0 && mode.cue.moving) mode.trail.push({ x: mode.cue.x, y: mode.cue.y });
      if (wasMoving && !world.anyMoving()) {
        mode.trail.push({ x: mode.cue.x, y: mode.cue.y });
        if (mode.predict) {
          if (mode.predict.state === 'shooting') { // 두 번째 쿠션 전에 멈춤
            mode.predict.state = 'result';
            global.App.msg('두 번째 쿠션까지 못 갔어요. 다시 해 볼까요?', 'bad');
            mode.el.reaim.hidden = false; mode.el.reaim.textContent = '🔄 다시 하기';
          }
        } else if (!mode.shot.done) {
          global.App.msg(`빨간 공을 못 맞혔어요 (쿠션 ${mode.shot.cushions}번). 다시!`, 'bad');
          global.App.sound.fail();
        }
        mode.shot = null; mode.timeScale = 1;
      }
    }
    if (mode.confetti) { mode.confetti.t += dt; if (mode.confetti.t > 1.2) mode.confetti = null; }
  };

  /* ---------- 뷰 ---------- */
  mode.worldRect = function () {
    const rail = 9;
    if (mode.mirror && typeof mode.level === 'number') {
      const L = mode.level, w = W - 2 * BR, h = H - 2 * BR;
      return { x: BR - L * w - rail - BR, y: BR - L * h - rail - BR, w: (2 * L + 1) * w + 2 * (rail + BR), h: (2 * L + 1) * h + 2 * (rail + BR) };
    }
    return { x: -rail, y: -rail, w: W + 2 * rail, h: H + 2 * rail };
  };

  /* 거울 타일 (i,j)에서 점 p의 상 */
  function imageOf(p, i, j) {
    const w = W - 2 * BR, h = H - 2 * BR, x0 = BR, y0 = BR;
    const ei = ((i % 2) + 2) % 2 === 0, ej = ((j % 2) + 2) % 2 === 0;
    return { x: ei ? x0 + i * w + (p.x - x0) : x0 + (i + 1) * w - (p.x - x0), y: ej ? y0 + j * h + (p.y - y0) : y0 + (j + 1) * h - (p.y - y0) };
  }

  /* ---------- 렌더 ---------- */
  mode.render = function (ctx, t) {
    const world = mode.world;
    const L = typeof mode.level === 'number' ? mode.level : 0;
    if (mode.mirror && L) {
      const w = W - 2 * BR, h = H - 2 * BR;
      // 유령 테이블: 공 중심이 움직이는 칸(w×h)을 격자로 펼친다. 격자선이 곧 쿠션(거울)
      for (let i = -L; i <= L; i++) for (let j = -L; j <= L; j++) {
        const n = Math.abs(i) + Math.abs(j);
        if (n === 0 || n > L) continue;
        ctx.save();
        ctx.globalAlpha = n === L ? 0.5 : 0.28;
        ctx.fillStyle = '#3a7a55';
        ctx.fillRect(BR + i * w, BR + j * h, w, h);
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#b98a55'; ctx.lineWidth = 1.6;
        ctx.strokeRect(BR + i * w, BR + j * h, w, h);
        ctx.restore();
        const im = imageOf(mode.red, i, j);
        ctx.save(); ctx.globalAlpha = n === L ? 1 : 0.45;
        R.drawBall(ctx, { x: im.x, y: im.y, r: BR, color: '#e0362c', number: null }, { glow: n === L ? '#ffe066' : null });
        R.drawText(ctx, String(n), im.x, im.y - BR * 2.1, 7, n === L ? '#ffe066' : '#fff');
        ctx.restore();
      }
    }
    R.drawRectTable(ctx, W, H, { cloth: '#2c8a4a' });

    // 지난 경로
    R.drawTrail(ctx, mode.trail, 'rgba(255,255,255,.85)', 1.2);
    for (const m of mode.marks) { R.drawBurst(ctx, m.x, m.y, 4, '#ffe066'); R.drawText(ctx, String(m.n), m.x + (m.x < W / 2 ? 7 : -7), m.y + (m.y < H / 2 ? 7 : -7), 6, '#ffe066'); }

    // 조준선
    if (mode.aim && !world.anyMoving()) {
      const a = global.App.aimFrom(mode.cue, mode.aim, W);
      if (a && a.d >= BR * 1.5) {
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mode.cue.x, mode.cue.y);
        if (mode.mirror && L) {
          const len = (2 * L + 2) * W;
          ctx.lineTo(mode.cue.x + a.dx * len, mode.cue.y + a.dy * len);
        } else {
          const hit = world.castRay(mode.cue, a.dx, a.dy);
          if (hit) ctx.lineTo(hit.x, hit.y);
        }
        ctx.stroke(); ctx.restore();
        if (!mode.predict) {
          // 세기 표시
          const pw = a.power;
          ctx.save(); ctx.strokeStyle = `hsl(${120 - pw * 120},90%,55%)`; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(mode.cue.x, mode.cue.y); ctx.lineTo(mode.cue.x - a.dx * (6 + pw * 24), mode.cue.y - a.dy * (6 + pw * 24)); ctx.stroke(); ctx.restore();
        }
      }
    }
    // 예측 놀이 표시
    if (mode.predict) {
      const p = mode.predict;
      if (p.dir && (p.state === 'predict' || p.state === 'shooting' || p.state === 'result')) {
        const hit = world.castRay(mode.cue, p.dir.dx, p.dir.dy);
        if (hit && p.state === 'predict') {
          ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(mode.cue.x, mode.cue.y); ctx.lineTo(hit.x, hit.y); ctx.stroke(); ctx.restore();
          R.drawArrow(ctx, mode.cue.x, mode.cue.y, mode.cue.x + p.dir.dx * 18, mode.cue.y + p.dir.dy * 18, '#fff', 1.4);
        }
      }
      if (p.marker) R.drawMarker(ctx, p.marker.x, p.marker.y, 4.5, '#3b82f6', '?');
      if (p.actual) R.drawMarker(ctx, p.actual.x, p.actual.y, 4.5, '#22c55e', '!');
      if (p.state === 'predict' && !p.marker) {
        const q = world.boundary.inner(BR); ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
        ctx.strokeRect(q.x0 - BR, q.y0 - BR, q.x1 - q.x0 + 2 * BR, q.y1 - q.y0 + 2 * BR); ctx.restore();
      }
    }
    for (const b of world.balls) R.drawBall(ctx, b);
    if (mode.confetti) {
      const c = mode.confetti, k = c.t / 1.2;
      ctx.save(); ctx.globalAlpha = 1 - k;
      for (let i = 0; i < 18; i++) { const a = i * Math.PI * 2 / 18, d = 8 + k * 40; ctx.fillStyle = `hsl(${i * 20},90%,60%)`; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d - k * 10, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  };

  global.App.modes.rect = mode;
})(window);
