#!/usr/bin/env node
// Checks that every YouTube video in the catalogue really plays inside the app's embedded player
// (headless Chrome + the official IFrame API on a local page; one player, ~0.5 s per video).
// Result: data/yt_embed.json  { id: { s: ok|noembed|gone|region|blocked|age, why, at, n } }
//   noembed = owner disabled playback on other sites (error 101/150) -> app shows "watch on YouTube" instead of a dead player
//   age     = age-restricted (never plays embedded)                  -> same as noembed
//   gone    = deleted / private / account closed (error 100)          -> build.py drops it after 2 checks in a row
//   region / blocked (copyright claim) depend on the viewer's country; the checker runs outside Israel -> informational only
// Order: never-checked first (sketches first), then the oldest checks. Budget: YT_MINUTES (default 20) / YT_MAX.
// Usage: node importers/yt_embed_check.js [--only id,id]   (needs puppeteer-core + Chrome; CHROME=path)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'data', 'yt_embed.json');
let puppeteer; for (const m of ['puppeteer-core', '/tmp/ytc/node_modules/puppeteer-core', '/workspace/tmp/pptr/node_modules/puppeteer-core']) { try { puppeteer = require(m); break } catch {} }
if (!puppeteer) { console.log('puppeteer-core not installed - skipping'); process.exit(0) }
const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
const DEADLINE = Date.now() + (+(process.env.YT_MINUTES || 20)) * 60000, MAX = +(process.env.YT_MAX || 1e9);
const args = process.argv.slice(2), ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const state = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const ids = new Map();   // id -> priority (0 sketches, 1 others)
for (const f of fs.readdirSync(path.join(ROOT, 'data', 'sources')).filter(f => f.endsWith('.json')).sort()) {
  const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sources', f), 'utf8'));
  for (const r of Object.values(st.shiurim || {})) for (const y of [r.youtube, ...(r.ytAlt || [])]) if (y && /^[\w-]{11}$/.test(y)) ids.set(y, Math.min(ids.get(y) ?? 9, f.includes('sketches') ? 0 : 1));
}
const rank = id => (state[id] ? 2 : 0) + ids.get(id);
let todo = ONLY || [...ids.keys()].sort((a, b) => rank(a) - rank(b) || ((state[a] || {}).at || '').localeCompare((state[b] || {}).at || ''));
todo = todo.slice(0, MAX);
const HTML = `<!doctype html><meta charset=utf-8><body><script>
var R={};function onYouTubeIframeAPIReady(){window.mk=function(){return new Promise(function(ok){if(window.P){try{P.destroy()}catch(e){}}document.body.insertAdjacentHTML('beforeend','<div id=p></div>');
window.P=new YT.Player('p',{width:320,height:180,playerVars:{origin:location.origin,playsinline:1,mute:1,autoplay:1,rel:0},events:{onReady:function(){ok()},onError:function(e){R.err=e.data},onStateChange:function(e){(R.st=R.st||[]).push(e.data)}}})})};window.api=1}
</script><script src="https://www.youtube.com/iframe_api"></script>`;
const classify = (code, d) => {
  const t = ((d && d.reason) || '') + ' ' + ((d && d.desc) || ''), l = t.toLowerCase();
  if (/not a bot|confirm you.?re not|sign in to confirm that/.test(l)) return 'unknown';
  if (/confirm your age|age-restricted|inappropriate for some users|גיל/.test(l)) return 'age';
  if (code === 100 || /private|removed|deleted|terminated|does not exist|no longer available|פרטי|הוסר/.test(l)) return 'gone';
  if (/country|במדינה/.test(l)) return 'region';
  if (/claimed content|copyright|זכויות יוצרים/.test(l)) return 'blocked';
  if (code === 101 || code === 150 || code === 152 || code === 153) return 'noembed';
  return 'unknown';
};
(async () => {
  if (!todo.length) return console.log('nothing to check');
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(HTML) });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--lang=he-IL', '--mute-audio'] });
  const p = await br.newPage(); await p.goto(`http://localhost:${srv.address().port}/`); await p.waitForFunction('window.api', { timeout: 30000 }); await p.evaluate('mk()');
  const now = new Date().toISOString(), cnt = {}; let done = 0, unknownRun = 0;
  const save = () => fs.writeFileSync(OUT, '{\n' + Object.keys(state).sort().map(k => JSON.stringify(k) + ':' + JSON.stringify(state[k])).join(',\n') + '\n}\n');
  for (const id of todo) {
    if (Date.now() > DEADLINE) break;
    let r = {};
    try {
      await p.evaluate(id => { R = {}; P.loadVideoById(id) }, id);
      for (let i = 0; i < 48; i++) { await new Promise(z => setTimeout(z, 250)); r = await p.evaluate('R'); if (r.err != null || (r.st || []).includes(1)) break }
    } catch (e) { r = { exc: String(e).slice(0, 80) } }
    let s, why = '';
    if ((r.st || []).includes(1)) s = 'ok';
    else if (r.err != null) {
      const f = p.frames().find(f => /youtube/.test(f.url()));
      const d = f ? await f.evaluate(() => { const m = document.querySelector('#movie_player'); let ps = null; try { ps = m.getPlayerResponse().playabilityStatus } catch (e) {}
        const es = (ps && ps.errorScreen) || {}, vm = ((es.playerInterstitialRenderer || {}).content || {}).interstitialViewModel, sub = (es.playerErrorMessageRenderer || {}).subreason;
        return { status: ps && ps.status, reason: ps && ps.reason, desc: (vm && vm.description && vm.description.content) || (sub && (sub.simpleText || (sub.runs || []).map(x => x.text).join(''))) || '' } }).catch(() => null) : null;
      s = classify(r.err, d); why = `${r.err}${d ? ': ' + [d.status, d.desc || d.reason].filter(Boolean).join(' - ') : ''}`.slice(0, 160);
      await p.evaluate('mk()').catch(() => {});
    } else { s = 'unknown'; why = r.exc || 'timeout ' + JSON.stringify(r.st || []); await p.evaluate('mk()').catch(() => {}) }
    unknownRun = s === 'unknown' ? unknownRun + 1 : 0;
    if (unknownRun >= 25) { console.log('::warning::YouTube seems to block this runner (25 unknown in a row) - stopping'); break }
    cnt[s] = (cnt[s] || 0) + 1;
    if (s === 'unknown') { if (process.env.YT_DEBUG) console.log('unknown', id, why); continue }   // keep the previous verdict
    const prev = state[id];
    state[id] = { s, ...(why ? { why } : {}), at: now, n: prev && prev.s === s ? (prev.n || 1) + 1 : 1 };
    if (++done % 100 === 0) { console.log(done, JSON.stringify(cnt)); save() }
  }
  save(); console.log('checked', done, 'of', todo.length, JSON.stringify(cnt));
  await br.close(); srv.close();
})().catch(e => { console.log('::warning::yt_embed_check failed', e.message); process.exit(0) });
