/* Ripe · código compartido por todas las páginas.
   Cada bloque revisa si su sección existe en la página antes de arrancar. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const rng = seed => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const root = document.documentElement;
  root.classList.add('js');

  /* ---------- split words once ---------- */
  $$('[data-split]').forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  });

  /* ---------- cinematic scroll hero (index.html only) ----------
     splash → the machine comes out of the dark → the pour, scrubbed by scroll → the full cup steams
     and slides aside while the notes arrive. Everything reads one smoothed progress value. */
  function setupHero(hero) {
    const stage = $('#stage'), video = $('#hero'), poster = $('#poster'), posterEnd = $('#posterEnd');
    const ring = $('#ring'), cue = $('#cue'), splash = $('#splash'), veil = $('#veil'), move = $('#mediaMove'), steamCanvas = $('#steam'), still = $('#still');
    /* steam: where the crema sits in the last frame, as fractions of the video */
    const SRC = {
      desk: { video: 'assets/hero-pour.mp4?v=120', poster: 'assets/hero-poster.jpg', end: 'assets/hero-ending.jpg', bytes: 7113419, w: 1280, h: 716, steam: { x: 0.498, y: 0.43, spread: 0.12, rate: 7, gain: 1 } },
      mob: { video: 'assets/hero-pour-m.mp4?v=120', poster: 'assets/hero-poster-m.jpg', end: 'assets/hero-ending-m.jpg', bytes: 5207096, w: 720, h: 804, steam: { x: 0.461, y: 0.38, spread: 0.16, rate: 4, gain: 0.5 } }
    };
    /* mirrored character for character in the CSS media queries */
    const STATIC_GATES = [
      '(prefers-reduced-motion: reduce)',
      '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)'
    ];
    const MOBILE_Q = '(max-width: 720px), (orientation: portrait) and (max-width: 1024px), (orientation: portrait) and (pointer: coarse)';
    /* the timeline, in hero progress */
    const V0 = 0, V1 = 0.6;              // the pour plays across this stretch of the scroll
    const STEAM0 = 0.5, STEAM1 = 0.62;   // steam rises as the cup fills
    const GLIDE0 = 0.625, GLIDE1 = 0.705; // the full cup slides aside for the notes (wide screens)
    const AUTO_IDLE = 900, AUTO_FIRST = 2600, AUTO_RATE = 1.1;  // autopilot: idle ms before it takes over, first wait on load, playback speed

    const bands = $$('.band[data-range]').map((el, n) => {
      const [a, b] = el.dataset.range.split(',').map(Number);
      const words = $$('.w', el);
      const r = rng(211 + n * 37);
      const spread = Number(el.dataset.spread || 0.5);
      words.forEach((w, i) => w.style.setProperty('--th', (i / Math.max(1, words.length) * spread + r() * 0.04).toFixed(3)));
      return { el, a, b, last: el.hasAttribute('data-last'), ramp: Number(el.dataset.ramp || 0), op: -1, k: -1, off: null };
    });

    let rangeVh = 1000, heroOnScreen = true;
    function measure() { rangeVh = Math.max(1, (hero.offsetHeight - innerHeight) / innerHeight * 100); }

    function heroProgress() {
      const r = hero.getBoundingClientRect();
      const range = r.height - innerHeight;
      return range > 0 ? clamp(-r.top / range, 0, 1) : 0;
    }

    /* captions (delta-gated) */
    function updateCaptions(p) {
      const f = Math.min(0.08, 18 / rangeVh);
      for (const B of bands) {
        const len = B.b - B.a;
        const ff = Math.min(f, len / 3);
        const op = smoothstep(p, B.a, B.a + ff) * (B.last ? 1 : 1 - smoothstep(p, B.b - ff, B.b));
        const ramp = B.ramp || Math.min(28 / rangeVh, len * 0.35);
        const k = clamp((p - B.a) / ramp, 0, 1);
        if (Math.abs(op - B.op) > 0.004 || (op === 0 && B.op !== 0) || (op === 1 && B.op !== 1)) {
          B.op = op;
          B.el.style.opacity = op.toFixed(3);
          const off = op < 0.01;
          if (off !== B.off) { B.off = off; B.el.classList.toggle('off', off); }
        }
        if (Math.abs(k - B.k) > 0.008 || (k === 1 && B.k !== 1) || (k === 0 && B.k !== 0)) {
          B.k = k;
          B.el.style.setProperty('--k', k.toFixed(3));
        }
      }
    }

    /* splash, veil, glide, steam level and cue (all delta-gated) */
    let lastOut = -1, lastVeil = -1, lastGlide = -1, cueGone = null, lateState = null, atCupState = null, wide = true;
    function updateScene(p) {
      const out = smoothstep(p, 0.004, 0.065);
      if (Math.abs(out - lastOut) > 0.003 || (out === 1 && lastOut !== 1) || (out === 0 && lastOut !== 0)) {
        lastOut = out;
        splash.style.opacity = (1 - out).toFixed(3);
        splash.style.transform = out ? 'scale(' + (1 + 0.16 * out).toFixed(4) + ')' : '';
        splash.style.filter = out ? 'blur(' + (out * 14).toFixed(1) + 'px)' : '';
        splash.style.visibility = out > 0.995 ? 'hidden' : '';
      }
      const v = 0.86 * (1 - smoothstep(p, 0, 0.13));
      if (Math.abs(v - lastVeil) > 0.003 || (v === 0 && lastVeil !== 0)) { lastVeil = v; veil.style.opacity = v.toFixed(3); }
      const g = wide ? smoothstep(p, GLIDE0, GLIDE1) : 0;
      if (Math.abs(g - lastGlide) > 0.001 || (g === 0 && lastGlide !== 0) || (g === 1 && lastGlide !== 1)) {
        lastGlide = g;
        move.style.transform = g ? 'translate3d(' + (22 * g).toFixed(3) + 'vw,0,0) scale(' + (1 - 0.2 * g).toFixed(4) + ')' : '';
        move.style.setProperty('--e', g.toFixed(3));
      }
      /* the last frame still has a falling drop: a cleaned still of the full cup takes over once the pour is done */
      const atCup = p >= V1 - 0.004;
      if (atCup !== atCupState) { atCupState = atCup; stage.classList.toggle('at-cup', atCup); }
      steam.setLevel(smoothstep(p, STEAM0, STEAM1));
      const gone = p > 0.012;
      if (gone !== cueGone) { cueGone = gone; cue.classList.toggle('gone', gone); }
      const late = p > V0 + 0.6 * (V1 - V0);
      if (late !== lateState) { lateState = late; stage.classList.toggle('late', late); }
    }

    /* steam: soft wisps drawn live over the cup, so it never loops or cuts */
    const steam = (() => {
      const ctx = steamCanvas.getContext('2d');
      const spr = document.createElement('canvas');
      spr.width = spr.height = 96;
      const sg = spr.getContext('2d');
      const grd = sg.createRadialGradient(48, 48, 0, 48, 48, 48);
      grd.addColorStop(0, 'rgba(255,246,234,0.9)');
      grd.addColorStop(0.38, 'rgba(255,244,230,0.36)');
      grd.addColorStop(1, 'rgba(255,244,230,0)');
      sg.fillStyle = grd;
      sg.fillRect(0, 0, 96, 96);
      const R = rng(977);
      let parts = [], level = 0, shownLevel = 0, raf = null, last = 0, acc = 0, W = 1, H = 1, box = null, src = SRC.desk, live = true;
      function resize() {
        W = Math.max(1, Math.round(move.offsetWidth * 0.5));
        H = Math.max(1, Math.round(move.offsetHeight * 0.5));
        steamCanvas.width = W; steamCanvas.height = H;
        const s = Math.max(W / src.w, H / src.h);
        box = { dw: src.w * s, dh: src.h * s, ox: (W - src.w * s) / 2, oy: (H - src.h * s) / 2 };
        parts = [];
      }
      function spawn() {
        const e = src.steam;
        const u = (R() + R() + R()) / 1.5 - 1;
        const x = box.ox + (e.x + u * e.spread) * box.dw;
        const wisp = R() < 0.5;   // half thin rising threads, half soft puffs
        parts.push({
          x0: x, y: box.oy + (e.y - 0.05 + R() * 0.05) * box.dh, age: 0, life: 4 + R() * 3.2,
          vy: (0.08 + R() * 0.05) * box.dh, size: (wisp ? 0.016 + R() * 0.014 : 0.032 + R() * 0.034) * box.dh, grow: (wisp ? 0.03 + R() * 0.03 : 0.07 + R() * 0.08) * box.dh,
          sway: (0.012 + R() * 0.024) * box.dw, freq: 0.25 + R() * 0.4, ph: R() * 6.283, a: wisp ? 0.36 + R() * 0.26 : 0.26 + R() * 0.2,
          stretch: wisp ? 3 + R() * 1.8 : 1.5 + R() * 0.9, rot: (R() - 0.5) * 0.6
        });
      }
      const running = () => live && heroOnScreen && !document.hidden && (level > 0 || shownLevel > 0.002);
      function frame(now) {
        raf = null;
        const dt = Math.min(0.05, (now - (last || now)) / 1000);
        last = now;
        shownLevel += (level - shownLevel) * (1 - Math.pow(0.03, dt));
        steamCanvas.style.opacity = shownLevel.toFixed(3);
        if (level === 0 && shownLevel < 0.002) { shownLevel = 0; steamCanvas.style.opacity = '0'; parts = []; ctx.clearRect(0, 0, W, H); last = 0; return; }
        acc += dt * src.steam.rate;
        while (acc > 1) { acc -= 1; if (parts.length < 48) spawn(); }
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = parts.length - 1; i >= 0; i--) {
          const q = parts[i];
          q.age += dt;
          const k = q.age / q.life;
          if (k >= 1) { parts.splice(i, 1); continue; }
          q.y -= q.vy * dt * (1 - k * 0.35);
          const x = q.x0 + Math.sin(q.ph + q.age * q.freq * 6.283) * q.sway * (0.3 + k * 1.6) + Math.sin(q.ph * 1.7 + q.age * 0.9) * q.sway * 0.5 * k;
          const size = q.size + q.grow * k;
          ctx.globalAlpha = q.a * src.steam.gain * smoothstep(k, 0.04, 0.32) * Math.pow(1 - k, 1.25);
          ctx.save();
          ctx.translate(x, q.y);
          ctx.rotate(q.rot * k + Math.sin(q.ph + q.age) * 0.15);
          ctx.scale(1, q.stretch);
          ctx.drawImage(spr, -size, -size, size * 2, size * 2);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        if (running()) raf = requestAnimationFrame(frame); else last = 0;
      }
      function kick() { if (raf === null && running()) raf = requestAnimationFrame(frame); }
      document.addEventListener('visibilitychange', kick);
      return {
        setLevel(l) { level = l; kick(); },
        setSource(s) { src = s; resize(); },
        setLive(on) { live = on; if (!on) { level = 0; shownLevel = 0; steamCanvas.style.opacity = '0'; } else kick(); },
        resize, kick
      };
    })();

    /* gated seeks */
    let seekBusy = false, pendingTime = null;
    function requestSeek(t) {
      if (!video.duration || !video.src) return;
      if (seekBusy) { pendingTime = t; return; }
      if (Math.abs(video.currentTime - t) < 0.001) return;
      seekBusy = true;
      video.currentTime = t;
    }
    video.addEventListener('seeked', () => {
      seekBusy = false;
      if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); }
    });
    video.addEventListener('error', () => {
      seekBusy = false; pendingTime = null;
      if (!stage.classList.contains('video-ready') && scrubOn) failVideo();
    });
    const videoTime = p => clamp((p - V0) / (V1 - V0), 0, 1) * Math.max(0, video.duration - 0.05);

    /* resting rAF loop with dt-normalized lerp */
    let target = 0, shown = 0, rafId = null, lastTick = 0;
    let auto = false, autoRaf = null, lastAutoY = -1, idleTimer = null;
    function tick(now) {
      const dt = Math.min(100, now - (lastTick || now));
      lastTick = now;
      shown += (target - shown) * (1 - Math.pow(1 - 0.22, dt / 16.667));
      const rest = Math.abs(target - shown) < 0.0004;
      if (rest) shown = target;
      if (video.duration && !auto) requestSeek(videoTime(shown));
      updateCaptions(shown);
      updateScene(shown);
      if (rest) { rafId = null; lastTick = 0; } else rafId = requestAnimationFrame(tick);
    }
    function kick() { if (rafId === null) rafId = requestAnimationFrame(tick); }
    function onScroll() {
      if (auto) { if (Math.abs(scrollY - lastAutoY) > 4) onInput(); return; }
      target = heroProgress();
      if (heroOnScreen) kick();
      scheduleAuto(AUTO_IDLE);   // the autopilot waits until the page has been still for a moment
    }

    /* autopilot: when the visitor stops scrolling, the pour keeps going by itself. The video plays natively
       (every frame it has, no seeking) and the page scrolls along with it until the cup is full.
       Any wheel, touch, key or click hands control straight back to the scroll. */
    function canAuto() {
      return scrubOn && heroOnScreen && !document.hidden && !root.classList.contains('locked') &&
        video.duration > 0 && stage.classList.contains('video-ready') && heroProgress() < V1 - 0.004;
    }
    function startAuto() {
      if (auto || !canAuto()) return;
      auto = true;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
      seekBusy = false; pendingTime = null;
      root.style.scrollBehavior = 'auto';
      video.currentTime = videoTime(heroProgress());
      video.playbackRate = AUTO_RATE;
      const pr = video.play();
      if (pr && pr.catch) pr.catch(() => stopAuto());
      lastAutoY = Math.round(scrollY);
      autoRaf = requestAnimationFrame(autoFrame);
    }
    function autoFrame() {
      autoRaf = null;
      if (!auto) return;
      if (!heroOnScreen || document.hidden) { stopAuto(); return; }
      const frac = clamp(video.currentTime / Math.max(0.01, video.duration - 0.05), 0, 1);
      const p = V0 + frac * (V1 - V0);
      const y = Math.round(hero.getBoundingClientRect().top + scrollY + p * (hero.offsetHeight - innerHeight));
      if (y !== lastAutoY) { lastAutoY = y; scrollTo(0, y); }
      target = shown = p;
      updateCaptions(p);
      updateScene(p);
      if (frac >= 1 || video.ended) { stopAuto(); return; }
      autoRaf = requestAnimationFrame(autoFrame);
    }
    function stopAuto() {
      if (!auto) return;
      auto = false;
      video.pause();
      video.playbackRate = 1;
      root.style.scrollBehavior = '';
      if (autoRaf !== null) { cancelAnimationFrame(autoRaf); autoRaf = null; }
      target = heroProgress();
      kick();
    }
    function scheduleAuto(delay) { clearTimeout(idleTimer); idleTimer = setTimeout(startAuto, delay); }
    function onInput() { stopAuto(); scheduleAuto(AUTO_IDLE); }
    ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'].forEach(t => addEventListener(t, onInput, { passive: true }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAuto(); else scheduleAuto(AUTO_IDLE); });
    new IntersectionObserver(([e]) => { heroOnScreen = e.isIntersecting; if (heroOnScreen && scrubOn) { onScroll(); steam.kick(); } }).observe(hero);

    /* streamed Blob loader with honest ring */
    let currentKey = null, loadCtrl = null, objUrl = null;
    function initHero(key) {
      if (currentKey === key) return;
      currentKey = key;
      const S = SRC[key];
      stage.classList.remove('video-ready', 'video-failed');
      if (loadCtrl) { loadCtrl.abort(); loadCtrl = null; }
      if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; video.removeAttribute('src'); video.load(); }
      seekBusy = false; pendingTime = null;
      ring.style.setProperty('--ld', 126);
      poster.style.backgroundImage = "url('" + S.poster + "')";
      still.style.backgroundImage = "url('" + S.end + "')";
      steam.setSource(S);
      let go = false;
      const start = () => {
        if (go || currentKey !== key) return;
        go = true;
        loadHeroBlob(S, key).catch(() => { if (currentKey === key) failVideo(); });
      };
      const img = new Image();
      img.onload = start; img.onerror = start;
      img.src = S.poster;
      setTimeout(start, 4000);
    }
    async function loadHeroBlob(S, key) {
      const ctrl = new AbortController();
      loadCtrl = ctrl;
      let watchdog = setTimeout(() => ctrl.abort(), 20000);
      try {
        const res = await fetch(S.video, { signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error('video ' + res.status);
        const total = Number(res.headers.get('Content-Length')) || S.bytes;
        const reader = res.body.getReader();
        const chunks = [];
        let got = 0, lastRing = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          clearTimeout(watchdog);
          watchdog = setTimeout(() => ctrl.abort(), 20000);
          chunks.push(value);
          got += value.length;
          const frac = Math.min(1, got / total);
          const now = performance.now();
          if (now - lastRing > 100 || frac === 1) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
        }
        clearTimeout(watchdog);
        if (currentKey !== key) return;
        ring.style.setProperty('--ld', 0);
        objUrl = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
        video.addEventListener('canplay', () => {
          if (currentKey !== key) return;
          requestSeek(videoTime(heroProgress()));
          stage.classList.add('video-ready');
          if (!auto) scheduleAuto(heroProgress() < 0.01 ? AUTO_FIRST : AUTO_IDLE);
        }, { once: true });
        video.src = objUrl;
        video.load();
      } finally {
        clearTimeout(watchdog);
      }
    }
    /* without the video, a full cup crossfades in for the second half of the journey */
    function failVideo() {
      if (currentKey) posterEnd.style.backgroundImage = "url('" + SRC[currentKey].end + "')";
      stage.classList.add('video-failed');
    }

    /* live gate: scrub on or static hero */
    let scrubOn = false;
    const staticMQ = STATIC_GATES.map(q => matchMedia(q));
    const mobileMQ = matchMedia(MOBILE_Q);
    function enableScrub() {
      const key = mobileMQ.matches ? 'mob' : 'desk';
      wide = !mobileMQ.matches;
      if (!scrubOn) {
        scrubOn = true;
        addEventListener('scroll', onScroll, { passive: true });
        bands.forEach(B => { B.op = -1; B.k = -1; B.off = null; });
        lastOut = -1; lastVeil = -1; lastGlide = -1; cueGone = null; lateState = null; atCupState = null;
        steam.setLive(true);
      }
      initHero(key);
      measure();
      steam.resize();
      target = shown = heroProgress();
      updateCaptions(shown);
      updateScene(shown);
      onScroll();
    }
    function disableScrub() {
      if (!scrubOn) return;
      scrubOn = false;
      removeEventListener('scroll', onScroll);
      stopAuto();
      clearTimeout(idleTimer);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
      steam.setLive(false);
      bands.forEach(B => { B.el.style.opacity = ''; B.el.style.removeProperty('--k'); B.el.classList.remove('off'); B.op = -1; B.k = -1; B.off = null; });
      [splash, veil, move].forEach(el => { el.style.opacity = ''; el.style.transform = ''; el.style.filter = ''; el.style.visibility = ''; });
      move.style.removeProperty('--e');
      stage.classList.remove('at-cup');
    }
    function applyHeroMode() { if (staticMQ.some(m => m.matches)) disableScrub(); else enableScrub(); }
    staticMQ.forEach(m => m.addEventListener('change', applyHeroMode));
    mobileMQ.addEventListener('change', () => { if (scrubOn) enableScrub(); });
    addEventListener('resize', () => { measure(); if (scrubOn) { steam.resize(); onScroll(); } }, { passive: true });

    measure();
    applyHeroMode();
    return applyHeroMode;
  }
  const hero = $('.hero');
  const applyHeroMode = hero ? setupHero(hero) : null;

  /* ---------- header: tuck the address bar, go solid, floating offer (all delta-gated) ---------- */
  const topbar = $('#topbar');
  const floatCta = $('#floatCta'), cupSec = $('#cup'), contactSec = $('#contacto');
  const onScreen = el => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; };
  let tucked = null, solid = null, floatOn = null, headerQueued = false;
  function headerState() {
    headerQueued = false;
    const y = scrollY;
    const t = y > 40;
    if (t !== tucked) { tucked = t; topbar.classList.toggle('tucked', t); }
    /* home: solid once the pour is over; every other page: solid as soon as it scrolls */
    const s = hero ? y > hero.offsetHeight - innerHeight * 0.4 : y > 8;
    if (s !== solid) { solid = s; topbar.classList.toggle('solid', s); }
    if (floatCta) {
      /* after the pour (or a short scroll), hidden while the offer or the contact form is on screen */
      const past = hero ? y > hero.offsetHeight - innerHeight * 0.2 : y > innerHeight * 0.35;
      const f = past && !(cupSec && onScreen(cupSec)) && !(contactSec && contactSec.getBoundingClientRect().top <= innerHeight * 0.9) && !root.classList.contains('locked');
      if (f !== floatOn) { floatOn = f; floatCta.classList.toggle('show', f); floatCta.tabIndex = f ? 0 : -1; }
    }
  }
  addEventListener('scroll', () => { if (!headerQueued) { headerQueued = true; requestAnimationFrame(headerState); } }, { passive: true });
  addEventListener('resize', headerState, { passive: true });

  /* ---------- mobile drawer ---------- */
  const menuBtn = $('#menuBtn'), drawer = $('#drawer'), drawerClose = $('#drawerClose');
  function openDrawer() {
    drawer.classList.add('open'); root.classList.add('locked');
    menuBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => drawerClose.focus(), 50);
  }
  function closeDrawer(returnFocus) {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open'); root.classList.remove('locked');
    menuBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) menuBtn.focus();
  }
  menuBtn.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', () => closeDrawer(true));
  $$('a', drawer).forEach(a => a.addEventListener('click', () => closeDrawer(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(true); });

  /* ---------- reveals: staggered, then the stagger retires ---------- */
  $$('.reveal').forEach(el => Array.from(el.children).forEach((c, i) => c.style.setProperty('--i', i)));
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add('in');
      revealIO.unobserve(el);
      setTimeout(() => el.classList.add('settled'), 1100 + el.children.length * 110);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach(el => revealIO.observe(el));

  /* living elements run only while their section is on screen */
  const liveIO = new IntersectionObserver(entries => entries.forEach(e => e.target.classList.toggle('live', e.isIntersecting)), { threshold: 0 });
  $$('.sec, #ribbon').forEach(s => liveIO.observe(s));

  /* ---------- story numbers count up once (nuestra-historia.html) ---------- */
  const stats = $('.stats');
  const counters = $$('[data-count]');
  const fmt = n => n.toLocaleString('es-MX');
  let countersDone = false;
  function finishCounters() { countersDone = true; counters.forEach(c => { c.textContent = fmt(+c.dataset.count); }); }
  if (stats && !matchMedia('(prefers-reduced-motion: reduce)').matches && stats.getBoundingClientRect().bottom > 0) {
    counters.forEach(c => { c.textContent = '0'; });
    const countIO = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || countersDone) return;
      countIO.disconnect();
      const t0 = performance.now(), dur = 1700;
      const step = now => {
        if (countersDone) return;
        const t = clamp((now - t0) / dur, 0, 1), ease = 1 - Math.pow(1 - t, 3);
        counters.forEach(c => { c.textContent = fmt(Math.round(+c.dataset.count * ease)); });
        if (t < 1) requestAnimationFrame(step); else finishCounters();
      };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    countIO.observe(stats);
  }

  /* ---------- open now, in Mexico City time (sucursales.html cards, index.html hours table) ---------- */
  function mxNow() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const get = t => (parts.find(p => p.type === t) || {}).value;
    let h = +get('hour'); if (h === 24) h = 0;
    return { wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')), mins: h * 60 + +get('minute') };
  }
  function updateOpen() {
    const now = mxNow();
    $$('[data-open]').forEach(loc => {
      const days = loc.dataset.open.split(',').map(s => s.split('-').map(Number));
      const [o, c] = days[now.wd];
      const isOpen = now.mins >= o * 60 && now.mins < c * 60;
      const short = 'short' in loc.dataset;
      let txt;
      if (isOpen) txt = short ? 'Abierto ahora' : 'Abierto ahora · cierra a las ' + c + ':00';
      else if (now.mins < o * 60) txt = short ? 'Abre hoy a las ' + o + ':00' : 'Cerrado · abre hoy a las ' + o + ':00';
      else txt = short ? 'Cerrado · abre mañana' : 'Cerrado · abre mañana a las ' + days[(now.wd + 1) % 7][0] + ':00';
      const st = $('.loc-status', loc);
      if (st.textContent !== txt) { st.textContent = txt; st.classList.toggle('open', isOpen); }
    });
  }
  if ($('[data-open]')) { updateOpen(); setInterval(updateOpen, 60000); }
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

  /* ---------- hold to ripen (nuestra-historia.html) ---------- */
  const hold = !$('#hold') ? null : (() => {
    const btn = $('#hold'), wrap = $('#ripenStage'), prog = $('#holdRing'), fruit = $('#cherryBody'), stageEl = $('#holdStage');
    const C = 578.05;
    const GREEN = [127, 160, 74], YEL = [214, 168, 58], RED = [142, 24, 38];
    const STAGES = ['Verde · a pasto', 'Amarilla · ácida', 'Roja · dulce'];
    const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
    let v = 0, holding = false, raf = null, last = 0, done = false, pinned = false, lastStage = -1;
    function render() {
      prog.style.strokeDashoffset = (C * (1 - v)).toFixed(1);
      const c = v < 0.5 ? mix(GREEN, YEL, v * 2) : mix(YEL, RED, (v - 0.5) * 2);
      fruit.setAttribute('fill', 'rgb(' + c.join(',') + ')');
      const st = v < 0.4 ? 0 : v < 0.9 ? 1 : 2;
      if (st !== lastStage) { lastStage = st; stageEl.textContent = STAGES[st]; }
    }
    function loop(now) {
      const dt = Math.min(64, now - (last || now));
      last = now;
      if (holding) v = Math.min(1, v + dt / 1700);
      else v = Math.max(0, v - (dt / 1000) * (0.35 + v * 0.9));
      render();
      if (v >= 1 && !done) complete(false);
      if (!done && (holding || v > 0)) raf = requestAnimationFrame(loop);
      else { raf = null; last = 0; }
    }
    function complete(isPin) {
      done = true; holding = false; pinned = isPin;
      wrap.classList.remove('holding');
      wrap.classList.add('done');
      btn.setAttribute('aria-pressed', 'true');
    }
    function start() { if (done) return; holding = true; wrap.classList.add('holding'); if (raf === null) raf = requestAnimationFrame(loop); }
    function stop() { if (!holding) return; holding = false; wrap.classList.remove('holding'); if (raf === null && !done) raf = requestAnimationFrame(loop); }
    btn.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (_) {} start(); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, stop));
    btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
    btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } });
    btn.addEventListener('blur', stop);
    btn.addEventListener('contextmenu', e => e.preventDefault());
    render();
    return {
      finish() { if (done) return; v = 1; render(); complete(true); },
      unpin() { if (!pinned) return; pinned = false; done = false; v = 0; wrap.classList.remove('done'); btn.removeAttribute('aria-pressed'); lastStage = -1; render(); }
    };
  })();

  /* ---------- sucursales: cards, map pins and the live map stay in sync ---------- */
  const locBtns = $$('.loc'), pins = $$('.map .pin');
  /* the real streets around each bar (OpenStreetMap), turned dark and warm to match the site;
     if the map library or the tiles can't load, the illustrated map underneath stays */
  const liveMap = (() => {
    const el = $('#mapLive');
    if (!el || !window.L) return null;
    const PLACES = {
      roma: { ll: [19.4219, -99.1606], name: 'Ripe Roma Norte' },
      condesa: { ll: [19.41503, -99.1694], name: 'Ripe Condesa' },
      coyoacan: { ll: [19.3493, -99.1706], name: 'Ripe Coyoacán' }
    };
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const box = el.closest('.map');
    box.classList.add('is-live');   // visible before Leaflet measures it
    const map = L.map(el, { zoomControl: false, scrollWheelZoom: false, keyboard: false, zoomSnap: 0.25, dragging: !L.Browser.mobile, tap: false })
      .setView(PLACES.roma.ll, 16.25);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    const markers = {};
    Object.keys(PLACES).forEach(id => {
      const icon = L.divIcon({ className: 'mpin', html: '<i></i><b>' + PLACES[id].name + '</b>', iconSize: [16, 16], iconAnchor: [8, 8] });
      markers[id] = L.marker(PLACES[id].ll, { icon, keyboard: false, title: PLACES[id].name }).addTo(map);
      markers[id].on('click', () => selectLoc(id));
    });
    box.removeAttribute('aria-hidden');
    addEventListener('resize', () => map.invalidateSize(), { passive: true });
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Mapa de las sucursales de Ripe');
    return {
      show(id, first) {
        Object.keys(markers).forEach(k => { const m = markers[k].getElement(); if (m) m.classList.toggle('on', k === id); });
        if (first || calm.matches) map.setView(PLACES[id].ll, 16.25, { animate: false });
        else map.flyTo(PLACES[id].ll, 16.25, { duration: 1.8, easeLinearity: 0.2 });
      }
    };
  })();
  function selectLoc(id, first) {
    locBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.loc === id)));
    pins.forEach(p => p.classList.toggle('on', p.dataset.loc === id));
    if (liveMap) liveMap.show(id, first);
  }
  if (liveMap) selectLoc((locBtns.find(b => b.getAttribute('aria-pressed') === 'true') || locBtns[0]).dataset.loc, true);
  locBtns.forEach(b => b.addEventListener('click', () => selectLoc(b.dataset.loc)));
  pins.forEach(p => p.addEventListener('click', () => selectLoc(p.dataset.loc)));
  /* sucursales.html#condesa opens with that branch already marked */
  const fromHash = location.hash.slice(1);
  if (locBtns.some(b => b.dataset.loc === fromHash)) selectLoc(fromHash, true);

  /* ---------- reduced motion, live in both directions ---------- */
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  function pinToFinalStates() {
    $$('.reveal').forEach(el => { el.classList.add('in', 'settled'); revealIO.unobserve(el); });
    if (hold) hold.finish();
    finishCounters();
  }
  function unpinFinalStates() { if (hold) hold.unpin(); }
  rmq.addEventListener('change', e => { if (e.matches) pinToFinalStates(); else { unpinFinalStates(); if (applyHeroMode) applyHeroMode(); } });
  if (rmq.matches) pinToFinalStates();

  /* ---------- forms: Bootstrap validation + sending through Formspree ---------- */
  /* Each <form> carries action="https://formspree.io/f/ID". While the ID is still the placeholder,
     the form only shows its success state (demo) and sends nothing. */
  const FORMSPREE = /^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i;
  function wireForm(formId, okId) {
    const form = $(formId), ok = $(okId);
    if (!form) return;
    const btn = $('button[type="submit"]', form), err = $('.form-error', form);
    const label = btn.textContent;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      /* Bootstrap validation: mark the form, show each field's message and jump to the first one to fix */
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        const bad = form.querySelector(':invalid');
        if (bad) bad.focus();
        return;
      }
      ok.querySelector('[data-name]').textContent = form.elements.nombre.value.trim().split(/\s+/)[0];
      const code = ok.querySelector('[data-code]');
      if (code) {
        const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        code.textContent = 'RIPE-' + Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
        if (form.elements.codigo) form.elements.codigo.value = code.textContent; /* the coupon code travels in the email */
      }
      const endpoint = form.getAttribute('action') || '';
      if (FORMSPREE.test(endpoint)) {
        if (err) err.hidden = true;
        btn.disabled = true;
        btn.textContent = 'Enviando…';
        try {
          const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error('Formspree ' + res.status);
        } catch (error) {
          btn.disabled = false;
          btn.textContent = label;
          if (err) err.hidden = false;
          return;
        }
      }
      form.classList.add('sent');
      ok.hidden = false;
      ok.focus();
    });
  }
  wireForm('#cupForm', '#cupOk');
  wireForm('#contactForm', '#contactOk');

  /* ---------- go ---------- */
  headerState();
})();
