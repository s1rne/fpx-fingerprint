// Тест FPX: тот же лаб-стенд, что для WEV — проверяем collectData, deviceHash,
// стабильность хеша и работу behavioral-потока.
const http = require('http');
const fs = require('fs');
const path = require('path');

const pw = require('/Users/alexander/projects/luckygames-v2/tests/e2e/node_modules/playwright-core');

const ROOT = '/Users/alexander/Desktop/fingerprint-research/product';

const srv = http.createServer((req, res) => {
  const file = req.url === '/' ? 'demo.html' : req.url.slice(1);
  try {
    const body = fs.readFileSync(path.join(ROOT, file));
    const type = file.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('no'); }
});

srv.listen(18780, '127.0.0.1', async () => {
  try {
    const browser = await pw.chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:18780/', { waitUntil: 'load' });
    await page.waitForTimeout(600);

    // генерим поведение
    await page.mouse.move(100, 100);
    for (let i = 0; i < 20; i++) { await page.mouse.move(100 + i * 15, 150 + Math.sin(i) * 40, { steps: 2 }); await page.waitForTimeout(30); }
    await page.mouse.click(300, 200);
    await page.keyboard.type('test', { delay: 40 });

    const data = await page.evaluate(async () => await Fpx.collectData());
    const hash1 = await page.evaluate(async () => await Fpx.deviceHash());
    const hash2 = await page.evaluate(async () => await Fpx.deviceHash());

    console.log('=== FPX collectData ===');
    console.log('ua:', data.ua.slice(0, 60));
    console.log('canvas hash:', data.canvas.slice(0, 24) + '…');
    console.log('webgl renderer:', data.webgl.webgl1 && data.webgl.webgl1.unMaskedRenderer);
    console.log('audio:', data.audio);
    console.log('bot checks:', JSON.stringify(data.bot));
    console.log('behavior events:', data.behavior.length, 'первое:', JSON.stringify(data.behavior[0]));
    console.log('screen:', JSON.stringify(data.screen), 'window:', JSON.stringify(data.windowSize));
    console.log('deviceHash:', hash1);
    console.log('hash стабильный:', hash1 === hash2 ? 'ДА' : 'НЕТ');

    // Спуф-тест: подменяем canvas fillText — hash должен измениться
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.addInitScript(`
      (() => { const p = CanvasRenderingContext2D.prototype; const o = p.fillText;
        let n = 0; p.fillText = function(t, x, y, ...r) { const res = o.call(this, t, x, y, ...r);
          const f = this.fillStyle; this.fillStyle = 'rgba(0,0,0,0.004)';
          o.call(this, String((t||'').length) + '|' + (n++), x + 0.37, y - 0.11); this.fillStyle = f; return res; }; })();
    `);
    await page2.goto('http://127.0.0.1:18780/', { waitUntil: 'load' });
    await page2.waitForTimeout(500);
    const hashSpoofed = await page2.evaluate(async () => await Fpx.deviceHash());
    console.log('hash со спуфом:', hashSpoofed.slice(0, 24) + '…', '| отличается от базового:', hashSpoofed !== hash1 ? 'ДА ✓' : 'НЕТ ✗');

    fs.writeFileSync('/Users/alexander/Desktop/fingerprint-research/product/test_results.json', JSON.stringify({ data, hash1, hashSpoofed }, null, 1));
    await browser.close();
    console.log('OK: тесты записаны в product/test_results.json');
  } catch (e) { console.error('ERR:', e.message); }
  finally { srv.close(); process.exit(0); }
});
