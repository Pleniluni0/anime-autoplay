// Anime AutoPlay — main.js v14

(function () {
  'use strict';

  if (window.self !== window.top) return;
  const DBG = (...a) => console.log('[AAP]', ...a);

  let settings = {
    autoplay: true, countdownSeconds: 5, countdownOverlay: true, skipBeforeEnd: 0,
    introSkip: false, introAuto: false, introSpeed: false, introFrom: 0, introTo: 90,
    rememberPlayer: true, autoFullscreen: false, keyboardShortcuts: true,
    nightMode: false, nightEpisodes: 3, nightLeft: 3,
  };

  const HOST = window.location.hostname;
  const IS_AV1      = HOST.includes('animeav1.com');
  const IS_FLV      = HOST.includes('animeflv.net');
  const IS_SDONGHUA = HOST.includes('seriesdonghua.com');
  const IS_MUNDO    = HOST.includes('mundodonghua.com');
  const IS_DLIFE    = HOST.includes('donghualife.com');
  const IS_JKANIME  = HOST.includes('jkanime.net');

  // Android (incluye Lemur Browser, Chromium móvil): desmutear sin gesto del usuario
  // hace que el navegador PAUSE el vídeo si arrancó bajo la excepción de muted-autoplay.
  const IS_ANDROID = /android/i.test(navigator.userAgent);

  const _ext = typeof chrome !== 'undefined' ? chrome : browser;
  const T = (k, v) => AAP_I18N.t(k, v); // i18n.js (es/en; por defecto el idioma del navegador)

  // ── Guarda de pausas propias ───────────────────────────────────────────────
  // Ventana temporal en lugar de flag booleana: el evento `pause` que provocan
  // nuestras operaciones (mute/unmute, seek) llega en un tick posterior, cuando
  // una flag booleana ya se habría borrado y el pause se interpretaría como
  // "el usuario pausó", abortando todos los reintentos de reproducción.
  function markOurPause(v, ms) { try { v._aapOurPauseUntil = Date.now() + (ms || 900); } catch (_) {} }
  function isOurPause(v)       { return !!(v && v._aapOurPauseUntil && Date.now() < v._aapOurPauseUntil); }
  function clearOurPause(v)    { try { delete v._aapOurPauseUntil; } catch (_) {} }

  // Audio ya desbloqueado dentro de un gesto trusted. A partir de ese momento
  // mutePlay NO debe volver a mutear: en Android el mute provoca un pause y con
  // él el bucle play/pause. Flag de sesión, no por vídeo.
  let audioUnlocked = false;

  // ── Desmutear en el próximo gesto real del usuario (Android) ───────────────
  // En Android no podemos desmutear desde código asíncrono. Registramos un
  // listener de un solo uso sobre un evento trusted para recuperar el audio.
  let unmuteOnGestureArmed = false;
  function armUnmuteOnGesture() {
    if (unmuteOnGestureArmed) return;
    unmuteOnGestureArmed = true;
    const doUnmute = (e) => {
      if (!e.isTrusted) return;
      audioUnlocked = true;
      document.querySelectorAll('video').forEach(v => {
        try { delete v._aapOrigMuted; v.muted = false; if (v.volume === 0) v.volume = 1; } catch (_) {}
      });
      document.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow.postMessage({ _aap: true, type: 'UNMUTE', gesture: true }, '*'); } catch (_) {}
      });
      unmuteOnGestureArmed = false;
      ['pointerdown', 'touchend', 'click', 'keydown'].forEach(t =>
        document.removeEventListener(t, doUnmute, true));
    };
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(t =>
      document.addEventListener(t, doUnmute, true));
  }

  // Desmutea sólo si es seguro. Devuelve true si lo hizo.
  function safeUnmute(v) {
    if (!v) return false;
    if (IS_ANDROID) { if (v.muted) armUnmuteOnGesture(); return false; }
    try { v.muted = false; if (v.volume === 0) v.volume = 1; } catch (_) {}
    return true;
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  let settingsLoaded = false;
  function loadSettings(cb) {
    _ext.storage.sync.get({
      autoplay: true, countdownSeconds: 5, countdownOverlay: true, skipBeforeEnd: 0,
      introSkip: false, introAuto: false, introSpeed: false, introFrom: 0, introTo: 90,
      rememberPlayer: true, autoFullscreen: false, keyboardShortcuts: true, lang: null,
      nightMode: false, nightEpisodes: 3, nightLeft: 3,
    }, (d) => { settings = d; AAP_I18N.setPref(d.lang); settingsLoaded = true; if (cb) cb(); });
  }
  _ext.storage.onChanged.addListener((c) => {
    if (c.autoplay)          settings.autoplay         = c.autoplay.newValue;
    if (c.countdownSeconds)  settings.countdownSeconds = c.countdownSeconds.newValue;
    if (c.countdownOverlay != null) settings.countdownOverlay = c.countdownOverlay.newValue;
    if (c.skipBeforeEnd)     settings.skipBeforeEnd    = c.skipBeforeEnd.newValue;
    if (c.introSkip)         settings.introSkip        = c.introSkip.newValue;
    if (c.introAuto)         settings.introAuto        = c.introAuto.newValue;
    if (c.introSpeed)        settings.introSpeed       = c.introSpeed.newValue;
    if (c.introFrom != null) settings.introFrom        = c.introFrom.newValue;
    if (c.introTo   != null) settings.introTo          = c.introTo.newValue;
    if (c.rememberPlayer != null) settings.rememberPlayer = c.rememberPlayer.newValue;
    if (c.autoFullscreen != null) settings.autoFullscreen = c.autoFullscreen.newValue;
    if (c.keyboardShortcuts != null) settings.keyboardShortcuts = c.keyboardShortcuts.newValue;
    if (c.nightMode != null) settings.nightMode = c.nightMode.newValue;
    if (c.nightEpisodes != null) settings.nightEpisodes = c.nightEpisodes.newValue;
    if (c.nightLeft != null) settings.nightLeft = c.nightLeft.newValue;
    if (c.lang != null) { settings.lang = c.lang.newValue; AAP_I18N.setPref(settings.lang); }
    pushSettings(); scanAllVideos();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // NAVEGACIÓN
  // ════════════════════════════════════════════════════════════════════════════
  function av1_next() {
    const btn = document.querySelector('a[aria-label="Siguiente"]');
    if (btn?.href) return btn.href;
    const sel = document.getElementById('selected-episode') || document.querySelector('a.on[href*="/media/"]');
    if (sel?.parentElement?.parentElement) {
      const kids = Array.from(sel.parentElement.parentElement.children);
      const i = kids.indexOf(sel.parentElement);
      if (i >= 0 && i < kids.length - 1) { const a = kids[i+1].querySelector('a'); if (a?.href) return a.href; }
    }
    const m = window.location.pathname.match(/^(.*\/)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1);
    return null;
  }
  function av1_label() {
    const sel = document.getElementById('selected-episode') || document.querySelector('a.on[href*="/media/"]');
    if (sel?.parentElement?.parentElement) {
      const kids = Array.from(sel.parentElement.parentElement.children);
      const i = kids.indexOf(sel.parentElement);
      if (i >= 0 && i < kids.length - 1) { const num = kids[i+1].querySelector('a')?.textContent.trim(); if (num) return T('ep_n', { n: num }); }
    }
    return T('next_ep_default');
  }
  function flv_next() {
    const btn = document.querySelector('a.CapNvNx, a[href*="/ver/"][class*="Nx"]');
    if (btn?.href) return btn.href;
    const m = window.location.pathname.match(/^(.*-)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1);
    return null;
  }
  function flv_label() {
    const btn = document.querySelector('a.CapNvNx, a[href*="/ver/"][class*="Nx"]');
    if (btn?.href) { const m = btn.href.match(/-(\d+)\/?$/); if (m) return T('ep_n', { n: m[1] }); }
    const curr = document.querySelector('h2.SubTitle, .SubTitle');
    if (curr) { const m2 = curr.textContent.match(/(\d+)/); if (m2) return T('ep_n', { n: parseInt(m2[1]) + 1 }); }
    return T('next_ep_default');
  }
  function sdonghua_next() {
    const links = document.querySelectorAll('.media-bar-player a, a[href*="episodio"]');
    for (const a of links) { if (a.textContent.trim().toLowerCase().includes('siguiente') && a.href) return a.href; }
    const m = window.location.pathname.match(/^(.*-)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1) + '/';
    return null;
  }
  function sdonghua_label() {
    const n = sdonghua_next(); if (n) { const m = n.match(/-(\d+)\/?$/); if (m) return T('ep_n', { n: m[1] }); }
    return T('next_ep_default');
  }
  function mundo_next() {
    const links = document.querySelectorAll('.media-bar-player a');
    for (const a of links) { if (a.textContent.trim().toLowerCase().startsWith('siguiente') && a.href) return a.href; }
    const m = window.location.pathname.match(/^(.*\/)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1);
    return null;
  }
  function mundo_label() {
    const n = mundo_next(); if (n) { const m = n.match(/\/(\d+)\/?$/); if (m) return T('ep_n', { n: m[1] }); }
    return T('next_ep_default');
  }
  function dlife_next() {
    // Rediseño (sep-2026): ya no existe a.next-episode ni URLs con "-x"; ahora
    // son "/watch/<slug>-<temporada>-<episodio>" y el enlace real es un <a>
    // cuyo único texto visible es "Siguiente".
    const links = document.querySelectorAll('a[href*="/watch/"]');
    for (const a of links) { if (a.textContent.trim().toLowerCase().includes('siguiente') && a.href) return a.href; }
    const m = window.location.pathname.match(/^(.*-)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1);
    return null;
  }
  function dlife_label() {
    const n = dlife_next(); if (n) { const m = n.match(/-(\d+)\/?$/); if (m) return T('ep_n', { n: m[1] }); }
    return T('next_ep_default');
  }
  function jkanime_next() {
    // JKAnime: URLs tipo "/<slug>/<num>/" (como MundoDonghua) y un <a> cuyo
    // único texto visible es "Siguiente" cuando existe episodio posterior.
    const links = document.querySelectorAll('a');
    for (const a of links) { if (a.textContent.trim().toLowerCase() === 'siguiente' && a.href) return a.href; }
    const m = window.location.pathname.match(/^(.*\/)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1) + '/';
    return null;
  }
  function jkanime_label() {
    const n = jkanime_next(); if (n) { const m = n.match(/\/(\d+)\/?$/); if (m) return T('ep_n', { n: m[1] }); }
    return T('next_ep_default');
  }

  function getNextUrl()   { return IS_AV1?av1_next():IS_FLV?flv_next():IS_SDONGHUA?sdonghua_next():IS_MUNDO?mundo_next():IS_DLIFE?dlife_next():IS_JKANIME?jkanime_next():null; }
  function getNextLabel() { return IS_AV1?av1_label():IS_FLV?flv_label():IS_SDONGHUA?sdonghua_label():IS_MUNDO?mundo_label():IS_DLIFE?dlife_label():IS_JKANIME?jkanime_label():T('next_ep_default'); }

  function dnsPrefetch() {
    const domains = [
      'mdnemonicplayer.xyz', 'www.dailymotion.com', 'geo.dailymotion.com',
      'streamtape.com', 'dood.watch', 'filemoon.sx', 'mp4upload.com',
    ];
    domains.forEach(d => {
      if (document.querySelector(`link[rel="dns-prefetch"][href="//${d}"]`)) return;
      const l = document.createElement('link');
      l.rel = 'dns-prefetch';
      l.href = `//${d}`;
      document.head.appendChild(l);
    });
  }

  function preloadNextEpisode(url) {
    if (!url) return;
    if (document.querySelector(`link[rel="prefetch"][href="${CSS.escape ? url : url}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  }

  // ── Modo noche ────────────────────────────────────────────────────────────
  // Con el modo noche activo solo se encadenan `nightEpisodes` episodios más; al terminar
  // el último no se pasa al siguiente, se avisa y el modo se desactiva solo. El contador
  // (nightLeft) vive en storage.sync y se decrementa una vez por episodio (nightCounted).
  let nightCounted = false, nightEnded = false;
  function nightBlockedNow() {
    return nightEnded || (!!settings.nightMode && !nightCounted && (settings.nightLeft | 0) <= 0);
  }
  function nightConsume() {
    if (!settings.nightMode || nightCounted || nightEnded) return;
    nightCounted = true;
    settings.nightLeft = Math.max(0, (settings.nightLeft | 0) - 1);
    try { _ext.storage.sync.set({ nightLeft: settings.nightLeft }); } catch (_) {}
    pushSettings();
  }
  function nightFinish() {
    if (nightEnded) return;
    nightEnded = true;
    settings.nightMode = false;
    try { _ext.storage.sync.set({ nightMode: false, nightLeft: settings.nightEpisodes | 0 }); } catch (_) {}
    showShortcutToast(T('toast_night_end'), 10000);
  }

  // ── Historial de último episodio visto ────────────────────────────────────
  // Solo se registra cuando el episodio terminó y la cuenta atrás pasó al siguiente
  // (no por abrir la página, ni al cancelar, ni con la tecla N).
  function siteDomain() {
    return IS_AV1 ? 'animeav1.com' : IS_FLV ? 'animeflv.net' : IS_SDONGHUA ? 'seriesdonghua.com'
         : IS_MUNDO ? 'mundodonghua.com' : IS_DLIFE ? 'donghualife.com' : IS_JKANIME ? 'jkanime.net' : null;
  }
  function parseEpisodeUrl(href) {
    let path;
    try { path = new URL(href, location.href).pathname; } catch (_) { return null; }
    path = path.replace(/\/+$/, '').replace(/\.html?$/i, '');
    const m = path.match(/^(.*)-episodio-(\d+)$/i) || path.match(/^(.*)\/(\d+)$/) || path.match(/^(.*)-(\d+)$/);
    if (!m) return null;
    const slug = (m[1].split('/').filter(Boolean).pop() || '').toLowerCase();
    if (!slug) return null;
    const title = slug.replace(/-+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
    return { slug, title, ep: Number(m[2]) };
  }
  function recordWatched() {
    try {
      const domain = siteDomain();
      const info = parseEpisodeUrl(location.href);
      if (!domain || !info) return;
      _ext.storage.local.get({ watchHistory: {} }, (res) => {
        const h = (res && res.watchHistory) || {};
        const d = h[domain] || (h[domain] = {});
        d[info.slug] = { title: info.title, ep: info.ep, url: location.href, ts: Date.now() };
        const keys = Object.keys(d);
        if (keys.length > 100) {
          keys.sort((a, b) => d[a].ts - d[b].ts).slice(0, keys.length - 100).forEach((k) => delete d[k]);
        }
        try { _ext.storage.local.set({ watchHistory: h }); } catch (_) {}
      });
    } catch (_) {}
  }
  function navigateAuto(fallbackUrl) {
    if (getNextUrl() || fallbackUrl) recordWatched();
    navigate(fallbackUrl);
  }

  // ── Navegar guardando flags ───────────────────────────────────────────────
  function navigate(fallbackUrl) {
    const url = getNextUrl() || fallbackUrl || null;
    DBG('navigate() url=', url, 'getNextUrl=', getNextUrl(), 'fallback=', fallbackUrl);
    if (!url) return;

    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const flags = { aap_autoplay: true };
    if (settings.autoFullscreen) flags.aap_fullscreen = true; // guardar siempre que autoFullscreen esté activo
    DBG('navigate() flags=', flags, 'autoFullscreen=', settings.autoFullscreen);

    try { _ext.storage.local.set(flags, () => {
      DBG('navigate() flags guardados, redirigiendo a', url);
      if (isFs) {
        // webkitExitFullscreen() devuelve undefined, no una promesa: sin el
        // Promise.resolve() esto lanzaba TypeError y nunca llegaba a navegar.
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        Promise.resolve(exit && exit.call(document))
          .catch(() => {})
          .finally(() => { window.location.href = url; });
      } else {
        window.location.href = url;
      }
    }); } catch (_) { window.location.href = url; } // contexto de extensión inválido (recarga) → navega directo
  }

  // ════════════════════════════════════════════════════════════════════════════
  // OVERLAY COUNTDOWN (para vídeos directos — Asura/JWPlayer)
  // ════════════════════════════════════════════════════════════════════════════
  let mainCountdownTimer = null;
  let mainCountdownActive = false;
  let mainCountdownSecs = 0;
  let mainSkipBtnEl = null;
  let mainSkipBtnInterval = null;
  let mainCdEl = null;
  let mainOrigVolumes = []; // [{video, volume}] para restaurar al cancelar countdown

  function getRoot() { return document.fullscreenElement || document.webkitFullscreenElement || document.body; }
  function relocateMainOverlays() {
    const root = getRoot();
    if (mainCdEl && !root.contains(mainCdEl)) root.appendChild(mainCdEl);
    if (mainSkipBtnEl && !root.contains(mainSkipBtnEl)) root.appendChild(mainSkipBtnEl);
  }
  document.addEventListener('fullscreenchange', relocateMainOverlays);
  document.addEventListener('webkitfullscreenchange', relocateMainOverlays);

  // ── Toast rápido para confirmar atajos de teclado ──────────────────────────
  // Feedback visual inmediato en la propia página (no depende de abrir el popup,
  // que solo lee storage al abrirse). Reutiliza Shadow DOM para no chocar con
  // los estilos del sitio, igual que el resto de overlays de la extensión.
  let toastEl = null;
  let toastHideTimer = null;

  // Reenvía un mensaje a los iframes del reproductor (los relés de player.js/bridge.js
  // se encargan de bajarlo a frames anidados).
  function forwardToPlayerFrames(msg) {
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow.postMessage(msg, '*'); } catch (_) {}
    });
  }

  // Cuando el fullscreen lo tiene un IFRAME, todo lo que colguemos de este documento
  // (toast, cuenta atrás de main.js) queda dentro del <iframe> y no se pinta: el
  // reproductor lo muestra él mismo desde player.js.
  function iframeIsFullscreen() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    return !!fs && fs.tagName === 'IFRAME';
  }

  // '+' / '-' (desde el teclado de esta página o reenviado por un iframe donde está el
  // foco): ajusta "saltar ending" y, con '+', extiende también la cuenta atrás activa.
  function applyEndingShortcut(delta, fromFrame, extendedInFrame) {
    if (delta < 0) {
      const v = adjustSkipEndingSetting(-5);
      if (v != null) showShortcutToast(T('toast_ending', { v }));
    } else {
      const wasActive = mainCountdownActive || !!extendedInFrame;
      if (mainCountdownActive) extendMainCountdown(5);
      // La cuenta atrás puede estar en un iframe (player.js): pedirle que sume 5s.
      // Si el aviso viene del propio iframe, él ya la extendió.
      if (!fromFrame) forwardToPlayerFrames({ _aap: true, type: 'EXTEND_COUNTDOWN', secs: 5 });
      const v = adjustSkipEndingSetting(5);
      if (v != null) {
        showShortcutToast(wasActive
          ? T('toast_plus_now') + T('toast_ending', { v })
          : T('toast_ending', { v }));
      }
    }
  }

  function showShortcutToast(text, ms) {
    if (iframeIsFullscreen()) { forwardToPlayerFrames({ _aap: true, type: 'TOAST', text, ms }); return; }
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = '_aap_toast';
      Object.assign(toastEl.style, {
        position: 'fixed', top: '4vh', left: '50%', zIndex: '2147483647',
        transform: 'translateX(-50%) translateY(-10px)', opacity: '0',
        transition: 'opacity 0.15s ease, transform 0.15s ease', pointerEvents: 'none',
      });
      const sh = toastEl.attachShadow({ mode: 'open' });
      sh.innerHTML = `<style>*{box-sizing:border-box;margin:0;padding:0}#card{background:rgba(8,10,18,.96);border:1.5px solid rgba(79,142,247,.55);border-radius:12px;padding:clamp(10px,1.1vw,15px) clamp(18px,2vw,30px);font:700 clamp(17px,1.7vw,24px) -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;box-shadow:0 8px 36px rgba(0,0,0,.68);white-space:nowrap}</style><div id="card"></div>`;
      toastEl._sh = sh;
    }
    // Reinsertar SIEMPRE (no solo la primera vez): appendChild sobre un nodo ya
    // insertado lo MUEVE al final, así el toast queda como último hijo y por
    // tanto por encima de cualquier overlay del propio sitio (o nuestro) que se
    // haya añadido después — si solo se comprobaba "root.contains(toastEl)" una
    // vez, el toast se quedaba "enterrado" bajo elementos posteriores y solo se
    // veía cuando getRoot() cambiaba (p.ej. al entrar en fullscreen), que es
    // justo lo que se reportó: el toast solo se veía en fullscreen.
    const root = getRoot();
    root.appendChild(toastEl);
    toastEl._sh.getElementById('card').textContent = text;
    // Forzar reflow si ya estaba visible, para que el timer se reinicie limpio
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateX(-50%) translateY(-10px)';
    }, ms || 1100);
  }

  function buildMainCountdown() {
    if (mainCdEl) return;
    mainCdEl = document.createElement('div');
    mainCdEl.id = '_aap_main_cd';
    Object.assign(mainCdEl.style, { position:'fixed', bottom:'80px', right:'20px', zIndex:'2147483647', opacity:'0', transform:'translateY(14px) scale(0.96)', transition:'opacity 0.3s ease, transform 0.3s ease', pointerEvents:'none' });
    getRoot().appendChild(mainCdEl);
    const sh = mainCdEl.attachShadow({ mode:'open' });
    sh.innerHTML = `<style>*{box-sizing:border-box;margin:0;padding:0}#card{background:rgba(8,10,18,.97);border:1px solid rgba(79,142,247,.35);border-radius:14px;padding:18px 22px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:210px;box-shadow:0 8px 40px rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}#lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.38);font-weight:700}#num{font-size:32px;font-weight:800;color:#4F8EF7;line-height:1}#ttl{font-size:12px;font-weight:600;color:rgba(255,255,255,.78);text-align:center;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#btns{display:flex;gap:8px;margin-top:3px}button{border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;padding:7px 14px;transition:all .15s;font-family:inherit;pointer-events:all}#no{background:rgba(255,255,255,.09);color:rgba(255,255,255,.55)}#no:hover{background:rgba(255,255,255,.16);color:#fff}#yes{background:#4F8EF7;color:#060d1f}#yes:hover{background:#7ab3fb}</style><div id="card"><div id="lbl">${T('cd_label')}</div><span id="num">5</span><div id="ttl">${T('next_ep_default')}</div><div id="btns"><button id="no">${T('cancel')}</button><button id="yes">${T('watch_now')}</button></div></div>`;
    sh.getElementById('no').onclick  = stopMainCountdown;
    sh.getElementById('yes').onclick = () => {
      stopMainCountdown();
      if (settings.autoFullscreen) {
        const target = findPlayerTarget();
        if (target) { activateFullscreenWithF(target); setTimeout(navigateAuto, 600); return; }
      }
      navigateAuto();
    };
    mainCdEl._sh = sh;
  }
  function showMainCountdown() {
    buildMainCountdown();
    // Sin fullscreen: posicionar relativo al div del player para que no quede fuera
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const player = document.querySelector('div[id$="_player"], iframe[src]:not([src=""]), video');
      if (player) {
        const r = player.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          mainCdEl.style.bottom = Math.max(10, window.innerHeight - r.bottom + 20) + 'px';
          mainCdEl.style.right  = Math.max(10, window.innerWidth  - r.right  + 20) + 'px';
        }
      } else {
        mainCdEl.style.bottom = '80px';
        mainCdEl.style.right  = '20px';
      }
    } else {
      mainCdEl.style.bottom = '80px';
      mainCdEl.style.right  = '20px';
    }
    mainCdEl._sh.getElementById('ttl').textContent = getNextLabel();
    mainCdEl.getBoundingClientRect();
    mainCdEl.style.opacity='1'; mainCdEl.style.transform='translateY(0) scale(1)'; mainCdEl.style.pointerEvents='all';
    mainCountdownActive = true;
    // Foco en Cancelar y mantenerlo (el player intenta robarlo)
    const focusCancel = () => {
      try {
        const noBtn = mainCdEl?._sh?.getElementById('no');
        if (!noBtn) return;
        noBtn.setAttribute('tabindex', '0');
        noBtn.focus({ preventScroll: true });
      } catch (_) {}
    };
    focusCancel();
    setTimeout(focusCancel, 50);
    setTimeout(focusCancel, 200);
    if (mainCdEl._aapFocusIv) clearInterval(mainCdEl._aapFocusIv);
    mainCdEl._aapFocusIv = setInterval(() => {
      if (!mainCountdownActive) { clearInterval(mainCdEl._aapFocusIv); mainCdEl._aapFocusIv = null; return; }
      try {
        const noBtn = mainCdEl._sh?.getElementById('no');
        if (noBtn && mainCdEl._sh.activeElement !== noBtn) noBtn.focus({ preventScroll: true });
      } catch (_) {}
    }, 300);
    // Bajar volumen al 80% mientras el overlay esté visible
    lowerMainVolume();
  }
  function hideMainCountdown() {
    if (mainCdEl?._aapFocusIv) { clearInterval(mainCdEl._aapFocusIv); mainCdEl._aapFocusIv = null; }
    if (mainCdEl) { mainCdEl.style.opacity='0'; mainCdEl.style.transform='translateY(14px) scale(0.96)'; mainCdEl.style.pointerEvents='none'; }
    mainCountdownActive = false;
    if (mainCountdownTimer) { clearInterval(mainCountdownTimer); mainCountdownTimer=null; }
    restoreMainVolume();
  }
  function stopMainCountdown() { hideMainCountdown(); }
  function tickMainCountdown(secs) {
    if (!mainCdEl?._sh) return;
    mainCdEl._sh.getElementById('num').textContent = String(secs);
  }
  // Añade segundos al countdown YA EN MARCHA (atajo de teclado). Solo toca la
  // cuenta atrás activa en pantalla — no lee ni escribe settings.skipBeforeEnd;
  // ese cambio permanente lo hace aparte adjustSkipEndingSetting().
  function extendMainCountdown(extraSecs) {
    if (!mainCountdownActive) return;
    mainCountdownSecs += extraSecs;
    tickMainCountdown(mainCountdownSecs);
    DBG('countdown extendido +' + extraSecs + 's, quedan', mainCountdownSecs);
  }
  // Ajusta de forma permanente los segundos de "saltar créditos / ending"
  // guardados en la configuración (el mismo valor que el slider del popup,
  // 0–240s en pasos de 5 — cuanto más alto, más cerca del final aparece el
  // overlay). A diferencia de extendMainCountdown(), esto SÍ persiste — se
  // guarda en storage.sync, igual que hace el popup, para que ambos se
  // mantengan sincronizados.
  function adjustSkipEndingSetting(delta) {
    // Evita pisar el valor guardado real con uno calculado sobre el default si
    // el atajo se pulsa antes de que loadSettings() haya terminado de leer
    // storage.sync (ventana muy breve, pero posible justo al cargar la página).
    if (!settingsLoaded) return null;
    const current = settings.skipBeforeEnd || 0;
    const next = Math.max(0, Math.min(240, current + delta));
    if (next === current) return next;
    settings.skipBeforeEnd = next;
    _ext.storage.sync.set({ skipBeforeEnd: next });
    DBG('skipBeforeEnd ajustado a', next, 'via atajo de teclado');
    return next;
  }
  function lowerMainVolume() {
    try {
      mainOrigVolumes = [];
      document.querySelectorAll('video').forEach(v => {
        try {
          mainOrigVolumes.push({ video: v, volume: v.volume });
          v.volume = Math.max(0, v.volume * 0.5);
        } catch (_) {}
      });
      document.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow.postMessage({ _aap: true, type: 'LOWER_VOLUME' }, '*'); } catch (_) {}
      });
    } catch (_) {}
  }
  function restoreMainVolume() {
    try {
      mainOrigVolumes.forEach(({ video, volume }) => {
        try { video.volume = volume; } catch (_) {}
      });
      mainOrigVolumes = [];
      document.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow.postMessage({ _aap: true, type: 'RESTORE_VOLUME' }, '*'); } catch (_) {}
      });
    } catch (_) {}
  }
  function mainCountdownTick() {
    mainCountdownSecs--;
    if (mainCountdownSecs <= 0) {
      clearInterval(mainCountdownTimer); mainCountdownTimer = null;
      hideMainCountdown(); navigateAuto();
    } else {
      tickMainCountdown(mainCountdownSecs);
    }
  }

  // Atajo G: acorta la cuenta atrás en pantalla a 2 s (si ya queda menos, no la alarga).
  function shortenMainCountdown(secs) {
    if (!mainCountdownActive) return false;
    mainCountdownSecs = Math.min(mainCountdownSecs, secs);
    tickMainCountdown(mainCountdownSecs);
    return true;
  }

  function startMainCountdown() {
    if (!settings.autoplay || mainCountdownActive || !getNextUrl()) return;
    if (nightBlockedNow()) { nightFinish(); return; }
    nightConsume();
    preloadNextEpisode(getNextUrl());
    // Sin overlay: pasar directo al siguiente episodio
    if (settings.countdownOverlay === false) { navigateAuto(); return; }
    mainCountdownSecs = settings.countdownSeconds;
    showMainCountdown(); tickMainCountdown(mainCountdownSecs);
    mainCountdownTimer = setInterval(mainCountdownTick, 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (mainCountdownTimer) { clearInterval(mainCountdownTimer); mainCountdownTimer = null; }
    } else if (mainCountdownActive && mainCountdownSecs > 0) {
      mainCountdownTimer = setInterval(mainCountdownTick, 1000);
    }
  });

  // ── Botón saltar intro (página principal) ─────────────────────────────────
  function buildMainSkipBtn(video) {
    if (mainSkipBtnEl) return;
    mainSkipBtnEl = document.createElement('div');
    mainSkipBtnEl.id = '_aap_main_skip';
    Object.assign(mainSkipBtnEl.style, { position:'fixed', bottom:'80px', right:'20px', zIndex:'2147483646', pointerEvents:'all' });
    getRoot().appendChild(mainSkipBtnEl);
    const sh = mainSkipBtnEl.attachShadow({ mode:'open' });
    sh.innerHTML = `<style>button{background:rgba(8,10,18,.92);border:2px solid rgba(79,142,247,.6);border-radius:10px;color:#4F8EF7;font-size:15px;font-weight:800;padding:11px 22px;cursor:pointer;font-family:-apple-system,'Segoe UI',sans-serif;letter-spacing:.04em;transition:all .15s;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.5);pointer-events:all}button:hover{background:#4F8EF7;color:#060d1f}</style><button id="btn">${T('skip_intro_btn')}</button>`;
    sh.getElementById('btn').onclick = () => doMainIntroSkip(video);
    mainSkipBtnEl._sh = sh;
    const hideAt = settings.introTo + 2;
    mainSkipBtnInterval = setInterval(() => { if (!video || video.currentTime >= hideAt) hideMainSkipBtn(); }, 300);
  }
  function hideMainSkipBtn() {
    if (mainSkipBtnInterval) { clearInterval(mainSkipBtnInterval); mainSkipBtnInterval=null; }
    if (mainSkipBtnEl) { mainSkipBtnEl.remove(); mainSkipBtnEl=null; }
  }
  function doMainIntroSkip(video) {
    hideMainSkipBtn();
    introSkipDone = true;
    if (settings.introSpeed) {
      // Modo velocidad ×2: reproducir la intro al doble y restaurar al terminar
      video.playbackRate = 2;
      const restoreSpeed = () => {
        if (video.playbackRate === 2) video.playbackRate = 1;
        video.removeEventListener('timeupdate', checkTime);
      };
      const checkTime = () => {
        if (video.currentTime >= settings.introTo) restoreSpeed();
      };
      video.addEventListener('timeupdate', checkTime);
      // Timeout de seguridad por si el evento no llega
      setTimeout(() => {
        if (video.playbackRate === 2 && video.currentTime < settings.introTo) {
          const dur = (settings.introTo - video.currentTime) / 2;
          setTimeout(restoreSpeed, Math.max(0, dur * 1000) + 500);
        }
      }, 100);
      return;
    }
    markOurPause(video);
    const wasPlaying = !video.paused;
    video.currentTime = settings.introTo;
    if (wasPlaying) {
      const resume = () => { video.play().catch(()=>{}); video.removeEventListener('seeked', resume); };
      video.addEventListener('seeked', resume);
      setTimeout(() => { if (video.paused) video.play().catch(()=>{}); }, 250);
    }
  }

  // ── Attach vídeo directo (Asura/JWPlayer) ─────────────────────────────────
  const attachedVideos = new WeakSet();
  let earlyFired = false;
  let introSkipDone = false;

  function attachVideo(v) {
    if (attachedVideos.has(v)) return;
    attachedVideos.add(v);
    DBG('attachVideo: enganchado a <video>', v.src ? '(con src)' : '(sin src aún)');

    // Detectar pausa manual del usuario para abortar auto-reproducción
    v.addEventListener('pause', () => {
      if (isOurPause(v)) return;
      // Un pause a los pocos ms de un play es del navegador (autoplay policy),
      // no del usuario: no debe abortar los reintentos.
      if (v._aapLastPlayAt && Date.now() - v._aapLastPlayAt < 500) {
        DBG('attachVideo: pause del navegador tras play, ignorado');
        return;
      }
      v._aapUserPaused = true;
      DBG('attachVideo: usuario pausó manualmente');
    });
    v.addEventListener('playing', () => { v._aapLastPlayAt = Date.now(); });
    v.addEventListener('play', () => {
      delete v._aapUserPaused;
    });

    v.addEventListener('loadedmetadata', () => { DBG('video loadedmetadata, duration=', v.duration); earlyFired=false; introSkipDone=false; hideMainSkipBtn(); hideMainCountdown(); });
    v.addEventListener('ended', () => { DBG('video ended → countdown'); hideMainSkipBtn(); if (settings.autoplay) setTimeout(startMainCountdown, 150); });
    v.addEventListener('timeupdate', () => {
      const t=v.currentTime, dur=v.duration;
      if (settings.introSkip && !introSkipDone && settings.introTo > settings.introFrom) {
        if (t >= settings.introFrom && t < settings.introTo) {
          if (settings.introSpeed) doMainIntroSkip(v);
          else if (settings.introAuto) doMainIntroSkip(v);
          else buildMainSkipBtn(v);
        } else if (mainSkipBtnEl) hideMainSkipBtn();
      }
      const skip=settings.skipBeforeEnd||0;
      if (!settings.autoplay||earlyFired||mainCountdownActive||skip<=0||!dur||dur<30) return;
      const effectiveSkip=245-skip; // invertido: slider más alto = más cerca del final
      const rem=dur-t;
      if (rem>0&&rem<=effectiveSkip) { earlyFired=true; v.addEventListener('seeking',()=>{earlyFired=false},{once:true}); startMainCountdown(); }
    });
  }

  function scanAllVideos() {
    document.querySelectorAll('video').forEach(attachVideo);
    document.querySelectorAll('iframe').forEach(iframe => {
      try { const doc=iframe.contentDocument; if(doc) doc.querySelectorAll('video').forEach(attachVideo); } catch(_) {}
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PUSH SETTINGS A IFRAMES
  // ════════════════════════════════════════════════════════════════════════════
  function pushSettings() {
    const payload = { ...settings, introSpeed: !!settings.introSpeed, keyboardShortcuts: !!settings.keyboardShortcuts, lang: settings.lang || null, nightBlock: nightBlockedNow(), introAuto: !!settings.introAuto, nextLabel: getNextLabel(), nextUrl: getNextUrl() || '' };
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow.postMessage({ _aap:true, type:'SETTINGS', payload }, '*'); } catch(_) {}
    });
  }

  // player.js se inyecta en todos los frames de todos los sitios, así que
  // cualquier iframe de terceros (un banner de ads) podría mandar un PLAY_NOW
  // con nextUrl arbitraria y forzar la navegación de la pestaña. Solo aceptamos
  // mensajes cuyo e.source sea un iframe presente en este documento.
  function isTrustedPlayerFrame(source) {
    if (!source) return false;
    try {
      for (const f of document.querySelectorAll('iframe')) {
        if (f.contentWindow === source) return true;
      }
    } catch (_) {}
    return false;
  }

  // Solo http(s), para descartar javascript:, data: y similares.
  function safeExternalUrl(url) {
    if (typeof url !== 'string' || !url) return null;
    try {
      const u = new URL(url, location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch (_) { return null; }
  }

  // El reproductor (iframe cross-origin) se ha quedado muteado porque Chrome no le da
  // activación: un click NATIVO al centro sobre el iframe en fullscreen se la da y su
  // player.js desmutea en ese gesto. Una sola vez cada 12 s, y solo si el iframe está en FS.
  let _lastAdjustAt = 0;

  window.addEventListener('message', (e) => {
    if (!e.data || e.data._aap !== true) return;
    if (!isTrustedPlayerFrame(e.source)) return;
    switch (e.data.type) {
      case 'GET_SETTINGS': pushSettings(); break;
      case 'NEED_GESTURE': break; // sin host nativo: el click del usuario da la activación
      case 'STARTING':     nightConsume(); pushSettings(); break;
      case 'COUNTDOWN_TO':
        // Pulsado dentro de un iframe sin cuenta atrás propia: aplicarla a la de esta página.
        if (shortenMainCountdown(Number(e.data.secs) || 2)) showShortcutToast(T('toast_cd_secs', { n: Number(e.data.secs) || 2 }));
        break;
      case 'NIGHT_END':    if (nightBlockedNow()) nightFinish(); break;
      case 'TRIGGER':
        // Vídeo terminado en un iframe sin su propio countdown (bridge.js): aplicar modo noche aquí.
        if (nightBlockedNow()) { nightFinish(); break; }
        nightConsume();
        navigateAuto(safeExternalUrl(e.data.nextUrl)); break;
      case 'PLAY_NOW':     (e.data.auto ? navigateAuto : navigate)(safeExternalUrl(e.data.nextUrl)); break;
      case 'ADJUST_ENDING': {
        // player.js avisa al parent Y al top; cuando son la misma ventana llega duplicado
        // (+5 se aplicaba dos veces = 10 s). Ignorar el eco inmediato.
        const now = Date.now();
        if (now - _lastAdjustAt < 150) break;
        _lastAdjustAt = now;
        applyEndingShortcut(e.data.delta < 0 ? -5 : 5, true, !!e.data.extended);
        break;
      }
      case 'FULLSCREEN_ENTERED':
        // El iframe entró en fullscreen — enviarle PLAY_VIDEO para reanudar
        document.querySelectorAll('iframe').forEach(f => {
          try { f.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
        });
        break;
    }
  });

  // ── Observer: iframes dinámicos ───────────────────────────────────────────
  const iframeObserver = new MutationObserver((mutations) => {
    try {
      let newIframe = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeName === 'IFRAME') {
            const srcObs = new MutationObserver(() => {
              try { if (node.src) { srcObs.disconnect(); setTimeout(() => { pushSettings(); scanAllVideos(); }, 800); } } catch (_) {}
            });
            srcObs.observe(node, { attributes:true, attributeFilter:['src'] });
            newIframe = true;
          }
          if (node.nodeName === 'VIDEO') attachVideo(node); // video añadido directamente
          if (node.querySelectorAll) {
            if (node.querySelectorAll('iframe').length > 0) newIframe = true;
            node.querySelectorAll('video').forEach(attachVideo);
          }
        }
      }
      if (newIframe) [500, 1500, 3000].forEach(ms => setTimeout(() => { pushSettings(); scanAllVideos(); }, ms));
    } catch (_) { /* extension context invalidated, ignorar */ }
  });
  iframeObserver.observe(document.body, { childList:true, subtree:true });

  // ════════════════════════════════════════════════════════════════════════════
  // RECORDAR REPRODUCTOR
  // ════════════════════════════════════════════════════════════════════════════
  // Selector de los tabs de servidor. Incluye tanto el markup antiguo tipo
  // Bootstrap (AnimeFLV, SeriesDonghua, DonghuaLife) como el nuevo markup de
  // MundoDonghua (`.md-server-tab`), que sustituyó a `ul.nav-tabs` en su rediseño
  // y por eso "recordar reproductor" dejó de funcionar en ese sitio: los
  // selectores viejos ya no encuentran ningún tab que guardar ni que clickar.
  const PLAYER_TAB_SEL = 'ul.nav-tabs a, .toggle-enlace, .border-line button, .md-server-tab, .server-tab-btn, a.servers';

  // Clave estable para identificar un tab de servidor. El markup nuevo de
  // MundoDonghua trae `data-target`/`id` (p.ej. "asura", "fmoon") que no cambian
  // aunque el sitio añada texto tipo "ADS" o cambie idioma; si no existen (markup
  // antiguo) cae al texto visible del tab, como hacía antes. El rediseño de
  // SeriesDonghua (sep-2026) trae `data-server-index` en sus botones — también
  // estable frente a cambios de texto ("1080p"→"720p", idioma del badge, etc.).
  function getTabKey(tab) {
    if (!tab) return null;
    if (tab.dataset && tab.dataset.target) return tab.dataset.target;
    if (tab.dataset && tab.dataset.serverIndex !== undefined) return 'srv' + tab.dataset.serverIndex;
    if (tab.id && tab.id.endsWith('_tab')) return tab.id.slice(0, -4);
    const txt = tab.textContent.trim().replace(/\s+/g, ' ');
    // DonghuaLife (sep-2026): botones tipo "RumbleEmbed • Con subtítulos" — el
    // nombre del servidor es estable, el sufijo tras "•" puede cambiar (idioma,
    // disponibilidad de sub/dub), así que solo usamos la parte antes de "•".
    const bullet = txt.indexOf('•');
    if (bullet > 0) return txt.slice(0, bullet).trim();
    return txt.split('\n')[0].trim();
  }

  // DonghuaLife (sep-2026): los botones de servidor ya no tienen clase ni
  // atributo estable — son <button> genéricos de Tailwind. Se identifican por
  // su texto ("...Embed • Con subtítulos" / "...directo • Con subtítulos") y
  // el activo se distingue por sus clases de estilo (fondo/borde blanco sólido
  // vs. semitransparente).
  function dlifeServerButtons() {
    return Array.from(document.querySelectorAll('button')).filter(b => {
      const t = b.textContent;
      return /subt/i.test(t) && (/embed/i.test(t) || /directo/i.test(t));
    });
  }
  function dlifeActiveServerBtn() {
    return dlifeServerButtons().find(b => /\btext-black\b/.test(b.className)) || null;
  }

  // ── JKAnime: iframe same-origin (.player_conte) que envuelve o bien un
  // <video> nativo (servidor propio "Desu"/"Magi") o bien un aviso "Este
  // reproductor contiene publicidad..." + iframe cross-origin anidado con el
  // servidor externo real (Mega, VOE, Vidhide, Filemoon, Mp4upload...). Como
  // el iframe exterior es same-origin, se puede inspeccionar y clickear
  // directamente desde main.js sin necesitar bridge.js.
  function jkanimeOuterIframe() {
    return document.querySelector('iframe.player_conte');
  }
  function jkanimeInnerDoc() {
    const outer = jkanimeOuterIframe();
    if (!outer) return null;
    try { return outer.contentDocument || null; } catch (_) { return null; }
  }
  function jkanimeDismissWarning() {
    const doc = jkanimeInnerDoc();
    if (!doc) return false;
    const btn = doc.querySelector('.accept-risk, #msjad button');
    if (!btn) return false;
    DBG('jkanime: aceptando aviso del reproductor externo');
    try { btn.click(); } catch (_) {}
    return true;
  }
  function jkanimeReady() {
    const doc = jkanimeInnerDoc();
    if (!doc) return false;
    if (doc.querySelector('video')) return true; // servidor propio (Desu/Magi)
    return !!doc.querySelector('iframe[src]'); // servidor externo ya montado
  }
  function fullscreenJkanimePlayer() {
    const doc = jkanimeInnerDoc();
    const outer = jkanimeOuterIframe();
    if (!doc || !outer) return;
    const video = doc.querySelector('video');
    if (video) {
      DBG('jkanime: fullscreen sobre <video> nativo');
      (video.requestFullscreen || video.webkitRequestFullscreen)?.call(video)
        .then(() => { if (video.paused) video.play().catch(() => {}); })
        .catch(err => DBG('jkanime fs video err:', err?.message));
      return;
    }
    // Servidor externo: fullscreen sobre el iframe exterior (same-origin), que
    // delega hacia el iframe cross-origin anidado gracias a allowfullscreen.
    DBG('jkanime: fullscreen sobre iframe exterior (servidor externo)');
    (outer.requestFullscreen || outer.webkitRequestFullscreen)?.call(outer)
      .catch(err => DBG('jkanime fs outer err:', err?.message));
    const nested = doc.querySelector('iframe[src]');
    if (nested) { try { nested.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {} }
  }

  function detectAndSaveActivePlayer() {
    let key = null;
    if (IS_AV1) { const b=document.querySelector('.border-line button.bg-main'); if(b) key=b.textContent.trim(); }
    else if (IS_FLV) { const a=document.querySelector('ul.nav-tabs li.active a'); if(a) key=a.textContent.trim().split('\n')[0].trim(); }
    else if (IS_SDONGHUA) { const b=document.querySelector('.server-tab-btn.active'); if(b) key=getTabKey(b); }
    else if (IS_MUNDO) { const a=document.querySelector('.md-server-tab.active, ul.nav-tabs li.active a'); if(a) key=getTabKey(a); }
    else if (IS_DLIFE) { const b=dlifeActiveServerBtn(); if(b) key=getTabKey(b); }
    else if (IS_JKANIME) { const a=document.querySelector('a.servers.active'); if(a) key=getTabKey(a); }
    if (key) _ext.storage.local.set({ ['aap_player_'+HOST.replace(/\./g,'_')]: key });
  }

  document.addEventListener('click', (e) => {
    // DonghuaLife: sus botones de servidor no matchean PLAYER_TAB_SEL (sin
    // clase/atributo estable), así que se comprueban aparte por texto.
    const tab = e.target.closest(PLAYER_TAB_SEL) ||
      (IS_DLIFE ? e.target.closest('button') && dlifeServerButtons().includes(e.target.closest('button')) && e.target.closest('button') : null);
    if (tab && settings.rememberPlayer) {
      // Guardar directamente la clave del tab clickado — sin depender de la clase "activa" del sitio
      const key = getTabKey(tab);
      if (key) {
        _ext.storage.local.set({ ['aap_player_' + HOST.replace(/\./g, '_')]: key });
        DBG('player guardado:', key);
      }
    }
  });

  // JKAnime: su propio handler de click en `a.servers` llama a
  // preventDefault()+stopPropagation() (evita que el <a href="#optionN">
  // navegue y frena la propagación para su propio switch de servidor AJAX),
  // así que el listener delegado de arriba (fase bubble, sobre `document`)
  // nunca llega a recibir el evento — "recordar reproductor" no guardaría
  // nunca un click real del usuario. Se añade aparte, en fase de CAPTURA
  // (se ejecuta antes que el propio handler del sitio, así que no le afecta
  // el stopPropagation posterior).
  if (IS_JKANIME) {
    document.addEventListener('click', (e) => {
      const tab = e.target.closest('a.servers');
      if (tab && settings.rememberPlayer) {
        const key = getTabKey(tab);
        if (key) {
          _ext.storage.local.set({ ['aap_player_' + HOST.replace(/\./g, '_')]: key });
          DBG('player guardado (jkanime, captura):', key);
        }
      }
    }, true);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PLAY AUTOMÁTICO Y PANTALLA COMPLETA AL CARGAR
  // Solo cuando venimos de un episodio anterior (aap_autoplay flag)
  // ════════════════════════════════════════════════════════════════════════════

  // Encontrar el target principal (iframe del player o vídeo directo)
  function findPlayerTarget() {
    const iframe = Array.from(document.querySelectorAll('iframe')).find(f =>
      f.src &&
      !f.src.includes('facebook') && !f.src.includes('disqus') &&
      !f.src.includes('google') && !f.src.includes('staticxx')
    );
    const video = document.querySelector('video');
    return iframe || video;
  }

  // SeriesDonghua (sep-2026) carga el iframe del reproductor bajo demanda: hay
  // una miniatura ("poster facade", por rendimiento/Core Web Vitals) con un botón
  // de play que hay que pulsar antes de que exista ningún iframe. Sin este click
  // el prompt de fullscreen de la extensión se queda esperando un target que
  // nunca aparece. `.click()` (no un MouseEvent simulado) dispara el handler del
  // sitio igual, incluso si el overlay quedó con pointer-events:none tras
  // cambiar de servidor antes de la primera reproducción.
  function clickGenericPlayPoster() {
    const btn = document.querySelector('.player-play-btn');
    if (!btn) return false;
    DBG('clickGenericPlayPoster: click sobre', btn.className);
    try { btn.click(); } catch (_) {}
    return true;
  }

  // ── Helpers para mundodonghua: placeholder click + fullscreen del contenedor ──
  // OJO: el <div id="xxx_play"> ENVUELVE al <img id="xxxplay"> y es el primero en orden
  // de documento, así que un querySelector con ambos selectores devolvía el div. Un click
  // (sintético) sobre el div no baja al img, que es quien tiene el handler que carga el
  // iframe (verificado en vivo en el servidor Fm): el iframe nunca aparecía, el overlay de
  // fullscreen esperaba al timeout y scheduleTabFallthrough iba saltando de servidor cada
  // 8 s. Por eso se busca SIEMPRE primero el <img> y el div solo queda como último recurso.
  function findActivePlaceholder() {
    const panes = document.querySelectorAll('.tab-pane.active, .tab-pane.in.active, .tab-pane.show.active, .md-player-pane.active');
    for (const pane of panes) {
      if (pane.offsetParent === null) continue; // tab oculto
      const ph = pane.querySelector('img[id$="play"]') || pane.querySelector('div[id$="_play"]');
      if (ph) return ph;
    }
    // Fallback: cualquier placeholder visible
    for (const ph of document.querySelectorAll('img[id$="play"]')) {
      if (ph.offsetParent !== null) return ph;
    }
    for (const ph of document.querySelectorAll('div[id$="_play"]')) {
      if (ph.offsetParent !== null) return ph;
    }
    return null;
  }

  function clickPlaceholder() {
    const ph = findActivePlaceholder();
    if (!ph) { DBG('clickPlaceholder: no hay placeholder visible'); return false; }
    DBG('clickPlaceholder: click sintético sobre', ph.id);
    try { ph.click(); } catch (_) {}
    try { ph.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch (_) {}
    return true;
  }

  // Polling tras click del prompt: espera al iframe/video del player y le pide fullscreen
  // al contenedor adecuado para que nuestro countdown overlay (Asura) sea visible.
  // Trusted activation de Chrome dura ~5s, así que tenemos margen.
  function fullscreenMundoPlayer() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const startTime = Date.now();
    const wait = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        clearInterval(wait); return;
      }

      // Caso A: iframe (Tamamo, Fm, Voe, Vh, Sw, etc.) — fullscreen sobre el iframe.
      // Los servidores de MundoDonghua usan dominios "espejo" que rotan (bysekoze.com,
      // vidhidepro.com, embedwish.com...), así que primero probamos con cualquier iframe
      // dentro del pane activo (robusto a esos cambios) y si no, con la lista de hosts
      // conocidos (por si el iframe no estuviera dentro de un `.md-player-pane`).
      const iframe = document.querySelector('.md-player-pane.active iframe[src]') || document.querySelector(
        'iframe[src*="mdnemonic"], iframe[src*="dailymotion"], iframe[src*="voe."], iframe[src*="streamtape"], iframe[src*="filemoon"]'
      );
      if (iframe) {
        clearInterval(wait);
        DBG('fullscreenMundoPlayer: iframe listo tras', elapsed, 'ms, fullscreen iframe');
        (iframe.requestFullscreen || iframe.webkitRequestFullscreen)?.call(iframe)
          .catch(err => DBG('iframe fs err:', err?.message));
        try { iframe.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
        // UNMUTE explícito + retries — el video pudo haber arrancado muted por la autoplay
        // policy (sin gesture), y mutePlay cachea ese estado. UNMUTE fuerza muted=false.
        const sendUnmute = () => {
          try { iframe.contentWindow.postMessage({ _aap: true, type: 'UNMUTE' }, '*'); } catch (_) {}
        };
        sendUnmute();
        [400, 1000, 2000, 3500].forEach(ms => setTimeout(sendUnmute, ms));
        return;
      }

      // Caso B: <video> directo (Asura/JWPlayer) — fullscreen sobre el contenedor
      const playerDiv = document.querySelector('div[id$="_player"]');
      const video = (playerDiv && playerDiv.querySelector('video')) || document.querySelector('video');
      if (video && video.isConnected && video.readyState >= 1) {
        clearInterval(wait);
        const target = playerDiv || video;
        DBG('fullscreenMundoPlayer: video listo tras', elapsed, 'ms, fullscreen sobre', target.id || 'video');
        (target.requestFullscreen || target.webkitRequestFullscreen)?.call(target)
          .catch(err => {
            DBG('container fs err:', err?.message, '— fallback video');
            (video.requestFullscreen || video.webkitRequestFullscreen)?.call(video).catch(() => {});
          });
        safeUnmute(video);
        if (video.paused) video.play().catch(() => {});
        return;
      }

      if (elapsed > 5000) { clearInterval(wait); DBG('fullscreenMundoPlayer: timeout sin player'); }
    }, 100);
  }

  // Para sitios sin placeholder (animeav1, animeflv, sdonghua, dlife): el iframe del player
  // ya está cargado al entrar a la página. Polling rápido + fullscreen sobre el iframe
  // dentro de la ventana de transient activation tras el click del usuario en el prompt.
  function fullscreenGenericPlayer() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const startTime = Date.now();
    const wait = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (document.fullscreenElement || document.webkitFullscreenElement) { clearInterval(wait); return; }

      const iframe = findPlayerTarget();
      if (iframe && iframe.tagName === 'IFRAME' && iframe.src) {
        clearInterval(wait);
        DBG('fullscreenGenericPlayer: iframe listo tras', elapsed, 'ms, fullscreen iframe', iframe.src.substring(0, 80));
        (iframe.requestFullscreen || iframe.webkitRequestFullscreen)?.call(iframe)
          .catch(err => DBG('iframe fs err:', err?.message));
        try { iframe.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
        const sendUnmute = () => {
          try { iframe.contentWindow.postMessage({ _aap: true, type: 'UNMUTE' }, '*'); } catch (_) {}
        };
        sendUnmute();
        [400, 1000, 2000, 3500].forEach(ms => setTimeout(sendUnmute, ms));
        return;
      }

      // Vídeo directo en la página (caso raro fuera de mundo, pero por si acaso)
      const video = document.querySelector('video');
      if (video && video.isConnected && video.readyState >= 1) {
        clearInterval(wait);
        (video.requestFullscreen || video.webkitRequestFullscreen)?.call(video).catch(() => {});
        safeUnmute(video);
        if (video.paused) video.play().catch(() => {});
        return;
      }

      if (elapsed > 5000) { clearInterval(wait); DBG('fullscreenGenericPlayer: timeout sin iframe'); }
    }, 100);
  }

  // Dar focus al iframe y simular tecla F para fullscreen
  function activateFullscreenWithF(target) {
    if (!target) return;

    if (target.tagName === 'IFRAME') {
      let isSameOrigin = false;
      try { void target.contentDocument; isSameOrigin = true; } catch (_) {}

      if (isSameOrigin) {
        // ── Same-origin: fullscreen sobre elemento DENTRO del iframe ─────
        // NO usamos target.requestFullscreen() porque eso pone el <iframe>
        // en fullscreen y el reproductor dentro no gestiona su propio estado,
        // rompiendo el botón de salir de pantalla completa del reproductor.
        const doc = target.contentDocument;
        // Buscar el elemento adecuado: contenedor del player, video, o body
        const innerTarget =
          doc.querySelector('.jw-wrapper, .jw-media, .video-js, .plyr, video') ||
          doc.querySelector('video') ||
          doc.body;
        const fs = (innerTarget.requestFullscreen || innerTarget.webkitRequestFullscreen);
        if (fs) {
          fs.call(innerTarget)
            .then(() => {
              try { target.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
              try {
                const v = doc.querySelector('video');
                if (v && v.paused) v.play().catch(() => {});
              } catch (_) {}
            })
            .catch(() => {
              // Fallback: si falla el fullscreen interno, intentar con el iframe
              DBG('activateFullscreenWithF: fallback a iframe.requestFullscreen');
              const ffb = target.requestFullscreen || target.webkitRequestFullscreen;
              if (ffb) ffb.call(target).catch(() => {});
            });
          return;
        }
        // Si no hay requestFullscreen en el elemento interno, usar PRESS_F
      }

      // Cross-origin (o same-origin sin requestFullscreen):
      // postMessage al iframe → player.js intenta APIs JWPlayer/VideoJS nativas
      try { target.contentWindow.postMessage({ _aap: true, type: 'SAVE_AND_PRESSF' }, '*'); } catch (_) {}
      try { target.focus(); } catch (_) {}

    } else if (target.tagName === 'VIDEO') {
      const wasMuted = target.muted;
      const vol = target.volume;
      const fs = target.requestFullscreen || target.webkitRequestFullscreen;
      // webkitRequestFullscreen antiguo devuelve undefined, no una promesa
      if (fs) Promise.resolve(fs.call(target)).then(() => {
        // El .then() ya no es un contexto de gesto: en Android restaurar el mute
        // aquí pausaría el vídeo.
        if (!IS_ANDROID) {
          target.muted = wasMuted;
          target.volume = vol;
        } else if (!wasMuted) {
          armUnmuteOnGesture();
        }
        if (target.paused) target.play().catch(() => {});
        try { window.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
      }).catch(() => {});
    }
  }

  // Inyectar keyframes de animación una sola vez
  function injectStyles() {
    if (document.getElementById('_aap_styles')) return;
    const style = document.createElement('style');
    style.id = '_aap_styles';
    style.textContent = `
      @keyframes _aap_fadein {
        from { opacity: 0; transform: scale(0.92) translateY(8px); }
        to   { opacity: 1; transform: scale(1)    translateY(0);   }
      }
      @keyframes _aap_pulse {
        0%, 100% { box-shadow: 0 8px 48px rgba(0,0,0,.85), 0 0 0 0   rgba(79,142,247,.4); }
        50%       { box-shadow: 0 8px 48px rgba(0,0,0,.85), 0 0 0 10px rgba(79,142,247,.0); }
      }
      @keyframes _aap_ring {
        from { stroke-dashoffset: 157; }
        to   { stroke-dashoffset: 0;   }
      }
    `;
    document.head.appendChild(style);
  }

  function showFullscreenPrompt(target, opts = {}) {
    DBG('showFullscreenPrompt llamado, fullscreenElement=', document.fullscreenElement, 'existing prompt=', document.getElementById('_aap_fs_prompt'));
    if (document.fullscreenElement || document.getElementById('_aap_fs_prompt')) return;
    DBG('showFullscreenPrompt creando overlay');
    injectStyles();

    const overlay = document.createElement('div');
    overlay.id = '_aap_fs_prompt';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      zIndex: '2147483647',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent',
      cursor: 'pointer',
    });

    const SECS = 5;
    const circ = 2 * Math.PI * 25; // 157

    const card = document.createElement('div');
    Object.assign(card.style, {
      background: 'rgba(8,10,18,0.96)',
      border: '1.5px solid rgba(79,142,247,0.45)',
      borderRadius: '16px',
      padding: '24px 34px',
      textAlign: 'center',
      boxShadow: '0 8px 48px rgba(0,0,0,0.85)',
      fontFamily: "-apple-system,'Segoe UI',sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
      pointerEvents: 'none',
      userSelect: 'none',
      color: '#fff',
      animation: '_aap_fadein 0.35s ease both, _aap_pulse 2s ease-in-out 0.5s infinite',
    });

    card.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.1em;text-transform:uppercase">${T('fs_title')}</div>

      <div style="position:relative;width:48px;height:48px;margin:4px 0;display:flex;align-items:center;justify-content:center;background:rgba(79,142,247,0.1);border-radius:50%">
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="#4F8EF7" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      </div>

      <div style="color:#4F8EF7;font-size:14px;font-weight:800;letter-spacing:.02em">${T('fs_tap')}</div>
      <div style="color:rgba(255,255,255,.4);font-size:11px">${T('fs_activate')}</div>
      <span id="_aap_skip" style="color:rgba(255,255,255,.2);font-size:10px;cursor:pointer;pointer-events:all;text-decoration:underline;margin-top:2px">${T('fs_skip')}</span>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Sin host nativo: el usuario pulsa el overlay para activar el fullscreen.
    // Ese click es un gesto trusted que permite requestFullscreen().

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      overlay.remove();
    };

    const enterFs = () => {
      cleanup();
      // beforeFullscreen corre PRIMERO dentro del trusted click (ej: click sintético al placeholder de mundo)
      if (opts.beforeFullscreen) {
        try { opts.beforeFullscreen(); } catch (e) { DBG('beforeFullscreen err:', e?.message); }
      }
      // customFullscreen reemplaza la lógica por defecto (ej: esperar al player de mundo y FS al contenedor)
      if (opts.customFullscreen) {
        try { opts.customFullscreen(); } catch (e) { DBG('customFullscreen err:', e?.message); }
        return;
      }
      // Re-evaluar target en el momento del click — puede que ahora exista aunque al crear el prompt no
      const liveTarget = target || findPlayerTarget();
      // Estamos dentro de un click trusted: el único momento en que Android permite
      // desmutear sin que el navegador pause el vídeo. La flag es de sesión porque
      // el <video> puede no existir todavía (lo crea el player más tarde).
      audioUnlocked = true;
      try {
        const vid = document.querySelector('video');
        if (vid) {
          vid.muted = false;
          vid.volume = vid.volume || 1;
          vid._aapOrigMuted = false; // el cache de mutePlay no debe re-mutearlo
          vid._aapAutoPlayDone = true; // el autoplay ya se resolvió aquí
          if (vid.paused) vid.play().catch(() => {});
        }
      } catch (_) {}
      // ORDEN IMPORTANTE: primero UNMUTE con gesture, luego PLAY_VIDEO. Al revés,
      // playPersistent arranca muteando el vídeo y en Android ese mute provoca un
      // pause; el permiso de audio llegaría tarde y entraría en bucle play/pause.
      document.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow.postMessage({ _aap: true, type: 'UNMUTE', gesture: true }, '*'); } catch (_) {}
      });
      document.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
      });
      if (liveTarget) activateFullscreenWithF(liveTarget);
    };

    overlay.addEventListener('click', enterFs);

    document.getElementById('_aap_skip').onclick = (e) => {
      e.stopPropagation();
      cleanup();
    };
    // El prompt persiste hasta que el usuario haga click o pulse "Saltar"
  }

  // Auto-play solo cuando venimos de episodio anterior
  // Envía PLAY_VIDEO una sola vez cuando el vídeo esté listo, sin bucle persistente
  function mutePlay(vid) {
    if (vid._aapMpInFlight) return Promise.resolve();
    vid._aapMpInFlight = true;
    markOurPause(vid); // el pause del mute/unmute no debe leerse como pausa del usuario
    // Audio ya desbloqueado por gesto trusted: mutear ahora provocaría un pause en
    // Android y con él el bucle play/pause. Desmutear y play directo. El unmute hace
    // falta aquí porque el <video> puede haberse creado después del gesto y nacer
    // muteado por la autoplay policy.
    if (audioUnlocked) {
      try { vid.muted = false; if (vid.volume === 0) vid.volume = 1; } catch (_) {}
      vid._aapOrigMuted = false;
      return vid.play()
        .then(() => { markOurPause(vid, 600); vid._aapMpInFlight = false; })
        .catch(() => {
          // La activación de usuario del click del overlay es transitoria y puede
          // haber expirado si el <video> se creó tarde. Play muteado (siempre
          // permitido) para que arranque, y el audio entra en el primer toque.
          try { vid.muted = true; } catch (_) {}
          return vid.play()
            .then(() => { markOurPause(vid, 600); vid._aapMpInFlight = false; armUnmuteOnGesture(); })
            .catch(() => { clearOurPause(vid); vid._aapMpInFlight = false; });
        });
    }
    if (vid._aapOrigMuted === undefined) vid._aapOrigMuted = vid.muted;
    const wasMuted = vid._aapOrigMuted;
    vid.muted = true;
    return vid.play()
      .then(() => { setTimeout(() => {
        // En Android NO restauramos el mute: hacerlo pausa el vídeo. El audio se
        // recupera en el próximo gesto real del usuario vía armUnmuteOnGesture.
        if (IS_ANDROID) {
          if (wasMuted === false) armUnmuteOnGesture();
        } else if (!wasMuted) {
          safeUnmute(vid);
        }
        vid._aapMpInFlight = false;
        // Dejar la ventana abierta un poco más: si el unmute provoca un pause,
        // el evento llega después de este tick.
        markOurPause(vid, 600);
      }, 300); })
      .catch(() => {
        if (!IS_ANDROID) vid.muted = wasMuted;
        clearOurPause(vid);
        vid._aapMpInFlight = false;
      });
  }

  function autoPlayWhenReady(fromPreviousEpisode) {
    if (!fromPreviousEpisode) return;

    let attempts = 0;
    let stopped = false;

    // Si el usuario pausa manualmente, abortar todos los reintentos
    function onUserPause(e) {
      const vid = e.target;
      if (isOurPause(vid)) return; // pausa causada por nuestro código
      if (!vid.paused) return;
      if (vid._aapLastPlayAt && Date.now() - vid._aapLastPlayAt < 500) return; // pause del navegador
      DBG('autoPlayWhenReady: usuario pausó manualmente, abortando');
      stopped = true;
      clearInterval(poll);
      document.removeEventListener('pause', onUserPause, true);
    }
    document.addEventListener('pause', onUserPause, true);

    const poll = setInterval(() => {
      if (stopped) return;
      attempts++;

      // Vídeo directo en página (Asura/JWPlayer)
      const vid = document.querySelector('video');
      if (vid && vid._aapUserPaused) {
        DBG('autoPlayWhenReady: video pausado por usuario, abortando');
        stopped = true;
        clearInterval(poll);
        document.removeEventListener('pause', onUserPause, true);
        return;
      }
      // Si el vídeo ya está reproduciéndose (p.ej. el gesto del overlay lo arrancó),
      // no hay nada que hacer: mutear ahora lo pausaría en Android y entraría en bucle.
      if (vid && !vid.paused) {
        DBG('autoPlayWhenReady: vídeo ya reproduciendo, terminado');
        stopped = true;
        clearInterval(poll);
        document.removeEventListener('pause', onUserPause, true);
        return;
      }
      // El gesto del overlay ya resolvió play+audio: mutePlay solo lo estropearía.
      if (vid && vid._aapAutoPlayDone) {
        DBG('autoPlayWhenReady: resuelto por gesto del overlay, abortando');
        stopped = true;
        clearInterval(poll);
        document.removeEventListener('pause', onUserPause, true);
        return;
      }
      if (vid && vid.readyState >= 2 && vid.paused) {
        mutePlay(vid);
        stopped = true;
        clearInterval(poll);
        document.removeEventListener('pause', onUserPause, true);
        return;
      }

      // Iframes mismo origen
      for (const f of document.querySelectorAll('iframe')) {
        if (!f.src || f.src.includes('facebook') || f.src.includes('disqus')) continue;
        try {
          const v = f.contentDocument?.querySelector('video');
          if (v && v.readyState >= 2 && v.paused && !v._aapUserPaused) {
            mutePlay(v);
            stopped = true;
            clearInterval(poll);
            document.removeEventListener('pause', onUserPause, true);
            return;
          }
        } catch (_) {}
      }

      // Cross-origin: enviar PLAY_VIDEO periódicamente hasta que el player esté listo
      const playerIframes = Array.from(document.querySelectorAll('iframe')).filter(f =>
        f.src && !f.src.includes('facebook') && !f.src.includes('disqus') && !f.src.includes('google')
      );
      if (playerIframes.length > 0) {
        playerIframes.forEach(f => {
          try { f.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
        });
      }

      if (attempts >= 20) { clearInterval(poll); document.removeEventListener('pause', onUserPause, true); } // máx 6s
    }, 300);
  }

  // Restaurar reproductor, play y fullscreen al cargar
  function restoreOnLoad() {
    const siteKey = 'aap_player_' + HOST.replace(/\./g, '_');
    _ext.storage.local.get([siteKey, 'aap_fullscreen', 'aap_autoplay'], (data) => {
      const savedPlayer      = data[siteKey];
      const doFullscreen     = !!data['aap_fullscreen'];
      const fromPrevEpisode  = !!data['aap_autoplay'];
      DBG('restoreOnLoad data=', data, 'autoFullscreen setting=', settings.autoFullscreen);

      // Limpiar flags SIEMPRE
      _ext.storage.local.remove(['aap_fullscreen', 'aap_autoplay']);

      // Si no venimos de episodio anterior no hay nada que restaurar
      if (!fromPrevEpisode) { DBG('restoreOnLoad: no fromPrevEpisode, salimos'); return; }

      // Función que ejecuta la restauración cuando el DOM esté listo
      function doRestore() {
        function realIframeReady() {
          // MundoDonghua: cualquier iframe cargado dentro del pane de servidor activo
          // cuenta como listo, sin depender de qué dominio espejo use ese servidor hoy
          // (bysekoze.com para Fm, vidhidepro.com para Vh, embedwish.com para Sw...).
          if (IS_MUNDO && document.querySelector('.md-player-pane.active iframe[src]')) return true;
          if (document.querySelector(
            'iframe[src*="mdnemonic"], iframe[src*="dailymotion"], iframe[src*="voe."], ' +
            'iframe[src*="streamtape"], iframe[src*="filemoon"], iframe[src*="zilla"], ' +
            'iframe[src*="mega.nz"], iframe[src*="upnshare"], iframe[src*="pdrain"], ' +
            'iframe[src*="mp4upload"]'
          )) return true;
          // Respaldo genérico (AV1, SeriesDonghua, DonghuaLife...): los servidores usan
          // dominios espejo que rotan con frecuencia (uns.bio, byselapuix.com, ok.ru,
          // rumble.com...) y es inútil perseguirlos uno a uno. Verificado en vivo que estos
          // sitios sustituyen el <iframe> al cambiar de servidor (nunca dejan varios ocultos
          // a la vez), así que cualquier iframe de contenido ya cargado — descartando los
          // widgets conocidos que no son el reproductor — cuenta como listo.
          if (IS_MUNDO) return false; // en Mundo si no matcheó arriba, aún no está listo
          return Array.from(document.querySelectorAll('iframe')).some(f =>
            f.src && !f.src.includes('facebook') && !f.src.includes('disqus') &&
            !f.src.includes('google') && !f.src.includes('staticxx')
          );
        }

        // En mundodonghua cada player tab tiene su propio Blocker (Tamamo_Blocker, Asura_Blocker, etc.)
        // Lo llamamos para que muestre la imagen placeholder. El click sobre la imagen lo hace el usuario
        // (debe ser un evento trusted — los sintéticos no disparan la carga del iframe).
        function invokeActiveBlocker() {
          const blockers = Object.keys(window).filter(k => {
            try { return typeof window[k] === 'function' && k.endsWith('_Blocker'); }
            catch (_) { return false; }
          });
          DBG('blockers disponibles:', blockers);
          for (const name of blockers) {
            try { window[name](); DBG('llamado', name); } catch (e) { DBG('error en', name, e.message); }
          }
        }

        // Listener delegado: cuando el usuario clickea cualquier placeholder (imágenes terminadas en "play"),
        // ese click trusted carga el reproductor Y aprovechamos el gesture para entrar en fullscreen.
        // Mundodonghua tiene DOS arquitecturas:
        //   - Iframe (Tamamo): <iframe id="tamamo_player" allowfullscreen> + <img id="tamamoplay">
        //     → requestFullscreen() sobre el iframe.
        //   - JWPlayer directo (Asura): <div id="asura_player"> + <img id="asuraplay">
        //     → tras delay, jwplayer(id).play() y jwplayer(id).setFullscreen(true).
        function attachPlayClickInterceptor() {
          if (window._aapClickInterceptorAttached) return;
          window._aapClickInterceptorAttached = true;
          document.addEventListener('click', (e) => {
            if (!e.isTrusted) return;
            const img = e.target.closest('img[id$="play"], div[id$="_play"]');
            if (!img) return;
            DBG('placeholder clickeado:', img.id);
            if (!settings.autoFullscreen) return;
            // `.tab-pane` es el markup antiguo; `.md-player-pane` es el actual de MundoDonghua.
            // Sin este segundo selector, pane caía siempre en `document` (toda la página) y el
            // Caso B de abajo podía acabar haciendo fullscreen sobre el pane de OTRO servidor.
            const pane = img.closest('.tab-pane, .md-player-pane') || document;

            // Caso A: player vía iframe (Tamamo, Fm, Voe, Vh, Sw, etc.). Los iframes del
            // markup nuevo no traen id, así que basta con que exista dentro del pane.
            const iframe = pane.querySelector('iframe[id$="_player"], iframe[src]');
            if (iframe) {
              DBG('modo iframe, fullscreen sobre', iframe.id || iframe.src);
              (iframe.requestFullscreen || iframe.webkitRequestFullscreen)?.call(iframe)
                .then(() => DBG('fullscreen OK'))
                .catch(err => DBG('fs error:', err?.message));
              return;
            }

            // Caso B: player vía <video> directo (Asura con JWPlayer, etc.)
            // Los content scripts no pueden acceder a window.jwplayer (mundo aislado).
            // Solución: esperar a que el <video> aparezca y pedir fullscreen sobre él directamente,
            // dentro de la ventana de "transient activation" de Chrome (~5s tras el click trusted).
            const playerDiv = pane.querySelector('div[id$="_player"]');
            DBG('Caso B check: playerDiv=', !!playerDiv, playerDiv?.id);
            if (!playerDiv) return;

            const startTime = Date.now();
            const waitVideo = setInterval(() => {
              const elapsed = Date.now() - startTime;
              const video = pane.querySelector('video') || playerDiv.querySelector('video');
              if (video && video.isConnected && video.readyState >= 1) {
                clearInterval(waitVideo);
                // Fullscreen sobre el contenedor (no sobre <video>) para que overlays
                // hijos del root (countdown, etc.) sigan siendo visibles en fullscreen.
                DBG('video listo tras', elapsed, 'ms, requestFullscreen sobre contenedor', playerDiv.id);
                (playerDiv.requestFullscreen || playerDiv.webkitRequestFullscreen)?.call(playerDiv)
                  .then(() => DBG('container fullscreen OK'))
                  .catch(err => {
                    DBG('container fs err:', err?.message, '— fallback a <video>');
                    (video.requestFullscreen || video.webkitRequestFullscreen)?.call(video).catch(() => {});
                  });
                if (video.paused) { video.play().catch(() => {}); }
                return;
              }
              if (elapsed > 4500) {
                clearInterval(waitVideo);
                DBG('timeout esperando <video> tras', elapsed, 'ms');
              }
            }, 100);
          }, true);
        }

        // Si el reproductor activo no tiene vídeo en N segundos, probar el siguiente tab
        function scheduleTabFallthrough(tabs, idx) {
          if (idx < 0 || idx >= tabs.length) return;
          let checks = 0;
          const fallTimer = setInterval(() => {
            checks++;
            if (realIframeReady() || document.querySelector('video')) {
              clearInterval(fallTimer);
              return;
            }
            if (checks >= 16) { // 8 s sin reproductor → probar siguiente
              clearInterval(fallTimer);
              const next = idx + 1;
              if (next < tabs.length) {
                DBG('Sin reproductor en tab', idx, '— intentando tab', next, tabs[next].textContent.trim().split('\n')[0].trim());
                tabs[next].click();
                scheduleTabFallthrough(tabs, next);
              }
            }
          }, 500);
        }

        // 1. Click en el tab del player guardado (Tamamo, Asura...)
        // NOTA: en AV1/SeriesDonghua/DonghuaLife el servidor por defecto ya trae
        // su iframe cargado al entrar a la página (a diferencia de Mundo, que
        // depende de un placeholder). Si el guard fuera "!realIframeReady()" para
        // todos los sitios, ese iframe por defecto ya existente haría que NUNCA
        // se intentase el click al tab guardado — el "recordar reproductor"
        // quedaría siempre en el servidor por defecto. Para Mundo se mantiene el
        // guard tal cual (su arquitectura sí depende de que aún no haya iframe).
        if (savedPlayer && settings.rememberPlayer && (!IS_MUNDO || !realIframeReady())) {
          const allTabs = IS_DLIFE ? dlifeServerButtons() : Array.from(document.querySelectorAll(PLAYER_TAB_SEL));
          let clickedIdx = -1;
          for (let i = 0; i < allTabs.length; i++) {
            const label = getTabKey(allTabs[i]);
            if (label === savedPlayer ||
                label.toLowerCase().includes(savedPlayer.toLowerCase()) ||
                savedPlayer.toLowerCase().includes(label.toLowerCase())) {
              DBG('doRestore clickeando tab', savedPlayer, 'idx', i);
              allTabs[i].click();
              clickedIdx = i;
              break;
            }
          }
          // Si se hizo click, validar que aparece vídeo; si no, probar el siguiente tab
          if (clickedIdx >= 0) scheduleTabFallthrough(allTabs, clickedIdx);
        }

        if (IS_MUNDO) {
          // ── MundoDonghua: arquitectura de placeholders + Blockers ────────────
          // 2. Mostrar el placeholder llamando al Blocker, y attachar el interceptor
          attachPlayClickInterceptor();
          invokeActiveBlocker(); // intento inmediato
          setTimeout(() => { invokeActiveBlocker(); }, 300);
          setTimeout(() => { invokeActiveBlocker(); }, 1000); // por si el tab tarda en cargar su Blocker

          // 2.5. Click programático sobre el placeholder (best-effort, sin gesture).
          [150, 400, 700, 1200, 2000, 3000, 4500].forEach(ms => setTimeout(() => {
            if (realIframeReady() || document.querySelector('div[id$="_player"] video, div[id$="_player"] iframe[src]')) return;
            clickPlaceholder();
          }, ms));

          // NOTA: el prompt de fullscreen se muestra DESPUÉS en el polling (step 3)
          // cuando el iframe del player esté cargado, no aquí. En MundoDonghua el
          // click del host nativo necesita que el iframe exista y esté visible.
        } else if (IS_JKANIME) {
          // ── JKAnime: iframe exterior same-origin (.player_conte) siempre presente,
          // pero si el servidor activo es uno externo (Mega, VOE, Filemoon...) hay
          // que aceptar primero un aviso ("Aceptar y Continuar") dentro de ese mismo
          // iframe antes de que el vídeo real exista. El servidor propio (Desu/Magi)
          // no muestra ese aviso — jkanimeReady() ya lo detecta sin más.
          [0, 300, 800, 1500, 2500].forEach(ms => setTimeout(() => {
            if (jkanimeReady()) return;
            jkanimeDismissWarning();
          }, ms));

          if (doFullscreen && !document.fullscreenElement) {
            showFullscreenPrompt(null, {
              beforeFullscreen: () => { if (!jkanimeReady()) jkanimeDismissWarning(); },
              customFullscreen: () => fullscreenJkanimePlayer(),
            });
          }
        } else {
          // ── AnimeAV1, AnimeFLV, SeriesDonghua, DonghuaLife ───────────────────
          // En AV1/FLV/DLife el iframe del player ya está cargado al entrar a la
          // página. SeriesDonghua (sep-2026) es la excepción: usa un poster-facade
          // y no existe ningún iframe hasta pulsar su propio botón de play — lo
          // intentamos con best-effort (no necesita gesture) y, por si acaso, también
          // justo antes del fullscreen (dentro del click trusted del prompt).
          [0, 300, 800, 1500].forEach(ms => setTimeout(() => {
            if (realIframeReady()) return;
            clickGenericPlayPoster();
          }, ms));

          // Mostramos el prompt grande de fullscreen — el click del usuario entra fullscreen
          // sobre el iframe del player y envía PLAY_VIDEO + UNMUTE para arrancar el video.
          if (doFullscreen && !document.fullscreenElement) {
            showFullscreenPrompt(null, {
              beforeFullscreen: () => { if (!realIframeReady()) clickGenericPlayPoster(); },
              customFullscreen: () => fullscreenGenericPlayer(),
            });
          }
        }

        // 3. Polling: detectar cuando el player real está listo para lanzar autoPlay.
        // En Asura no hay iframe — chequear también <video> directo dentro de panes activos.
        // En MundoDonghua: mostrar el prompt de fullscreen AQUÍ (cuando el player ya existe),
        // para que el click nativo del host caiga sobre el iframe/player visible.
        let attempts = 0;
        let mundoFsShown = false;
        const poll = setInterval(() => {
          attempts++;
          const videoReady = !!document.querySelector('div[id$="_player"] video, video');
          const playerReady = realIframeReady() || (IS_MUNDO && videoReady) || (IS_JKANIME && jkanimeReady());
          if (playerReady) {
            DBG('player real detectado tras', attempts, 'intentos, lanzando autoPlay');
            clearInterval(poll);
            if (IS_MUNDO && doFullscreen && !mundoFsShown && !document.fullscreenElement) {
              mundoFsShown = true;
              showFullscreenPrompt(null, {
                beforeFullscreen: () => {
                  if (realIframeReady()) return;
                  invokeActiveBlocker();
                  clickPlaceholder();
                },
                customFullscreen: () => fullscreenMundoPlayer(),
              });
            }
            setTimeout(() => autoPlayWhenReady(fromPrevEpisode), 300);
            return;
          }
          // Si tras varios intentos el placeholder sigue sin cargar el player, reintentar click
          if (IS_MUNDO && attempts % 5 === 0) {
            invokeActiveBlocker();
            clickPlaceholder();
          }
          if (!IS_MUNDO && attempts % 5 === 0) {
            clickGenericPlayPoster();
          }
          if (IS_JKANIME && attempts % 5 === 0) {
            jkanimeDismissWarning();
          }
          if (attempts >= 60) { // 30s
            DBG('doRestore: timeout esperando player (usuario debe hacer click en play)');
            clearInterval(poll);
            // Fallback: mostrar prompt de todas formas para que el usuario pueda clickar
            if (IS_MUNDO && doFullscreen && !mundoFsShown && !document.fullscreenElement) {
              mundoFsShown = true;
              showFullscreenPrompt(null, {
                beforeFullscreen: () => { invokeActiveBlocker(); clickPlaceholder(); },
                customFullscreen: () => fullscreenMundoPlayer(),
              });
            }
          }
        }, 300);
      }

      // Esperar a que los tabs del player estén en el DOM
      // (en MundoDonghua pueden tardar más porque son jQuery)
      const tabsSel = PLAYER_TAB_SEL + ', #iframe-episode, iframe[src*="player"]';
      // DonghuaLife: sus botones de servidor no matchean tabsSel (sin clase estable).
      const tabsPresent = () => document.querySelectorAll(tabsSel).length > 0 || (IS_DLIFE && dlifeServerButtons().length > 0);
      if (tabsPresent()) {
        doRestore(); // tabs ya en el DOM, no esperar
      } else {
        let waitAttempts = 0;
        const waitForTabs = setInterval(() => {
          waitAttempts++;
          if (tabsPresent() || waitAttempts > 15) {
            clearInterval(waitForTabs);
            doRestore();
          }
        }, 60);
      }
    });
  }

  function requestFullscreenWhenReady() {
    DBG('requestFullscreenWhenReady → mostrando prompt inmediatamente (target se resolverá al click)');
    // No esperamos a encontrar el target — mostramos el prompt YA y resolvemos el target
    // cuando el usuario haga click (puede que para entonces el iframe ya esté en el DOM).
    showFullscreenPrompt(findPlayerTarget());
  }


  // ════════════════════════════════════════════════════════════════════════════
  // Cancelar countdown: C (no pelea con fullscreen).
  // Escape: Chrome FUERZA salir de FS; cancelamos y reentramos con PRESS_F.
  let _aapEscReenterUntil = 0;
  function cancelCountdownKeepFs(fromEsc) {
    const wasFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    stopMainCountdown();
    if (!fromEsc || !wasFs) return;
    _aapEscReenterUntil = Date.now() + 1500;
    const reenter = () => {
      if (Date.now() > _aapEscReenterUntil) return;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const target = findPlayerTarget();
      if (target) try { activateFullscreenWithF(target); } catch (_) {}
    };
    setTimeout(reenter, 40);
    setTimeout(reenter, 150);
    setTimeout(reenter, 350);
  }
  document.addEventListener('keydown', (e) => {
    if (mainCountdownActive) {
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault(); e.stopImmediatePropagation();
        cancelCountdownKeepFs(false);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation();
        cancelCountdownKeepFs(true);
        return;
      }
    }
    // '+'/'-' ajustan los segundos de "saltar créditos / ending" (settings.skipBeforeEnd,
    // el slider "Saltar créditos / ending" del popup, no la cuenta atrás). No dependen de
    // que haya una cuenta atrás activa (funcionan "siempre") y no dependen del ajuste
    // general de "atajos de teclado" — son atajos propios de este valor.
    //   '+': si hay una cuenta atrás EN MARCHA, además la extiende 5s en pantalla
    //        (extendMainCountdown) — y, siempre, suma 5s a skipBeforeEnd guardado.
    //   '-': nunca toca la cuenta atrás en pantalla, solo resta 5s a skipBeforeEnd.
    // Se ignoran si el usuario está escribiendo en un campo de texto de la página.
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' ||
        e.key === '-' || e.code === 'NumpadSubtract') {
      const t = e.target;
      const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (isTyping) return;
      e.preventDefault(); e.stopImmediatePropagation();
      applyEndingShortcut((e.key === '-' || e.code === 'NumpadSubtract') ? -5 : 5);
    }
  }, true);
  document.addEventListener('fullscreenchange', () => {
    if (Date.now() > _aapEscReenterUntil) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) { _aapEscReenterUntil = 0; return; }
    const target = findPlayerTarget();
    if (target) try { activateFullscreenWithF(target); } catch (_) {}
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ATAJOS DE TECLADO
  // ════════════════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', (e) => {
    if (!settings.keyboardShortcuts) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key.toLowerCase()) {
      case 'g':
        // La cuenta atrás puede estar aquí (vídeo directo) o dentro de un iframe (player.js).
        if (shortenMainCountdown(2)) { e.preventDefault(); showShortcutToast(T('toast_cd_secs', { n: 2 })); }
        else forwardToPlayerFrames({ _aap: true, type: 'COUNTDOWN_TO', secs: 2 });
        break;
      case 'n':
        e.preventDefault();
        showShortcutToast(T('toast_next'));
        navigateAuto();
        break;
      case 'c':
        if (mainCountdownActive) {
          e.preventDefault();
          showShortcutToast(T('toast_cd_cancelled'));
          stopMainCountdown();
        }
        break;
      case 'escape':
        // Capture handler ya cancela + reentra FS
        break;
      case 's':
        if (settings.introSkip) {
          e.preventDefault();
          // Si el <video> vive en un iframe (SeriesDonghua, AV1...), esta página no lo
          // ve: se lo pasamos al reproductor, que salta la intro y muestra su toast.
          if (iframeIsFullscreen() || !document.querySelector('video')) { forwardToPlayerFrames({ _aap: true, type: 'SHORTCUT', key: 's' }); break; }
          document.querySelectorAll('video').forEach(v => {
            if (v.currentTime >= settings.introFrom && v.currentTime < settings.introTo && !introSkipDone) {
              showShortcutToast(T('toast_intro'));
              doMainIntroSkip(v);
            }
          });
        }
        break;
      case 'f':
        e.preventDefault();
        showShortcutToast(T('toast_fs'));
        (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)?.();
        break;
      case 'p':
        e.preventDefault();
        const pi = document.querySelector('video');
        if (!pi) { forwardToPlayerFrames({ _aap: true, type: 'SHORTCUT', key: 'p' }); break; }
        if (pi && document.pictureInPictureEnabled) {
          if (document.pictureInPictureElement) {
            showShortcutToast(T('toast_pip_off'));
            document.exitPictureInPicture().catch(()=>{});
          } else {
            showShortcutToast(T('toast_pip_on'));
            pi.requestPictureInPicture().catch(()=>{});
          }
        }
        break;
      case 'arrowleft':
        e.preventDefault();
        if (iframeIsFullscreen() || !document.querySelector('video')) { forwardToPlayerFrames({ _aap: true, type: 'SHORTCUT', key: 'arrowleft' }); break; }
        showShortcutToast('◀ -5s');
        document.querySelectorAll('video').forEach(v => { v.currentTime = Math.max(0, v.currentTime - 5); });
        break;
      case 'arrowright':
        e.preventDefault();
        if (iframeIsFullscreen() || !document.querySelector('video')) { forwardToPlayerFrames({ _aap: true, type: 'SHORTCUT', key: 'arrowright' }); break; }
        showShortcutToast('▶ +5s');
        document.querySelectorAll('video').forEach(v => { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 5); });
        break;
    }
  });
