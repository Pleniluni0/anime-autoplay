// popup.js — Anime AutoPlay

const autoplayToggle   = document.getElementById('autoplay-toggle');
const countdownOverlayToggle = document.getElementById('countdown-overlay-toggle');
const countdownSlider  = document.getElementById('countdown-slider');
const countdownDisplay = document.getElementById('countdown-display');
const skipSlider       = document.getElementById('skip-slider');
const langSelect = document.getElementById('lang-select');
const skipDisplay      = document.getElementById('skip-display');
const skipPreview      = document.getElementById('skip-preview');
const introToggle      = document.getElementById('intro-toggle');
const introBody        = document.getElementById('intro-body');
const pillManual       = document.getElementById('pill-manual');
const pillAuto         = document.getElementById('pill-auto');
const pillSpeed        = document.getElementById('pill-speed');
const introFrom        = document.getElementById('intro-from');
const introTo          = document.getElementById('intro-to');
const introPreview     = document.getElementById('intro-preview');
const keyboardToggle   = document.getElementById('keyboard-toggle');
const statusText       = document.getElementById('status-text');
const sectionCountdown = document.getElementById('section-countdown');
const rowCountdownOverlay = document.getElementById('row-countdown-overlay');
const sectionSkip      = document.getElementById('section-skip');
const rowKeyboard      = document.getElementById('row-keyboard');
const nightToggle      = document.getElementById('night-toggle');
const nightSlider      = document.getElementById('night-slider');
const nightDisplay     = document.getElementById('night-display');
const nightStatus      = document.getElementById('night-status');
const sectionNight     = document.getElementById('section-night');

// ── Time helpers ──────────────────────────────────────────────────────────────
function parseTime(str) {
  str = (str || '').trim();
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatTime(secs) {
  if (secs == null || isNaN(secs)) return '';
  secs = Math.round(secs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

const autofsToogle         = document.getElementById('autofs-toggle');
const rowAutofs            = document.getElementById('row-autofs');

// ── Load settings ──────────────────────────────────────────────────────────────
chrome.storage.sync.get({
  autoplay: true,
  countdownSeconds: 5,
  countdownOverlay: true,
  skipBeforeEnd: 0,
  introSkip: false,
  introAuto: false,
  introSpeed: false,
  introFrom: 0,
  introTo: 90,
  rememberPlayer: true,
  autoFullscreen: false,
  keyboardShortcuts: true,
  lang: null,
  nightMode: false,
  nightEpisodes: 3,
  nightLeft: 3,
}, (d) => {
  nightToggle.checked = !!d.nightMode;
  nightSlider.value = d.nightEpisodes;
  nightDisplay.textContent = d.nightEpisodes;
  updateNight(!!d.nightMode, d.nightLeft);
  AAP_I18N.setPref(d.lang);
  AAP_I18N.apply();
  langSelect.value = AAP_I18N.lang();
  autoplayToggle.checked       = d.autoplay;
  countdownOverlayToggle.checked = d.countdownOverlay !== false;
  countdownSlider.value        = d.countdownSeconds;
  countdownDisplay.textContent = d.countdownSeconds;
  updateCountdownSliderState(countdownOverlayToggle.checked);
  skipSlider.value             = d.skipBeforeEnd;
  skipDisplay.textContent      = d.skipBeforeEnd;
  introToggle.checked          = d.introSkip;
  introFrom.value              = formatTime(d.introFrom);
  introTo.value                = formatTime(d.introTo);
  autofsToogle.checked         = d.autoFullscreen;
  keyboardToggle.checked       = d.keyboardShortcuts;

  setIntroPillMode(d.introAuto, d.introSpeed);
  updateSkipPreview(d.skipBeforeEnd);
  updateIntroBodyState(d.introSkip);
  updateIntroPreview();
  updateSectionsState(d.autoplay);
  updateStatus(d.autoplay);
});

// ── Idioma ─────────────────────────────────────────────────────────────────────
// Sin preferencia guardada manda el idioma del navegador; al elegir uno se guarda.
langSelect.addEventListener('change', () => {
  const l = langSelect.value === 'en' ? 'en' : 'es';
  chrome.storage.sync.set({ lang: l });
  AAP_I18N.setPref(l);
  AAP_I18N.apply();
  updateSkipPreview(parseInt(skipSlider.value) || 0);
  updateIntroPreview();
  updateStatus(autoplayToggle.checked);
  chrome.storage.sync.get({ nightMode: false, nightLeft: 0 }, (d) => updateNight(!!d.nightMode, d.nightLeft));
  if (currentScreen === 'history') renderHistory();
});

// ── Modo noche ─────────────────────────────────────────────────────────────────
// nightMode: activo; nightEpisodes: episodios MÁS tras el actual; nightLeft: los que quedan
// (lo decrementa main.js en cada salto automático; al llegar a 0 el último episodio no avanza).
function updateNight(on, left) {
  sectionNight.classList.toggle('disabled-section', !on);
  nightStatus.classList.toggle('active', on);
  if (!on) nightStatus.textContent = AAP_I18N.t('night_off');
  else nightStatus.textContent = left > 0 ? AAP_I18N.t('night_left', { n: left }) : AAP_I18N.t('night_last');
}
nightToggle.addEventListener('change', () => {
  const n = parseInt(nightSlider.value) || 3;
  chrome.storage.sync.set({ nightMode: nightToggle.checked, nightEpisodes: n, nightLeft: n });
  updateNight(nightToggle.checked, n);
});
nightSlider.addEventListener('input', () => {
  const n = parseInt(nightSlider.value) || 3;
  nightDisplay.textContent = n;
  chrome.storage.sync.set({ nightEpisodes: n, nightLeft: n });
  updateNight(nightToggle.checked, n);
});

// ── Autoplay ───────────────────────────────────────────────────────────────────
autoplayToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ autoplay: autoplayToggle.checked });
  updateSectionsState(autoplayToggle.checked);
  updateStatus(autoplayToggle.checked);
});

