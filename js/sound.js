/* sound.js — 효과음.
   assets/sounds/*.mp3 를 js/sounds-data.js(base64)로 내장해 재생한다(파일 열기·오프라인 모두 동작).
   같은 파일의 '레시피'(합성 코드)로 그 mp3를 제작했고, 샘플을 못 불러오면 레시피로 즉석 합성한다. */
(function (global) {
  'use strict';

  const S = { ctx: null, master: null, on: true, buffers: {}, _noiseBuf: null, _ir: null, _last: {}, _decoding: false };

  S.ensure = function () {
    if (!S.ctx) {
      try {
        S.ctx = new (window.AudioContext || window.webkitAudioContext)();
        S.master = S.ctx.createGain(); S.master.gain.value = 0.9;
        S.master.connect(S.ctx.destination);
      } catch (e) { S.ctx = null; }
    }
    if (S.ctx && S.ctx.state === 'suspended') S.ctx.resume();
    if (S.ctx && !S._decoding) S.loadSamples();
  };
  S.loadSamples = function () {
    S._decoding = true;
    const data = global.SoundData || {};
    Object.keys(data).forEach(name => {
      try {
        const bin = atob(data[name]); const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        S.ctx.decodeAudioData(u8.buffer.slice(0), buf => { S.buffers[name] = buf; }, () => {});
      } catch (e) { /* 실패하면 레시피로 합성 */ }
    });
  };
  const ready = () => S.on && S.ctx && S.ctx.state === 'running';
  const now = () => S.ctx.currentTime;
  function throttle(key, gapMs) { const t = performance.now(); if (S._last[key] && t - S._last[key] < gapMs) return false; S._last[key] = t; return true; }
  const clamp01 = v => Math.max(0, Math.min(1, v || 0));

  /* ---------- 샘플 재생 ---------- */
  function play(name, o) {
    o = o || {};
    if (!ready()) return false;
    const buf = S.buffers[name];
    if (!buf) return false;
    const src = S.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = o.rate || 1;
    const g = S.ctx.createGain(); g.gain.value = o.vol == null ? 1 : o.vol;
    src.connect(g); g.connect(S.master); src.start();
    return true;
  }

  /* ---------- 합성 재료 ---------- */
  function out() { return S._bus || S.master; }
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
    last.connect(g); g.connect(out());
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(o) {
    if (!ready()) return;
    if (!S._noiseBuf || S._noiseBuf.sampleRate !== S.ctx.sampleRate) {
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
    src.connect(f); f.connect(g); g.connect(out());
    src.start(t); src.stop(t + dur + 0.05);
  }
  /* 마림바 느낌: 기음 + 빠르게 사라지는 4배음 */
  function marimba(f, delay, vol, dur) {
    tone({ delay, freq: f, type: 'sine', dur: dur || 0.35, vol: vol || 0.2, attack: 0.004 });
    tone({ delay, freq: f * 4, type: 'sine', dur: 0.07, vol: (vol || 0.2) * 0.35, attack: 0.002 });
    tone({ delay, freq: f * 2.01, type: 'triangle', dur: 0.12, vol: (vol || 0.2) * 0.15, attack: 0.002 });
  }
  /* 짧은 잔향(합성 IR)을 거쳐 내보내는 구간 */
  function withReverb(fn, mix) {
    if (!ready()) return;
    if (!S._ir || S._ir.sampleRate !== S.ctx.sampleRate) {
      const sr = S.ctx.sampleRate, len = Math.floor(sr * 0.6); const buf = S.ctx.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2); }
      S._ir = buf;
    }
    const bus = S.ctx.createGain(); const conv = S.ctx.createConvolver(); conv.buffer = S._ir;
    const wet = S.ctx.createGain(); wet.gain.value = mix == null ? 0.35 : mix;
    bus.connect(S.master); bus.connect(conv); conv.connect(wet); wet.connect(S.master);
    S._bus = bus; try { fn(); } finally { S._bus = null; }
  }
  const N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784, A5: 880, B5: 987.8, C6: 1046.5, E6: 1318.5, G6: 1568 };

  /* ---------- 레시피 (mp3 제작에도 쓰인다) ---------- */
  const R = S.recipes = {
    // 공끼리 '딱': 짧은 노이즈 충격 + 두 개의 울림 배음 + 아주 낮은 몸통 소리
    click() {
      noise({ freq: 3800, q: 4, dur: 0.012, vol: 0.55, attack: 0.001 });
      tone({ freq: 2700, type: 'sine', dur: 0.028, vol: 0.22, attack: 0.001 });
      tone({ freq: 4300, type: 'sine', dur: 0.016, vol: 0.12, attack: 0.001 });
      tone({ freq: 320, slideTo: 160, type: 'sine', dur: 0.03, vol: 0.12, attack: 0.001 });
    },
    // 쿠션 '통': 고무 두께감
    cushion() {
      tone({ freq: 190, slideTo: 85, type: 'sine', dur: 0.1, vol: 0.32, attack: 0.002 });
      noise({ freq: 420, q: 0.7, dur: 0.045, vol: 0.14, ftype: 'lowpass' });
      noise({ freq: 1400, q: 3, dur: 0.008, vol: 0.06, attack: 0.001 });
    },
    // 큐 '톡'
    shoot() {
      noise({ freq: 1500, q: 2, dur: 0.02, vol: 0.32, attack: 0.001 });
      tone({ freq: 850, slideTo: 380, type: 'triangle', dur: 0.06, vol: 0.2, attack: 0.001 });
      tone({ freq: 3200, type: 'sine', dur: 0.012, vol: 0.06, attack: 0.001 });
    },
    // 포켓: '퐁' 떨어짐 + 달그락 + 낮은 굴림
    pocket() {
      tone({ freq: 420, slideTo: 110, type: 'sine', dur: 0.26, vol: 0.34 });
      [0.1, 0.18, 0.25, 0.31].forEach((d, i) => noise({ delay: d, freq: 1500 - i * 220, q: 3, dur: 0.05, vol: 0.2 - i * 0.04 }));
      noise({ delay: 0.12, freq: 180, q: 0.5, dur: 0.4, vol: 0.12, ftype: 'lowpass', attack: 0.05 });
      tone({ delay: 0.34, freq: 95, slideTo: 60, type: 'sine', dur: 0.2, vol: 0.18 });
    },
    // 초점 안착 종소리
    snap() { withReverb(() => {
      tone({ freq: 1320, type: 'sine', dur: 0.45, vol: 0.16 });
      tone({ freq: 2640, type: 'sine', dur: 0.3, vol: 0.05 });
      tone({ freq: 3960 * 1.003, type: 'sine', dur: 0.14, vol: 0.03 });
    }, 0.4); },
    // 살짝 잘했어
    nice() { withReverb(() => { marimba(N.G5, 0, 0.2); marimba(N.C6, 0.11, 0.2, 0.45); }); },
    // 미션 성공 팡파르
    success() { withReverb(() => {
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => marimba(f, i * 0.1, 0.2));
      [N.C6, N.E6, N.G6].forEach(f => tone({ delay: 0.42, freq: f, type: 'triangle', dur: 0.7, vol: 0.09 }));
    }); },
    // 별 반짝
    star() { withReverb(() => {
      tone({ freq: 700, slideTo: 2800, type: 'sine', dur: 0.4, vol: 0.12 });
      for (let i = 0; i < 8; i++) tone({ delay: 0.06 + i * 0.055, freq: 2200 + ((i * 7919) % 2400), type: 'sine', dur: 0.08, vol: 0.06 });
    }); },
    // 따단!
    tada() { withReverb(() => {
      marimba(N.G5, 0, 0.22, 0.15);
      [N.C6, N.E6, N.G6].forEach(f => tone({ delay: 0.14, freq: f, type: 'triangle', dur: 0.8, vol: 0.11 }));
      for (let i = 0; i < 6; i++) tone({ delay: 0.2 + i * 0.06, freq: 2400 + ((i * 6131) % 2000), type: 'sine', dur: 0.07, vol: 0.05 });
    }); },
    // 아깝다 (짧고 부드럽게)
    fail() {
      tone({ freq: 330, slideTo: 262, type: 'square', lp: 900, dur: 0.2, vol: 0.08 });
      tone({ delay: 0.2, freq: 262, slideTo: 196, type: 'square', lp: 800, dur: 0.3, vol: 0.08 });
    },
    // 파울 부저 (귀엽게)
    foul() {
      tone({ freq: 150, type: 'square', lp: 700, dur: 0.16, vol: 0.09 });
      tone({ delay: 0.19, freq: 125, type: 'square', lp: 650, dur: 0.26, vol: 0.09 });
    },
    // 턴 교대 딩동
    turn() { withReverb(() => {
      tone({ freq: N.A5, type: 'sine', dur: 0.3, vol: 0.13 }); tone({ freq: N.A5 * 3, type: 'sine', dur: 0.08, vol: 0.03 });
      tone({ delay: 0.17, freq: N.F5, type: 'sine', dur: 0.4, vol: 0.13 }); tone({ delay: 0.17, freq: N.F5 * 3, type: 'sine', dur: 0.08, vol: 0.03 });
    }); },
    // 승리 팡파르
    win() { withReverb(() => {
      [[N.G4, 0], [N.C5, 0.12], [N.E5, 0.24], [N.G5, 0.36], [N.E5, 0.54], [N.G5, 0.66]].forEach(([f, d]) => marimba(f, d, 0.2, 0.3));
      [N.C6, N.E6, N.G6].forEach(f => tone({ delay: 0.84, freq: f, type: 'triangle', dur: 1.0, vol: 0.1 }));
      for (let i = 0; i < 10; i++) tone({ delay: 0.9 + i * 0.07, freq: 2000 + ((i * 4787) % 3000), type: 'sine', dur: 0.07, vol: 0.05 });
    }); },
    // 불꽃놀이 슈우욱
    whoosh() {
      noise({ freq: 300, slideTo: 3800, q: 1.2, dur: 0.7, vol: 0.5, attack: 0.05 });
      tone({ freq: 300, slideTo: 1900, type: 'sine', dur: 0.6, vol: 0.05 });
    },
    // 반짝 하나
    sparkle() { tone({ freq: 2600, type: 'sine', dur: 0.08, vol: 0.06 }); tone({ freq: 5200, type: 'sine', dur: 0.04, vol: 0.02 }); },
    // 버튼 탭
    tap() { noise({ freq: 3000, q: 2, dur: 0.018, vol: 0.12, attack: 0.001 }); tone({ freq: 1100, type: 'sine', dur: 0.04, vol: 0.06 }); },
    // 타이머 틱
    tick() { tone({ freq: 1000, type: 'sine', dur: 0.045, vol: 0.12, attack: 0.002 }); },
  };

  /* ---------- 공개 API (게임 코드가 부르는 이름) ---------- */
  // mp3는 피크 정규화되어 있으므로 소리마다 기본 음량을 따로 둔다
  const VOL = { click: 0.9, cushion: 0.7, shoot: 0.6, pocket: 0.8, snap: 0.5, nice: 0.55, success: 0.6, star: 0.4, tada: 0.6, fail: 0.35, foul: 0.35, turn: 0.45, win: 0.65, whoosh: 0.4, sparkle: 0.25, tap: 0.25, tick: 0.35 };
  function fire(name, o) {
    if (!ready()) return;
    o = Object.assign({}, o); o.vol = (o.vol == null ? 1 : o.vol) * (VOL[name] || 1);
    if (!play(name, o)) R[name]();
  }
  S.click = v => { v = clamp01(v); if (!throttle('click', 25)) return; fire('click', { vol: 0.25 + v * 0.75, rate: 0.92 + v * 0.2 }); };
  S.cushion = v => { v = clamp01(v); if (!throttle('cushion', 30)) return; fire('cushion', { vol: 0.3 + v * 0.7, rate: 0.95 + v * 0.12 }); };
  S.shoot = p => { p = clamp01(p); fire('shoot', { vol: 0.5 + p * 0.5, rate: 0.95 + p * 0.15 }); };
  S.pocket = () => fire('pocket');
  S.snap = () => fire('snap');
  S.nice = () => fire('nice');
  S.success = () => fire('success');
  S.star = () => fire('star');
  S.tada = () => fire('tada');
  S.fail = () => fire('fail');
  S.foul = () => fire('foul');
  S.turn = () => fire('turn');
  S.win = () => fire('win');
  S.whoosh = () => fire('whoosh');
  S.sparkle = () => { if (!throttle('sparkle', 60)) return; fire('sparkle', { rate: 0.8 + Math.random() * 0.6 }); };
  S.tap = () => { if (!throttle('tap', 40)) return; fire('tap'); };
  S.tick = () => fire('tick');

  global.Sound = S;
})(window);
