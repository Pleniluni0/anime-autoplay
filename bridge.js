// Anime AutoPlay — bridge.js
// Se ejecuta en iframes intermediarios del mismo origen (ej: seriesdonghua.com/player.php)
// Su trabajo: reenviar mensajes entre la página principal y los iframes cross-origin anidados,
// y también detectar vídeos directos si los hay.

(function () {
  'use strict';

  // ── Reenviar mensajes de main.js hacia los iframes hijos ─────────────────
  window.addEventListener('message', (e) => {
    if (!e.data || e.data._aap !== true) return;

    // Mensajes que vienen de la página principal → reenviar a iframes hijos
    if (e.data.type === 'SETTINGS' || e.data.type === 'PLAY_VIDEO') {
      document.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow.postMessage(e.data, '*'); } catch (_) {}
      });
    }

    // Mensajes que vienen de iframes hijos → reenviar a la página principal
    if (['TRIGGER', 'PLAY_NOW', 'CANCELLED', 'STARTING', 'GET_SETTINGS'].includes(e.data.type)) {
      try { window.parent.postMessage(e.data, '*'); } catch (_) {}
      try { window.top.postMessage(e.data, '*'); } catch (_) {}
    }
  });

  // ── También detectar vídeos directos en este iframe ───────────────────────
  // (por si player.php embebe el vídeo directamente en lugar de sub-iframe)
  let earlyFired = false;
  let introSkipDone = false;
  let S = { autoplay: true, countdownSeconds: 5, skipBeforeEnd: 0, introSkip: false, introAuto: false, introFrom: 0, introTo: 90 };

  window.addEventListener('message', (e) => {
    if (e.data?._aap && e.data.type === 'SETTINGS') S = { ...S, ...e.data.payload };
  });

  function notifyUp(type) {
    try { window.parent.postMessage({ _aap: true, type }, '*'); } catch (_) {}
    try { window.top.postMessage({ _aap: true, type }, '*'); } catch (_) {}
  }

  function attachVideo(v) {
    if (v._aapBridge) return;
    v._aapBridge = true;

    v.addEventListener('loadedmetadata', () => { earlyFired = false; introSkipDone = false; });

    v.addEventListener('ended', () => {
      if (S.autoplay) setTimeout(() => notifyUp('TRIGGER'), 500);
    });

    v.addEventListener('timeupdate', () => {
      const t = v.currentTime, dur = v.duration;
      const skip = S.skipBeforeEnd || 0;
      if (!S.autoplay || earlyFired || skip <= 0 || !dur || dur < 30) return;
      const rem = dur - t;
      if (rem > 0 && rem <= skip) {
        earlyFired = true;
        v.addEventListener('seeking', () => { earlyFired = false; }, { once: true });
        notifyUp('TRIGGER');
      }
    });
  }

  function scan() { document.querySelectorAll('video').forEach(attachVideo); }

  // ── Vigilar iframes añadidos dinámicamente en player.php ──────────────────
  // player.php carga el iframe del player real (voe, dailymotion, etc.) de forma dinámica
  const obs = new MutationObserver((mutations) => {
    let hasNewIframe = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeName === 'IFRAME') {
          hasNewIframe = true;
          // Vigilar asignación de src
          const srcObs = new MutationObserver(() => {
            if (node.src) {
              srcObs.disconnect();
              // Reenviar settings al nuevo iframe hijo
              setTimeout(() => {
                try { node.contentWindow.postMessage({ _aap: true, type: 'SETTINGS', payload: S }, '*'); } catch (_) {}
                // Pedir settings frescos a la página principal
                notifyUp('GET_SETTINGS');
              }, 500);
            }
          });
          srcObs.observe(node, { attributes: true, attributeFilter: ['src'] });
        }
        if (node.querySelectorAll) node.querySelectorAll('video').forEach(attachVideo);
      }
    }
    if (hasNewIframe) {
      setTimeout(() => {
        scan();
        // Reenviar settings a todos los iframes hijos
        document.querySelectorAll('iframe').forEach(f => {
          try { f.contentWindow.postMessage({ _aap: true, type: 'SETTINGS', payload: S }, '*'); } catch (_) {}
        });
        notifyUp('GET_SETTINGS');
      }, 800);
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
  scan();

  // Pedir settings iniciales a la página principal
  setTimeout(() => notifyUp('GET_SETTINGS'), 500);
  setTimeout(() => notifyUp('GET_SETTINGS'), 1500);
})();
