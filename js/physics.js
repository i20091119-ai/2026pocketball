/* physics.js — 공·쿠션·포켓 물리. 세 모드(네모/타원/포켓볼)가 공유한다.
   좌표계는 '월드 단위'(네모 당구대 가로 200, 공 반지름 5). */
(function (global) {
  'use strict';

  const MAX_MOVE_PER_SUBSTEP = 1.2; // 한 서브스텝에서 공이 움직일 최대 거리(터널링 방지)

  class Ball {
    constructor(o) {
      this.id = o.id;
      this.x = o.x; this.y = o.y;
      this.vx = 0; this.vy = 0;
      this.r = o.r;
      this.color = o.color || '#ffffff';
      this.number = o.number == null ? null : o.number; // 포켓볼 번호, 없으면 null
      this.stripe = !!o.stripe;
      this.pocketed = false;
      this.sink = 0;        // 포켓에 빠지는 애니메이션 진행도(0~1)
      this.pocketAt = null;
    }
    get speed() { return Math.hypot(this.vx, this.vy); }
    get moving() { return !this.pocketed && (this.vx !== 0 || this.vy !== 0); }
    stop() { this.vx = 0; this.vy = 0; }
  }

  /* 사각 경계. 공 중심은 안쪽으로 r만큼 들어온 사각형 안에서만 움직인다. */
  class RectBoundary {
    constructor(w, h) { this.w = w; this.h = h; this.type = 'rect'; }
    inner(r) { return { x0: r, y0: r, x1: this.w - r, y1: this.h - r }; }
    contains(x, y, r) { const q = this.inner(r); return x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1; }
    clamp(x, y, r) {
      const q = this.inner(r);
      return { x: Math.min(q.x1, Math.max(q.x0, x)), y: Math.min(q.y1, Math.max(q.y0, y)) };
    }
    collide(ball, e) {
      const q = this.inner(ball.r);
      let hit = null;
      // 완전 반사(입사각 = 반사각)를 먼저 하고, 에너지 손실은 속도 전체에 곱한다(각도 보존)
      if (ball.x < q.x0 && ball.vx < 0) { const cy = ball.y - ball.vy / ball.vx * (ball.x - q.x0); ball.x = 2 * q.x0 - ball.x; ball.vx = -ball.vx; hit = { x: 0, y: cy, cx: q.x0, cy, nx: 1, ny: 0 }; }
      else if (ball.x > q.x1 && ball.vx > 0) { const cy = ball.y - ball.vy / ball.vx * (ball.x - q.x1); ball.x = 2 * q.x1 - ball.x; ball.vx = -ball.vx; hit = { x: this.w, y: cy, cx: q.x1, cy, nx: -1, ny: 0 }; }
      if (ball.y < q.y0 && ball.vy < 0) { const cx = ball.x - ball.vx / ball.vy * (ball.y - q.y0); ball.y = 2 * q.y0 - ball.y; ball.vy = -ball.vy; hit = hit || { x: cx, y: 0, cx, cy: q.y0, nx: 0, ny: 1 }; }
      else if (ball.y > q.y1 && ball.vy > 0) { const cx = ball.x - ball.vx / ball.vy * (ball.y - q.y1); ball.y = 2 * q.y1 - ball.y; ball.vy = -ball.vy; hit = hit || { x: cx, y: this.h, cx, cy: q.y1, nx: 0, ny: -1 }; }
      if (hit) { ball.vx *= e; ball.vy *= e; }
      return hit;
    }
    /* (x,y)에서 (dx,dy) 방향으로 나아갈 때 처음 만나는 쿠션 */
    rayHit(x, y, dx, dy, r) {
      const q = this.inner(r);
      let best = null;
      const c = [];
      if (dx < 0) c.push({ t: (q.x0 - x) / dx, nx: 1, ny: 0 });
      if (dx > 0) c.push({ t: (q.x1 - x) / dx, nx: -1, ny: 0 });
      if (dy < 0) c.push({ t: (q.y0 - y) / dy, nx: 0, ny: 1 });
      if (dy > 0) c.push({ t: (q.y1 - y) / dy, nx: 0, ny: -1 });
      for (const k of c) if (k.t >= 0 && (!best || k.t < best.t)) best = k;
      if (!best) return null;
      return { t: best.t, x: x + dx * best.t, y: y + dy * best.t, nx: best.nx, ny: best.ny };
    }
  }

  /* 타원 경계. a, b는 '공 중심이 움직이는 타원'의 반지름.
     초점의 반사 성질은 이 타원에 대해 정확히 성립하므로 초점 표시도 이 타원 기준으로 한다. */
  class EllipseBoundary {
    constructor(a, b) { this.type = 'ellipse'; this.set(a, b); }
    set(a, b) { this.a = a; this.b = b; this.c = Math.sqrt(Math.max(0, a * a - b * b)); }
    foci() { return [{ x: -this.c, y: 0 }, { x: this.c, y: 0 }]; }
    value(x, y) { return (x * x) / (this.a * this.a) + (y * y) / (this.b * this.b); }
    contains(x, y) { return this.value(x, y) <= 1; }
    clamp(x, y) {
      const f = this.value(x, y);
      if (f <= 1) return { x, y };
      const s = 0.995 / Math.sqrt(f);
      return { x: x * s, y: y * s };
    }
    normalAt(x, y) {
      let nx = x / (this.a * this.a), ny = y / (this.b * this.b);
      const l = Math.hypot(nx, ny) || 1;
      return { nx: nx / l, ny: ny / l };
    }
    /* 안쪽 점에서 (dx,dy) 방향으로 나아갈 때 타원과 만나는 거리 t (앞쪽 교점) */
    rayT(x, y, dx, dy) {
      const a2 = this.a * this.a, b2 = this.b * this.b;
      const A = dx * dx / a2 + dy * dy / b2;
      const B = 2 * (x * dx / a2 + y * dy / b2);
      const C = this.value(x, y) - 1;
      const disc = B * B - 4 * A * C;
      if (disc < 0 || A === 0) return null;
      return (-B + Math.sqrt(disc)) / (2 * A);
    }
    rayHit(x, y, dx, dy) {
      const t = this.rayT(x, y, dx, dy);
      if (t === null || t < 0) return null;
      const px = x + dx * t, py = y + dy * t;
      const n = this.normalAt(px, py);
      return { t, x: px, y: py, nx: -n.nx, ny: -n.ny };
    }
    collide(ball, e) {
      const f = this.value(ball.x, ball.y);
      if (f <= 1) return null;
      const sp = ball.speed;
      if (sp === 0) { const p = this.clamp(ball.x, ball.y); ball.x = p.x; ball.y = p.y; return null; }
      const dx = ball.vx / sp, dy = ball.vy / sp;
      // 속도 반대 방향으로 되돌아가 타원을 통과한 점을 찾는다 (작은 양수 근)
      const a2 = this.a * this.a, b2 = this.b * this.b;
      const A = dx * dx / a2 + dy * dy / b2;
      const B = -2 * (ball.x * dx / a2 + ball.y * dy / b2);
      const C = f - 1;
      const disc = B * B - 4 * A * C;
      let t = 0;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        const t1 = (-B - s) / (2 * A), t2 = (-B + s) / (2 * A);
        t = t1 >= 0 ? t1 : t2;
        if (t < 0) t = 0;
      }
      const px = ball.x - dx * t, py = ball.y - dy * t;
      const n = this.normalAt(px, py);
      const vn = ball.vx * n.nx + ball.vy * n.ny;
      // 완전 반사(입사각 = 반사각) 후 에너지 손실은 속도 전체에 곱한다(각도 보존)
      if (vn > 0) { ball.vx -= 2 * vn * n.nx; ball.vy -= 2 * vn * n.ny; }
      const sp2 = ball.speed || 1;
      ball.x = px + (ball.vx / sp2) * t;
      ball.y = py + (ball.vy / sp2) * t;
      ball.vx *= e; ball.vy *= e;
      if (this.value(ball.x, ball.y) > 1) { const p = this.clamp(ball.x, ball.y); ball.x = p.x; ball.y = p.y; }
      return { x: px + n.nx * ball.r, y: py + n.ny * ball.r, cx: px, cy: py, nx: -n.nx, ny: -n.ny };
    }
  }

  /* 두 공의 충돌. 서로 가까워지는 중일 때만 true(접촉 이벤트) */
  function collideBalls(a, b, e) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy), minD = a.r + b.r;
    if (dist >= minD || dist === 0) return false;
    const nx = dx / dist, ny = dy / dist;
    const overlap = minD - dist;
    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2; b.y += ny * overlap / 2;
    const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vn <= 0) return false;
    const j = vn * (1 + e) / 2;
    a.vx -= j * nx; a.vy -= j * ny;
    b.vx += j * nx; b.vy += j * ny;
    return true;
  }

  class World {
    constructor(boundary) {
      this.boundary = boundary;
      this.balls = [];
      this.pockets = [];              // {x, y, r}
      this.cushionRestitution = 0.9;
      this.ballRestitution = 0.95;
      this.friction = 0.35;           // 지수 감쇠(1/s)
      this.decel = 8;                 // 선형 감속(단위/s²)
      this.stopSpeed = 1.5;
      this.onCushion = null;          // (ball, hit)
      this.onBallHit = null;          // (a, b)
      this.onPocket = null;           // (ball, pocket)
    }
    anyMoving() { return this.balls.some(b => b.moving || (b.pocketed && b.sink < 1)); }
    step(dt) {
      let vmax = 0;
      for (const b of this.balls) if (!b.pocketed) vmax = Math.max(vmax, b.speed);
      const n = Math.max(1, Math.ceil(vmax * dt / MAX_MOVE_PER_SUBSTEP));
      const h = dt / n;
      for (let i = 0; i < n; i++) this.substep(h);
    }
    substep(h) {
      const balls = this.balls;
      for (const b of balls) {
        if (b.pocketed) { if (b.sink < 1) b.sink = Math.min(1, b.sink + h * 4); continue; }
        if (b.vx === 0 && b.vy === 0) continue;
        b.x += b.vx * h; b.y += b.vy * h;
        const sp = b.speed;
        const ns = sp * Math.exp(-this.friction * h) - this.decel * h;
        if (ns < this.stopSpeed) b.stop();
        else { const k = ns / sp; b.vx *= k; b.vy *= k; }
      }
      for (const b of balls) {
        if (b.pocketed) continue;
        for (const p of this.pockets) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) {
            b.pocketed = true; b.stop(); b.sink = 0; b.pocketAt = { x: p.x, y: p.y };
            if (this.onPocket) this.onPocket(b, p);
            break;
          }
        }
      }
      for (const b of balls) {
        if (b.pocketed) continue;
        const hit = this.boundary.collide(b, this.cushionRestitution);
        if (hit && this.onCushion) this.onCushion(b, hit);
      }
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], c = balls[j];
          if (a.pocketed || c.pocketed) continue;
          if (collideBalls(a, c, this.ballRestitution) && this.onBallHit) this.onBallHit(a, c);
        }
      }
    }
    /* ball이 (dx,dy) 방향으로 갈 때 처음 만나는 것: 다른 공 또는 쿠션 */
    castRay(ball, dx, dy) {
      let best = null;
      for (const o of this.balls) {
        if (o === ball || o.pocketed) continue;
        const R = ball.r + o.r;
        const fx = ball.x - o.x, fy = ball.y - o.y;
        const B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - R * R;
        const disc = B * B - 4 * C;
        if (disc < 0) continue;
        const t = (-B - Math.sqrt(disc)) / 2;
        if (t >= 0 && (!best || t < best.t)) best = { t, kind: 'ball', ball: o, x: ball.x + dx * t, y: ball.y + dy * t };
      }
      const w = this.boundary.rayHit(ball.x, ball.y, dx, dy, ball.r);
      if (w && (!best || w.t < best.t)) best = { t: w.t, kind: 'wall', x: w.x, y: w.y, nx: w.nx, ny: w.ny };
      return best;
    }
    ballAt(x, y, slack) {
      slack = slack == null ? 1.6 : slack;
      let best = null, bd = Infinity;
      for (const b of this.balls) {
        if (b.pocketed) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < b.r * slack && d < bd) { best = b; bd = d; }
      }
      return best;
    }
    overlapsAny(x, y, r, except) {
      return this.balls.some(b => b !== except && !b.pocketed && Math.hypot(b.x - x, b.y - y) < b.r + r + 0.5);
    }
    snapshot() { return this.balls.map(b => ({ x: b.x, y: b.y, pocketed: b.pocketed })); }
    restore(s) {
      this.balls.forEach((b, i) => { const q = s[i]; if (!q) return; b.x = q.x; b.y = q.y; b.pocketed = q.pocketed; b.sink = q.pocketed ? 1 : 0; b.stop(); });
    }
  }

  /* 조준 세기 → 발사 속도 */
  const MIN_SPEED = 80, MAX_SPEED = 340;
  function speedFromPower(p) { return MIN_SPEED + Math.max(0, Math.min(1, p)) * (MAX_SPEED - MIN_SPEED); }

  global.Physics = { Ball, RectBoundary, EllipseBoundary, World, speedFromPower, MIN_SPEED, MAX_SPEED };
})(window);
