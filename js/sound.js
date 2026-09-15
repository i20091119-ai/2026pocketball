/* sound.js — 효과음. 외부 파일 없이 Web Audio로 전부 합성한다.
   첫 터치 후 ensure()가 불려야 소리가 난다(브라우저 자동재생 정책). */
(function (global) {
  'use strict';

  const S = { ctx: null, master: null, on: true, _noiseBuf: null, _last: {} };

  S.ensure = function () {
    if (!S.ctx) {
      try {
        S.ctx = new (window.AudioContext || window.webkitAudioContext)();
        S.master = S.ctx.createGain(); S.master.gain.value = 0.9;
        S.master.connect(S.ctx.destination);
      } catch (e) { S.ctx = null; }
    }
    if (S.ctx && S.ctx.state === 'suspended') S.ctx.resume();
  };
  const ready = () => S.on && S.ctx && S.ctx.state === 'running';
  const now = () => S.ctx.currentTime;
  /* 같은 종류의 소리가 너무 촘촘히 겹치지 않게 */
  function throttle(key, gapMs) { const t = performance.now(); if (S._last[key] && t - S._last[key] < gapMs) return false; S._last[key] = t; return true; }
  const clamp01 = v => Math.max(0, Math.min(1, v || 0));

  /* 기본 재료 1: 음(주파수 슬라이드, 파형, 로우패스 가능) */
  function tone(o) {
    if (!ready()) return;
    const t = now() + (o.delay || 0), dur = o.dur || 0.2;
    const osc = S.ctx.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    const g = S.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = osc;
    if (o.lp) { const f = S.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; last.connect(f); last = f; }
    last.connect(g); g.connect(S.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  /* 기본 재료 2: 노이즈(밴드패스로 색을 입힘) — 타격음, 달그락, 바람 소리 */
  function noise(o) {
    if (!ready()) return;
    if (!S._noiseBuf) {
      const len = S.ctx.sampleRate; const buf = S.ctx.createBuffer(1, len, S.ctx.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      S._noiseBuf = buf;
    }
    const t = now() + (o.delay || 0), dur = o.dur || 0.05;
    const src = S.ctx.createBufferSource(); src.buffer = S._noiseBuf; src.loop = true;
    const f = S.ctx.createBiquadFilter(); f.type = o.ftype || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.slideTo) f.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    const g = S.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(S.master);
    src.start(t); src.stop(t + dur + 0.05);
  }
  const NOTE = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784, A5: 880, B5: 987.8, C6: 1046.5, E6: 1318.5, G6: 1568 };

  /* ---------- 당구 소리 ---------- */
  // 공끼리 '딱' — 세게 부딪힐수록 크고 높게
  S.click = function (v) {
    v = clamp01(v); if (!throttle('click', 25)) return;
    noise({ freq: 2600 + v * 2000, q: 2, dur: 0.035 + v * 0.02, vol: 0.12 + v * 0.35 });
    tone({ freq: 1700 + v * 900, type: 'triangle', dur: 0.03 + v * 0.02, vol: 0.05 + v * 0.12 });
  };
  // 쿠션 '통' — 낮고 둥근 소리
  S.cushion = function (v) {
    v = clamp01(v); if (!throttle('cushion', 30)) return;
    tone({ freq: 170 + v * 60, slideTo: 80, type: 'sine', dur: 0.13, vol: 0.08 + v * 0.22 });
    noise({ freq: 500, q: 0.7, dur: 0.04, vol: 0.05 + v * 0.1, ftype: 'lowpass' });
  };
  // 큐로 치는 '톡'
  S.shoot = function (p) {
    p = clamp01(p);
    noise({ freq: 1800, q: 1.5, dur: 0.04, vol: 0.18 + p * 0.2 });
    tone({ freq: 900 + p * 400, slideTo: 260, type: 'triangle', dur: 0.08, vol: 0.12 + p * 0.15 });
  };
  // 포켓 '퐁' + 달그락달그락
  S.pocket = function () {
    tone({ freq: 480, slideTo: 130, type: 'sine', dur: 0.28, vol: 0.32 });
    [0.09, 0.17, 0.24, 0.3].forEach((d, i) => noise({ delay: d, freq: 1400 - i * 200, q: 3, dur: 0.05, vol: 0.18 - i * 0.035 }));
    tone({ delay: 0.32, freq: 90, slideTo: 60, type: 'sine', dur: 0.18, vol: 0.2 });
  };

  /* ---------- 미션·게임 소리 ---------- */
  // 성공 팡파르 (도미솔도)
  S.success = function () {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone({ delay: i * 0.09, freq: f, type: 'triangle', dur: 0.22, vol: 0.18 }));
    tone({ delay: 0.36, freq: NOTE.C6, type: 'sine', dur: 0.5, vol: 0.12 });
    tone({ delay: 0.36, freq: NOTE.E6, type: 'sine', dur: 0.5, vol: 0.08 });
  };
  // 별 획득 — 올라가는 반짝임
  S.star = function () {
    tone({ freq: 700, slideTo: 2600, type: 'sine', dur: 0.4, vol: 0.14 });
    for (let i = 0; i < 7; i++) tone({ delay: 0.05 + i * 0.06, freq: 2000 + Math.random() * 2500, type: 'sine', dur: 0.06, vol: 0.07 });
  };
  // 아깝다 '와~' (실패지만 기죽지 않게)
  S.fail = function () {
    tone({ freq: 330, slideTo: 250, type: 'square', lp: 900, dur: 0.22, vol: 0.09 });
    tone({ delay: 0.22, freq: 250, slideTo: 190, type: 'square', lp: 800, dur: 0.32, vol: 0.09 });
  };
  // 살짝 잘했어 (한 번 더 칠 때)
  S.nice = function () {
    tone({ freq: NOTE.G5, type: 'triangle', dur: 0.12, vol: 0.14 });
    tone({ delay: 0.1, freq: NOTE.C6, type: 'triangle', dur: 0.2, vol: 0.14 });
  };
  // 초점에 '딩' 안착 (종소리)
  S.snap = function () {
    tone({ freq: 1320, type: 'sine', dur: 0.35, vol: 0.14 });
    tone({ freq: 2640, type: 'sine', dur: 0.25, vol: 0.05 });
    tone({ delay: 0.02, freq: 3960, type: 'sine', dur: 0.12, vol: 0.03 });
  };
  // 턴 교대 '딩동'
  S.turn = function () {
    tone({ freq: NOTE.A5, type: 'sine', dur: 0.25, vol: 0.13 });
    tone({ delay: 0.16, freq: NOTE.F5, type: 'sine', dur: 0.35, vol: 0.13 });
  };
  // 파울 부저 (짧고 귀엽게)
  S.foul = function () {
    tone({ freq: 140, type: 'square', lp: 700, dur: 0.18, vol: 0.1 });
    tone({ delay: 0.2, freq: 120, type: 'square', lp: 700, dur: 0.28, vol: 0.1 });
  };
  // 승리 팡파르
  S.win = function () {
    const seq = [[NOTE.G4, 0], [NOTE.C5, 0.12], [NOTE.E5, 0.24], [NOTE.G5, 0.36], [NOTE.E5, 0.54], [NOTE.G5, 0.66]];
    seq.forEach(([f, d]) => tone({ delay: d, freq: f, type: 'triangle', dur: 0.2, vol: 0.18 }));
    [NOTE.C6, NOTE.E6, NOTE.G6].forEach(f => tone({ delay: 0.84, freq: f, type: 'triangle', dur: 0.9, vol: 0.12 }));
    for (let i = 0; i < 10; i++) tone({ delay: 0.9 + i * 0.07, freq: 2000 + Math.random() * 3000, type: 'sine', dur: 0.06, vol: 0.06 });
  };
  // 불꽃놀이 시작 '슈우욱'
  S.whoosh = function () {
    noise({ freq: 300, slideTo: 3500, q: 1.2, dur: 0.7, vol: 0.45, attack: 0.05 });
    tone({ freq: 300, slideTo: 1800, type: 'sine', dur: 0.6, vol: 0.05 });
  };
  // 반짝 하나 (불꽃놀이 진행 중 간간이)
  S.sparkle = function () {
    if (!throttle('sparkle', 60)) return;
    tone({ freq: 1800 + Math.random() * 3000, type: 'sine', dur: 0.07, vol: 0.05 });
  };
  // 버튼 탭
  S.tap = function () {
    if (!throttle('tap', 40)) return;
    noise({ freq: 3000, q: 2, dur: 0.02, vol: 0.08 });
    tone({ freq: 1100, type: 'sine', dur: 0.04, vol: 0.05 });
  };
  // 타이머 마지막 5초 '틱'
  S.tick = function () { tone({ freq: 1000, type: 'sine', dur: 0.04, vol: 0.1 }); };
  // 예측 놀이 '딱 맞았어요' 따단!
  S.tada = function () {
    tone({ freq: NOTE.G5, type: 'triangle', dur: 0.12, vol: 0.18 });
    [NOTE.C6, NOTE.E6, NOTE.G6].forEach(f => tone({ delay: 0.13, freq: f, type: 'triangle', dur: 0.6, vol: 0.12 }));
    S.star();
  };

  global.Sound = S;
})(window);
