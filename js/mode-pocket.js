/* mode-pocket.js — 포켓볼 대결: 2인 교대, 점수 모드 / 8볼 모드 */
(function (global) {
  'use strict';
  const { Ball, RectBoundary, World, speedFromPower } = global.Physics;
  const R = global.Render;

  const W = 200, H = 100, BR = 5;
  const P_NAME = ['🔵 1번 친구', '🔴 2번 친구'];

  const mode = {
    id: 'pocket', timeScale: 1,
    world: null, cue: null,
    phase: 'setup',      // setup | play | over
    opts: { mode: 'score', balls: 15, turnSec: 0, gameSec: 0, first: 0 },
    players: [], turn: 0, ballInHand: false,
    shot: null, aim: null, drag: null, downAt: 0,
    aimLine: true, mirror: false,
    turnLeft: 0, gameLeft: 0,
    el: {},
  };

  mode.init = function () {
    const world = new World(new RectBoundary(W, H));
    const cr = BR * 2.2, sr = BR * 1.7;
    world.pockets = [
      { x: 0, y: 0, r: cr }, { x: W, y: 0, r: cr }, { x: 0, y: H, r: cr }, { x: W, y: H, r: cr },
      { x: W / 2, y: -1.5, r: sr }, { x: W / 2, y: H + 1.5, r: sr },
    ];
    world.onCushion = (b) => global.App.sound.cushion(b.speed / 420);
    world.onBallHit = (a, b) => { global.App.sound.click(Math.max(a.speed, b.speed) / 420); if (mode.shot) mode.shot.contact = true; };
    world.onPocket = (b) => {
      global.App.sound.pocket();
      if (!mode.shot) return;
      if (b === mode.cue) mode.shot.cueFoul = true; else mode.shot.pocketed.push(b);
    };
    mode.world = world;

    const $ = id => document.getElementById(id);
    mode.el = {
      setup: $('pocket-setup'), over: $('pocket-over'), overText: $('pocket-over-text'),
      turn: $('pocket-turn'), score: $('pocket-score'), timer: $('pocket-timer'),
      aimBtn: $('pocket-aimline'), mirrorBtn: $('pocket-mirror'), newBtn: $('pocket-new'),
      start: $('pocket-start'), again: $('pocket-again'),
    };
    mode.el.setup.querySelectorAll('.seg').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        const key = seg.dataset.opt, v = b.dataset.v;
        mode.opts[key] = isNaN(Number(v)) ? v : Number(v);
      }));
    });
    mode.el.start.addEventListener('click', () => mode.newGame());
    mode.el.again.addEventListener('click', () => { mode.el.over.classList.remove('active'); mode.showSetup(); });
    mode.el.newBtn.addEventListener('click', () => mode.showSetup());
    mode.el.aimBtn.addEventListener('click', () => mode.setAimLine(!mode.aimLine));
    mode.el.mirrorBtn.addEventListener('click', () => { mode.mirror = !mode.mirror; mode.el.mirrorBtn.classList.toggle('on', mode.mirror); mode.el.mirrorBtn.textContent = mode.mirror ? '🪞 거울 끄기' : '🪞 거울 켜기'; });
  };

  mode.enter = function () { mode.timeScale = 1; if (mode.phase !== 'play') mode.showSetup(); };
  mode.leave = function () { mode.world.balls.forEach(b => b.stop()); mode.shot = null; mode.aim = null; mode.drag = null; };
  mode.reset = function () { mode.phase = 'setup'; };

  mode.showSetup = function () {
    mode.phase = 'setup';
    mode.world.balls.forEach(b => b.stop());
    mode.el.setup.classList.add('active');
    mode.el.over.classList.remove('active');
    mode.el.turn.hidden = true; mode.el.score.textContent = ''; mode.el.timer.textContent = '';
    global.App.msg('');
  };
  mode.setAimLine = function (on) {
    mode.aimLine = on;
    mode.el.aimBtn.classList.toggle('on', on);
    mode.el.aimBtn.textContent = on ? '🎯 조준선 켜짐' : '🎯 조준선 꺼짐';
  };

  /* ---------- 새 게임 ---------- */
  mode.newGame = function () {
    const o = mode.opts;
    mode.el.setup.classList.remove('active');
    mode.phase = 'play';
    mode.players = [{ score: 0, group: null }, { score: 0, group: null }];
    mode.turn = o.first; mode.ballInHand = false; mode.shot = null;
    mode.turnLeft = o.turnSec; mode.gameLeft = o.gameSec;
    mode.setAimLine(o.mode === 'score');
    mode.buildBalls();
    mode.updateHud();
    global.App.msg(`${P_NAME[mode.turn]}, 흰 공을 끌어서 쳐 보세요!`);
  };
  mode.buildBalls = function () {
    const o = mode.opts;
    mode.cue = new Ball({ id: 'cue', x: 50, y: 50, r: BR, color: '#ffffff' });
    let numbers;
    if (o.balls === 15) numbers = Array.from({ length: 15 }, (_, i) => i + 1);
    else numbers = o.mode === 'eight' ? [1, 2, 3, 4, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const rows = o.balls === 15 ? [1, 2, 3, 4, 5] : [1, 2, 3, 2, 1];
    // 8번은 가운데(3번째 줄 중앙), 나머지는 섞기
    const rest = numbers.filter(n => n !== 8);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const slots = [];
    rows.forEach((cnt, k) => { for (let i = 0; i < cnt; i++) slots.push({ x: 150 + k * BR * 2 * 0.875, y: 50 + (i - (cnt - 1) / 2) * (BR * 2 + 0.15), center: k === 2 && i === Math.floor(cnt / 2) }); });
    const balls = [mode.cue];
    let ri = 0;
    slots.forEach(s => {
      const n = s.center && numbers.includes(8) ? 8 : rest[ri++];
      balls.push(new Ball({ id: 'b' + n, x: s.x, y: s.y, r: BR, color: R.colorForNumber(n), number: n, stripe: n > 8 }));
    });
    mode.world.balls = balls;
  };

  /* ---------- HUD ---------- */
  mode.updateHud = function () {
    const p = mode.players, o = mode.opts;
    mode.el.turn.hidden = false;
    mode.el.turn.textContent = P_NAME[mode.turn] + ' 차례';
    mode.el.turn.className = 'turn ' + (mode.turn === 0 ? 'p1' : 'p2');
    if (o.mode === 'score') mode.el.score.textContent = `🔵 ${p[0].score} : ${p[1].score} 🔴`;
    else {
      const rem = g => mode.world.balls.filter(b => b.number && b.number !== 8 && !b.pocketed && (g === 'solid' ? b.number < 8 : b.number > 8)).length;
      const gname = g => g === 'solid' ? '단색' : '줄무늬';
      mode.el.score.textContent = p[0].group ? `🔵 ${gname(p[0].group)} ${rem(p[0].group)}개 · 🔴 ${gname(p[1].group)} ${rem(p[1].group)}개` : '처음 넣는 공으로 단색/줄무늬가 정해져요';
    }
    let t = '';
    if (o.turnSec) t += `⏱ ${Math.ceil(mode.turnLeft)}초`;
    if (o.gameSec) t += (t ? '  ' : '') + `🕒 ${Math.floor(mode.gameLeft / 60)}:${String(Math.floor(mode.gameLeft % 60)).padStart(2, '0')}`;
    mode.el.timer.textContent = t;
  };

  /* ---------- 턴 처리 ---------- */
  mode.objectBalls = () => mode.world.balls.filter(b => b !== mode.cue && !b.pocketed);
  mode.switchTurn = function () { mode.turn = 1 - mode.turn; mode.turnLeft = mode.opts.turnSec; };
  mode.resolveShot = function () {
    const s = mode.shot; mode.shot = null;
    const o = mode.opts, me = mode.players[mode.turn], other = mode.players[1 - mode.turn];
    let msg = '';
    if (s.cueFoul) {
      mode.cue.pocketed = false; mode.cue.sink = 0; mode.cue.stop();
      mode.placeCue();
      mode.ballInHand = true;
    }
    if (o.mode === 'score') {
      me.score += s.pocketed.length;
      if (s.cueFoul) { mode.switchTurn(); msg = `흰 공이 빠졌어요! ${P_NAME[mode.turn]}, 흰 공을 원하는 곳에 놓고 치세요`; }
      else if (s.pocketed.length) msg = `${s.pocketed.length}개 넣었어요! ${P_NAME[mode.turn]} 한 번 더`;
      else { mode.switchTurn(); msg = `${P_NAME[mode.turn]} 차례예요`; }
      if (!mode.objectBalls().length) return mode.endGame();
    } else {
      const eight = s.pocketed.find(b => b.number === 8);
      const others = s.pocketed.filter(b => b.number !== 8);
      if (eight) {
        if (!me.group) { // 아직 그룹이 없으면 8번을 다시 올려놓는다
          eight.pocketed = false; eight.sink = 0; eight.stop(); mode.placeBall(eight, 150, 50);
        } else {
          const cleared = mode.remaining(me.group) === 0;
          return mode.endGame(cleared && !s.cueFoul ? mode.turn : 1 - mode.turn);
        }
      }
      if (!me.group && others.length) {
        me.group = others[0].number < 8 ? 'solid' : 'stripe';
        other.group = me.group === 'solid' ? 'stripe' : 'solid';
        msg = `${P_NAME[mode.turn]}는 ${me.group === 'solid' ? '단색' : '줄무늬'} 공! `;
      }
      const mine = me.group ? others.some(b => (b.number < 8) === (me.group === 'solid')) : others.length > 0;
      if (s.cueFoul) { mode.switchTurn(); msg = `흰 공이 빠졌어요! ${P_NAME[mode.turn]}, 흰 공을 원하는 곳에 놓고 치세요`; }
      else if (mine) msg += `${P_NAME[mode.turn]} 한 번 더!`;
      else { mode.switchTurn(); msg += `${P_NAME[mode.turn]} 차례예요`; }
      const cur = mode.players[mode.turn];
      if (cur.group && mode.remaining(cur.group) === 0) msg += ' — 이제 8번 공을 넣으면 승리!';
    }
    mode.updateHud();
    global.App.msg(msg);
  };
  mode.remaining = g => mode.world.balls.filter(b => b.number && b.number !== 8 && !b.pocketed && ((b.number < 8) === (g === 'solid'))).length;
  mode.placeBall = function (ball, x, y) {
    for (let k = 0; k < 40; k++) {
      const q = mode.world.boundary.clamp(x - k * 6, y, BR);
      if (!mode.world.overlapsAny(q.x, q.y, BR, ball)) { ball.x = q.x; ball.y = q.y; return; }
    }
    ball.x = x; ball.y = y;
  };
  mode.placeCue = function () { mode.placeBall(mode.cue, 50, 50); };
  mode.endGame = function (winner) {
    mode.phase = 'over';
    const p = mode.players;
    let text;
    if (winner == null) {
      if (mode.opts.mode === 'score') winner = p[0].score === p[1].score ? null : (p[0].score > p[1].score ? 0 : 1);
      else { const r0 = p[0].group ? mode.remaining(p[0].group) : 99, r1 = p[1].group ? mode.remaining(p[1].group) : 99; winner = r0 === r1 ? null : (r0 < r1 ? 0 : 1); }
    }
    if (winner == null) text = '무승부! 🤝';
    else text = `${P_NAME[winner]} 승리! 🏆`;
    if (mode.opts.mode === 'score') text += `\n🔵 ${p[0].score} : ${p[1].score} 🔴`;
    mode.el.overText.textContent = text;
    mode.el.over.classList.add('active');
    global.App.sound.success();
  };

  /* ---------- 입력 ---------- */
  mode.onDown = function (p) {
    if (mode.phase !== 'play' || mode.world.anyMoving()) return;
    if (mode.ballInHand && Math.hypot(p.x - mode.cue.x, p.y - mode.cue.y) < BR * 2.2) { mode.drag = { offx: mode.cue.x - p.x, offy: mode.cue.y - p.y }; return; }
    mode.aim = p; mode.downAt = performance.now();
  };
  mode.onMove = function (p) {
    if (mode.drag) {
      const q = mode.world.boundary.clamp(p.x + mode.drag.offx, p.y + mode.drag.offy, BR);
      if (!mode.world.overlapsAny(q.x, q.y, BR, mode.cue)) { mode.cue.x = q.x; mode.cue.y = q.y; }
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
    mode.cue.vx = a.dx * speedFromPower(a.power); mode.cue.vy = a.dy * speedFromPower(a.power);
    mode.ballInHand = false;
    mode.shot = { pocketed: [], cueFoul: false, contact: false };
    global.App.msg('');
  };

  /* ---------- 업데이트 ---------- */
  mode.update = function (dt) {
    if (mode.phase !== 'play') return;
    const world = mode.world;
    const wasMoving = world.anyMoving();
    world.step(dt);
    const moving = world.anyMoving();
    if (mode.shot && wasMoving && !moving) mode.resolveShot();
    if (mode.phase !== 'play') return;
    const o = mode.opts;
    if (o.gameSec) { mode.gameLeft -= dt; if (mode.gameLeft <= 0) { mode.gameLeft = 0; return mode.endGame(); } }
    if (o.turnSec && !moving && !mode.shot) {
      mode.turnLeft -= dt;
      if (mode.turnLeft <= 0) { mode.switchTurn(); global.App.msg(`시간 초과! ${P_NAME[mode.turn]} 차례예요`); }
    }
    if ((mode.tick = (mode.tick || 0) + 1) % 12 === 0) mode.updateHud();
  };

  mode.worldRect = function () {
    const rail = 9;
    if (mode.mirror) { const w = W - 2 * BR, h = H - 2 * BR; return { x: BR - w - rail - BR, y: BR - h - rail - BR, w: 3 * w + 2 * (rail + BR), h: 3 * h + 2 * (rail + BR) }; }
    return { x: -rail, y: -rail, w: W + 2 * rail, h: H + 2 * rail };
  };

  /* ---------- 렌더 ---------- */
  mode.render = function (ctx, t) {
    const world = mode.world;
    if (mode.mirror) {
      const w = W - 2 * BR, h = H - 2 * BR;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        ctx.save(); ctx.globalAlpha = 0.4; ctx.translate(i * w, j * h);
        R.drawRectTable(ctx, W, H, { cloth: '#3a7a55', wood: '#6b4a2b', rail: 4, pockets: world.pockets });
        ctx.restore();
      }
    }
    R.drawRectTable(ctx, W, H, { cloth: '#2c8a4a', pockets: world.pockets });
    // 조준선
    if (mode.aim && !world.anyMoving() && mode.phase === 'play') {
      const a = global.App.aimFrom(mode.cue, mode.aim, W);
      if (a && a.d >= BR * 1.5) {
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mode.cue.x, mode.cue.y);
        if (mode.aimLine) {
          const hit = world.castRay(mode.cue, a.dx, a.dy);
          if (hit) {
            ctx.lineTo(hit.x, hit.y); ctx.stroke();
            ctx.setLineDash([]); ctx.beginPath(); ctx.arc(hit.x, hit.y, BR, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke();
            if (hit.kind === 'ball') {
              const o = hit.ball, ox = o.x - hit.x, oy = o.y - hit.y, l = Math.hypot(ox, oy) || 1;
              R.drawArrow(ctx, o.x, o.y, o.x + ox / l * 22, o.y + oy / l * 22, 'rgba(255,230,120,.95)', 1.3);
            }
          }
        } else { ctx.lineTo(mode.cue.x + a.dx * 30, mode.cue.y + a.dy * 30); ctx.stroke(); }
        ctx.restore();
        const pw = a.power;
        ctx.save(); ctx.strokeStyle = `hsl(${120 - pw * 120},90%,55%)`; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mode.cue.x, mode.cue.y); ctx.lineTo(mode.cue.x - a.dx * (6 + pw * 24), mode.cue.y - a.dy * (6 + pw * 24)); ctx.stroke(); ctx.restore();
      }
    }
    if (mode.ballInHand && mode.phase === 'play' && !world.anyMoving()) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(mode.cue.x, mode.cue.y, BR * 2 + Math.sin(t * 5), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    for (const b of world.balls) R.drawBall(ctx, b);
  };

  global.App.modes.pocket = mode;
})(window);
