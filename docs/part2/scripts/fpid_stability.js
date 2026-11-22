// Эксперимент: стабильность fingerprintId.
// 1. Одна и та же сессия, два запроса подряд -> ID меняется?
// 2. Новая сессия (свежий контекст, те же сигналы) -> ID тот же?
// 3. Меняем один сигнал (canvas) -> ID меняется?
// Расшифровываем payload между запусками и сравниваем поля.
const { chromium } = require('playwright');
const fs = require('fs');
const zlib = require('zlib');

async function runSession(browser, label, canvasSpoof) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  await page.addInitScript(spoof => {
    const origEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    window.__aesKeys = [];
    crypto.subtle.encrypt = async (alg, key, data) => {
      const res = await origEncrypt(alg, key, data);
      if (alg.name === 'RSA-OAEP') window.__aesKeys.push(Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2, '0')).join(''));
      return res;
    };
    if (spoof) {
      const orig = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const ctx2 = this.getContext('2d');
        if (ctx2) { ctx2.save(); ctx2.fillStyle = 'rgba(1,2,3,0.05)'; ctx2.fillRect(0, 0, 1, 1); ctx2.restore(); }
        return orig.apply(this, args);
      };
    }
  }, canvasSpoof || '');

  let fingerprintId = null;
  page.on('response', async res => {
    if (/web-fingerprint\/api\/v1\/external\/fingerprint/.test(res.url())) {
      try { const j = await res.json(); if (j.fingerprintId) fingerprintId = j.fingerprintId; } catch (e) {}
    }
  });

  const bodies = [];
  page.on('request', req => {
    if (/web-fingerprint\/api\/v1\/external\/fingerprint/.test(req.url()) && req.method() === 'POST') bodies.push(JSON.parse(req.postData()));
  });

  await page.goto('https://www.tbank.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(14000);

  const keys = await page.evaluate(() => window.__aesKeys || []);
  const payloads = [];
  for (let i = 0; i < bodies.length; i++) {
    try {
      const key = Buffer.from(keys[i] || keys[0], 'hex');
      const iv = Buffer.from(bodies[i].nonce_b64, 'base64');
      const data = Buffer.from(bodies[i].encrypted_gzip_data_b64, 'base64');
      const tag = Buffer.from(bodies[i].tag_b64, 'base64');
      const d = require('crypto').createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      const json = zlib.gunzipSync(Buffer.concat([d.update(data), d.final()])).toString('utf8');
      payloads.push(JSON.parse(json));
    } catch (e) {}
  }
  await ctx.close();
  return { label, fingerprintId, payloads };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // 1. Базовая сессия
  const s1 = await runSession(browser, 'base');
  // 2. Повтор с новым контекстом (те же сигналы)
  const s2 = await runSession(browser, 'repeat-same-signals');
  // 3. Подмена canvas
  const s3 = await runSession(browser, 'canvas-spoof', true);

  const summary = (s) => {
    const full = s.payloads.find(p => p.logData && p.logData.canvas_2d_computed);
    return {
      label: s.label,
      fingerprintId: s.fingerprintId,
      canvas2d: full ? full.logData.canvas_2d_computed : null,
      canvasCB: full ? full.logData.canvas_webgl_computed : null,
      fonts: full ? full.logData.fonts : null,
      gpu: full ? full.logData.gpuImageHash : null,
      headless: full ? full.logData.headless_chromium_flg : null,
    };
  };

  const out = [summary(s1), summary(s2), summary(s3)];
  console.table(out);
  fs.writeFileSync('/Users/alexander/Desktop/fingerprint-research2/evidence/fpid_stability.json', JSON.stringify({ s1, s2, s3 }, null, 2).slice(0, 100000));
  await browser.close();
})();
