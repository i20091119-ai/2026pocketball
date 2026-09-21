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
  const SEG_COLORS = ['rgba(255,255,255,.95)', '#ffe066', '#ff9f43', '#ff6b81', '#a29bfe', '#7bed9f'];

  const mode = {
    id: 'rect', timeScale: 1,
    world: null, cue: null, red: null,
    level: 1, stars: { 1: false, 2: false, 3: false },
    mirror: false, showAngles: false,
    aim: null, drag: null, downAt: 0,
    shot: null, lastShot: null,
    trail: [], marks: [],
    predict: null,   // 예측 놀이: { state:'aim'|'predict'|'shooting'|'result', dir, marker, actual }
    el: {},
  };

  mode.init = function () {
    const world = new World(new RectBoundary(W, H));
    mode.cue = new Ball({ id: 'cue', x: 50, y: 50, r: BR, color: '#ffffff' });
    mode.red = new Ball({ id: 'red', x: 150, y: 50, r: BR, color: '#e0362c' });
    world.balls = [mode.cue, mode.red];
    world.onCushion = (b, hit) => {
      if (b !== mode.cue || !mode.shot) return;
      if (!mode.shot.hitRed) mode.shot.cushions++;
      if (!mode.shot.hitRed) { if (hit.nx) mode.shot.ti += Math.sign(mode.shot.udx); if (hit.ny) mode.shot.tj += Math.sign(mode.shot.udy); }
      const sp = b.speed || 1, out = { x: b.vx / sp, y: b.vy / sp }, vn = out.x * hit.nx + out.y * hit.ny;
      const din = { x: out.x - 2 * vn * hit.nx, y: out.y - 2 * vn * hit.ny }; // 들어온 방향 = 나간 방향을 법선에 대해 되비춘 것
      mode.marks.push({ x: hit.x, y: hit.y, cx: hit.cx, cy: hit.cy, nx: hit.nx, ny: hit.ny, din, out, n: mode.shot.hitRed ? null : mode.shot.cushions }); // 빨간 공을 맞힌 뒤의 튕김은 숫자 없이
      mode.trail.push({ x: hit.cx, y: hit.cy, k: mode.shot.cushions });
      if (!mode.shot.hitRed) mode.shot.ghostPts.push({ x: imageOf({ x: hit.cx, y: hit.cy }, mode.shot.ti, mode.shot.tj), k: mode.shot.cushions });
      global.App.sound.cushion(b.speed / 420);
      if (mode.predict && mode.predict.state === 'shooting' && mode.shot.cushions === 2 && !mode.predict.actual) {
        mode.predict.actual = { x: hit.x, y: hit.y };
        mode.finishPredict();
      }
    };
    world.onBallHit = (a, b) => {
      if (!mode.shot) return;
      global.App.sound.click(Math.max(a.speed, b.speed) / 420);
      if ((a === mode.cue || b === mode.cue) && !mode.shot.hitRed && !mode.predict) {
        mode.shot.hitRed = true;
        mode.shot.ghostFrozen = imageOf(mode.cue, mode.shot.ti, mode.shot.tj);
        mode.trail.push({ x: mode.cue.x, y: mode.cue.y, k: mode.shot.cushions });
        mode.judge();
      }
    };
    mode.world = world;

    const $ = id => document.getElementById(id);
    mode.el = { tabs: $('rect-tabs'), mirror: $('rect-mirror'), shuffle: $('rect-shuffle'), replay: $('rect-replay'), fire: $('rect-fire'), reaim: $('rect-reaim'),
      angles: $('rect-angles'), stars: $('rect-stars'), reward: $('rect-reward'), rewardIcon: $('reward-icon'), rewardTitle: $('reward-title'), rewardStars: $('reward-stars'), rewardSub: $('reward-sub'), rewardNext: $('reward-next'), rewardStay: $('reward-stay') };
    mode.el.rewardStay.addEventListener('click', () => { mode.el.reward.classList.remove('active'); if (mode.starCount() === 3) { mode.stars = { 1: false, 2: false, 3: false }; mode.setLevel(1); } });
    mode.el.rewardNext.addEventListener('click', () => { mode.el.reward.classList.remove('active'); mode.rewardNextAction(); });
    mode.el.tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => mode.setLevel(b.dataset.level)));
    mode.el.mirror.addEventListener('click', () => mode.setMirror(!mode.mirror));
    mode.el.angles.addEventListener('click', () => mode.setAngles(!mode.showAngles));
    mode.el.shuffle.addEventListener('click', () => mode.shuffle());
    mode.el.replay.addEventListener('click', () => mode.replay());
    mode.el.fire.addEventListener('click', () => mode.firePredict());
    mode.el.reaim.addEventListener('click', () => mode.startPredict());
  };

  mode.enter = function () {
    mode.timeScale = 1; mode.el.reward.classList.remove('active');
    mode.setLevel(mode.level === 'predict' ? 1 : mode.level);
  };
  mode.leave = function () { mode.stopAll(); };
  mode.reset = function () { mode.stars = { 1: false, 2: false, 3: false }; mode.level = 1; mode.mirror = false; };

  mode.stopAll = function () { mode.world.balls.forEach(b => b.stop()); mode.shot = null; mode.aim = null; mode.aimStart = null; mode.drag = null; mode.picked = null; mode.timeScale = 1; };

  mode.setLevel = function (lv) {
    clearTimeout(mode.rewardTimer); // 다른 단계로 넘어가면 예약된 축하 카드는 취소
    mode.stopAll();
    mode.level = lv === 'predict' ? 'predict' : Number(lv);
    mode.trail = []; mode.marks = [];
    mode.el.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.level === String(lv)));
    if (mode.level === 'predict') {
      mode.world.balls = [mode.cue];
      mode.cue.x = 50; mode.cue.y = 50; // 예측 놀이는 늘 같은 자리에서 시작
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
    mode.el.stars.querySelectorAll('span').forEach(sp => { const on = !!mode.stars[Number(sp.dataset.star)]; sp.classList.toggle('on', on); sp.textContent = on ? '★' : '☆'; });
    mode.el.tabs.querySelectorAll('button[data-level]').forEach(b => {
      const lv = Number(b.dataset.level);
      if (lv) b.textContent = (mode.stars[lv] ? '★ ' : '☆ ') + lv + '쿠션';
    });
  };
  mode.setAngles = function (on) {
    mode.showAngles = on;
    mode.el.angles.classList.toggle('on', on);
    mode.el.angles.textContent = on ? '📐 각도 끄기' : '📐 각도 보기';
    if (on) global.App.msg('📐 쿠션에 들어간 각(주황)과 나온 각(초록)은 항상 같아요. 쳐서 확인해 보세요!');
  };
  mode.setMirror = function (on) {
    mode.mirror = on;
    mode.el.mirror.textContent = on ? '🪞 거울 끄기' : '🪞 거울 켜기';
    mode.el.mirror.classList.toggle('on', on);
    if (on && typeof mode.level === 'number') global.App.msg(`🪞 쿠션 너머는 거울 세계! 휘는 길이 거울 세계에선 직선이에요. 숫자 ${mode.level} 그림자를 향해 똑바로 쳐 보세요`);
    else if (!on && typeof mode.level === 'number') global.App.msg(LEVEL_MSG[mode.level]);
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
    global.App.sound.shoot(speed / 420);
    mode.shot = { cushions: 0, hitRed: false, done: false, udx: dx, udy: dy, ti: 0, tj: 0, ghostFrozen: null, ghostStart: { x: mode.cue.x, y: mode.cue.y }, ghostPts: [{ x: { x: mode.cue.x, y: mode.cue.y }, k: 0 }] };
    mode.trail = [{ x: mode.cue.x, y: mode.cue.y, k: 0 }]; mode.marks = [];
    mode.tick = 0;
    if (mode.level !== 'predict') global.App.msg('공이 굴러가요…');
  };
  mode.replay = function () {
    if (!mode.lastShot || mode.world.anyMoving()) return;
    mode.world.restore(mode.lastShot.snap);
    mode.timeScale = 0.5;
    mode.shoot(mode.lastShot.dx, mode.lastShot.dy, mode.lastShot.speed);
    global.App.msg('🐢 천천히 다시 보기');
  };
  mode.judge = function () {
    const need = mode.level, got = mode.shot.cushions;
    if (got === need) {
      const isNew = !mode.stars[need];
      mode.stars[need] = true; mode.updateTabs();
      global.App.msg(`성공! 쿠션 ${got}번 → 빨간 공 🎯  ★ 획득!`, 'good');
      global.App.sound.success(); global.App.sound.star();
      mode.confetti = { t: 0, parts: makeConfetti(mode.cue.x, mode.cue.y, isNew ? 140 : 50) };
      if (isNew) { clearTimeout(mode.rewardTimer); mode.rewardTimer = setTimeout(() => { if (mode.level === need) mode.showReward(need); }, 900); }
    } else {
      global.App.msg(`빨간 공은 맞혔지만 쿠션은 ${got}번이었어요 (목표 ${need}번)`, 'bad');
      global.App.sound.fail();
    }
    mode.shot.done = true;
    mode.timeScale = 1; // 다시 보기 중이었다면 명중 이후엔 정상 속도
  };

  /* ---------- 별 보상 ---------- */
  function makeConfetti(x, y, n) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 110;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, vr: (Math.random() - 0.5) * 12, rot: Math.random() * Math.PI, w: 2 + Math.random() * 2.5, h: 1.2 + Math.random() * 1.5, color: `hsl(${Math.floor(Math.random() * 360)},95%,62%)` });
    }
    return parts;
  }
  mode.starCount = () => [1, 2, 3].filter(l => mode.stars[l]).length;
  mode.showReward = function (level) {
    const el = mode.el, count = mode.starCount(), all = count === 3;
    el.rewardStars.innerHTML = [1, 2, 3].map(l => mode.stars[l] ? '<b>★</b>' : '☆').join('');
    el.reward.querySelector('.box').classList.toggle('master', all);
    if (all) {
      el.rewardIcon.textContent = '🏆';
      el.rewardTitle.textContent = '당구 마스터!';
      el.rewardSub.textContent = '별 세 개를 모두 모았어요!\n대칭의 원리로 3쿠션까지 성공한 진짜 고수예요.';
      el.rewardNext.textContent = '🎯 예측 놀이 해보기';
      el.rewardStay.textContent = '처음부터 다시';
      mode.confetti = { t: 0, parts: makeConfetti(W / 2, H / 2, 260) };
      global.App.sound.win();
    } else {
      el.rewardIcon.textContent = '⭐';
      el.rewardTitle.textContent = `${level}쿠션 성공!`;
      el.rewardSub.textContent = count === 1 ? '첫 번째 별이에요! 별 세 개를 모으면 당구 마스터!' : `별 ${count}개! 하나만 더 모으면 당구 마스터!`;
      const next = [1, 2, 3].find(l => !mode.stars[l]);
      el.rewardNext.textContent = next ? `다음 도전: ${next}쿠션 →` : '다음 도전 →';
      el.rewardStay.textContent = '계속 연습';
    }
    el.reward.classList.add('active');
  };
  mode.rewardNextAction = function () {
    if (mode.starCount() === 3) { mode.setLevel('predict'); return; }
    const next = [1, 2, 3].find(l => !mode.stars[l]);
    if (next) mode.setLevel(next);
  };

  /* ---------- 예측 놀이 ---------- */
  mode.startPredict = function () {
    mode.stopAll();
    mode.predict = { state: 'aim', dir: null, marker: null, actual: null };
    mode.trail = []; mode.marks = [];
    mode.el.fire.hidden = true; mode.el.reaim.hidden = true;
    if (!mode.world.boundary.contains(mode.cue.x, mode.cue.y, BR)) { mode.cue.x = 50; mode.cue.y = 50; }
    global.App.msg('① 새총처럼 당겼다 놓아 방향을 정하세요');
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
    if (d <= 6) { text = '딱 맞았어요! 🎯 거울처럼 튀는 걸 알아냈네요'; global.App.sound.tada(); }
    else if (d <= 15) { text = '거의 맞았어요! 👍 조금만 더 거울처럼 생각해 봐요'; global.App.sound.nice(); }
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
    if (b && b !== mode.cue && !mode.picked) { mode.drag = { ball: b, offx: b.x - p.x, offy: b.y - p.y }; return; }
    mode.pressedBall = b; mode.aimStart = p; mode.aim = p; mode.downAt = performance.now();
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
    const a = global.App.aimDrag(mode.aimStart, p, W);
    const pressed = mode.pressedBall; mode.aim = null; mode.aimStart = null; mode.pressedBall = null;
    if (!a) { // 톡 누름: 공 집기 / 놓기
      if (mode.picked) { mode.placePicked(p); return; }
      if (pressed) { mode.picked = pressed; global.App.msg(`${pressed === mode.cue ? '흰' : '빨간'} 공을 집었어요. 놓을 곳을 누르세요`); global.App.sound.tap(); }
      return;
    }
    if (mode.picked) mode.picked = null;
    if (mode.predict && mode.predict.state === 'aim') {
      mode.predict.dir = { dx: a.dx, dy: a.dy }; mode.lastDir = mode.predict.dir;
      mode.predict.state = 'predict';
      mode.el.reaim.hidden = false; mode.el.reaim.textContent = '↩ 방향 다시';
      global.App.msg('② 공이 두 번째로 쿠션에 닿을 곳을 찍어 보세요');
      return;
    }
    mode.lastDir = { dx: a.dx, dy: a.dy };
    mode.shoot(a.dx, a.dy, speedFromPower(a.power));
  };

  mode.placePicked = function (p) {
    const b = mode.picked, q = mode.world.boundary.clamp(p.x, p.y, BR);
    if (Math.hypot(q.x - b.x, q.y - b.y) < BR * 1.8) { mode.picked = null; global.App.msg(mode.predict ? '① 새총처럼 당겼다 놓아 방향을 정하세요' : LEVEL_MSG[mode.level]); return; } // 제자리 → 취소
    if (mode.world.overlapsAny(q.x, q.y, BR, b)) { global.App.msg('거긴 다른 공이 있어요. 다른 곳을 누르세요'); return; }
    b.x = q.x; b.y = q.y; mode.picked = null; mode.trail = []; mode.marks = [];
    global.App.sound.tap();
    global.App.msg(mode.predict ? '① 새총처럼 당겼다 놓아 방향을 정하세요' : LEVEL_MSG[mode.level]);
  };

  /* ---------- 업데이트 ---------- */
  mode.update = function (dt) {
    const world = mode.world;
    const wasMoving = world.anyMoving();
    world.step(dt);
    if (mode.shot) {
      mode.tick = (mode.tick || 0) + 1;
      if (mode.tick % 4 === 0 && mode.cue.moving) mode.trail.push({ x: mode.cue.x, y: mode.cue.y, k: mode.shot.cushions });
      if (wasMoving && !world.anyMoving()) {
        mode.trail.push({ x: mode.cue.x, y: mode.cue.y, k: mode.shot.cushions });
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
    if (mode.confetti) { const c = mode.confetti; c.t += dt; for (const p of c.parts) { p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; } if (c.t > 2.4) mode.confetti = null; }
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

  /* 조준 방향으로 쿠션에 maxSeg번 튕기는 실제 경로(접힌 길). 빨간 공에 닿으면 거기서 끝 */
  mode.foldedPath = function (dx, dy, maxSeg) {
    const world = mode.world, segs = [];
    let p = { x: mode.cue.x, y: mode.cue.y, r: BR }, hitRed = false;
    for (let k = 0; k <= maxSeg; k++) {
      const hit = world.castRay(p, dx, dy);
      if (!hit) break;
      segs.push({ x0: p.x, y0: p.y, x1: hit.x, y1: hit.y, k });
      if (hit.kind === 'ball') { hitRed = true; break; }
      const vn = dx * hit.nx + dy * hit.ny; dx -= 2 * vn * hit.nx; dy -= 2 * vn * hit.ny;
      p = { x: hit.x + dx * 0.01, y: hit.y + dy * 0.01, r: BR };
    }
    return { segs, hitRed };
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
        ctx.globalAlpha = n === L ? 0.7 : 0.42;
        ctx.fillStyle = '#3a8a5a';
        ctx.fillRect(BR + i * w, BR + j * h, w, h);
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#b98a55'; ctx.lineWidth = 1.6;
        ctx.strokeRect(BR + i * w, BR + j * h, w, h);
        ctx.restore();
        const im = imageOf(mode.red, i, j);
        ctx.save(); ctx.globalAlpha = n === L ? 1 : 0.3;
        R.drawBall(ctx, { x: im.x, y: im.y, r: BR, color: '#e0362c', number: null }, { glow: n === L ? '#ffe066' : null });
        if (n === L) { const pulse = 1 + 0.15 * Math.sin(t * 5); ctx.beginPath(); ctx.arc(im.x, im.y, BR * 2.2 * pulse, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,224,102,.7)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]); }
        R.drawText(ctx, String(n), im.x, im.y - BR * 2.6, n === L ? 9 : 6.5, n === L ? '#ffe066' : '#fff');
        ctx.restore();
      }
    }
    R.drawRectTable(ctx, W, H, { cloth: '#2c8a4a' });

    // 지난 경로
    if (mode.trail.length > 1) {
      ctx.save(); ctx.lineWidth = mode.mirror ? 2 : 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < mode.trail.length; i++) {
        const a = mode.trail[i - 1], b = mode.trail[i];
        ctx.strokeStyle = SEG_COLORS[Math.min(a.k || 0, SEG_COLORS.length - 1)];
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    }
    for (const m of mode.marks) { R.drawBurst(ctx, m.x, m.y, m.n == null ? 2.5 : 4, m.n == null ? 'rgba(255,224,102,.55)' : '#ffe066'); if (m.n != null) R.drawText(ctx, String(m.n), m.x + (m.x < W / 2 ? 7 : -7), m.y + (m.y < H / 2 ? 7 : -7), 6, '#ffe066'); }

    if (mode.showAngles) { const m = mode.marks[0]; if (m && m.din) R.drawAngles(ctx, m.cx, m.cy, m.nx, m.ny, m.din, m.out, { rim: { x: m.x, y: m.y }, ballR: BR }); } // 첫 번째 쿠션만
    // 조준선
    if (mode.aim && !world.anyMoving()) {
      const a = global.App.aimDrag(mode.aimStart, mode.aim, W);
      if (a && mode.showAngles && !(mode.mirror && L) && !mode.marks.length) { // 첫 번째 튕김의 각도를 미리 보여준다
        const hit = world.castRay(mode.cue, a.dx, a.dy);
        if (hit && hit.kind === 'wall') { const vn = a.dx * hit.nx + a.dy * hit.ny; R.drawAngles(ctx, hit.x, hit.y, hit.nx, hit.ny, { x: a.dx, y: a.dy }, { x: a.dx - 2 * vn * hit.nx, y: a.dy - 2 * vn * hit.ny }, { rim: { x: hit.x - hit.nx * BR, y: hit.y - hit.ny * BR }, ballR: BR }); }
      }
      if (a) {
        if (mode.mirror && L) {
          // 두 길을 같은 색 구간으로: 진짜 테이블엔 접힌 길, 거울 세계엔 곧은 길
          const fp = mode.foldedPath(a.dx, a.dy, L);
          ctx.save(); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.setLineDash([4, 3]);
          let sx = mode.cue.x, sy = mode.cue.y;
          for (const s of fp.segs) {
            const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
            ctx.strokeStyle = SEG_COLORS[Math.min(s.k, SEG_COLORS.length - 1)];
            ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke();                     // 접힌 길
            ctx.beginPath(); ctx.moveTo(sx, sy); sx += a.dx * len; sy += a.dy * len; ctx.lineTo(sx, sy); ctx.stroke(); // 곧은 길
          }
          if (!fp.hitRed) { ctx.strokeStyle = 'rgba(34,48,71,.35)'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + a.dx * W, sy + a.dy * W); ctx.stroke(); }
          ctx.setLineDash([]);
          if (fp.hitRed) { ctx.beginPath(); ctx.arc(sx, sy, BR, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill(); }
          ctx.restore();
        } else R.drawAimLine(ctx, mode.cue, a.dx, a.dy, world.castRay(mode.cue, a.dx, a.dy));
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
          R.drawAimLine(ctx, mode.cue, p.dir.dx, p.dir.dy, hit);
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
    // 큐: 공이 멈춰 있을 때 항상 보인다. 조준 중엔 방향을 따라 돌고 세기만큼 뒤로 당겨진다
    if (!world.anyMoving() && !mode.drag && !(mode.predict && (mode.predict.state === 'shooting' || mode.predict.state === 'result'))) {
      let dir = null, pull = 3 + Math.sin(t * 2.5) * 1.5;
      const a = mode.aim ? global.App.aimDrag(mode.aimStart, mode.aim, W) : null;
      if (a) { dir = a; pull = 4 + a.power * 16; }
      else if (mode.predict && mode.predict.dir) dir = mode.predict.dir;
      else if (mode.lastDir) dir = mode.lastDir;
      else if (!mode.predict) { const dx = mode.red.x - mode.cue.x, dy = mode.red.y - mode.cue.y, l = Math.hypot(dx, dy) || 1; dir = { dx: dx / l, dy: dy / l }; }
      else dir = { dx: 0.8, dy: -0.6 };
      R.drawCue(ctx, mode.cue.x, mode.cue.y, dir.dx, dir.dy, pull, BR);
    }
    if (mode.mirror && L && mode.shot && mode.shot.ghostStart) {
      const g = mode.shot.ghostFrozen || imageOf(mode.cue, mode.shot.ti, mode.shot.tj);
      ctx.save(); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.setLineDash([4, 3]);
      const gp = mode.shot.ghostPts;
      for (let i = 0; i <= gp.length - 1; i++) {
        const a = gp[i].x, b = i + 1 < gp.length ? gp[i + 1].x : g;
        ctx.strokeStyle = SEG_COLORS[Math.min(gp[i].k, SEG_COLORS.length - 1)];
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 0.55;
      R.drawBall(ctx, { x: g.x, y: g.y, r: BR, color: '#ffffff', number: null });
      ctx.restore();
    }
    for (const b of world.balls) R.drawBall(ctx, b, { glow: b === mode.picked ? 'rgba(255,255,255,.95)' : null });
    if (mode.picked) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(mode.picked.x, mode.picked.y, BR * 2 + Math.sin(t * 5), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (mode.confetti) {
      const c = mode.confetti; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (c.t - 1.4) / 1);
      for (const p of c.parts) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
      ctx.restore();
    }
  };

  global.App.modes.rect = mode;
})(window);
