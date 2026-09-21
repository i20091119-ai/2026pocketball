/* render.js — 캔버스 그리기 도우미. ctx는 이미 월드 좌표계로 변환되어 있다고 가정. */
(function (global) {
  'use strict';

  const NUM_COLORS = { 1: '#f5c518', 2: '#1f5fd6', 3: '#e0362c', 4: '#7a3bb7', 5: '#f28b1c', 6: '#1f9d55', 7: '#8e2b2b', 8: '#1b1b1b' };
  function colorForNumber(n) { return NUM_COLORS[n > 8 ? n - 8 : n] || '#ccc'; }

  function drawBall(ctx, b, opts) {
    opts = opts || {};
    let r = b.r, x = b.x, y = b.y;
    if (b.pocketed) {
      if (b.sink >= 1) return;
      r = b.r * (1 - b.sink); x = b.pocketAt ? b.pocketAt.x : x; y = b.pocketAt ? b.pocketAt.y : y;
    }
    ctx.save();
    // 그림자
    ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.2, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
    // 몸통
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = b.stripe ? '#f7f7f2' : b.color; ctx.fill();
    if (b.stripe) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = b.color; ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1);
      ctx.restore();
    }
    if (b.number != null) {
      ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `bold ${r * 0.78}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(b.number), x, y + r * 0.04);
    }
    // 하이라이트
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    if (opts.glow) {
      ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
      ctx.strokeStyle = opts.glow; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.restore();
  }

  function drawRectTable(ctx, W, H, o) {
    o = o || {};
    const rail = o.rail == null ? 9 : o.rail;
    ctx.save();
    ctx.fillStyle = o.wood || '#8a5a2b';
    roundRect(ctx, -rail, -rail, W + rail * 2, H + rail * 2, rail * 1.2); ctx.fill();
    ctx.fillStyle = o.cloth || '#2c8a4a';
    ctx.fillRect(0, 0, W, H);
    // 쿠션 안쪽 살짝 어두운 띠
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.5; ctx.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);
    if (o.pockets) {
      for (const p of o.pockets) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = '#0c0c0c'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.75, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawEllipseTable(ctx, a, b, r, o) {
    o = o || {};
    const rail = o.rail == null ? 12 : o.rail;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, a + r + rail, b + r + rail, 0, 0, Math.PI * 2);
    ctx.fillStyle = o.wood || '#b98a55'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, a + r + 2.5, b + r + 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = o.cushion || '#1a3fb0'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, a + r, b + r, 0, 0, Math.PI * 2);
    ctx.fillStyle = o.cloth || '#2453d6'; ctx.fill();
    ctx.restore();
  }

  function drawTrail(ctx, pts, color, width, dash) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }

  function drawBurst(ctx, x, y, size, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = size * 0.18; ctx.lineCap = 'round';
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * size * 0.45, y + Math.sin(a) * size * 0.45);
      ctx.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMarker(ctx, x, y, size, color, label) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.25; ctx.stroke();
    if (label) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${size * 1.1}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + size * 0.05);
    }
    ctx.restore();
  }

  function drawFocus(ctx, x, y, t, active) {
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 3, 0, Math.PI * 2);
    ctx.strokeStyle = active ? 'rgba(255,220,80,.95)' : 'rgba(255,255,255,.55)'; ctx.lineWidth = active ? 1.6 : 0.9; ctx.stroke();
    if (active) {
      for (let k = 0; k < 4; k++) {
        const a = t * 1.5 + k * Math.PI / 2;
        const d = 10 + pulse * 2;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe680'; ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawArrow(ctx, x0, y0, x1, y1, color, width) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0), s = width * 3.2;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(a - 0.5) * s, y1 - Math.sin(a - 0.5) * s);
    ctx.lineTo(x1 - Math.cos(a + 0.5) * s, y1 - Math.sin(a + 0.5) * s);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* 큐(당구 막대). (dx,dy)는 발사 방향(단위벡터), 큐는 공의 반대쪽에 놓인다. pull = 뒤로 당긴 거리 */
  function drawCue(ctx, x, y, dx, dy, pull, r, alpha) {
    const len = 75, gap = r * 1.25 + (pull || 0);
    const tx = x - dx * gap, ty = y - dy * gap;          // 팁
    const ex = tx - dx * len, ey = ty - dy * len;        // 손잡이 끝
    const line = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); };
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 3.6; line(tx + 0.8, ty + 1.4, ex + 0.8, ey + 1.4);
    const g = ctx.createLinearGradient(tx, ty, ex, ey);
    g.addColorStop(0, '#f0d5a3'); g.addColorStop(0.5, '#c58f52'); g.addColorStop(0.62, '#b07a3f'); g.addColorStop(0.64, '#2a2a2a'); g.addColorStop(1, '#151515');
    ctx.strokeStyle = g; ctx.lineWidth = 3; line(tx, ty, ex, ey);
    ctx.strokeStyle = '#f6f6f6'; ctx.lineWidth = 2.8; line(tx - dx * 1.2, ty - dy * 1.2, tx - dx * 5, ty - dy * 5);   // 페룰
    ctx.strokeStyle = '#3f7fe0'; ctx.lineWidth = 2.8; line(tx, ty, tx - dx * 1.6, ty - dy * 1.6);                   // 초크 묻은 팁
    ctx.restore();
  }

  /* 조준선: 공 중심에서 첫 접촉까지. 쿠션이면 벽면까지 이어 그리고, 공이면 닿는 자리에 유령 공을 그린다 */
  function drawAimLine(ctx, ball, dx, dy, hit) {
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ball.x, ball.y);
    if (!hit) { ctx.lineTo(ball.x + dx * 400, ball.y + dy * 400); ctx.stroke(); ctx.restore(); return; }
    if (hit.kind === 'wall') { ctx.lineTo(hit.x + dx * ball.r, hit.y + dy * ball.r); ctx.stroke(); }
    else {
      ctx.lineTo(hit.x, hit.y); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(hit.x, hit.y, ball.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.restore();
  }

  /* 입사각·반사각 표시. (px,py) 반사점(공 중심 경로의 꺾임점), (nx,ny) 안쪽 법선,
     din = 들어오는 방향, dout = 나가는 방향(단위벡터). tangent=true면 접선(거울)도 그린다 */
  function drawAngles(ctx, px, py, nx, ny, din, dout, o) {
    o = o || {};
    const rad = o.radius || 13, L = o.length || 26;
    const aN = Math.atan2(ny, nx), aIn = Math.atan2(-din.y, -din.x), aOut = Math.atan2(dout.y, dout.x);
    const degIn = Math.round(Math.acos(Math.max(-1, Math.min(1, -din.x * nx - din.y * ny))) * 180 / Math.PI);
    const degOut = Math.round(Math.acos(Math.max(-1, Math.min(1, dout.x * nx + dout.y * ny))) * 180 / Math.PI);
    ctx.save(); ctx.lineCap = 'round';
    // 벽에 닿아 있는 공(반투명): 선이 벽 앞에서 꺾이는 이유 — 공의 중심 자국이기 때문
    if (o.ballR) {
      ctx.beginPath(); ctx.arc(px, py, o.ballR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill();
      ctx.setLineDash([1.6, 1.4]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    }
    const label = (txt, x, y, color, size) => { ctx.font = `bold ${size || 5.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y); };
    // 두 초점으로 가는 보조선: 법선이 ∠F₁PF₂를 반으로 나눈다
    if (o.foci) {
      ctx.setLineDash([1.5, 2.5]); ctx.strokeStyle = 'rgba(140,220,255,.9)'; ctx.lineWidth = 0.9;
      o.foci.forEach((f, i) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(f.x, f.y); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    // 접촉점(벽면 위의 점). 공 중심 경로의 꺾임점(px,py)에서 공 반지름만큼 바깥이다
    const rx = o.rim ? o.rim.x : px, ry = o.rim ? o.rim.y : py;
    // 접선(거울): 벽면의 접촉점을 지나는 선. 곡선에서는 이 선이 거울 역할
    if (o.tangent) {
      const T = L * 1.7;
      ctx.strokeStyle = '#ff9ad5'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx - ny * T, ry + nx * T); ctx.lineTo(rx + ny * T, ry - nx * T); ctx.stroke();
      label('접선', rx + ny * (T + 7), ry - nx * (T + 7), '#ffb8e3');
    }
    // 법선: 접촉점에서 안쪽으로, 꺾임점을 지나서
    ctx.setLineDash([2.5, 2]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(rx - nx * 2, ry - ny * 2); ctx.lineTo(px + nx * L, py + ny * L); ctx.stroke(); ctx.setLineDash([]);
    if (o.tangent) label('법선', px + nx * (L + 6), py + ny * (L + 6), '#ffffff');
    // 부채꼴 두 개: 법선 → 들어온 쪽, 법선 → 나간 쪽
    const arc = (a1, a2, color) => {
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, rad, a1, a1 + d, d < 0); ctx.closePath();
      ctx.fillStyle = color.replace('1)', '.35)'); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke();
      return a1 + d / 2;
    };
    const mIn = arc(aN, aIn, 'rgba(247,148,29,1)'), mOut = arc(aN, aOut, 'rgba(141,198,63,1)');
    // 숫자는 법선 좌우로 최소 간격을 두어 각이 작아도 겹치지 않게
    const lab = (ang, txt, color) => {
      const side = Math.sign(Math.cos(ang) * -ny + Math.sin(ang) * nx) || 1;
      const along = rad + 6, lat = Math.max(10, (rad + 8) * Math.abs(Math.sin(ang - aN)));
      const x = px + nx * along + (-ny) * side * lat, y = py + ny * along + nx * side * lat;
      ctx.font = 'bold 6.5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
    };
    lab(mIn, degIn + '°', '#ffd28a'); lab(mOut, degOut + '°', '#c9f28a');
    ctx.restore();
    return { degIn, degOut };
  }

  function drawText(ctx, text, x, y, size, color, align) {
    ctx.save();
    ctx.fillStyle = color || '#fff'; ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  global.Render = { colorForNumber, drawBall, drawCue, drawAimLine, drawAngles, drawRectTable, drawEllipseTable, drawTrail, drawBurst, drawMarker, drawFocus, drawArrow, drawText, roundRect };
})(window);
