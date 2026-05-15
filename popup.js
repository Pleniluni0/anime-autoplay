// popup.js — Anime AutoPlay

const autoplayToggle   = document.getElementById('autoplay-toggle');
const countdownSlider  = document.getElementById('countdown-slider');
const countdownDisplay = document.getElementById('countdown-display');
const skipSlider       = document.getElementById('skip-slider');
const skipDisplay      = document.getElementById('skip-display');
const skipPreview      = document.getElementById('skip-preview');
const introToggle      = document.getElementById('intro-toggle');
const introBody        = document.getElementById('intro-body');
const pillManual       = document.getElementById('pill-manual');
const pillAuto         = document.getElementById('pill-auto');
const introFrom        = document.getElementById('intro-from');
const introTo          = document.getElementById('intro-to');
const introPreview     = document.getElementById('intro-preview');
const statusText       = document.getElementById('status-text');
const sectionCountdown = document.getElementById('section-countdown');
const sectionSkip      = document.getElementById('section-skip');

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

const rememberPlayerToggle = document.getElementById('remember-player-toggle');
const autofsToogle         = document.getElementById('autofs-toggle');

// ── Load settings ──────────────────────────────────────────────────────────────
chrome.storage.sync.get({
  autoplay: true,
  countdownSeconds: 5,
  skipBeforeEnd: 0,
  introSkip: false,
  introAuto: false,
  introFrom: 0,
  introTo: 90,
  rememberPlayer: true,
  autoFullscreen: false,
}, (d) => {
  autoplayToggle.checked       = d.autoplay;
  countdownSlider.value        = d.countdownSeconds;
  countdownDisplay.textContent = d.countdownSeconds;
  skipSlider.value             = d.skipBeforeEnd;
  skipDisplay.textContent      = d.skipBeforeEnd;
  introToggle.checked          = d.introSkip;
  introFrom.value              = formatTime(d.introFrom);
  introTo.value                = formatTime(d.introTo);
  rememberPlayerToggle.checked = d.rememberPlayer;
  autofsToogle.checked         = d.autoFullscreen;

  setIntroPillMode(d.introAuto);
  updateSkipPreview(d.skipBeforeEnd);
  updateIntroBodyState(d.introSkip);
  updateIntroPreview();
  updateSectionsState(d.autoplay);
  updateStatus(d.autoplay);
});

// ── Autoplay ───────────────────────────────────────────────────────────────────
autoplayToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ autoplay: autoplayToggle.checked });
  updateSectionsState(autoplayToggle.checked);
  updateStatus(autoplayToggle.checked);
});

// ── Remember player ───────────────────────────────────────────────────────────
rememberPlayerToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ rememberPlayer: rememberPlayerToggle.checked });
});

// ── Auto fullscreen ───────────────────────────────────────────────────────────
autofsToogle.addEventListener('change', () => {
  chrome.storage.sync.set({ autoFullscreen: autofsToogle.checked });
});

// ── Countdown ──────────────────────────────────────────────────────────────────
countdownSlider.addEventListener('input', () => {
  const v = parseInt(countdownSlider.value);
  countdownDisplay.textContent = v;
  chrome.storage.sync.set({ countdownSeconds: v });
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

// ── Modo manual / automático ───────────────────────────────────────────────────
let introAutoMode = false;

function setIntroPillMode(auto) {
  introAutoMode = auto;
  pillManual.classList.toggle('active', !auto);
  pillAuto.classList.toggle('active', auto);
}

pillManual.addEventListener('click', () => {
  setIntroPillMode(false);
  chrome.storage.sync.set({ introAuto: false });
});
pillAuto.addEventListener('click', () => {
  setIntroPillMode(true);
  chrome.storage.sync.set({ introAuto: true });
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
    skipPreview.textContent = 'Desactivado — aparece al terminar el vídeo';
    skipPreview.classList.remove('active');
  } else {
    const m = Math.floor(s / 60), sec = s % 60;
    const label = m > 0 ? `${m}m ${sec > 0 ? sec + 's' : ''}` : `${sec}s`;
    skipPreview.textContent = `⏭ Aparece ${label} antes del final`;
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
    const mode = introAutoMode ? 'Saltará automáticamente' : 'Mostrará botón para saltar';
    introPreview.textContent = `${to - from}s — ${mode} (${formatTime(from)} → ${formatTime(to)})`;
    introPreview.classList.add('active');
  } else {
    introPreview.textContent = 'Introduce los tiempos de la intro';
    introPreview.classList.remove('active');
  }
}

// Actualizar preview cuando cambia el modo
pillManual.addEventListener('click', updateIntroPreview);
pillAuto.addEventListener('click', updateIntroPreview);

function updateSectionsState(on) {
  sectionCountdown.classList.toggle('disabled-section', !on);
  sectionSkip.classList.toggle('disabled-section', !on);
}

function updateStatus(on) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const sites = ['animeav1.com', 'animeflv.net', 'seriesdonghua.com', 'mundodonghua.com', 'donghualife.com'];
    const ok = sites.some(s => url.includes(s));
    statusText.textContent = ok
      ? (on ? '✅ Activo en esta página' : '⏸ Desactivado')
      : 'AV1 · FLV · SDonghua · Mundo · DLife';
  });
}

// ── Help screen toggle ────────────────────────────────────────────────────────
const screenMain = document.getElementById('screen-main');
const screenHelp = document.getElementById('screen-help');
document.getElementById('help-toggle').addEventListener('click', () => {
  screenMain.style.display = 'none';
  screenHelp.style.display = 'flex';
});
document.getElementById('help-back').addEventListener('click', () => {
  screenHelp.style.display = 'none';
  screenMain.style.display = 'flex';
});
