// Собирает 40+ сигналов в текущем браузере и печатает JSON
// Запускается в 3 движках: Chromium, WebKit, Firefox (и на реальном Safari через cdp)
const SIGNALS = () => {
  const r = {};
  const nav = navigator;
  r.userAgent = nav.userAgent;
  r.platform = nav.platform;
  r.vendor = nav.vendor;
  r.language = nav.language;
  r.languages = (nav.languages || []).join(',');
  r.hardwareConcurrency = nav.hardwareConcurrency;
  r.deviceMemory = nav.deviceMemory || null;
  r.maxTouchPoints = nav.maxTouchPoints;
  r.pdfViewerEnabled = nav.pdfViewerEnabled || null;
  r.doNotTrack = nav.doNotTrack;
  r.cookieEnabled = nav.cookieEnabled;
  r.webdriver = nav.webdriver || false;

  // UA-CH
  if (nav.userAgentData) {
    r.uaData = {
      brands: (nav.userAgentData.brands || []).map(b => b.brand + ' ' + b.version),
      mobile: nav.userAgentData.mobile,
      platform: nav.userAgentData.platform,
    };
  } else r.uaData = null;

  // Screen
  r.screen = {
    w: screen.width, h: screen.height,
    availW: screen.availWidth, availH: screen.availHeight,
    colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth,
    dpr: window.devicePixelRatio,
  };

  // TimeZone + Intl
  r.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try { r.tzLong = new Intl.DateTimeFormat('ru-RU', { timeZoneName: 'long' }).formatToParts().find(p => p.type === 'timeZoneName').value; } catch (e) { r.tzLong = null; }
  try { r.intlDateTime = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZoneName: 'long' }).format(new Date(2026, 6, 1)); } catch (e) { r.intlDateTime = null; }
  try { r.intlList = new Intl.ListFormat('ru-RU').format(['0', '1']); } catch (e) { r.intlList = null; }
  try { r.intlDisplay = new Intl.DisplayNames(['ru-RU'], { type: 'language' }).of('en-US'); } catch (e) { r.intlDisplay = null; }
  try { r.intlPlural = new Intl.PluralRules('ru-RU').select(1); } catch (e) { r.intlPlural = null; }
  try { r.intlNumber = new Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(2100000); } catch (e) { r.intlNumber = null; }
  try { r.intlRelTime = new Intl.RelativeTimeFormat('ru-RU').format(1, 'year'); } catch (e) { r.intlRelTime = null; }

  // Battery
  if (nav.getBattery) {
    r.battery = 'PENDING';
  } else r.battery = null;

  // Storage quota
  if (nav.storage && nav.storage.estimate) {
    r.storageQuota = 'PENDING';
  } else r.storageQuota = null;

  // Network
  r.network = nav.connection ? {
    downlink: nav.connection.downlink, rtt: nav.connection.rtt,
    effectiveType: nav.connection.effectiveType, saveData: nav.connection.saveData, type: nav.connection.type,
  } : null;

  // Plugins/mimeTypes
  r.pluginCount = nav.plugins ? nav.plugins.length : -1;
  r.mimeCount = nav.mimeTypes ? nav.mimeTypes.length : -1;

  // Speech voices
  r.speechVoices = window.speechSynthesis ? speechSynthesis.getVoices().length : null;

  // Window keys
  r.windowKeysCount = Object.keys(window).length;
  r.navigatorKeysCount = Object.keys(Object.getOwnPropertyNames(Navigator.prototype)).length;

  // WebGL
  const gl = document.createElement('canvas').getContext('webgl');
  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    r.webgl = {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
      version: gl.getParameter(gl.VERSION),
      glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      extensions: gl.getExtensions ? 'n/a' : null,
      extCount: (gl.getSupportedExtensions() || []).length,
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxViewport: gl.getParameter(gl.MAX_VIEWPORT_DIMS).join('x'),
      aliasedLineWidth: gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE).join('-'),
      aliasedPointSize: gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE).join('-'),
    };
  }

  // WebGPU
  r.webgpu = navigator.gpu ? 'yes' : 'no';

  // WebRTC
  r.rtcApis = typeof RTCPeerConnection !== 'undefined';

  // ContentIndex, ContactsManager (headless-детекторы Т-Банка)
  r.contentIndex = 'serviceWorker' in navigator && 'ContentIndex' in (window.ContentIndex || {}) ? !!window.ContentIndex : !!window.ContentIndex;
  r.contactsManager = !!nav.contactsManager;
  r.idleDetector = !!window.IdleDetector;

  // Canvas fingerprint (тот же рецепт, что в fp-pixel)
  const c = document.createElement('canvas');
  c.width = 500; c.height = 200;
  const ctx = c.getContext('2d');
  const text = "❁ Very unique and secure TEXT!\n\r <🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🍍🥝>";
  ctx.textBaseline = 'top';
  ctx.font = "14px 'Arial'";
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.fillText(text, 2, 15);
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.fillText(text, 4, 17);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(255,0,255)';
  ctx.beginPath(); ctx.arc(50, 50, 50, 0, 2 * Math.PI, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgb(0,255,255)';
  ctx.beginPath(); ctx.arc(100, 50, 50, 0, 2 * Math.PI, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgb(255,255,0)';
  ctx.beginPath(); ctx.arc(75, 100, 50, 0, 2 * Math.PI, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgb(255,0,255)';
  ctx.arc(75, 75, 75, 0, 2 * Math.PI, true); ctx.arc(75, 75, 25, 0, 2 * Math.PI, true); ctx.fill('evenodd');
  r.canvasFP = c.toDataURL().slice(-64);

  // Fonts probe (7 шрифтов из списка fp-pixel)
  const probe = ['Segoe UI Emoji', 'Helvetica Neue', 'Geneva', 'Luminari', 'American Typewriter Semibold', 'SignPainter-HouseScript Semibold', 'Noto Color Emoji'];
  r.fonts = probe.filter(f => document.fonts.check(`12px "${f}"`));

  // Audio
  try {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new AC(1, 44100, 44100);
    const osc = oc.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    const comp = oc.createDynamicsCompressor();
    osc.connect(comp); comp.connect(oc.destination);
    osc.start(0);
    oc.startRendering().then(buf => {
      const d = buf.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += Math.abs(d[i]);
      r.audioSum = sum;
    });
  } catch (e) { r.audioSum = 'ERR'; }

  return r;
};

module.exports = { SIGNALS };
