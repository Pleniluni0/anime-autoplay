// Anime AutoPlay — player.js v12

(function () {
  'use strict';

  if (window.self === window.top) return;
  const DBG = () => {}; // logs silenciados

  const IS_ANDROID = /android/i.test(navigator.userAgent);
  const T = (k, v) => AAP_I18N.t(k, v); // i18n.js; el idioma llega con SETTINGS (lang)

  // Ventana temporal en vez de flag booleana: el `pause` que provocan nuestras
  // operaciones (mute/unmute, seek) llega en un tick posterior, cuando una flag
  // booleana ya se habría borrado y el pause pasaría por "el usuario pausó".
  function markOurPause(v, ms) { try { v._aapOurPauseUntil = Date.now() + (ms || 900); } catch (_) {} }
  function isOurPause(v)       { return !!(v && v._aapOurPauseUntil && Date.now() < v._aapOurPauseUntil); }
  function clearOurPause(v)    { try { delete v._aapOurPauseUntil; } catch (_) {} }

  // Una vez que el audio se ha desbloqueado dentro de un gesto trusted, mutePlay
  // NO debe volver a mutear: en Android ese mute provoca un pause y entra en bucle
  // de play/pause. Es una flag de sesión, no por vídeo.
  let audioUnlocked = false;

  // Android: desmutear sólo dentro de un gesto trusted. Si no hay gesto, lo
  // dejamos armado para el próximo toque del usuario.
  let unmuteArmed = false;
  function armUnmuteOnGesture() {
    // Avisar (cada intento fallido, no solo el primero) a la página principal: si este frame está en fullscreen y sigue muteado,
    // main.js manda un click nativo (trusted) al centro para darle activación.
    try { window.top.postMessage({ _aap: true, type: 'NEED_GESTURE' }, '*'); } catch (_) {}
    try { window.parent.postMessage({ _aap: true, type: 'NEED_GESTURE' }, '*'); } catch (_) {}
    if (unmuteArmed) return;
    unmuteArmed = true;
    const doUnmute = (e) => {
      if (!e.isTrusted) return;
      audioUnlocked = true;
      document.querySelectorAll('video').forEach(v => {
        try {
          const wasPlaying = !v.paused && !v.ended;
          delete v._aapOrigMuted; v.muted = false; if (v.volume === 0) v.volume = 1;
          // Si el propio gesto (p.ej. el click nativo al centro) hace de play/pause en el
          // reproductor, lo reanudamos para no dejar el vídeo parado.
          if (wasPlaying) {
            markOurPause(v, 1500);
            setTimeout(() => { try { if (v.paused && !v.ended) v.play().catch(() => {}); } catch (_) {} }, 350);
          }
        } catch (_) {}
      });
      unmuteArmed = false;
      ['pointerdown', 'touchend', 'click', 'keydown'].forEach(t =>
        document.removeEventListener(t, doUnmute, true));
    };
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(t =>
      document.addEventListener(t, doUnmute, true));
  }


  let S = {
    autoplay: true,
    countdownSeconds: 5,
    countdownOverlay: true,
    skipBeforeEnd: 0,
    introSkip: false,
    introAuto: false,
    introSpeed: false,   // ×2 velocidad en intro
    introFrom: 0,
    introTo: 90,
    keyboardShortcuts: true,
    nextLabel: '',
    lang: null,
    nightBlock: false,
    nextUrl: '',
  };

  let earlyFired      = false;
  let introSkipDone   = false;
  let countdownTimer  = null;
  let countdownActive = false;
  let countdownSecs   = 0;
  let origVolumes     = []; // [{video, volume}] para restaurar al cancelar countdown

  // ── Relé para frames intermedios ────────────────────────────────────────────
  // Algunos servidores anidan el reproductor un nivel más (p.ej. MundoDonghua/Fm:
  // mundodonghua.com → bysekoze.com [solo UI React] → n1mwq.org [el <video>]).
  // main.js solo habla con sus iframes DIRECTOS y descarta mensajes cuyo e.source
  // no lo sea (isTrustedPlayerFrame), así que sin relé el frame interior nunca
  // recibía SETTINGS/PLAY_VIDEO y sus TRIGGER/PLAY_NOW se descartaban. bridge.js
  // ya hace esto en los dominios que conoce; aquí lo cubrimos para CUALQUIER dominio
  // espejo (rotan constantemente). Si bridge.js está activo en este frame, no
  // duplicamos. Bajada: solo desde parent/top hacia los hijos. Subida: solo desde
  // un iframe hijo real de este documento hacia el parent.
  const AAP_DOWN = ['SETTINGS', 'PLAY_VIDEO', 'UNMUTE', 'LOWER_VOLUME', 'RESTORE_VOLUME', 'SAVE_AND_PRESSF', 'PRESS_F', 'SHORTCUT', 'TOAST', 'EXTEND_COUNTDOWN', 'COUNTDOWN_TO'];
  const AAP_UP   = ['TRIGGER', 'PLAY_NOW', 'CANCELLED', 'STARTING', 'GET_SETTINGS', 'FULLSCREEN_ENTERED', 'ADJUST_ENDING', 'NEED_GESTURE', 'NIGHT_END', 'COUNTDOWN_TO'];
  window.addEventListener('message', (e) => {
    if (window.__aapBridgeActive) return;
    if (!e.data || e.data._aap !== true) return;
    const frames = document.querySelectorAll('iframe');
    if (!frames.length) return;
    if (AAP_DOWN.includes(e.data.type) && (e.source === window.parent || e.source === window.top)) {
      frames.forEach(f => { try { f.contentWindow.postMessage(e.data, '*'); } catch (_) {} });
      return;
    }
    if (AAP_UP.includes(e.data.type)) {
      for (const f of frames) {
        if (f.contentWindow === e.source) {
          try { window.parent.postMessage(e.data, '*'); } catch (_) {}
          break;
        }
      }
    }
  });

  // ── Toast de atajos (dentro del iframe) ─────────────────────────────────────
  // Cuando el fullscreen lo tiene el <iframe>, el toast de la página principal queda
  // dentro del elemento <iframe> y no se pinta; por eso el reproductor tiene el suyo.
  // Mismo estilo que el de main.js. Solo lo muestra el frame "grande" (no los banners).
  let _aapToastEl = null, _aapToastTimer = null;
  function showToast(text, ms) {
    if (window.innerWidth < 240 || window.innerHeight < 120) return;
    if (!_aapToastEl) {
      _aapToastEl = document.createElement('div');
      _aapToastEl.id = '_aap_toast';
      Object.assign(_aapToastEl.style, {
        position: 'fixed', top: '4vh', left: '50%', zIndex: '2147483647',
        transform: 'translateX(-50%) translateY(-10px)', opacity: '0',
        transition: 'opacity 0.15s ease, transform 0.15s ease', pointerEvents: 'none',
      });
      const sh = _aapToastEl.attachShadow({ mode: 'open' });
      sh.innerHTML = `<style>*{box-sizing:border-box;margin:0;padding:0}#card{background:rgba(8,10,18,.96);border:1.5px solid rgba(79,142,247,.55);border-radius:12px;padding:clamp(10px,1.1vw,15px) clamp(18px,2vw,30px);font:700 clamp(17px,1.7vw,24px) -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;box-shadow:0 8px 36px rgba(0,0,0,.68);white-space:nowrap}</style><div id="card"></div>`;
      _aapToastEl._sh = sh;
    }
    // Reinsertar siempre: queda como último hijo (encima) y sigue al fullscreen.
    (document.fullscreenElement || document.webkitFullscreenElement || document.body || document.documentElement).appendChild(_aapToastEl);
    _aapToastEl._sh.getElementById('card').textContent = text;
    _aapToastEl.style.opacity = '1';
    _aapToastEl.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(_aapToastTimer);
    _aapToastTimer = setTimeout(() => {
      _aapToastEl.style.opacity = '0';
      _aapToastEl.style.transform = 'translateX(-50%) translateY(-10px)';
    }, ms || 1100);
  }

  // Atajos que dependen del <video> (S, P, ←, →). Se ejecutan por teclado en este frame o
  // reenviados desde la página principal (type SHORTCUT) cuando el foco está allí y el
  // vídeo vive aquí. En el caso reenviado solo actuamos sobre vídeos "de verdad" (>= 60 s)
  // para no tocar los de banners/previews, y como el mensaje llega a TODOS los iframes,
  // el que no tiene reproductor no hace nada (ni toast).
  function runVideoShortcut(key, forwarded) {
    const all = Array.from(document.querySelectorAll('video'));
    const vids = forwarded ? all.filter(v => v.readyState >= 1 && (v.duration || 0) >= 60) : all;
    switch (key) {
      case 's': {
        if (!S.introSkip) return;
        let did = false;
        vids.forEach(v => {
          if (v.currentTime >= S.introFrom && v.currentTime < S.introTo && !introSkipDone) { doIntroSkip(v); did = true; }
        });
        if (did) showToast(T('toast_intro'));
        return;
      }
      case 'p': {
        const pi = vids[0];
        if (!pi || !document.pictureInPictureEnabled) return;
        if (document.pictureInPictureElement) { showToast(T('toast_pip_off')); document.exitPictureInPicture().catch(() => {}); }
        else { showToast(T('toast_pip_on')); pi.requestPictureInPicture().catch(() => {}); }
        return;
      }
      case 'arrowleft':
        if (!vids.length) return;
        showToast('◀ -5s');
        vids.forEach(v => { v.currentTime = Math.max(0, v.currentTime - 5); });
        return;
      case 'arrowright':
        if (!vids.length) return;
        showToast('▶ +5s');
        vids.forEach(v => { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 5); });
        return;
    }
  }

  // ── Settings ─────────────────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (!e.data || e.data._aap !== true) return;
    if (e.data.type === 'SHORTCUT') { runVideoShortcut(String(e.data.key || ''), true); return; }
    if (e.data.type === 'COUNTDOWN_TO') { shortenCountdown(Number(e.data.secs) || 2); return; }
    if (e.data.type === 'EXTEND_COUNTDOWN') { extendCountdown(Number(e.data.secs) || 5); return; }
    if (e.data.type === 'TOAST') { showToast(String(e.data.text || ''), Number(e.data.ms) || 0); return; }
    if (e.data.type === 'SETTINGS') { S = { ...S, ...e.data.payload }; AAP_I18N.setPref(S.lang); }
    // Reproducir vídeo tras salto de episodio — y desmutearlo si el browser lo muteó por autoplay
    if (e.data.type === 'PLAY_VIDEO') {
      DBG('PLAY_VIDEO recibido, llamando playPersistent');
      playPersistent();
    }
    // Desmutear directamente — para casos donde el video arrancó muted por autoplay policy
    // y mutePlay no puede desmutearlo porque cacheó wasMuted=true del estado autoplay.
    // video.muted = false vía JS no está bloqueado por la policy cuando el video ya está playing.
    if (e.data.type === 'UNMUTE') {
      // En Android el unmute sin gesto pausa el vídeo. Si el padre nos avisa de que
      // viene de un click trusted (gesture:true) sí podemos desmutear ya; si no,
      // lo dejamos armado para el próximo toque del usuario.
      if (IS_ANDROID && !e.data.gesture) { armUnmuteOnGesture(); return; }
      audioUnlocked = true; // marcar que el audio ya está desbloqueado por gesto
      document.querySelectorAll('video').forEach(v => {
        try {
          delete v._aapOrigMuted; // resetear cache de mutePlay para no volver a mutear
          v.muted = false;
          if (v.volume === 0) v.volume = 1;
          // Si Chrome lo rechaza (sin activación aún) el vídeo sigue muteado: dejar armado
          // el desmute para el primer gesto real, además de los reintentos de main.js.
          if (v.muted) armUnmuteOnGesture();
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
    // Bajar volumen al 80% cuando el overlay de countdown aparece
    if (e.data.type === 'LOWER_VOLUME') {
      DBG('LOWER_VOLUME recibido, llamando lowerVolume()');
      lowerVolume();
    }
    // Restaurar volumen original cuando el overlay se oculta
    if (e.data.type === 'RESTORE_VOLUME') {
      DBG('RESTORE_VOLUME recibido, llamando restoreVolume()');
      restoreVolume();
    }
    // Pantalla completa via tecla F, guardando y restaurando volumen/mute
    if (e.data.type === 'SAVE_AND_PRESSF' || e.data.type === 'PRESS_F') {
      const audioStates = [];
      document.querySelectorAll('video').forEach(v => {
        audioStates.push({ v, muted: v.muted, volume: v.volume });
      });

      // Intento 1: APIs nativas de reproductores (JWPlayer, VideoJS)
      // No requieren user gesture → más fiable que KeyboardEvent sintético
      try { enterFullscreenNow(); } catch (_) {}

      // Intento 2: KeyboardEvent sintético (fallback, raramente funciona en navegadores modernos)
      ['keydown', 'keypress', 'keyup'].forEach(type => {
        document.dispatchEvent(new KeyboardEvent(type, {
          key: 'f', code: 'KeyF', keyCode: 70, which: 70,
          bubbles: true, cancelable: true,
        }));
      });

      // Empezar a vigilar cuándo entra en fullscreen para hacer play
      watchForFullscreenAndPlay();

      // Restaurar audio — en Android no se puede desmutear sin gesture del usuario
      if (!IS_ANDROID) {
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
    }
  });
  // Reintenta hasta que el video aparezca y empiece a reproducirse, o hasta timeout
  let playPersistentActive = false;
  let playPersistentInterval = null;
  let playPersistentObserver = null;
  // Intenta el play limpio (mutePlay) y sólo si el vídeo sigue pausado recurre a
  // tryPlay, que hace clicks sintéticos. Separarlos en el tiempo evita el doble
  // play que en JWPlayer/Plyr se traduce en play → pause → play.
  function playThenFallback(vid) {
    if (vid._aapPtfPending) return; // el interval de 250ms no debe apilar intentos
    vid._aapPtfPending = true;
    Promise.resolve(mutePlay(vid)).then(() => {
      setTimeout(() => {
        vid._aapPtfPending = false;
        if (vid.paused && !vid.ended && !vid._aapUserPaused) tryPlay();
      }, 400);
    }).catch(() => { vid._aapPtfPending = false; });
  }

  function playPersistent() {
    if (playPersistentActive) return;
    playPersistentActive = true;

    const start = Date.now();
    const MAX_MS = 15000;

    // Si el usuario pausa manualmente, abortar todos los reintentos
    function onUserPause(e) {
      const vid = e.target;
      if (isOurPause(vid)) return;  // pausa causada por nuestro código (mutePlay, seek, etc.)
      if (!vid.paused) return;      // no es un pause real
      // Pause a los pocos ms de un play = autoplay policy del navegador, no el usuario
      if (vid._aapLastPlayAt && Date.now() - vid._aapLastPlayAt < 500) return;
      DBG('playPersistent: usuario pausó manualmente, abortando reintentos');
      cleanup();
    }
    document.addEventListener('pause', onUserPause, true);

    function attempt() {
      const vid = document.querySelector('video');
      const dmIframe = document.querySelector('iframe[src*="dailymotion.com"]');
      if (!vid && dmIframe) DBG('playPersistent: sin <video> pero hay iframe Dailymotion');
      if (vid) DBG('playPersistent: <video> readyState=', vid.readyState, 'paused=', vid.paused, 'muted=', vid.muted);
      if (vid && !vid.paused && !vid.ended) { DBG('playPersistent: ya reproduciéndose'); cleanup(); return true; }
      if (vid && vid._aapUserPaused) { DBG('playPersistent: video pausado por usuario, abortando'); cleanup(); return true; }
      if (vid) {
        // mutePlay primero y tryPlay SOLO si sigue pausado después. En el mismo tick
        // vid.paused aún es true (play() es async), así que tryPlay haría un segundo
        // play — y en JWPlayer/Plyr el click en el botón alterna, parando el vídeo.
        if (vid.readyState >= 2) {
          playThenFallback(vid);
        } else {
          vid.addEventListener('canplay', () => {
            if (vid.paused && !vid._aapUserPaused) playThenFallback(vid);
          }, { once: true });
        }
      }
      // Dailymotion/Rumble en frío: pulsar su botón de play (ver clickColdStartPlay)
      clickColdStartPlay();
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

    function cleanup() {
      clearInterval(playPersistentInterval);
      playPersistentInterval = null;
      if (playPersistentObserver) { playPersistentObserver.disconnect(); playPersistentObserver = null; }
      document.removeEventListener('pause', onUserPause, true);
      playPersistentActive = false;
    }

    attempt();
    playPersistentInterval = setInterval(() => {
      if (attempt() || Date.now() - start > MAX_MS) {
        cleanup();
      }
    }, 250);

    // También observar nuevos elementos <video> añadidos al DOM (Dailymotion lo crea dinámicamente)
    playPersistentObserver = new MutationObserver(() => { attempt(); });
    playPersistentObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { if (playPersistentObserver) { playPersistentObserver.disconnect(); playPersistentObserver = null; } }, MAX_MS);
  }

  function mutePlay(vid) {
    if (vid._aapMpInFlight) return Promise.resolve();
    vid._aapMpInFlight = true;
    markOurPause(vid); // evitar que el pause del mute/unmute se lea como pausa del usuario
    // Si el audio ya se desbloqueó con un gesto trusted, mutear ahora provocaría un
    // pause en Android y con él el bucle play/pause. Desmutear y play directo. El
    // unmute hace falta aquí porque el <video> puede haberse creado después del
    // gesto (JWPlayer/Dailymotion lo insertan tarde) y nacer muteado.
    if (audioUnlocked) {
      try { vid.muted = false; if (vid.volume === 0) vid.volume = 1; } catch (_) {}
      vid._aapOrigMuted = false;
      return vid.play()
        .then(() => { markOurPause(vid, 600); vid._aapMpInFlight = false; })
        .catch(() => {
          // El play con audio se rechaza si este documento no tiene activación de
          // usuario propia: el click del overlay activa el frame superior, no este
          // iframe. Caemos a play muteado (siempre permitido) para que el vídeo
          // arranque, y el audio entra en el primer toque.
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
        if (IS_ANDROID) {
          if (!wasMuted) armUnmuteOnGesture(); // audio en el próximo toque
        } else {
          vid.muted = wasMuted;
          if (vid.volume === 0) vid.volume = 1;
        }
        vid._aapMpInFlight = false;
        markOurPause(vid, 600); // el pause del unmute llega después de este tick
      }, 300); })
      .catch(() => {
        if (!IS_ANDROID) vid.muted = wasMuted;
        clearOurPause(vid);
        vid._aapMpInFlight = false;
      });
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
    if (IS_ANDROID) return; // click sintético en botón unmute pausa el vídeo en Chrome Android
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
      position: fixed !important;
      inset: 0 !important;
      pointer-events: none !important;
      z-index: 2147483640 !important;
      overflow: visible !important;
    `;
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
        #num { font-size:32px; font-weight:800; color:#4F8EF7; line-height:1; }
        #ttl { font-size:12px; font-weight:600; color:rgba(255,255,255,0.78); text-align:center; max-width:170px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #btns { display:flex; gap:8px; margin-top:3px; }
        button { border:none; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; padding:7px 14px; transition:all 0.15s; font-family:inherit; letter-spacing:0.02em; pointer-events:all; }
        #no  { background:rgba(255,255,255,0.09); color:rgba(255,255,255,0.55); }
        #no:hover  { background:rgba(255,255,255,0.16); color:#fff; }
        #yes { background:#4F8EF7; color:#060d1f; }
        #yes:hover { background:#7ab3fb; }
      </style>
      <div id="card">
        <div id="lbl">${T('cd_label')}</div>
        <span id="num">5</span>
        <div id="ttl">${T('next_ep_default')}</div>
        <div id="btns">
          <button id="no" style="pointer-events:all">${T('cancel')}</button>
          <button id="yes" style="pointer-events:all">${T('watch_now')}</button>
        </div>
      </div>
    `;
    sh.getElementById('no').onclick  = () => { stopCountdown(); notify('CANCELLED'); };
    sh.getElementById('yes').onclick = () => {
      stopCountdown();
      if (S.autoFullscreen) enterFullscreenNow(); // gesture real → fullscreen directo
      setTimeout(() => notify('PLAY_NOW', { nextUrl: S.nextUrl, auto: true }), S.autoFullscreen ? 400 : 0);
    };
    host._sh = sh;
    cdEl = host;
  }

  function showCountdown() {
    buildCountdown();
    cdEl._sh.getElementById('ttl').textContent = S.nextLabel || T('next_ep_default');
    cdEl.getBoundingClientRect(); // forzar reflow
    cdEl.style.setProperty('opacity', '1', 'important');
    cdEl.style.setProperty('transform', 'translateY(0) scale(1)', 'important');
    cdEl.style.setProperty('pointer-events', 'all', 'important');
    countdownActive = true;
    // Foco en Cancelar y mantenerlo (el player intenta robarlo)
    const focusCancel = () => {
      try {
        const noBtn = cdEl?._sh?.getElementById('no');
        if (!noBtn) return;
        noBtn.setAttribute('tabindex', '0');
        noBtn.focus({ preventScroll: true });
      } catch (_) {}
    };
    focusCancel();
    setTimeout(focusCancel, 50);
    setTimeout(focusCancel, 200);
    if (cdEl._aapFocusIv) clearInterval(cdEl._aapFocusIv);
    cdEl._aapFocusIv = setInterval(() => {
      if (!countdownActive) { clearInterval(cdEl._aapFocusIv); cdEl._aapFocusIv = null; return; }
      try {
        const noBtn = cdEl._sh?.getElementById('no');
        if (noBtn && cdEl._sh.activeElement !== noBtn) noBtn.focus({ preventScroll: true });
      } catch (_) {}
    }, 300);
    lowerVolume();
  }

  function hideCountdown() {
    if (cdEl?._aapFocusIv) { clearInterval(cdEl._aapFocusIv); cdEl._aapFocusIv = null; }
    if (cdEl) {
      cdEl.style.setProperty('opacity', '0', 'important');
      cdEl.style.setProperty('transform', 'translateY(14px) scale(0.96)', 'important');
      cdEl.style.setProperty('pointer-events', 'none', 'important');
    }
    countdownActive = false;
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    restoreVolume();
  }

  function stopCountdown() { hideCountdown(); }
  // Atajo G: acorta la cuenta atrás visible a `secs` s (nunca la alarga).
  function shortenCountdown(secs) {
    if (!countdownActive) return false;
    countdownSecs = Math.min(countdownSecs, secs);
    tickCountdown(countdownSecs);
    showToast(T('toast_cd_secs', { n: secs }));
    return true;
  }
  function extendCountdown(secs) {
    if (!countdownActive) return false;
    countdownSecs += secs;
    tickCountdown(countdownSecs);
    return true;
  }

  function lowerVolume() {
    try {
      origVolumes = [];
      const videos = document.querySelectorAll('video');
      DBG('lowerVolume: encontrados', videos.length, 'videos');
      videos.forEach(v => {
        try {
          DBG('lowerVolume: video volumen actual=', v.volume);
          origVolumes.push({ video: v, volume: v.volume });
          v.volume = Math.max(0, v.volume * 0.5);
          DBG('lowerVolume: video nuevo volumen=', v.volume);
        } catch (_) {}
      });
    } catch (_) {}
  }
  function restoreVolume() {
    try {
      DBG('restoreVolume: restaurando', origVolumes.length, 'videos');
      origVolumes.forEach(({ video, volume }) => {
        try { video.volume = volume; } catch (_) {}
      });
      origVolumes = [];
    } catch (_) {}
  }

  function tickCountdown(secs) {
    if (!cdEl?._sh) return;
    cdEl._sh.getElementById('num').textContent = secs;
  }

  function countdownTick() {
    countdownSecs--;
    if (countdownSecs <= 0) {
      clearInterval(countdownTimer); countdownTimer = null;
      hideCountdown();
      notify('PLAY_NOW', { nextUrl: S.nextUrl, auto: true });
    } else {
      tickCountdown(countdownSecs);
    }
  }

  function startCountdown() {
    if (!S.autoplay || countdownActive || !S.nextUrl) return;
    // Modo noche agotado: no pasar al siguiente; main.js avisa y desactiva el modo.
    if (S.nightBlock) { notify('NIGHT_END'); return; }
    notify('STARTING');
    // Sin overlay: pasar directo al siguiente episodio
    if (S.countdownOverlay === false) {
      notify('PLAY_NOW', { nextUrl: S.nextUrl, auto: true });
      return;
    }
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
      <button id="btn">${T('skip_intro_btn')}</button>
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
    if (S.introSpeed) {
      video.playbackRate = 2;
      const restoreSpeed = () => {
        if (video.playbackRate === 2) video.playbackRate = 1;
        video.removeEventListener('timeupdate', checkTime);
      };
      const checkTime = () => {
        if (video.currentTime >= S.introTo) restoreSpeed();
      };
      video.addEventListener('timeupdate', checkTime);
      setTimeout(() => {
        if (video.playbackRate === 2 && video.currentTime < S.introTo) {
          setTimeout(restoreSpeed, Math.max(0, (S.introTo - video.currentTime) * 500) + 500);
        }
      }, 100);
      return;
    }
    markOurPause(video);
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

    // Detectar pausa manual del usuario para abortar auto-reproducción
    v.addEventListener('pause', () => {
      if (isOurPause(v)) return; // pausa causada por nuestro código (mutePlay, seek, tryPlay)
      // Pause inmediatamente después de un play = autoplay policy, no el usuario.
      // Sin esta guarda, en Android el vídeo se marca como "pausado por el usuario"
      // y se abortan todos los reintentos de reproducción.
      if (v._aapLastPlayAt && Date.now() - v._aapLastPlayAt < 500) {
        DBG('attach: pause del navegador tras play, ignorado');
        return;
      }
      v._aapUserPaused = true;
      DBG('attach: usuario pausó manualmente');
    });
    v.addEventListener('playing', () => { v._aapLastPlayAt = Date.now(); });
    v.addEventListener('play', () => {
      delete v._aapUserPaused;
    });

    v.addEventListener('loadedmetadata', () => {
      earlyFired    = false;
      introSkipDone = false;
      hideSkipBtn();
      hideCountdown();
    });

    v.addEventListener('ended', () => {
      hideSkipBtn();
      if (S.autoplay) setTimeout(startCountdown, 150);
    });

    v.addEventListener('timeupdate', () => {
      const t   = v.currentTime;
      const dur = v.duration;

      // ── Intro skip ────────────────────────────────────────────────────────
      if (S.introSkip && !introSkipDone && S.introTo > S.introFrom && S.introFrom >= 0) {
        if (t >= S.introFrom && t < S.introTo) {
          if (S.introSpeed) {
            doIntroSkip(v);
          } else if (S.introAuto) {
            doIntroSkip(v);
          } else {
            buildSkipBtn(v);
          }
        } else if (skipBtnEl) {
          hideSkipBtn();
        }
      }

      // ── Trigger anticipado ────────────────────────────────────────────────
      const skip = S.skipBeforeEnd || 0;
      if (!S.autoplay || earlyFired || countdownActive || skip <= 0 || !dur || dur < 30) return;
      const effectiveSkip = 245 - skip; // invertido: slider más alto = más cerca del final
      const rem = dur - t;
      if (rem > 0 && rem <= effectiveSkip) {
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

  // Dailymotion (geo.dailymotion.com/player/...): el reproductor arranca "en frío". Sus
  // <video> existen pero vacíos (readyState 0, sin src) hasta que se pulsa el botón grande
  // de play (`button.button_play`, aria-label "Reproducción, 16:15"). Verificado en vivo:
  // un .click() sobre ese botón basta para cargar y reproducir. Sin esto, playPersistent
  // esperaba un `canplay` que nunca llegaba, mutePlay hacía play() sobre un <video> sin
  // fuente y el click sintético caía sobre el <video> (no sobre el botón), así que en
  // SeriesDonghua (Dailymotion es su servidor por defecto) el fullscreen entraba pero el
  // vídeo se quedaba parado. Throttle para no volver a pulsar mientras carga.
  //
  // Rumble (rumble.com/embed/...) es igual: su <video> visible es un blob: sin cargar
  // (readyState 0) hasta pulsar el botón grande central (`.bigPlayUI`); un .click() sobre
  // él lo arranca (verificado en vivo). OJO: en Rumble un click en el centro del <video>
  // ALTERNA play/pausa, así que tryPlay() (que hace justo eso) no lo arrancaba y, peor,
  // podía pausarlo. Por eso, mientras el click está "en curso" (throttle) devolvemos true:
  // el llamador no debe encimar otro click.
  let _aapColdClickAt = 0;
  function clickColdStartPlay() {
    const h = location.hostname;
    const sel = /(^|\.)dailymotion\.com$/.test(h)
      ? 'button.button_play, button[aria-label^="Reproducción,"], button[aria-label^="Play,"]'
      : /(^|\.)rumble\.com$/.test(h) ? '.bigPlayUI' : null;
    if (!sel) return false;
    if (Array.from(document.querySelectorAll('video')).some(v => !v.paused && !v.ended)) return false;
    if (Date.now() - _aapColdClickAt < 2500) return true; // ya pulsado, el player está cargando
    const btn = document.querySelector(sel);
    if (!btn || !btn.getClientRects().length) return false; // no existe o está oculto
    _aapColdClickAt = Date.now();
    try { btn.click(); } catch (_) {}
    return true;
  }

  // Intentar play con JWPlayer o fallback nativo
  function tryPlay() {
    const vid = document.querySelector('video');
    if (!vid || vid.ended || !vid.paused) return;
    if (vid._aapUserPaused) return; // el usuario pausó manualmente, no forzar
    if (clickColdStartPlay()) return;

    markOurPause(vid); // evitar que nuestras operaciones se interpreten como pausa del usuario

    // 1. Click en el centro del player — donde está el botón grande de play de JWPlayer.
    // En Android NO: un tap en el centro del player alterna play/pause en JWPlayer y
    // Plyr, así que este "click" puede parar el vídeo que acabamos de arrancar.
    const playerEl = IS_ANDROID ? null : document.querySelector('.jw-media, .jw-wrapper, video');
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
          if (vj && vj.paused()) { vj.play(); clearOurPause(vid); return; }
        }
      }
    } catch (_) {}

    // 5. Fallback nativo. mutePlay abre la ventana de "pausa nuestra" con
    //    markOurPause(); caduca sola, no hace falta limpiarla aquí.
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

  // Cancelar countdown: C (no pelea con fullscreen).
  // Escape: Chrome FUERZA salir de FS; cancelamos y reentramos con JW/PRESS_F.
  let _aapEscReenterUntil = 0;
  function cancelCountdownKeepFs(fromEsc) {
    const wasFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    stopCountdown();
    if (!fromEsc || !wasFs) return;
    _aapEscReenterUntil = Date.now() + 1500;
    const reenter = () => {
      if (Date.now() > _aapEscReenterUntil) return;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      try { enterFullscreenNow(); } catch (_) {}
    };
    setTimeout(reenter, 40);
    setTimeout(reenter, 150);
    setTimeout(reenter, 350);
  }
  // ¿El foco está en un campo de escritura (comentarios, buscador…)? Si es así,
  // los atajos NO deben actuar ni tragarse la tecla. Cubre INPUT/TEXTAREA/SELECT,
  // elementos contenteditable y cualquier nodo dentro de uno.
  function isTypingTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    try { if (el.closest && el.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return true; } catch (_) {}
    return false;
  }

  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    if (!countdownActive) return;
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault(); e.stopImmediatePropagation();
      cancelCountdownKeepFs(false);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      cancelCountdownKeepFs(true);
    }
  }, true);

  // ══════════════════════════════════════════════════════════════════════════════
  // ATAJOS DE TECLADO
  // ══════════════════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', (e) => {
    if (typeof S === 'undefined' || !S.keyboardShortcuts) return;
    if (isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === '+' || e.key === '-' || e.code === 'NumpadAdd' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      const dl = (e.key === '-' || e.code === 'NumpadSubtract') ? -5 : 5;
      const ext = dl > 0 && extendCountdown(5);
      notify('ADJUST_ENDING', { delta: dl, extended: ext });
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'n':
        e.preventDefault();
        showToast(T('toast_next'));
        notify('PLAY_NOW', { nextUrl: S.nextUrl || '', auto: true });
        break;
      case 'g':
        e.preventDefault();
        // Sin cuenta atrás aquí, quizá la haya la página principal (vídeo directo): avisarle.
        if (!shortenCountdown(2)) notify('COUNTDOWN_TO', { secs: 2 });
        break;
      case 'c':
        if (countdownActive) { e.preventDefault(); stopCountdown(); showToast(T('toast_cd_cancelled')); }
        break;
      case 'escape':
        break;
      case 's':
      case 'p':
      case 'arrowleft':
      case 'arrowright':
        e.preventDefault();
        runVideoShortcut(e.key.toLowerCase(), false);
        break;
      case 'f':
        e.preventDefault();
        (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)?.();
        break;
    }
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