// ── Auto fullscreen ───────────────────────────────────────────────────────────
autofsToogle.addEventListener('change', () => {
  chrome.storage.sync.set({ autoFullscreen: autofsToogle.checked });
});


// ── Countdown overlay toggle ────────────────────────────────────────────────
countdownOverlayToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ countdownOverlay: countdownOverlayToggle.checked });
  updateCountdownSliderState(countdownOverlayToggle.checked);
});

function updateCountdownSliderState(on) {
  sectionCountdown.classList.toggle('disabled-section', !on);
}

// ── Countdown ──────────────────────────────────────────────────────────────────
countdownSlider.addEventListener('input', () => {
  const v = parseInt(countdownSlider.value);
  countdownDisplay.textContent = v;
  chrome.storage.sync.set({ countdownSeconds: v });
});

// El popup normalmente se recarga entero cada vez que se abre (siempre lee el
// valor fresco arriba), pero si se queda abierto — p.ej. inspeccionándolo con
// DevTools — no se entera solo de los cambios que haga el atajo +/- en la
// página. Con esto el slider se actualiza también en caliente.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.nightMode || changes.nightLeft) {
    chrome.storage.sync.get({ nightMode: false, nightLeft: 0 }, (d) => {
      nightToggle.checked = !!d.nightMode;
      updateNight(!!d.nightMode, d.nightLeft);
    });
  }
  if (changes.countdownSeconds) {
    const v = changes.countdownSeconds.newValue;
    countdownSlider.value = v;
    countdownDisplay.textContent = v;
  }
});

// ── Skip ending ────────────────────────────────────────────────────────────────
skipSlider.addEventListener('input', () => {
  const v = parseInt(skipSlider.value);
  skipDisplay.textContent = v;
  chrome.storage.sync.set({ skipBeforeEnd: v });
  updateSkipPreview(v);
});

// ── Intro toggle ───────────────────────────────────────────────────────────────
introToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ introSkip: introToggle.checked });
  updateIntroBodyState(introToggle.checked);
});

// ── Modo intro: manual / automático / velocidad ×2 ─────────────────────────
let introAutoMode = false;
let introSpeedMode = false;

function setIntroPillMode(auto, speed) {
  introAutoMode = auto;
  introSpeedMode = speed;
  pillManual.classList.toggle('active', !auto && !speed);
  pillAuto.classList.toggle('active', auto && !speed);
  pillSpeed.classList.toggle('active', speed);
}

function saveIntroMode() {
  chrome.storage.sync.set({ introAuto: introAutoMode, introSpeed: introSpeedMode });
  updateIntroPreview();
}

pillManual.addEventListener('click', () => {
  setIntroPillMode(false, false);
  saveIntroMode();
});
pillAuto.addEventListener('click', () => {
  setIntroPillMode(true, false);
  saveIntroMode();
});
pillSpeed.addEventListener('click', () => {
  setIntroPillMode(false, true);
  saveIntroMode();
});

