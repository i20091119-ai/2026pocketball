/* mode-ellipse.js — 타원 당구대 마법: 초점에서 치면 반드시 맞는다, 거리 막대, 불꽃놀이, 원↔타원 슬라이더 */
(function (global) {
  'use strict';
  const { Ball, EllipseBoundary, World, speedFromPower } = global.Physics;
  const R = global.Render;

  const A = 100, BR = 5, SNAP = 8;
  const RAY_COUNT = 60;

  const mode = {
    id: 'ellipse', timeScale: 1,
    world: null, yellow: null, red: null,
    aim: null, drag: null, downAt: 0, showAngles: false,
    shot: null, lastShot: null,
    trail: [], oldTrails: [], marks: [],
    history: [],
    rays: null,     // { lines:[{pts,len,hue}], progress }
    el: {},
  };

  mode.init = function () {
    const world = new World(new EllipseBoundary(A, 60));
    mode.yellow = new Ball({ id: 'yellow', x: 0, y: 0, r: BR, color: '#f5c518' });
    mode.red = new Ball({ id: 'red', x: 0, y: 0, r: BR, color: '#e0362c' });
    world.balls = [mode.yellow, mode.red];
    world.onCushion = (b, hit) => {
      if (b === mode.yellow && mode.shot) {
        const s = mode.shot;
        if (!s.hitRed) { s.dist += Math.hypot(hit.cx - s.px, hit.cy - s.py); s.px = hit.cx; s.py = hit.cy; }
        const sp = b.speed || 1, out = { x: b.vx / sp, y: b.vy / sp }, vn = out.x * hit.nx + out.y * hit.ny;
        hit.din = { x: out.x - 2 * vn * hit.nx, y: out.y - 2 * vn * hit.ny }; hit.out = out;
        mode.marks.push(hit); mode.trail.push({ x: hit.cx, y: hit.cy });
      }
      global.App.sound.cushion(b.speed / 420);
    };
    world.onBallHit = (a, b) => {
      global.App.sound.click(Math.max(a.speed, b.speed) / 420);
      if (mode.shot && !mode.shot.hitRed) {
        const s = mode.shot; s.dist += Math.hypot(mode.yellow.x - s.px, mode.yellow.y - s.py); s.px = mode.yellow.x; s.py = mode.yellow.y;
        mode.shot.hitRed = true;
        mode.timeScale = 1; // 다시 보기 중이었다면 명중 이후엔 정상 속도
        mode.trail.push({ x: mode.yellow.x, y: mode.yellow.y });
        mode.recordDistance(mode.shot.dist);
      }
    };
    mode.world = world;

    const $ = id => document.getElementById(id);
    mode.el = { reset: $('ellipse-reset'), rays: $('ellipse-rays'), replay: $('ellipse-replay'), shape: $('ellipse-shape'), bars: $('ellipse-bars'), angles: $('ellipse-angles') };
    mode.el.angles.addEventListener('click', () => { mode.showAngles = !mode.showAngles; mode.el.angles.classList.toggle('on', mode.showAngles); mode.el.angles.textContent = mode.showAngles ? '📐 각도 끄기' : '📐 각도 보기'; if (mode.showAngles) global.App.msg('📐 곡선에서도 거울(접선) 기준으로 들어간 각(주황)과 나온 각(초록)이 같아요'); });
    mode.el.reset.addEventListener('click', () => mode.placeOnFoci());
    mode.el.rays.addEventListener('click', () => mode.startRays());
    mode.el.replay.addEventListener('click', () => mode.replay());
    mode.el.shape.addEventListener('input', () => mode.setShape(Number(mode.el.shape.value)));
    mode.placeOnFoci();
  };

  mode.enter = function () { mode.timeScale = 1; mode.rays = null; global.App.msg('새총처럼 당겼다 놓아 노란 공을 아무 방향으로나 쳐 보세요. 빨간 공에 맞을까요?'); };
  mode.leave = function () { mode.world.balls.forEach(b => b.stop()); mode.shot = null; mode.aim = null; mode.aimStart = null; mode.drag = null; mode.picked = null; mode.timeScale = 1; };
  mode.reset = function () { mode.history = []; mode.renderBars(); mode.oldTrails = []; mode.setShape(60); mode.el.shape.value = 60; mode.placeOnFoci(); };

  mode.placeOnFoci = function () {
    if (mode.world.anyMoving()) return;
    const [f1, f2] = mode.world.boundary.foci();
    mode.yellow.x = f1.x; mode.yellow.y = f1.y; mode.red.x = f2.x; mode.red.y = f2.y;
    mode.yellow.stop(); mode.red.stop();
    mode.trail = []; mode.marks = []; mode.rays = null; mode.shot = null;
    global.App.msg('두 공이 마법의 점 위에 있어요. 노란 공을 아무 방향으로나 쳐 보세요!');
  };
  mode.setShape = function (b) {
    if (mode.world.anyMoving()) return;
    b = Math.max(45, Math.min(96, b)); // 완전한 원이 되면 두 초점이 겹쳐 공 두 개를 놓을 수 없으므로 여기서 멈춘다
    const wasY = mode.onFocus(mode.yellow), wasR = mode.onFocus(mode.red);
    mode.world.boundary.set(A, b);
    const [f1, f2] = mode.world.boundary.foci();
    if (wasY !== null) { const f = wasY === 0 ? f1 : f2; mode.yellow.x = f.x; mode.yellow.y = f.y; }
    else { const p = mode.world.boundary.clamp(mode.yellow.x, mode.yellow.y); mode.yellow.x = p.x; mode.yellow.y = p.y; }
    if (wasR !== null) { const f = wasR === 0 ? f1 : f2; mode.red.x = f.x; mode.red.y = f.y; }
    else { const p = mode.world.boundary.clamp(mode.red.x, mode.red.y); mode.red.x = p.x; mode.red.y = p.y; }
    mode.trail = []; mode.oldTrails = []; mode.marks = []; mode.rays = null;
    mode.history = []; mode.renderBars();
    const c = mode.world.boundary.c;
    global.App.msg(c < 35 ? '동그라미에 가까워지니 마법의 점 두 개가 가운데로 모여요' : '납작할수록 마법의 점이 멀어져요');
  };
  /* 공이 어느 초점 위에 있는지 (0, 1) 아니면 null */
  mode.onFocus = function (ball) {
    const f = mode.world.boundary.foci();
    for (let i = 0; i < 2; i++) if (Math.hypot(ball.x - f[i].x, ball.y - f[i].y) < 0.6) return i;
    return null;
  };

  mode.recordDistance = function (d) {
    mode.history.push(Math.round(d));
    if (mode.history.length > 6) mode.history.shift();
    mode.renderBars();
    const same = mode.history.length >= 2 && mode.history.every(v => Math.abs(v - mode.history[0]) <= 5);
    const focusY = mode.onFocusSnap(mode.lastShot.from);
    if (focusY) {
      global.App.msg(same ? `빨간 공 맞힘! 🎯 굴러간 거리 ${Math.round(d)} — 방향이 달라도 거리가 똑같아요!` : `빨간 공 맞힘! 🎯 굴러간 거리 ${Math.round(d)}`, 'good');
      global.App.sound.success();
    } else {
      global.App.msg(`빨간 공 맞힘! 굴러간 거리 ${Math.round(d)}`, 'good');
    }
  };
  mode.onFocusSnap = function (p) {
    return mode.world.boundary.foci().some(f => Math.hypot(p.x - f.x, p.y - f.y) < 0.6);
  };
  mode.renderBars = function () {
    const el = mode.el.bars; el.innerHTML = '';
    const max = 2 * A * 1.3;
    const title = document.createElement('div'); title.className = 'label'; title.textContent = '굴러간 거리 (빨간 공에 닿을 때까지)'; el.appendChild(title);
    if (!mode.history.length) { const e = document.createElement('div'); e.className = 'row dim'; e.textContent = '아직 기록이 없어요'; el.appendChild(e); return; }
    mode.history.slice().reverse().forEach((v, i) => {
      const row = document.createElement('div'); row.className = 'row' + (i === 0 ? ' latest' : '');
      const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = Math.min(100, v / max * 100) + '%';
      const num = document.createElement('span'); num.textContent = v;
      row.appendChild(fill); row.appendChild(num); el.appendChild(row);
    });
  };

  /* ---------- 샷 ---------- */
  mode.shoot = function (dx, dy, speed) {
    mode.lastShot = { snap: mode.world.snapshot(), dx, dy, speed, from: { x: mode.yellow.x, y: mode.yellow.y } };
    mode.yellow.vx = dx * speed; mode.yellow.vy = dy * speed;
    global.App.sound.shoot(speed / 420);
    if (mode.trail.length > 1) { mode.oldTrails.push(mode.trail); if (mode.oldTrails.length > 5) mode.oldTrails.shift(); }
    mode.shot = { dist: 0, hitRed: false, px: mode.yellow.x, py: mode.yellow.y };
    mode.trail = [{ x: mode.yellow.x, y: mode.yellow.y }]; mode.marks = []; mode.rays = null; mode.tick = 0;
    global.App.msg('공이 굴러가요…');
  };
  mode.replay = function () {
    if (!mode.lastShot || mode.world.anyMoving()) return;
    mode.world.restore(mode.lastShot.snap);
    mode.timeScale = 0.5;
    mode.shoot(mode.lastShot.dx, mode.lastShot.dy, mode.lastShot.speed);
    global.App.msg('🐢 천천히 다시 보기');
  };

  /* ---------- 불꽃놀이: 점 광선 60개를 6a 길이만큼 반사시켜 그린다 ---------- */
  mode.startRays = function () {
    if (mode.world.anyMoving()) return;
    const bd = mode.world.boundary, ox = mode.yellow.x, oy = mode.yellow.y;
    const total = 6 * A, lines = [];
    for (let k = 0; k < RAY_COUNT; k++) {
      const ang = (k / RAY_COUNT) * Math.PI * 2;
      let x = ox, y = oy, dx = Math.cos(ang), dy = Math.sin(ang), left = total;
      const pts = [{ x, y }];
      for (let n = 0; n < 40 && left > 0; n++) {
        const t = bd.rayT(x, y, dx, dy);
        if (t === null || t < 1e-6) break;
        if (t >= left) { pts.push({ x: x + dx * left, y: y + dy * left }); left = 0; break; }
        x += dx * t; y += dy * t; left -= t; pts.push({ x, y });
        const nrm = bd.normalAt(x, y);
        const vn = dx * nrm.nx + dy * nrm.ny;
        dx -= 2 * vn * nrm.nx; dy -= 2 * vn * nrm.ny;
        const p = bd.clamp(x, y); x = p.x; y = p.y;
      }
      lines.push({ pts, len: total, hue: (k / RAY_COUNT) * 360 });
    }
    mode.rays = { lines, progress: 0, fromFocus: mode.onFocusSnap({ x: ox, y: oy }) };
    mode.trail = []; mode.marks = [];
    global.App.sound.whoosh();
    global.App.msg('🌈 60방향으로 동시에 쏘면 어디로 갈까요?');
  };

  /* ---------- 입력 ---------- */
  mode.onDown = function (p) {
    if (mode.world.anyMoving()) return;
    const b = mode.world.ballAt(p.x, p.y, 1.8);
    if (b && b !== mode.yellow && !mode.picked) { mode.drag = { ball: b, offx: b.x - p.x, offy: b.y - p.y }; return; }
    mode.pressedBall = b; mode.aimStart = p; mode.aim = p; mode.downAt = performance.now();
  };
  mode.onMove = function (p) {
    if (mode.drag) {
      const b = mode.drag.ball;
      let q = mode.world.boundary.clamp(p.x + mode.drag.offx, p.y + mode.drag.offy);
      for (const f of mode.world.boundary.foci()) if (Math.hypot(q.x - f.x, q.y - f.y) < SNAP) q = { x: f.x, y: f.y };
      if (!mode.world.overlapsAny(q.x, q.y, BR, b)) { b.x = q.x; b.y = q.y; }
      mode.trail = []; mode.marks = []; mode.rays = null;
      return;
    }
    if (mode.aim) mode.aim = p;
  };
  mode.onUp = function (p) {
    if (mode.drag) {
      const b = mode.drag.ball; mode.drag = null;
      if (mode.onFocus(b) !== null) global.App.sound.snap();
      if (mode.onFocus(b) !== null) global.App.msg(b === mode.yellow ? '노란 공이 마법의 점 위에 올라갔어요 ✨' : '빨간 공이 마법의 점 위에 올라갔어요 ✨');
      else global.App.msg(b === mode.yellow ? '마법의 점이 아닌 곳이에요. 여기서 치면 어떻게 될까요?' : '빨간 공이 마법의 점을 벗어났어요');
      return;
    }
    if (!mode.aim) return;
    const a = global.App.aimDrag(mode.aimStart, p, 2 * A);
    const pressed = mode.pressedBall; mode.aim = null; mode.aimStart = null; mode.pressedBall = null;
    if (!a) {
      if (mode.picked) { mode.placePicked(p); return; }
      if (pressed) { mode.picked = pressed; global.App.msg(`${pressed === mode.yellow ? '노란' : '빨간'} 공을 집었어요. 놓을 곳을 누르세요 (마법의 점 근처면 딱 붙어요)`); global.App.sound.tap(); }
      return;
    }
    if (mode.picked) mode.picked = null;
    mode.lastDir = { dx: a.dx, dy: a.dy };
    mode.shoot(a.dx, a.dy, Math.max(200, speedFromPower(a.power)));
  };

  mode.placePicked = function (p) {
    const b = mode.picked;
    let q = mode.world.boundary.clamp(p.x, p.y);
    for (const f of mode.world.boundary.foci()) if (Math.hypot(q.x - f.x, q.y - f.y) < SNAP) q = { x: f.x, y: f.y };
    if (Math.hypot(q.x - b.x, q.y - b.y) < BR * 1.8) { mode.picked = null; global.App.msg('그대로 두었어요'); return; }
    if (mode.world.overlapsAny(q.x, q.y, BR, b)) { global.App.msg('거긴 다른 공이 있어요. 다른 곳을 누르세요'); return; }
    b.x = q.x; b.y = q.y; mode.picked = null; mode.trail = []; mode.marks = []; mode.rays = null;
    if (mode.onFocus(b) !== null) { global.App.sound.snap(); global.App.msg(b === mode.yellow ? '노란 공이 마법의 점 위에 올라갔어요 ✨' : '빨간 공이 마법의 점 위에 올라갔어요 ✨'); }
    else { global.App.sound.tap(); global.App.msg(b === mode.yellow ? '마법의 점이 아닌 곳이에요. 여기서 치면 어떻게 될까요?' : '빨간 공이 마법의 점을 벗어났어요'); }
  };

  /* ---------- 업데이트 ---------- */
  mode.update = function (dt) {
    const world = mode.world;
    const wasMoving = world.anyMoving();
    world.step(dt);
    if (mode.shot) {
      const s = mode.shot;
      if (!s.hitRed) { s.dist += Math.hypot(mode.yellow.x - s.px, mode.yellow.y - s.py); s.px = mode.yellow.x; s.py = mode.yellow.y; }
      mode.tick = (mode.tick || 0) + 1;
      if (mode.tick % 4 === 0 && mode.yellow.moving) mode.trail.push({ x: mode.yellow.x, y: mode.yellow.y });
      if (wasMoving && !world.anyMoving()) {
        mode.trail.push({ x: mode.yellow.x, y: mode.yellow.y });
        if (!s.hitRed) { global.App.msg('빨간 공을 못 맞혔어요. 노란 공이 마법의 점 위에 있었나요?', 'bad'); global.App.sound.fail(); }
        mode.shot = null; mode.timeScale = 1;
      }
    }
    if (mode.rays && mode.rays.progress < 1) {
      mode.rays.progress = Math.min(1, mode.rays.progress + dt / 2.6);
      if (Math.random() < 0.25) global.App.sound.sparkle();
      if (mode.rays.progress >= 1) {
        if (mode.rays.fromFocus) global.App.sound.star();
        global.App.msg(mode.rays.fromFocus ? '전부 다른 마법의 점을 지나갔어요! 어느 방향이든 똑같아요' : '마법의 점이 아니면 이렇게 흩어져요. 무늬가 보이나요?');
      }
    }
  };

  mode.worldRect = function () { const bd = mode.world.boundary, m = BR + 14; return { x: -A - m, y: -bd.b - m, w: 2 * (A + m), h: 2 * (bd.b + m) }; };

  /* ---------- 렌더 ---------- */
  mode.render = function (ctx, t) {
    const world = mode.world, bd = world.boundary;
    R.drawEllipseTable(ctx, bd.a, bd.b, BR);
    // 장축(살짝)
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-bd.a, 0); ctx.lineTo(bd.a, 0); ctx.stroke(); ctx.restore();
    // 초점
    const foci = bd.foci();
    foci.forEach((f, i) => {
      const occupied = world.balls.some(b => Math.hypot(b.x - f.x, b.y - f.y) < 0.6);
      R.drawFocus(ctx, f.x, f.y, t + i, occupied);
    });
    // 불꽃놀이
    if (mode.rays) {
      ctx.save(); ctx.lineWidth = 0.7; ctx.lineCap = 'round'; ctx.globalAlpha = 0.85;
      for (const ln of mode.rays.lines) {
        let left = ln.len * mode.rays.progress;
        ctx.strokeStyle = `hsl(${ln.hue},95%,65%)`; ctx.beginPath(); ctx.moveTo(ln.pts[0].x, ln.pts[0].y);
        for (let i = 1; i < ln.pts.length && left > 0; i++) {
          const a = ln.pts[i - 1], b = ln.pts[i]; const seg = Math.hypot(b.x - a.x, b.y - a.y);
          if (seg <= left) { ctx.lineTo(b.x, b.y); left -= seg; }
          else { const k = left / seg; ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k); left = 0; }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // 예전 경로
    for (const tr of mode.oldTrails) R.drawTrail(ctx, tr, 'rgba(255,255,255,.28)', 0.9);
    R.drawTrail(ctx, mode.trail, 'rgba(255,255,255,.9)', 1.2);
    for (const m of mode.marks) R.drawBurst(ctx, m.x, m.y, 4, '#ffe066');
    if (mode.showAngles) for (const m of mode.marks) if (m.din) R.drawAngles(ctx, m.cx, m.cy, m.nx, m.ny, m.din, m.out, { tangent: true });
    // 조준선
    if (mode.aim && !world.anyMoving()) {
      const a = global.App.aimDrag(mode.aimStart, mode.aim, 2 * A);
      if (a && mode.showAngles) {
        const hit = world.castRay(mode.yellow, a.dx, a.dy);
        if (hit && hit.kind === 'wall') { const vn = a.dx * hit.nx + a.dy * hit.ny; R.drawAngles(ctx, hit.x, hit.y, hit.nx, hit.ny, { x: a.dx, y: a.dy }, { x: a.dx - 2 * vn * hit.nx, y: a.dy - 2 * vn * hit.ny }, { tangent: true }); }
      }
      if (a) {
        R.drawAimLine(ctx, mode.yellow, a.dx, a.dy, world.castRay(mode.yellow, a.dx, a.dy));
      }
    }
    if (!world.anyMoving() && !mode.drag && !(mode.rays && mode.rays.progress < 1)) {
      let dir = null, pull = 3 + Math.sin(t * 2.5) * 1.5;
      const a = mode.aim ? global.App.aimDrag(mode.aimStart, mode.aim, 2 * A) : null;
      if (a) { dir = a; pull = 4 + a.power * 16; }
      else if (mode.lastDir) dir = mode.lastDir;
      else { const dx = mode.red.x - mode.yellow.x, dy = mode.red.y - mode.yellow.y, l = Math.hypot(dx, dy) || 1; dir = { dx: dx / l, dy: dy / l }; }
      R.drawCue(ctx, mode.yellow.x, mode.yellow.y, dir.dx, dir.dy, pull, BR);
    }
    for (const b of world.balls) R.drawBall(ctx, b, { glow: b === mode.picked ? 'rgba(255,255,255,.95)' : (mode.onFocus(b) !== null ? 'rgba(255,230,120,.9)' : null) });
    if (mode.picked) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(mode.picked.x, mode.picked.y, BR * 2 + Math.sin(t * 5), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  };

  global.App.modes.ellipse = mode;
})(window);
