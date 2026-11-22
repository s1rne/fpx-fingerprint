// Реальный Safari: webdriver-протокол
const { spawn } = require('child_process');
const fs = require('fs');

const WD = 'http://127.0.0.1:7777';

async function wd(method, path, body) {
  const res = await fetch(WD + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' || method === 'DELETE' || body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(method + ' ' + path + ': ' + j.error);
  return j.value;
}

(async () => {
  const proc = spawn('safaridriver', ['-p', '7777'], { stdio: 'ignore', detached: true });
  proc.unref();
  await new Promise(r => setTimeout(r, 1500));

  try {
    const created = await wd('POST', '/session', { capabilities: { browserName: 'safari' } });
    const sessionId = created.sessionId;
    console.log('session ok:', sessionId);

    const signalsSrc = fs.readFileSync('/Users/alexander/Desktop/fingerprint-research2/scripts/signals.js', 'utf8');
    const html = `<!DOCTYPE html><html><body><script>
      ${signalsSrc.replace("module.exports = { SIGNALS };", 'window.SIGNALS = SIGNALS;')}
      window.__done = false; window.__result = null;
      try { window.__result = SIGNALS(); } catch(e) { window.__result = { error: String(e) }; }
      (async () => {
        try {
          if (navigator.getBattery) { const b = await navigator.getBattery(); window.__result.battery = { charging: b.charging, level: b.level }; }
          if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); window.__result.storageQuota = e.quota; }
        } catch(e) {}
        if (window.speechSynthesis) { speechSynthesis.getVoices(); await new Promise(r => setTimeout(r, 800)); window.__result.speechVoices = speechSynthesis.getVoices().length; window.__result.voiceNames = speechSynthesis.getVoices().slice(0,10).map(v=>v.name); }
        window.__done = true;
      })();
    </script></body></html>`;
    fs.writeFileSync('/tmp/fp_signals_safari.html', html);

    await wd('POST', `/session/${sessionId}/url`, { url: 'file:///tmp/fp_signals_safari.html' });
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      const done = await wd('POST', `/session/${sessionId}/execute/sync`, { script: 'return window.__done === true;', args: [] });
      if (done) break;
    }
    const result = await wd('POST', `/session/${sessionId}/execute/sync`, { script: 'return JSON.stringify(window.__result);', args: [] });
    const parsed = JSON.parse(result);
    console.log(JSON.stringify(parsed, null, 2).slice(0, 5000));
    fs.writeFileSync('/Users/alexander/Desktop/fingerprint-research2/evidence/real_safari.json', JSON.stringify(parsed, null, 2));
    await wd('DELETE', `/session/${sessionId}`);
  } catch (e) {
    console.log('safari test error:', e.message);
  } finally {
    try { process.kill(-proc.pid); } catch (e) {}
  }
})();