// ── Intro time inputs ──────────────────────────────────────────────────────────
function saveIntroTimes() {
  const from = parseTime(introFrom.value);
  const to   = parseTime(introTo.value);
  const fromOk = from !== null && from >= 0;
  const toOk   = to !== null && to > 0;
  const valid  = fromOk && toOk && to > from;

  introFrom.classList.toggle('valid', fromOk);
  introFrom.classList.toggle('error', !fromOk && introFrom.value.trim() !== '');
  introTo.classList.toggle('valid', valid);
  introTo.classList.toggle('error', introTo.value.trim() !== '' && !valid);

  if (valid) chrome.storage.sync.set({ introFrom: from, introTo: to });
  updateIntroPreview();
}

introFrom.addEventListener('input', saveIntroTimes);
introTo.addEventListener('input', saveIntroTimes);

introFrom.addEventListener('blur', () => {
  const v = parseTime(introFrom.value);
  if (v !== null) introFrom.value = formatTime(v);
});
introTo.addEventListener('blur', () => {
  const v = parseTime(introTo.value);
  if (v !== null) introTo.value = formatTime(v);
});

// ── UI helpers ─────────────────────────────────────────────────────────────────
function updateSkipPreview(s) {
  if (s === 0) {
    skipPreview.textContent = AAP_I18N.t('skip_none');
    skipPreview.classList.remove('active');
  } else {
    const effective = 245 - s; // invertido: slider más alto = más cerca del final
    const m = Math.floor(effective / 60), sec = effective % 60;
    const label = m > 0 ? `${m}m ${sec > 0 ? sec + 's' : ''}` : `${sec}s`;
    skipPreview.textContent = AAP_I18N.t('skip_appears', { label });
    skipPreview.classList.add('active');
  }
}

function updateIntroBodyState(on) {
  introBody.classList.toggle('disabled-section', !on);
}

function updateIntroPreview() {
  const from = parseTime(introFrom.value);
  const to   = parseTime(introTo.value);
  if (from !== null && to !== null && to > from) {
    let mode;
    if (introSpeedMode) mode = AAP_I18N.t('intro_speed');
    else if (introAutoMode) mode = AAP_I18N.t('intro_auto');
    else mode = AAP_I18N.t('intro_button');
    introPreview.textContent = `${to - from}s — ${mode} (${formatTime(from)} → ${formatTime(to)})`;
    introPreview.classList.add('active');
  } else {
    introPreview.textContent = AAP_I18N.t('intro_enter');
    introPreview.classList.remove('active');
  }
}

// Actualizar preview cuando cambia el modo
pillManual.addEventListener('click', updateIntroPreview);
pillAuto.addEventListener('click', updateIntroPreview);
pillSpeed.addEventListener('click', updateIntroPreview);

function updateSectionsState(on) {
  rowCountdownOverlay.classList.toggle('disabled-section', !on);
  sectionCountdown.classList.toggle('disabled-section', !on || !countdownOverlayToggle.checked);
  sectionSkip.classList.toggle('disabled-section', !on);
  rowAutofs.classList.toggle('disabled-section', !on);
  rowKeyboard.classList.toggle('disabled-section', !on);
  document.getElementById('row-night').classList.toggle('disabled-section', !on);
}

// ── Keyboard shortcuts ───────────────────────────────────────────────────────
keyboardToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ keyboardShortcuts: keyboardToggle.checked });
});

function updateStatus(on) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const sites = ['animeav1.com', 'animeflv.net', 'seriesdonghua.com', 'mundodonghua.com', 'donghualife.com'];
    const ok = sites.some(s => url.includes(s));
    statusText.textContent = ok
      ? (on ? AAP_I18N.t('status_on') : AAP_I18N.t('status_off'))
      : AAP_I18N.t('status_ready');
  });
}

// ── Pantallas: principal / ayuda / historial ─────────────────────────────────
const screenMain    = document.getElementById('screen-main');
const screenHelp    = document.getElementById('screen-help');
const screenHistory = document.getElementById('screen-history');
const helpToggle    = document.getElementById('help-toggle');
const historyToggle = document.getElementById('history-toggle');
let currentScreen = 'main';

function showScreen(name) {
  currentScreen = name;
  screenMain.style.display    = name === 'main'    ? 'flex' : 'none';
  screenHelp.style.display    = name === 'help'    ? 'flex' : 'none';
  screenHistory.style.display = name === 'history' ? 'flex' : 'none';
  helpToggle.textContent    = name === 'help'    ? '←' : '?';
  historyToggle.textContent = name === 'history' ? '←' : '🕘';
  if (name === 'history') renderHistory();
}
helpToggle.addEventListener('click', () => showScreen(currentScreen === 'help' ? 'main' : 'help'));
historyToggle.addEventListener('click', () => showScreen(currentScreen === 'history' ? 'main' : 'history'));

