// Расшифровка собственного payload: перехватываем AES-ключ ДО RSA-шифрования,
// прогоняем тело через gzip-распаковку и печатаем полный JSON
const { chromium } = require('playwright');
const fs = require('fs');
const zlib = require('zlib');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  // Хук: перехватываем crypto.subtle.encrypt — второй вызов с RSA-OAEP шифрует AES-ключ.
  // Проще: обернуть encrypt, сохраняя raw-ключ при name RSA-OAEP, и параллельно ловить тело POST.
  await page.addInitScript(() => {
    const origEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    window.__aesKeys = [];
    crypto.subtle.encrypt = async (alg, key, data) => {
      const res = await origEncrypt(alg, key, data);
      if (alg.name === 'RSA-OAEP') {
        // сам AES-ключ — data
        window.__aesKeys.push(Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2, '0')).join(''));
      }
      return res;
    };
  });

  const bodies = [];
  page.on('request', req => {
    const u = req.url();
    if (/web-fingerprint\/api\/v1\/external\/fingerprint/.test(u) && req.method() === 'POST') {
      bodies.push(JSON.parse(req.postData()));
    }
  });

  await page.goto('https://www.tbank.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(15000);

  const keys = await page.evaluate(() => window.__aesKeys || []);
  console.log('aes keys captured:', keys.length);

  const out = [];
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const keyHex = keys[i] || keys[0];
    if (!keyHex) continue;
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(b.nonce_b64, 'base64');
    const data = Buffer.from(b.encrypted_gzip_data_b64, 'base64');
    const tag = Buffer.from(b.tag_b64, 'base64');
    const nodeCrypto = require('crypto');
    try {
      const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(data), decipher.final()]);
      const json = zlib.gunzipSync(dec).toString('utf8');
      const parsed = JSON.parse(json);
      out.push(parsed);
      console.log('=== payload', i, 'keys:', Object.keys(parsed).length);
    } catch (e) {
      console.log('decrypt fail', i, e.message);
    }
  }

  fs.writeFileSync('/Users/alexander/Desktop/fingerprint-research2/evidence/fp_pixel_decrypted.json', JSON.stringify(out, null, 2));
  console.log('saved', out.length, 'payloads');
  await browser.close();
})();
