// Anime AutoPlay — main.js v14

(function () {
  'use strict';

  if (window.self !== window.top) return;
  const DBG = (...a) => console.log('[AAP]', ...a);

  let settings = {
    autoplay: true, countdownSeconds: 5, skipBeforeEnd: 0,
    introSkip: false, introAuto: false, introFrom: 0, introTo: 90,
    rememberPlayer: true, autoFullscreen: false,
  };

  const HOST = window.location.hostname;
  const IS_AV1      = HOST.includes('animeav1.com');
  const IS_FLV      = HOST.includes('animeflv.net');
  const IS_SDONGHUA = HOST.includes('seriesdonghua.com');
  const IS_MUNDO    = HOST.includes('mundodonghua.com');
  const IS_DLIFE    = HOST.includes('donghualife.com');

  const _ext = typeof chrome !== 'undefined' ? chrome : browser;

  // ── Settings ──────────────────────────────────────────────────────────────
  function loadSettings(cb) {
    _ext.storage.sync.get({
      autoplay: true, countdownSeconds: 5, skipBeforeEnd: 0,
      introSkip: false, introAuto: false, introFrom: 0, introTo: 90,
      rememberPlayer: true, autoFullscreen: false,
    }, (d) => { settings = d; if (cb) cb(); });
  }
  _ext.storage.onChanged.addListener((c) => {
    if (c.autoplay)          settings.autoplay         = c.autoplay.newValue;
    if (c.countdownSeconds)  settings.countdownSeconds = c.countdownSeconds.newValue;
    if (c.skipBeforeEnd)     settings.skipBeforeEnd    = c.skipBeforeEnd.newValue;
    if (c.introSkip)         settings.introSkip        = c.introSkip.newValue;
    if (c.introAuto)         settings.introAuto        = c.introAuto.newValue;
    if (c.introFrom != null) settings.introFrom        = c.introFrom.newValue;
    if (c.introTo   != null) settings.introTo          = c.introTo.newValue;
    if (c.rememberPlayer != null) settings.rememberPlayer = c.rememberPlayer.newValue;
    if (c.autoFullscreen != null) settings.autoFullscreen = c.autoFullscreen.newValue;
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
      if (i >= 0 && i < kids.length - 1) { const num = kids[i+1].querySelector('a')?.textContent.trim(); if (num) return 'Episodio ' + num; }
    }
    return 'Episodio siguiente';
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
    if (btn?.href) { const m = btn.href.match(/-(\d+)\/?$/); if (m) return 'Episodio ' + m[1]; }
    const curr = document.querySelector('h2.SubTitle, .SubTitle');
    if (curr) { const m2 = curr.textContent.match(/(\d+)/); if (m2) return 'Episodio ' + (parseInt(m2[1]) + 1); }
    return 'Episodio siguiente';
  }
  function sdonghua_next() {
    const links = document.querySelectorAll('.media-bar-player a, a[href*="episodio"]');
    for (const a of links) { if (a.textContent.trim().toLowerCase().includes('siguiente') && a.href) return a.href; }
    const m = window.location.pathname.match(/^(.*-)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1) + '/';
    return null;
  }
  function sdonghua_label() {
    const n = sdonghua_next(); if (n) { const m = n.match(/-(\d+)\/?$/); if (m) return 'Episodio ' + m[1]; }
    return 'Episodio siguiente';
  }
  function mundo_next() {
    const links = document.querySelectorAll('.media-bar-player a');
    for (const a of links) { if (a.textContent.trim().toLowerCase().startsWith('siguiente') && a.href) return a.href; }
    const m = window.location.pathname.match(/^(.*\/)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1);
    return null;
  }
  function mundo_label() {
    const n = mundo_next(); if (n) { const m = n.match(/\/(\d+)\/?$/); if (m) return 'Episodio ' + m[1]; }
    return 'Episodio siguiente';
  }
  function dlife_next() {
    const btn = document.querySelector('a.next-episode');
    if (btn?.href) return btn.href;
    const m = window.location.pathname.match(/^(.*-x)(\d+)\/?$/);
    if (m) return window.location.origin + m[1] + (parseInt(m[2]) + 1);
    return null;
  }
  function dlife_label() {
    const n = dlife_next(); if (n) { const m = n.match(/-x(\d+)\/?$/); if (m) return 'Episodio ' + m[1]; }
    return 'Episodio siguiente';
  }

  function getNextUrl()   { return IS_AV1?av1_next():IS_FLV?flv_next():IS_SDONGHUA?sdonghua_next():IS_MUNDO?mundo_next():IS_DLIFE?dlife_next():null; }
  function getNextLabel() { return IS_AV1?av1_label():IS_FLV?flv_label():IS_SDONGHUA?sdonghua_label():IS_MUNDO?mundo_label():IS_DLIFE?dlife_label():'Episodio siguiente'; }

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
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
          .catch(() => {}).finally(() => { window.location.href = url; });
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

  function getRoot() { return document.fullscreenElement || document.webkitFullscreenElement || document.body; }
  function relocateMainOverlays() {
    const root = getRoot();
    if (mainCdEl && !root.contains(mainCdEl)) root.appendChild(mainCdEl);
    if (mainSkipBtnEl && !root.contains(mainSkipBtnEl)) root.appendChild(mainSkipBtnEl);
  }
  document.addEventListener('fullscreenchange', relocateMainOverlays);
  document.addEventListener('webkitfullscreenchange', relocateMainOverlays);

  function buildMainCountdown() {
    if (mainCdEl) return;
    const circ = 2 * Math.PI * 25;
    mainCdEl = document.createElement('div');
    mainCdEl.id = '_aap_main_cd';
    Object.assign(mainCdEl.style, { position:'fixed', bottom:'80px', right:'20px', zIndex:'2147483647', opacity:'0', transform:'translateY(14px) scale(0.96)', transition:'opacity 0.3s ease, transform 0.3s ease', pointerEvents:'none' });
    getRoot().appendChild(mainCdEl);
    const sh = mainCdEl.attachShadow({ mode:'open' });
    sh.innerHTML = `<style>*{box-sizing:border-box;margin:0;padding:0}#card{background:rgba(8,10,18,.97);border:1px solid rgba(0,188,164,.35);border-radius:14px;padding:18px 22px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:210px;box-shadow:0 8px 40px rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}#lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.38);font-weight:700}#wrap{position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center}svg{position:absolute;top:0;left:0;width:60px;height:60px;transform:rotate(-90deg)}.rb{fill:none;stroke:rgba(255,255,255,.08);stroke-width:3}.rf{fill:none;stroke:#00BCA4;stroke-width:3;stroke-linecap:round;transition:stroke-dashoffset .9s linear}#num{font-size:22px;font-weight:800;color:#fff;position:relative;z-index:1;line-height:1}#ttl{font-size:12px;font-weight:600;color:rgba(255,255,255,.78);text-align:center;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#btns{display:flex;gap:8px;margin-top:3px}button{border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;padding:7px 14px;transition:all .15s;font-family:inherit;pointer-events:all}#no{background:rgba(255,255,255,.09);color:rgba(255,255,255,.55)}#no:hover{background:rgba(255,255,255,.16);color:#fff}#yes{background:#00BCA4;color:#061212}#yes:hover{background:#00d4b8}</style><div id="card"><div id="lbl">Siguiente episodio en</div><div id="wrap"><svg viewBox="0 0 60 60"><circle class="rb" cx="30" cy="30" r="25"/><circle class="rf" cx="30" cy="30" r="25" id="ring" style="stroke-dasharray:${circ};stroke-dashoffset:0"/></svg><span id="num">5</span></div><div id="ttl">Episodio siguiente</div><div id="btns"><button id="no">Cancelar</button><button id="yes">&#9654; Ver ahora</button></div></div>`;
    sh.getElementById('no').onclick  = stopMainCountdown;
    sh.getElementById('yes').onclick = () => {
      stopMainCountdown();
      if (settings.autoFullscreen) {
        const target = findPlayerTarget();
        if (target) { activateFullscreenWithF(target); setTimeout(navigate, 600); return; }
      }
      navigate();
    };
    mainCdEl._sh = sh;
  }
  function showMainCountdown() {
    buildMainCountdown();
    mainCdEl._sh.getElementById('ttl').textContent = getNextLabel();
    mainCdEl.getBoundingClientRect();
    mainCdEl.style.opacity='1'; mainCdEl.style.transform='translateY(0) scale(1)'; mainCdEl.style.pointerEvents='all';
    mainCountdownActive = true;
  }
  function hideMainCountdown() {
    if (mainCdEl) { mainCdEl.style.opacity='0'; mainCdEl.style.transform='translateY(14px) scale(0.96)'; mainCdEl.style.pointerEvents='none'; }
    mainCountdownActive = false;
    if (mainCountdownTimer) { clearInterval(mainCountdownTimer); mainCountdownTimer=null; }
  }
  function stopMainCountdown() { hideMainCountdown(); }
  function tickMainCountdown(secs) {
    if (!mainCdEl?._sh) return;
    mainCdEl._sh.getElementById('num').textContent = String(secs);
    const ring = mainCdEl._sh.getElementById('ring');
    if (ring) { const c=2*Math.PI*25; ring.style.strokeDashoffset=String(c-(secs/Math.max(settings.countdownSeconds,1))*c); }
  }
  function mainCountdownTick() {
    mainCountdownSecs--;
    if (mainCountdownSecs <= 0) {
      clearInterval(mainCountdownTimer); mainCountdownTimer = null;
      hideMainCountdown(); navigate();
    } else {
      tickMainCountdown(mainCountdownSecs);
    }
  }

  function startMainCountdown() {
    if (!settings.autoplay || mainCountdownActive || !getNextUrl()) return;
    preloadNextEpisode(getNextUrl());
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
    sh.innerHTML = `<style>button{background:rgba(8,10,18,.92);border:2px solid rgba(0,188,164,.6);border-radius:10px;color:#00BCA4;font-size:15px;font-weight:800;padding:11px 22px;cursor:pointer;font-family:-apple-system,'Segoe UI',sans-serif;letter-spacing:.04em;transition:all .15s;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.5);pointer-events:all}button:hover{background:#00BCA4;color:#061212}</style><button id="btn">&#9193; Saltar intro</button>`;
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
    v.addEventListener('loadedmetadata', () => { DBG('video loadedmetadata, duration=', v.duration); earlyFired=false; introSkipDone=false; hideMainSkipBtn(); hideMainCountdown(); });
    v.addEventListener('ended', () => { DBG('video ended → countdown'); hideMainSkipBtn(); if (settings.autoplay) setTimeout(startMainCountdown, 500); });
    v.addEventListener('timeupdate', () => {
      const t=v.currentTime, dur=v.duration;
      if (settings.introSkip && !introSkipDone && settings.introTo > settings.introFrom) {
        if (t >= settings.introFrom && t < settings.introTo) {
          settings.introAuto ? doMainIntroSkip(v) : buildMainSkipBtn(v);
        } else if (mainSkipBtnEl) hideMainSkipBtn();
      }
      const skip=settings.skipBeforeEnd||0;
      if (!settings.autoplay||earlyFired||mainCountdownActive||skip<=0||!dur||dur<30) return;
      const rem=dur-t;
      if (rem>0&&rem<=skip) { earlyFired=true; v.addEventListener('seeking',()=>{earlyFired=false},{once:true}); startMainCountdown(); }
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
    const payload = { ...settings, nextLabel: getNextLabel(), nextUrl: getNextUrl() || '' };
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow.postMessage({ _aap:true, type:'SETTINGS', payload }, '*'); } catch(_) {}
    });
  }

  window.addEventListener('message', (e) => {
    if (!e.data || e.data._aap !== true) return;
    switch (e.data.type) {
      case 'GET_SETTINGS': pushSettings(); break;
      case 'STARTING':     pushSettings(); break;
      case 'TRIGGER':
      case 'PLAY_NOW':     navigate(e.data.nextUrl); break;
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
  function detectAndSaveActivePlayer() {
    let key = null;
    if (IS_AV1) { const b=document.querySelector('.border-line button.bg-main'); if(b) key=b.textContent.trim(); }
    else if (IS_FLV||IS_SDONGHUA||IS_MUNDO) { const a=document.querySelector('ul.nav-tabs li.active a'); if(a) key=a.textContent.trim().split('\n')[0].trim(); }
    else if (IS_DLIFE) { const a=document.querySelector('.toggle-enlace.active-link'); if(a) key=a.textContent.trim(); }
    if (key) _ext.storage.local.set({ ['aap_player_'+HOST.replace(/\./g,'_')]: key });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('ul.nav-tabs a, .toggle-enlace, .border-line button') && settings.rememberPlayer)
      setTimeout(detectAndSaveActivePlayer, 300);
  });

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

  // ── Helpers para mundodonghua: placeholder click + fullscreen del contenedor ──
  function findActivePlaceholder() {
    const panes = document.querySelectorAll('.tab-pane.active, .tab-pane.in.active, .tab-pane.show.active');
    for (const pane of panes) {
      if (pane.offsetParent === null) continue; // tab oculto
      const ph = pane.querySelector('img[id$="play"], div[id$="_play"]');
      if (ph) return ph;
    }
    // Fallback: cualquier placeholder visible
    for (const ph of document.querySelectorAll('img[id$="play"], div[id$="_play"]')) {
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

      // Caso A: iframe (Tamamo, Voe, etc.) — fullscreen sobre el iframe
      const iframe = document.querySelector(
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
        try { video.muted = false; if (video.volume === 0) video.volume = 1; } catch (_) {}
        if (video.paused) video.play().catch(() => {});
        return;
      }

      if (elapsed > 5000) { clearInterval(wait); DBG('fullscreenMundoPlayer: timeout sin player'); }
    }, 100);
  }

  // Dar focus al iframe y simular tecla F para fullscreen
  function activateFullscreenWithF(target) {
    if (!target) return;

    if (target.tagName === 'IFRAME') {
      let isSameOrigin = false;
      try { void target.contentDocument; isSameOrigin = true; } catch (_) {}

      if (isSameOrigin) {
        const fs = target.requestFullscreen || target.webkitRequestFullscreen;
        if (fs) {
          fs.call(target)
            .then(() => {
              try { target.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
              try {
                const v = target.contentDocument?.querySelector('video');
                if (v && v.paused) v.play().catch(() => {});
              } catch (_) {}
            })
            .catch(() => {});
          return;
        }
      }

      // Cross-origin: guardar volumen, enviar PRESS_F, restaurar volumen tras 800ms
      try { target.contentWindow.postMessage({ _aap: true, type: 'SAVE_AND_PRESSF' }, '*'); } catch (_) {}

    } else if (target.tagName === 'VIDEO') {
      const wasMuted = target.muted;
      const vol = target.volume;
      const fs = target.requestFullscreen || target.webkitRequestFullscreen;
      if (fs) fs.call(target).then(() => {
        target.muted = wasMuted;
        target.volume = vol;
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
        0%, 100% { box-shadow: 0 8px 48px rgba(0,0,0,.85), 0 0 0 0   rgba(0,188,164,.4); }
        50%       { box-shadow: 0 8px 48px rgba(0,0,0,.85), 0 0 0 10px rgba(0,188,164,.0); }
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
      border: '1.5px solid rgba(0,188,164,0.45)',
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
      <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.1em;text-transform:uppercase">Pantalla completa</div>

      <div style="position:relative;width:48px;height:48px;margin:4px 0;display:flex;align-items:center;justify-content:center;background:rgba(0,188,164,0.1);border-radius:50%">
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="#00BCA4" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      </div>

      <div style="color:#00BCA4;font-size:14px;font-weight:800;letter-spacing:.02em">Pulsa en cualquier parte</div>
      <div style="color:rgba(255,255,255,.4);font-size:11px">para activar</div>
      <span id="_aap_skip" style="color:rgba(255,255,255,.2);font-size:10px;cursor:pointer;pointer-events:all;text-decoration:underline;margin-top:2px">Saltar</span>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Removed ring animation

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
      document.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow.postMessage({ _aap: true, type: 'PLAY_VIDEO' }, '*'); } catch (_) {}
      });
      try {
        const vid = document.querySelector('video');
        if (vid) { vid.muted = false; vid.volume = vid.volume || 1; }
      } catch (_) {}
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

  function autoPlayWhenReady(fromPreviousEpisode) {
    if (!fromPreviousEpisode) return;

    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;

      // Vídeo directo en página (Asura/JWPlayer)
      const vid = document.querySelector('video');
      if (vid && vid.readyState >= 2 && vid.paused) {
        mutePlay(vid);
        clearInterval(poll);
        return;
      }

      // Iframes mismo origen
      for (const f of document.querySelectorAll('iframe')) {
        if (!f.src || f.src.includes('facebook') || f.src.includes('disqus')) continue;
        try {
          const v = f.contentDocument?.querySelector('video');
          if (v && v.readyState >= 2 && v.paused) {
            mutePlay(v);
            clearInterval(poll);
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

      if (attempts >= 20) clearInterval(poll); // máx 10s
    }, 500);
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
          return !!document.querySelector('iframe[src*="mdnemonic"], iframe[src*="dailymotion"], iframe[src*="voe."], iframe[src*="streamtape"], iframe[src*="filemoon"]');
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
            const pane = img.closest('.tab-pane') || document;

            // Caso A: player vía iframe (Tamamo, etc.)
            const iframe = pane.querySelector('iframe[id$="_player"]');
            if (iframe) {
              DBG('modo iframe, fullscreen sobre', iframe.id);
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

        // 1. Click en el tab del player guardado (Tamamo, Asura...)
        if (savedPlayer && settings.rememberPlayer && !realIframeReady()) {
          const allTabs = document.querySelectorAll('ul.nav-tabs a, .toggle-enlace, .border-line button');
          for (const tab of allTabs) {
            const label = tab.textContent.trim().split('\n')[0].trim();
            if (label === savedPlayer ||
                label.toLowerCase().includes(savedPlayer.toLowerCase()) ||
                savedPlayer.toLowerCase().includes(label.toLowerCase())) {
              DBG('doRestore clickeando tab', savedPlayer);
              tab.click();
              break;
            }
          }
        }

        // 2. Mostrar el placeholder llamando al Blocker, y attachar el interceptor
        attachPlayClickInterceptor();
        invokeActiveBlocker(); // intento inmediato
        setTimeout(() => { invokeActiveBlocker(); }, 300);
        setTimeout(() => { invokeActiveBlocker(); }, 1000); // por si el tab tarda en cargar su Blocker

        // 2.5. Click programático sobre el placeholder (best-effort, sin gesture).
        // Si el handler de mundo no chequea isTrusted, el iframe/JWPlayer carga solo y el
        // video arranca con el mute trick. Si lo chequea, no pasa nada y el prompt de
        // fullscreen (paso 2.6) captura el click manual del usuario.
        [200, 800, 1800, 3000].forEach(ms => setTimeout(() => {
          if (realIframeReady()) return;
          if (document.querySelector('div[id$="_player"] video, div[id$="_player"] iframe[src]')) return;
          clickPlaceholder();
        }, ms));

        // 2.6. Si autoFullscreen está activo, mostrar prompt grande sobre la pantalla CUANTO ANTES.
        // beforeFullscreen llama a invokeActiveBlocker para asegurar que el placeholder exista
        // si el usuario hace click muy rápido (antes de que el blocker se haya ejecutado).
        if (doFullscreen) {
          const showPrompt = () => {
            if (document.fullscreenElement) return;
            showFullscreenPrompt(null, {
              beforeFullscreen: () => {
                if (realIframeReady()) return;
                invokeActiveBlocker(); // asegurar que el placeholder esté en el DOM
                clickPlaceholder();
              },
              customFullscreen: () => fullscreenMundoPlayer(),
            });
          };
          showPrompt(); // mostrar inmediatamente
        }

        // 3. Polling: detectar cuando el player real está listo para lanzar autoPlay.
        // En Asura no hay iframe — chequear también <video> directo dentro de panes activos.
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          const videoReady = !!document.querySelector('div[id$="_player"] video, video');
          if (realIframeReady() || (IS_MUNDO && videoReady)) {
            DBG('player real detectado tras', attempts, 'intentos, lanzando autoPlay');
            clearInterval(poll);
            setTimeout(() => autoPlayWhenReady(fromPrevEpisode), 1500);
            return;
          }
          if (attempts >= 60) { // 30s
            DBG('doRestore: timeout esperando player (usuario debe hacer click en play)');
            clearInterval(poll);
          }
        }, 500);
      }

      // Esperar a que los tabs del player estén en el DOM
      // (en MundoDonghua pueden tardar más porque son jQuery)
      const tabsSel = 'ul.nav-tabs a, .toggle-enlace, .border-line button, #iframe-episode, iframe[src*="player"]';
      if (document.querySelectorAll(tabsSel).length > 0) {
        doRestore(); // tabs ya en el DOM, no esperar
      } else {
        let waitAttempts = 0;
        const waitForTabs = setInterval(() => {
          waitAttempts++;
          if (document.querySelectorAll(tabsSel).length > 0 || waitAttempts > 15) {
            clearInterval(waitForTabs);
            doRestore();
          }
        }, 150);
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

})();
