// Anime AutoPlay — player.js v12

(function () {
  'use strict';

  if (window.self === window.top) return;
  const DBG = () => {}; // logs silenciados


  let S = {
    autoplay: true,
    countdownSeconds: 5,
    skipBeforeEnd: 0,
    introSkip: false,
    introAuto: false,   // true = saltar automáticamente sin botón
    introFrom: 0,
    introTo: 90,
    nextLabel: 'Episodio siguiente',
    nextUrl: '',
  };

  let earlyFired      = false;
  let introSkipDone   = false;
  let countdownTimer  = null;
  let countdownActive = false;
  let countdownSecs   = 0;

  // ── Settings ─────────────────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (!e.data || e.data._aap !== true) return;
    if (e.data.type === 'SETTINGS') S = { ...S, ...e.data.payload };
    // Reproducir vídeo tras salto de episodio — y desmutearlo si el browser lo muteó por autoplay
    if (e.data.type === 'PLAY_VIDEO') {
      DBG('PLAY_VIDEO recibido, llamando playPersistent');
      playPersistent();
    }
    // Desmutear directamente — para casos donde el video arrancó muted por autoplay policy
    // y mutePlay no puede desmutearlo porque cacheó wasMuted=true del estado autoplay.
    // video.muted = false vía JS no está bloqueado por la policy cuando el video ya está playing.
    if (e.data.type === 'UNMUTE') {
      document.querySelectorAll('video').forEach(v => {
        try {
          delete v._aapOrigMuted; // resetear cache de mutePlay para no volver a mutear
          v.muted = false;
          if (v.volume === 0) v.volume = 1;
        } catch (_) {}
      });
      // API oficial de Dailymotion y Vimeo
      document.querySelectorAll('iframe').forEach(f => {
        if (!f.src) return;
        if (f.src.includes('dailymotion.com')) {
          try { f.contentWindow.postMessage({ command: 'setMuted', parameters: [false] }, '*'); } catch (_) {}
          try { f.contentWindow.postMessage({ command: 'setVolume', parameters: [1] }, '*'); } catch (_) {}
        }
        if (f.src.includes('vimeo.com')) {
          try { f.contentWindow.postMessage({ method: 'setMuted', value: false }, '*'); } catch (_) {}
          try { f.contentWindow.postMessage({ method: 'setVolume', value: 1 }, '*'); } catch (_) {}
        }
      });
    }
    if (e.data.type === 'SETTINGS') {
      DBG('SETTINGS recibido, autoFullscreen=', e.data.payload?.autoFullscreen, 'nextUrl=', e.data.payload?.nextUrl);
    }
    // Pantalla completa via tecla F, guardando y restaurando volumen/mute
    if (e.data.type === 'SAVE_AND_PRESSF' || e.data.type === 'PRESS_F') {
      const audioStates = [];
      document.querySelectorAll('video').forEach(v => {
        audioStates.push({ v, muted: v.muted, volume: v.volume });
      });

      // Simular tecla F
      ['keydown', 'keypress', 'keyup'].forEach(type => {
        document.dispatchEvent(new KeyboardEvent(type, {
          key: 'f', code: 'KeyF', keyCode: 70, which: 70,
          bubbles: true, cancelable: true,
        }));
      });

      // Empezar a vigilar cuándo entra en fullscreen para hacer play
      watchForFullscreenAndPlay();

      // Restaurar audio
      [300, 600, 1200].forEach(delay => {
        setTimeout(() => {
          audioStates.forEach(({ v, muted, volume }) => {
            v.muted  = muted;
            v.volume = volume > 0 ? volume : 1;
            if (v.muted && volume > 0) v.muted = false;
          });
        }, delay);
      });
    }
  });
  // Reintenta hasta que el video aparezca y empiece a reproducirse, o hasta timeout
  let playPersistentActive = false;
  function playPersistent() {
    if (playPersistentActive) return;
    playPersistentActive = true;

    const start = Date.now();
    const MAX_MS = 15000;

    function attempt() {
      const vid = document.querySelector('video');
      const dmIframe = document.querySelector('iframe[src*="dailymotion.com"]');
      if (!vid && dmIframe) DBG('playPersistent: sin <video> pero hay iframe Dailymotion');
      if (vid) DBG('playPersistent: <video> readyState=', vid.readyState, 'paused=', vid.paused, 'muted=', vid.muted);
      if (vid && !vid.paused && !vid.ended) { DBG('playPersistent: ya reproduciéndose'); return true; }
      if (vid) {
        if (vid.readyState >= 2) {
          mutePlay(vid);
          tryPlay();
        } else {
          vid.addEventListener('canplay', () => { if (vid.paused) { mutePlay(vid); tryPlay(); } }, { once: true });
        }
      }
      clickUnmuteButton();

      // API oficial de Dailymotion (iframe con ?api=postMessage)
      document.querySelectorAll('iframe').forEach(f => {
        if (!f.src) return;
        if (f.src.includes('dailymotion.com')) {
          try {
            f.contentWindow.postMessage({ command: 'play', parameters: [] }, '*');
            f.contentWindow.postMessage({ command: 'setMuted', parameters: [false] }, '*');
          } catch (_) {}
        }
        // API oficial de Vimeo
        if (f.src.includes('vimeo.com') || f.src.includes('player.vimeo.com')) {
          try {
            f.contentWindow.postMessage({ method: 'play' }, '*');
            f.contentWindow.postMessage({ method: 'setMuted', value: false }, '*');
          } catch (_) {}
        }
      });

      return false;
    }

    attempt();
    const interval = setInterval(() => {
      if (attempt() || Date.now() - start > MAX_MS) {
        clearInterval(interval);
        playPersistentActive = false;
      }
    }, 400);

    // También observar nuevos elementos <video> añadidos al DOM (Dailymotion lo crea dinámicamente)
    const mo = new MutationObserver(() => { attempt(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), MAX_MS);
  }

  function mutePlay(vid) {
    if (vid._aapMpInFlight) return Promise.resolve();
    vid._aapMpInFlight = true;
    if (vid._aapOrigMuted === undefined) vid._aapOrigMuted = vid.muted;
    const wasMuted = vid._aapOrigMuted;
    vid.muted = true;
    return vid.play()
      .then(() => { setTimeout(() => {
        vid.muted = wasMuted;
        if (vid.volume === 0) vid.volume = 1;
        vid._aapMpInFlight = false;
      }, 300); })
      .catch(() => { vid.muted = wasMuted; vid._aapMpInFlight = false; });
  }

  function ask() {
    try { window.parent.postMessage({ _aap: true, type: 'GET_SETTINGS' }, '*'); } catch (_) {}
  }
  ask(); setTimeout(ask, 1500);

  function notify(type, extra) {
    const msg = { _aap: true, type, ...extra };
    try { window.parent.postMessage(msg, '*'); } catch (_) {}
    try { window.top.postMessage(msg, '*'); } catch (_) {}
  }

  // Hacer click en el botón de unmute del player (Dailymotion, JWPlayer, etc.)
  // cuando su UI muestra el overlay de mute aunque el vídeo ya esté desmuteado
  function clickUnmuteButton() {
    const selectors = [
      // Dailymotion
      'button.tap_to_unmute',
      'button[aria-label="Activar sonido"]',
      '[data-testid="unmute-button"]',
      // JWPlayer
      '.jw-icon-mute',
      // Genérico
      'button[class*="unmute"]',
      'button[class*="Unmute"]',
    ];

    const tryClick = () => {
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn) { btn.click(); return true; }
      }
      return false;
    };

    if (!tryClick()) {
      setTimeout(tryClick, 500);
      setTimeout(tryClick, 1000);
    }
  }

  // ── Contenedor para overlays ─────────────────────────────────────────────────
  // Clave: cuando el iframe está en fullscreen, document.fullscreenElement
  // es el elemento que ocupa toda la pantalla. Insertando dentro de él
  // con position:absolute inset:0 (para el wrapper) y position:absolute
  // bottom/right para el overlay, funciona correctamente.
  // Cuando NO hay fullscreen, usamos document.body igualmente.
  function getRoot() {
    return document.fullscreenElement
      || document.webkitFullscreenElement
      || document.body;
  }

  // Wrapper transparente de tamaño completo que actúa como contexto de posición
  // para nuestros overlays. Se recrea si el elemento fullscreen cambia.
  let wrapperEl = null;

  function getWrapper() {
    const root = getRoot();

    // Si ya existe y está en el root correcto, reutilizarlo
    if (wrapperEl && root.contains(wrapperEl)) return wrapperEl;

    // Crear nuevo wrapper
    if (wrapperEl) wrapperEl.remove();
    wrapperEl = document.createElement('div');
    wrapperEl.id = '_aap_wrapper';
    wrapperEl.style.cssText = `
      position: absolute !important;
      inset: 0 !important;
      pointer-events: none !important;
      z-index: 2147483640 !important;
      overflow: visible !important;
    `;
    // Asegurar que root tiene position no-static
    const cs = getComputedStyle(root);
    if (cs.position === 'static') root.style.position = 'relative';
    root.appendChild(wrapperEl);
    return wrapperEl;
  }

  // Mover overlays al nuevo root cuando cambia el fullscreen
  document.addEventListener('fullscreenchange', relocateOverlays);
  document.addEventListener('webkitfullscreenchange', relocateOverlays);
  function relocateOverlays() {
    // Forzar recreación del wrapper en el nuevo root
    if (wrapperEl) { wrapperEl.remove(); wrapperEl = null; }
    const w = getWrapper();
    if (cdEl)     w.appendChild(cdEl);
    if (skipBtnEl) w.appendChild(skipBtnEl);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // OVERLAY COUNTDOWN
  // ══════════════════════════════════════════════════════════════════════════════
  let cdEl = null;

  function buildCountdown() {
    if (cdEl) return;
    const circ = 2 * Math.PI * 25;
    const host = document.createElement('div');
    host.id = '_aap_cd';
    host.style.cssText = `
      position: absolute !important;
      bottom: 80px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      opacity: 0 !important;
      transform: translateY(14px) scale(0.96) !important;
      transition: opacity 0.3s ease, transform 0.3s ease !important;
      pointer-events: none !important;
    `;
    getWrapper().appendChild(host);

    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        #card {
          background:rgba(8,10,18,0.97);
          border:1px solid rgba(79,142,247,0.35);
          border-radius:14px;
          padding:18px 22px 16px;
          display:flex; flex-direction:column; align-items:center; gap:10px;
          min-width:210px;
          box-shadow:0 8px 40px rgba(0,0,0,0.7);
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        }
        #lbl { font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.38); font-weight:700; }
        #wrap { position:relative; width:60px; height:60px; display:flex; align-items:center; justify-content:center; }
        svg { position:absolute; top:0; left:0; width:60px; height:60px; transform:rotate(-90deg); }
        .rb { fill:none; stroke:rgba(255,255,255,0.08); stroke-width:3; }
        .rf { fill:none; stroke:#4F8EF7; stroke-width:3; stroke-linecap:round; transition:stroke-dashoffset 0.9s linear; }
        #num { font-size:22px; font-weight:800; color:#fff; position:relative; z-index:1; line-height:1; }
        #ttl { font-size:12px; font-weight:600; color:rgba(255,255,255,0.78); text-align:center; max-width:170px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #btns { display:flex; gap:8px; margin-top:3px; }
        button { border:none; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; padding:7px 14px; transition:all 0.15s; font-family:inherit; letter-spacing:0.02em; pointer-events:all; }
        #no  { background:rgba(255,255,255,0.09); color:rgba(255,255,255,0.55); }
        #no:hover  { background:rgba(255,255,255,0.16); color:#fff; }
        #yes { background:#4F8EF7; color:#060d1f; }
        #yes:hover { background:#00d4b8; }
      </style>
      <div id="card">
        <div id="lbl">Siguiente episodio en</div>
        <div id="wrap">
          <svg viewBox="0 0 60 60">
            <circle class="rb" cx="30" cy="30" r="25"/>
            <circle class="rf" cx="30" cy="30" r="25" id="ring"
              style="stroke-dasharray:${circ};stroke-dashoffset:0"/>
          </svg>
          <span id="num">5</span>
        </div>
        <div id="ttl">Episodio siguiente</div>
        <div id="btns">
          <button id="no" style="pointer-events:all">Cancelar</button>
          <button id="yes" style="pointer-events:all">▶ Ver ahora</button>
        </div>
      </div>
    `;
    sh.getElementById('no').onclick  = () => { stopCountdown(); notify('CANCELLED'); };
    sh.getElementById('yes').onclick = () => {
      stopCountdown();
      if (S.autoFullscreen) enterFullscreenNow(); // gesture real → fullscreen directo
      setTimeout(() => notify('PLAY_NOW', { nextUrl: S.nextUrl }), S.autoFullscreen ? 400 : 0);
    };
    host._sh = sh;
    cdEl = host;
  }

  function showCountdown() {
    buildCountdown();
    cdEl._sh.getElementById('ttl').textContent = S.nextLabel || 'Episodio siguiente';
    cdEl.getBoundingClientRect(); // forzar reflow
    cdEl.style.setProperty('opacity', '1', 'important');
    cdEl.style.setProperty('transform', 'translateY(0) scale(1)', 'important');
    cdEl.style.setProperty('pointer-events', 'all', 'important');
    countdownActive = true;
  }

  function hideCountdown() {
    if (cdEl) {
      cdEl.style.setProperty('opacity', '0', 'important');
      cdEl.style.setProperty('transform', 'translateY(14px) scale(0.96)', 'important');
      cdEl.style.setProperty('pointer-events', 'none', 'important');
    }
    countdownActive = false;
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }

  function stopCountdown() { hideCountdown(); }

  function tickCountdown(secs) {
    if (!cdEl?._sh) return;
    const sh = cdEl._sh;
    sh.getElementById('num').textContent = secs;
    const ring = sh.getElementById('ring');
    if (ring) {
      const circ = 2 * Math.PI * 25;
      ring.style.strokeDashoffset = `${circ - (secs / Math.max(S.countdownSeconds, 1)) * circ}`;
    }
  }

  function countdownTick() {
    countdownSecs--;
    if (countdownSecs <= 0) {
      clearInterval(countdownTimer); countdownTimer = null;
      hideCountdown();
      notify('PLAY_NOW', { nextUrl: S.nextUrl });
    } else {
      tickCountdown(countdownSecs);
    }
  }

  function startCountdown() {
    if (!S.autoplay || countdownActive || !S.nextUrl) return;
    notify('STARTING');
    countdownSecs = S.countdownSeconds;
    showCountdown();
    tickCountdown(countdownSecs);
    countdownTimer = setInterval(countdownTick, 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    } else if (countdownActive && countdownSecs > 0) {
      countdownTimer = setInterval(countdownTick, 1000);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // BOTÓN / AUTO SALTAR INTRO
  // ══════════════════════════════════════════════════════════════════════════════
  let skipBtnEl = null;
  let skipBtnInterval = null;

  function buildSkipBtn(video) {
    if (skipBtnEl) return;
    const host = document.createElement('div');
    host.id = '_aap_skip';
    host.style.cssText = `
      position: absolute !important;
      bottom: 80px !important;
      right: 20px !important;
      z-index: 2147483646 !important;
      pointer-events: all !important;
    `;
    getWrapper().appendChild(host);

    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `
      <style>
        button {
          background: rgba(8,10,18,0.92);
          border: 2px solid rgba(79,142,247,0.6);
          border-radius: 10px;
          color: #4F8EF7;
          font-size: 15px;
          font-weight: 800;
          padding: 11px 22px;
          cursor: pointer;
          font-family: -apple-system, 'Segoe UI', sans-serif;
          letter-spacing: 0.04em;
          transition: all 0.15s;
          white-space: nowrap;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 12px rgba(79,142,247,0.2);
          pointer-events: all;
        }
        button:hover {
          background: #4F8EF7;
          color: #060d1f;
          box-shadow: 0 4px 24px rgba(79,142,247,0.4);
          transform: scale(1.04);
        }
      </style>
      <button id="btn">⏩ Saltar intro</button>
    `;

    sh.getElementById('btn').onclick = () => {
      doIntroSkip(video);
    };

    host._sh = sh;
    skipBtnEl = host;

    // Ocultar cuando pase el tiempo fin de intro
    const hideAt = S.introTo + 2;
    skipBtnInterval = setInterval(() => {
      if (!video || video.currentTime >= hideAt) hideSkipBtn();
    }, 300);
  }

  function hideSkipBtn() {
    if (skipBtnInterval) { clearInterval(skipBtnInterval); skipBtnInterval = null; }
    if (skipBtnEl) { skipBtnEl.remove(); skipBtnEl = null; }
  }

  function doIntroSkip(video) {
    introSkipDone = true;
    hideSkipBtn();
    const wasPlaying = !video.paused;
    video.currentTime = S.introTo;
    if (wasPlaying) {
      const resume = () => { video.play().catch(() => {}); video.removeEventListener('seeked', resume); };
      video.addEventListener('seeked', resume);
      setTimeout(() => { if (video.paused) video.play().catch(() => {}); }, 250);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ATTACH VIDEO
  // ══════════════════════════════════════════════════════════════════════════════
  function attach(v) {
    if (v._aap) return;
    v._aap = true;

    v.addEventListener('loadedmetadata', () => {
      earlyFired    = false;
      introSkipDone = false;
      hideSkipBtn();
      hideCountdown();
    });

    v.addEventListener('ended', () => {
      hideSkipBtn();
      if (S.autoplay) setTimeout(startCountdown, 500);
    });

    v.addEventListener('timeupdate', () => {
      const t   = v.currentTime;
      const dur = v.duration;

      // ── Intro skip ────────────────────────────────────────────────────────
      if (S.introSkip && !introSkipDone && S.introTo > S.introFrom && S.introFrom >= 0) {
        if (t >= S.introFrom && t < S.introTo) {
          if (S.introAuto) {
            // Modo automático: saltar sin mostrar botón
            doIntroSkip(v);
          } else {
            // Modo manual: mostrar botón
            buildSkipBtn(v);
          }
        } else if (skipBtnEl) {
          hideSkipBtn();
        }
      }

      // ── Trigger anticipado ────────────────────────────────────────────────
      const skip = S.skipBeforeEnd || 0;
      if (!S.autoplay || earlyFired || countdownActive || skip <= 0 || !dur || dur < 30) return;
      const rem = dur - t;
      if (rem > 0 && rem <= skip) {
        earlyFired = true;
        v.addEventListener('seeking', () => { earlyFired = false; }, { once: true });
        startCountdown();
      }
    });
  }

  function scan() { document.querySelectorAll('video').forEach(attach); }
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(scan, 2000);

  // Entrar en fullscreen desde un gesto de usuario (click en "Ver ahora")
  function enterFullscreenNow() {
    // 1. API JWPlayer (no necesita gesture del navegador)
    try {
      if (window.jwplayer) {
        for (const el of document.querySelectorAll('[id]')) {
          try {
            const jw = window.jwplayer(el.id);
            if (jw && typeof jw.getState === 'function') { jw.setFullscreen(true); return; }
          } catch (_) {}
        }
      }
    } catch (_) {}
    // 2. API VideoJS
    try {
      if (window.videojs) {
        const vjsEl = document.querySelector('.video-js[id], [data-vjs-player][id]');
        if (vjsEl) { const vj = window.videojs.getPlayer(vjsEl.id); if (vj) { vj.requestFullscreen(); return; } }
      }
    } catch (_) {}
    // 3. HTML5 nativo — funciona porque estamos dentro de un click handler real
    const target = document.querySelector('.jw-wrapper, .jw-media, .video-js, video, .plyr');
    if (target) { (target.requestFullscreen || target.webkitRequestFullscreen)?.call(target).catch(() => {}); }
  }

  // Intentar play con JWPlayer o fallback nativo
  function tryPlay() {
    const vid = document.querySelector('video');
    if (!vid || vid.ended || !vid.paused) return;

    // 1. Click en el centro del player — donde está el botón grande de play de JWPlayer
    const playerEl = document.querySelector('.jw-media, .jw-wrapper, video');
    if (playerEl) {
      const rect = playerEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      ['mousedown','mouseup','click'].forEach(type => {
        playerEl.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true,
          clientX: cx, clientY: cy,
          view: window,
        }));
      });
    }

    // 2. Click directo en el botón de play visible
    const playBtn = document.querySelector(
      '.jw-icon-display[aria-label="Play"], .jw-icon-playback[aria-label="Play"], ' +
      '.jw-svg-icon-play, .jw-icon-play, ' +
      '.vjs-big-play-button, .vjs-play-control[title="Play"], ' +
      '.plyr__control--overlaid, button[data-plyr="play"], ' +
      '.vp-play-button, .play-button, .pjs-play-button'
    );
    if (playBtn) { playBtn.click(); return; }

    // 3. API JWPlayer
    try {
      if (window.jwplayer) {
        for (const el of document.querySelectorAll('[id]')) {
          try {
            const jw = window.jwplayer(el.id);
            if (jw && typeof jw.getState === 'function') {
              const st = jw.getState();
              if (st === 'paused' || st === 'idle') { jw.play(); return; }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 4. API VideoJS
    try {
      if (window.videojs) {
        const vjsEl = document.querySelector('.video-js[id], [data-vjs-player][id]');
        if (vjsEl) {
          const vj = window.videojs.getPlayer(vjsEl.id);
          if (vj && vj.paused()) { vj.play(); return; }
        }
      }
    } catch (_) {}

    // 5. Fallback nativo
    mutePlay(vid);
  }

  // Cuando se envía PRESS_F, hacer polling hasta detectar fullscreen y luego play
  function watchForFullscreenAndPlay() {
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const inFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.querySelector('.jw-icon-fullscreen.jw-off')
      );
      if (inFs) {
        clearInterval(poll);
        notify('FULLSCREEN_ENTERED');
        setTimeout(tryPlay, 300);
        setTimeout(tryPlay, 700);
        setTimeout(tryPlay, 1400);
        setTimeout(tryPlay, 2500);
      }
      if (attempts > 40) clearInterval(poll); // max 8s
    }, 200);
  }

  // También escuchar fullscreenchange nativo (por si requestFullscreen funciona)
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      notify('FULLSCREEN_ENTERED');
      setTimeout(tryPlay, 300);
      setTimeout(tryPlay, 800);
    }
  });
  document.addEventListener('webkitfullscreenchange', () => {
    if (document.webkitFullscreenElement) {
      notify('FULLSCREEN_ENTERED');
      setTimeout(tryPlay, 300);
      setTimeout(tryPlay, 800);
    }
  });
})();