// ── Historial: último episodio visto por serie (agrupado por dominio, en acordeón) ──
// main.js guarda aquí (storage.local → watchHistory) solo cuando salió la cuenta atrás y
// la extensión pasó de episodio:  { 'dominio.com': { slug: { title, ep, url, ts } } }
const SITE_NAMES = {
  'animeav1.com': 'AnimeAV1', 'animeflv.net': 'AnimeFLV', 'seriesdonghua.com': 'SeriesDonghua',
  'mundodonghua.com': 'MundoDonghua', 'donghualife.com': 'DonghuaLife', 'jkanime.net': 'JKAnime',
};
const histList  = document.getElementById('hist-list');
const histClear = document.getElementById('hist-clear');

function isHttpUrl(u) { try { const p = new URL(u).protocol; return p === 'http:' || p === 'https:'; } catch (_) { return false; } }
function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString(AAP_I18N.lang(), { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (_) { return ''; }
}

function renderHistory() {
  chrome.storage.local.get({ watchHistory: {} }, (d) => {
    const hist = d.watchHistory || {};
    const openDomain = histList.querySelector('details[open]')?.dataset.domain;
    histList.textContent = '';
    const domains = Object.keys(hist).filter(dom => Object.keys(hist[dom] || {}).length);
    histClear.style.display = domains.length ? '' : 'none';
    if (!domains.length) {
      const empty = document.createElement('div');
      empty.className = 'hist-empty';
      empty.textContent = AAP_I18N.t('hist_empty');
      histList.appendChild(empty);
      return;
    }
    const newest = (dom) => Math.max(...Object.values(hist[dom]).map(e => e.ts || 0));
    domains.sort((a, b) => newest(b) - newest(a));

    domains.forEach((dom) => {
      const entries = Object.entries(hist[dom]).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
      const det = document.createElement('details');
      det.className = 'hist-domain';
      det.dataset.domain = dom;
      if (dom === openDomain) det.open = true;

      const sum = document.createElement('summary');
      const name = document.createElement('span'); name.textContent = SITE_NAMES[dom] || dom;
      const host = document.createElement('span'); host.className = 'hist-host'; host.textContent = dom;
      const cnt  = document.createElement('span'); cnt.className = 'hist-count'; cnt.textContent = AAP_I18N.t(entries.length === 1 ? 'hist_series_one' : 'hist_series', { n: entries.length });
      sum.append(name, host, cnt);
      det.appendChild(sum);

      const items = document.createElement('div'); items.className = 'hist-items';
      entries.forEach(([slug, e]) => {
        const row = document.createElement('div'); row.className = 'hist-item';
        const open = document.createElement('button'); open.className = 'hist-open'; open.title = AAP_I18N.t('hist_open');
        const t = document.createElement('span'); t.className = 'hist-series'; t.textContent = e.title || slug;
        const m = document.createElement('span'); m.className = 'hist-meta';
        const b = document.createElement('b'); b.textContent = AAP_I18N.t('hist_ep', { n: e.ep });
        m.append(b, document.createTextNode(' · ' + fmtDate(e.ts)));
        open.append(t, m);
        open.addEventListener('click', () => { if (isHttpUrl(e.url)) chrome.tabs.create({ url: e.url }); });
        const del = document.createElement('button'); del.className = 'hist-del'; del.textContent = '✕'; del.title = AAP_I18N.t('hist_remove');
        del.addEventListener('click', () => {
          chrome.storage.local.get({ watchHistory: {} }, (x) => {
            const h = x.watchHistory || {};
            if (h[dom]) { delete h[dom][slug]; if (!Object.keys(h[dom]).length) delete h[dom]; }
            chrome.storage.local.set({ watchHistory: h }, renderHistory);
          });
        });
        row.append(open, del);
        items.appendChild(row);
      });
      det.appendChild(items);
      // Acordeón: al abrir un dominio se cierran los demás
      det.addEventListener('toggle', () => {
        if (!det.open) return;
        histList.querySelectorAll('details[open]').forEach(o => { if (o !== det) o.open = false; });
      });
      histList.appendChild(det);
    });
  });
}

let histClearTimer = null;
histClear.addEventListener('click', () => {
  if (!histClear.dataset.armed) {
    histClear.dataset.armed = '1';
    histClear.textContent = AAP_I18N.t('hist_clear_confirm');
    histClearTimer = setTimeout(() => { delete histClear.dataset.armed; histClear.textContent = AAP_I18N.t('hist_clear'); }, 3000);
    return;
  }
  clearTimeout(histClearTimer);
  delete histClear.dataset.armed;
  histClear.textContent = AAP_I18N.t('hist_clear');
  chrome.storage.local.set({ watchHistory: {} }, renderHistory);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.watchHistory && currentScreen === 'history') renderHistory();
});
