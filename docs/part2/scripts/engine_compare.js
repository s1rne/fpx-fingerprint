// Запускаем signals.js в Chromium, WebKit и Firefox. Сравниваем.
const { chromium, webkit, firefox } = require('playwright');
const fs = require('fs');
const { SIGNALS } = require('./signals');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const out = {};

  // Chromium
  {
    const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-blink-features=AutomationControlled'] });
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p.goto('about:blank');
    out.chromium = await p.evaluate(SIGNALS);
    // async-поля
    out.chromium.storageQuota = await p.evaluate(async () => { try { const e = await navigator.storage.estimate(); return e.quota; } catch (err) { return null; } });
    await b.close();
  }

  // WebKit (ядро Safari/iOS)
  {
    const b = await webkit.launch({ headless: true });
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p.goto('about:blank');
    out.webkit = await p.evaluate(SIGNALS);
    out.webkit.storageQuota = await p.evaluate(async () => { try { const e = await navigator.storage.estimate(); return e.quota; } catch (err) { return null; } });
    await b.close();
  }

  // Firefox
  {
    const b = await firefox.launch({ headless: true });
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p.goto('about:blank');
    out.firefox = await p.evaluate(SIGNALS);
    out.firefox.storageQuota = await p.evaluate(async () => { try { const e = await navigator.storage.estimate(); return e.quota; } catch (err) { return null; } });
    await b.close();
  }

  fs.writeFileSync('/Users/alexander/Desktop/fingerprint-research2/evidence/engine_compare.json', JSON.stringify(out, null, 2));

  // Компактная таблица различий
  const keys = new Set();
  const flat = (o, pre = '') => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, pre + k + '.');
      else keys.add(pre + k);
    }
  };
  Object.values(out).forEach(v => flat(v));

  console.log('field'.padEnd(38), 'chromium'.padEnd(46), 'webkit'.padEnd(44), 'firefox');
  for (const k of [...keys].sort()) {
    const get = o => {
      let v = o;
      for (const part of k.split('.')) v = v ? v[part] : undefined;
      return v === undefined ? '<absent>' : JSON.stringify(v);
    };
    const c = get(out.chromium), w = get(out.webkit), f = get(out.firefox);
    const mark = c === w && w === f ? '' : ' <<';
    console.log(k.padEnd(38), c.slice(0, 46).padEnd(46), w.slice(0, 44).padEnd(44), f.slice(0, 40), mark);
  }
})();
