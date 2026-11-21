/*!
 * FPX — behavioral & device fingerprint collector (clean-room implementation)
 * Основан на публично известных техниках (canvas fingerprinting, FP-Stalker,
 * WebGL probing) с оригинальным кодом. Реверс-исследование Т-Банк WEV:
 * /Users/alexander/Desktop/fingerprint-research/
 */
(function (root) {
  'use strict';

  const VERSION = '0.1.0';

  // ---------- utils ----------
  const now = () => Date.now();
  const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return hex(digest);
  }

  // ---------- device fingerprint ----------
  function canvasFingerprint() {
    try {
      // Оригинальный рецепт: несуществующий шрифт + текст + цветной «цветок»
      const canvas = document.createElement('canvas');
      canvas.width = 2000; canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 10, 100, 20);
      ctx.fillStyle = '#069';
      ctx.font = '11pt no-real-font-123';
      ctx.fillText('Cwm fjord bank glyphs vext quiz \u263A', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.2)';
      ctx.font = '18pt Arial';
      ctx.fillText('Cwm fjord bank glyphs vext quiz \u263A', 4, 45);
      // цветные дуги
      const arcs = [[30, 30, 30, 'rgb(255,0,255)'], [50, 30, 30, 'rgb(0,255,255)'], [75, 80, 30, 'rgb(255,255,0)'], [55, 55, 55, 'rgb(255,0,255)'], [55, 55, 35, 'rgb(0,255,255)']];
      for (const [x, y, r, c] of arcs) {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2, true);
        ctx.stroke();
      }
      const url1 = canvas.toDataURL();
      const url2 = canvas.toDataURL('image/jpeg');
      return url1 + '_' + url2;
    } catch (e) { return ''; }
  }

  function webglFingerprint() {
    const out = { webgl1: null, webgl2: null };
    const probe = (type) => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext(type, { failIfMajorPerformanceCaveat: true });
        if (!gl) return null;
        const info = { glVersion: gl.getParameter(gl.VERSION) };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          info.unMaskedVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
          info.unMaskedRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        }
        info.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        info.maxViewport = [...gl.getParameter(gl.MAX_VIEWPORT_DIMS)];
        info.extensions = gl.getExtensions ? gl.getExtensions() : (gl.getExtension('WEBGL_lose_context') ? undefined : undefined);
        try { info.extensions = gl.getSupportedExtensions().length; } catch (e) {}
        return info;
      } catch (e) { return null; }
    };
    out.webgl1 = probe('webgl');
    out.webgl2 = probe('webgl2');
    return out;
  }

  function audioFingerprint() {
    return new Promise((resolve) => {
      try {
        const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!Ctx) return resolve(null);
        const ctx = new Ctx(1, 44100, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 10000;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -50; comp.knee.value = 40; comp.ratio.value = 12;
        comp.attack.value = 0; comp.release.value = 0.25;
        osc.connect(comp); comp.connect(ctx.destination);
        osc.start(0);
        ctx.startRendering();
        ctx.oncomplete = (e) => {
          let sum = 0;
          const buf = e.renderedBuffer.getChannelData(0);
          for (let i = 0; i < buf.length; i++) sum += Math.abs(buf[i]);
          resolve(sum);
        };
        setTimeout(() => resolve(null), 1500);
      } catch (e) { resolve(null); }
    });
  }

  // ---------- bot detection ----------
  function botChecks() {
    const stackProbe = (() => {
      try { null[0](); } catch (e) {
        try { return /callback\*/.test(String(e.stack || '')); } catch (e2) { return false; }
      }
      return false;
    })();
    const fakeSafari = (() => {
      const appleMarks =
        ('ApplePayError' in window ? 1 : 0) +
        ('CSSPrimitiveValue' in window ? 1 : 0) +
        ('Counter' in window ? 1 : 0) +
        (navigator.vendor && navigator.vendor.indexOf('Apple') === 0 ? 1 : 0) +
        ('getStorageUpdates' in navigator ? 1 : 0) +
        ('WebKitMediaKeys' in window ? 1 : 0);
      if (appleMarks < 4) return false; // и не претендует на Safari
      if ('safari' in window) return false;
      try {
        const hasJpeg = document.createElement('canvas').toDataURL('image/jpeg').indexOf('data:image/jpeg') === 0;
        return !hasJpeg || ('ApplePayError' in window && !('ApplePaySession' in window));
      } catch (e) { return true; }
    })();
    const webdriverDeep = (() => {
      if (navigator.webdriver === true) return true;
      if (Object.prototype.hasOwnProperty.call(navigator, 'webdriver')) return true;
      try {
        const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
        if (!desc || !desc.get) return false;
        const src = Function.prototype.toString.call(desc.get);
        return !/\(\)\s*{\s*\[native code\]\s*}\s*$/.test(src);
      } catch (e) { return false; }
    })();
    return {
      webdriver: webdriverDeep,
      domAutomation: !!(window.domAutomation || window.domAutomationController),
      phantom: !!(window.callPhantom || window._phantom || window.__phantoma),
      nodeInjected: !!(window.Buffer || window.spawn),
      headless: /HeadlessChrome/i.test(navigator.userAgent || ''),
      stackArtifact: stackProbe,
      fakeSafari,
    };
  }

  // ---------- behavior ----------
  function BehaviorCollector(cfg) {
    const EVENTS = {
      mouse: ['mousemove', 'mousedown', 'mouseup', 'click', 'wheel', 'dblclick', 'contextmenu'],
      keyboard: ['keydown', 'keyup'],
      touch: ['touchstart', 'touchend', 'touchmove'],
      focus: ['focus', 'blur'],
    };
    const TYPES = { mousemove: 24, mousedown: 5, mouseup: 3, click: 4, wheel: 15, dblclick: 6, contextmenu: 9, keydown: 16, keyup: 17, touchstart: 12, touchend: 13, touchmove: 11, focus: 22, blur: 23 };
    const KEYMAP = { timeStamp: 'a', isTrusted: 'b', pageX: 'j', pageY: 'k', screenX: 'l', screenY: 'm', movementX: 'h', movementY: 'i', button: 'd', buttons: 'e', ctrlKey: 'f', metaKey: 'g', shiftKey: 'n', which: 'o', deltaX: 'p', deltaY: 'q', type: 'w', code: 'z', key: '0', keyCode: '4' };

    const stream = [];
    const handlers = {};

    const push = (e) => {
      if (stream.length >= (cfg.limit || 1000)) return;
      const rec = { v: TYPES[e.type] != null ? TYPES[e.type] : -1 };
      for (const k in KEYMAP) {
        if (e[k] !== undefined) rec[KEYMAP[k]] = typeof e[k] === 'number' ? Math.round(e[k] * 100) / 100 : e[k];
      }
      if (e.target && e.target.tagName) rec.L = e.target.tagName;
      rec.t = now();
      stream.push(rec);
    };

    this.start = () => {
      for (const group in EVENTS) {
        for (const type of EVENTS[group]) {
          const h = (e) => push(e);
          document.addEventListener(type, h, { passive: true });
          handlers[type] = h;
        }
      }
    };
    this.stop = () => {
      for (const type in handlers) document.removeEventListener(type, handlers[type]);
    };
    this.stream = () => stream.slice();
    this.clear = () => { stream.length = 0; };
  }

  // ---------- public API ----------
  const Fpx = {
    version: VERSION,
    _behavior: null,
    _cfg: { limit: 1000 },

    init(cfg) {
      this._cfg = Object.assign({ limit: 1000 }, cfg || {});
      this._behavior = new BehaviorCollector(this._cfg);
      this._behavior.start();
      return this;
    },

    async collectData() {
      const audio = await audioFingerprint();
      const data = {
        version: VERSION,
        ua: navigator.userAgent,
        language: navigator.language,
        timezoneOffset: new Date().getTimezoneOffset(),
        screen: [screen.width, screen.height],
        windowSize: [innerWidth, innerHeight],
        pixelRatio: devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        deviceMemory: navigator.deviceMemory || null,
        touchPoints: navigator.maxTouchPoints || 0,
        referrer: document.referrer || '',
        bot: botChecks(),
        canvas: null,
        webgl: webglFingerprint(),
        audio: audio,
        behavior: this._behavior ? this._behavior.stream() : [],
      };
      const canvasSrc = canvasFingerprint();
      data.canvas = canvasSrc ? await sha256(canvasSrc) : '';
      return data;
    },

    async deviceHash() {
      const d = await this.collectData();
      // стабильный «паспорт»: без поведенки и одноразовых полей
      const stable = JSON.stringify({
        c: d.canvas, w: d.webgl, a: d.audio, s: d.screen, p: d.pixelRatio,
        t: d.timezoneOffset, h: d.hardwareConcurrency, m: d.deviceMemory,
        tp: d.touchPoints, ua: d.ua,
      });
      return sha256(stable);
    },

    async send(url) {
      const data = await this.collectData();
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'collect', payload: data }),
        keepalive: true,
      });
    },

    clear() { if (this._behavior) this._behavior.clear(); },
  };

  root.Fpx = Fpx;
  if (typeof module !== 'undefined') module.exports = Fpx;
})(typeof window !== 'undefined' ? window : this);