// INIT
  // ════════════════════════════════════════════════════════════════════════════
  loadSettings(() => {
    dnsPrefetch();
    pushSettings();
    scanAllVideos();
    [500, 1000, 2000, 4000].forEach(ms => setTimeout(() => { pushSettings(); scanAllVideos(); }, ms));
    // Restaurar lo antes posible — waitForTabs en doRestore gestiona su propio polling
    restoreOnLoad();
    setTimeout(detectAndSaveActivePlayer, 3000);
    setTimeout(() => preloadNextEpisode(getNextUrl()), 4000);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // AUTO-OCULTAR CURSOR EN FULLSCREEN
  // ════════════════════════════════════════════════════════════════════════════
  // El click automático via host nativo (Python) no genera movimiento de ratón,
  // asi que el cursor se queda visible sobre el vídeo en fullscreen hasta que el
  // usuario lo mueve. Lo ocultamos ya al entrar en FS y lo re-ocultamos tras
  // inactividad, como hace cualquier reproductor de vídeo (YouTube, Netflix...).
  (function () {
    let cursorStyleEl = null;
    let hideTimer = null;
    const HIDE_DELAY = 1800;

    function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

    function ensureStyle() {
      if (cursorStyleEl) return cursorStyleEl;
      cursorStyleEl = document.createElement('style');
      cursorStyleEl.id = '_aap_cursor_hide';
      cursorStyleEl.textContent = '*{cursor:none !important}';
      return cursorStyleEl;
    }

    function hideCursor() {
      if (!isFs()) return;
      const root = document.fullscreenElement || document.webkitFullscreenElement || document.documentElement;
      const style = ensureStyle();
      if (!style.isConnected || style.parentNode !== root) {
        try { (root.appendChild ? root : document.documentElement).appendChild(style); } catch (_) {}
      }
    }

    function showCursor() {
      if (cursorStyleEl && cursorStyleEl.isConnected) {
        try { cursorStyleEl.remove(); } catch (_) {}
      }
    }

    function scheduleHide() {
      clearTimeout(hideTimer);
      if (!isFs()) return;
      hideTimer = setTimeout(hideCursor, HIDE_DELAY);
    }

    function onActivity() {
      showCursor();
      scheduleHide();
    }

    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach(evt => {
      document.addEventListener(evt, onActivity, true);
    });

    function onFsChange() {
      if (isFs()) {
        // Ocultar pronto tras entrar en FS (el click del host no mueve el ratón)
        showCursor();
        scheduleHide();
      } else {
        clearTimeout(hideTimer);
        showCursor();
      }
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  })();

})();
