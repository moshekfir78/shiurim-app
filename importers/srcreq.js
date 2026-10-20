#!/usr/bin/env node
// On-demand source search worker. The app posts a shiur uid to an ntfy topic when someone opens a shiur
// that has no saved sources; this script (run by .github/workflows/sources.yml every 10 minutes) reads the
// requests, collects what the shiur's own origin states (title citation, description "מקורות:" list, a linked
// source sheet on Google Docs/Drive, the publisher's page, the YouTube/Spotify description), saves the entries to
// data/srcfound/<content id>.json and resolves them with importers/srclinks.js. Nothing is guessed.
// Usage: node importers/srcreq.js [--peek] [--uid <uid> ...]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public', 'data'), CONTENT = path.join(PUB, 'content');
const FOUND = path.join(ROOT, 'data', 'srcfound'), STATE = path.join(ROOT, 'data', 'srcreq_state.json');
const TOPIC = fs.readFileSync(path.join(ROOT, 'data', 'ntfy_src_topic.txt'), 'utf8').trim();
const args = process.argv.slice(2), PEEK = args.includes('--peek');
const DEADLINE = Date.now() + (+(process.env.SRC_MINUTES || 30)) * 60000, MAX = +(process.env.SRC_MAX || 60);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const load = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return d } };
const sha16 = u => require('crypto').createHash('sha1').update(u).digest('hex').slice(0, 16);

async function get(url, as = 'text', ms = 40000) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'he,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!r.ok) return { ok: false, status: r.status, url: r.url };
    return { ok: true, url: r.url, type: r.headers.get('content-type') || '', body: as === 'buf' ? Buffer.from(await r.arrayBuffer()) : await r.text() };
  } catch (e) { return { ok: false, status: String(e.message || e).slice(0, 80) } }
}
async function pollNtfy(st) {
  const r = await get(`https://ntfy.sh/${TOPIC}/json?poll=1&since=${encodeURIComponent(st.since || '24h')}`);
  if (!r.ok) { console.log('ntfy error', r.status); return [] }
  const msgs = r.body.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return null } }).filter(m => m && m.event === 'message');
  return msgs;
}
(async () => {
  const st = load(STATE, { since: '24h', queue: {} });
  const msgs = await pollNtfy(st);
  const fresh = msgs.map(m => (m.message || '').trim().slice(0, 200)).filter(Boolean);
  const pend = new Set([...Object.keys(st.queue), ...fresh, ...(args.includes('--uid') ? args.slice(args.indexOf('--uid') + 1).filter(a => !a.startsWith('--')) : [])]);
  if (PEEK) { console.log(`pending=${pend.size}`); if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `pending=${pend.size}\n`); return }
  if (msgs.length) st.since = msgs[msgs.length - 1].id;
  for (const u of pend) st.queue[u] = st.queue[u] || Date.now();
  fs.writeFileSync(STATE, JSON.stringify(st));
  if (!pend.size) { console.log('no requests'); return }

  // the app's own extraction code
  global.window = {}; global.localStorage = { getItem: () => null, setItem: () => { } };
  eval(fs.readFileSync(path.join(ROOT, 'public', 'sources.js'), 'utf8'));
  const S = window.SrcLink;
  const idx = load(path.join(PUB, 'index.json'), { shiurim: [], categories: {} });
  const byUid = {}; for (const s of idx.shiurim) byUid[s.uid] = s;
  const rec = {}; for (const f of fs.readdirSync(path.join(ROOT, 'data', 'sources'))) { const d = load(path.join(ROOT, 'data', 'sources', f), {}); for (const [u, r] of Object.entries(d.shiurim || {})) rec[u] = r }
  const hasPdf = (() => { try { cp.execSync('which pdftotext', { stdio: 'ignore' }); return true } catch (e) { return false } })();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srcreq-'));

  async function sheetText(l, log) {
    if (l.gdoc) { const r = await get(`https://docs.google.com/document/d/${l.gdoc}/export?format=txt`); log.push(['gdoc', r.ok ? 'ok' : r.status]); return r.ok ? r.body : '' }
    let fid = l.gfile, u = l.url;
    if (!fid && /bit\.ly|goo\.gl|tinyurl|ypt\.co\.il\/\w+$/.test(u)) { const r = await get(u, 'text', 20000); log.push(['short', r.ok ? 'ok' : r.status]); if (r.url) { const x = S.sheetLinks('דף מקורות: ' + r.url)[0]; if (x && (x.gdoc || x.gfile)) return sheetText(x, log) } return '' }
    if (!fid) { log.push(['link', 'unsupported']); return '' }
    const r = await get(`https://drive.usercontent.google.com/download?id=${fid}&export=download&confirm=t`, 'buf', 60000);
    if (!r.ok) { log.push(['gfile', r.status]); return '' }
    const b = r.body, fp = path.join(tmp, fid);
    fs.writeFileSync(fp, b);
    try {
      if (b.slice(0, 4).toString() === '%PDF') { if (!hasPdf) { log.push(['pdf', 'no pdftotext']); return '' } const t = cp.execFileSync('pdftotext', [fp, '-'], { maxBuffer: 1 << 26 }).toString(); const ok = t.replace(/\s/g, '').length > 200; log.push(['pdf', ok ? 'ok' : 'scanned (no text layer)']); return ok ? t : '' }
      if (b.slice(0, 2).toString() === 'PK') { const x = cp.execFileSync('unzip', ['-p', fp, 'word/document.xml'], { maxBuffer: 1 << 26 }).toString(); log.push(['docx', 'ok']); return x.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&') }
      log.push(['gfile', 'unsupported type']); return '';
    } catch (e) { log.push(['gfile', 'convert failed']); return '' }
  }
  async function ytDesc(vid, log) {
    try { const d = cp.execFileSync('yt-dlp', ['--skip-download', '--no-warnings', '--print', 'description', 'https://www.youtube.com/watch?v=' + vid], { timeout: 90000, maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); log.push(['youtube', 'ok']); return d } catch (e) { }
    const r = await get('https://www.youtube.com/watch?v=' + vid + '&hl=iw');
    const m = r.ok && r.body.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (m) { log.push(['youtube', 'ok (page)']); try { return JSON.parse('"' + m[1] + '"') } catch (e) { return '' } }
    log.push(['youtube', 'unavailable from this runner']); return '';
  }

  const done = [];
  for (const uid of [...pend]) {
    if (Date.now() > DEADLINE || done.length >= MAX) break;
    const s = byUid[uid]; delete st.queue[uid];
    if (!s) { console.log('unknown uid', uid); continue }
    const c = s.c, fp = path.join(FOUND, c + '.json');
    const prev = load(fp, null); if (prev && Date.now() - Date.parse(prev.at) < 30 * 864e5) { console.log('already searched', uid); continue }
    const d = load(path.join(CONTENT, c + '.json'), {}), r = rec[uid] || {};
    const log = []; let found = [];
    const cat = (idx.categories[s.cat] || {}).title || '';
    found.push(...S.titleEntries(s.title, cat));
    let desc = d.excerpt || '';
    const vid = r.youtube || (s.pageUrl || '').match(/[?&]v=([\w-]{11})/)?.[1] || (uid.match(/^(?:youtube|yt-[\w-]+):([\w-]{11})$/) || [])[1];
    if (vid && desc.length < 40 && s.rav !== 'sketches') desc = await ytDesc(vid, log);
    if (r.spotify && desc.length < 40) { const p = await get("https://open.spotify.com/episode/" + r.spotify); const m = p.ok && (p.body.match(/<meta property="og:description" content="([^"]*)"/) || p.body.match(/<meta name="description" content="(?:Listen to this episode from .*? on Spotify\.\s*)?([^"]*)"/)); if (m) { desc = m[1].replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&'); log.push(['spotify', 'ok']) } else log.push(['spotify', p.status || 'no description']) }
    found.push(...S.descEntries(desc));
    // the publisher's own page
    let pageHtml = '';
    if (s.source === 'haravhendler' && !d.html) { const p = await get(`https://www.haravhendler.co.il/api/lesson?id=${r.sourceId}`); if (p.ok) { try { pageHtml = JSON.parse(p.body).content || '' } catch (e) { } } log.push(['page', p.ok ? 'ok' : p.status]) }
    else if (/^(siach-site|ostlv-)/.test(s.source)) { const api = s.source === 'siach-site' ? `https://siach.org.il/wp-json/wp/v2/posts/${r.sourceId}?_fields=content` : `https://ostlv.co.il/wp-json/wp/v2/lesson/${r.sourceId}?_fields=content`; const p = await get(api); if (p.ok) { try { pageHtml = JSON.parse(p.body).content.rendered || '' } catch (e) { } } log.push(['page', p.ok ? (pageHtml.replace(/<[^>]+>|\s/g, '').length ? 'ok' : 'empty') : p.status]) }
    else if (/^etzion-/.test(s.source) && s.pageUrl) { const p = await get(s.pageUrl); if (p.ok) { const m = p.body.match(/<div[^>]+(?:field--name-body|text-formatted)[^>]*>([\s\S]{0,60000}?)<\/div>/); pageHtml = m ? m[1] : '' } log.push(['page', p.ok ? 'ok' : p.status]) }
    if (pageHtml) { found.push(...S.listedFromHtml(pageHtml).map(e => ({ ...e, from: 'site' }))) }
    // linked source sheets (description, page)
    const links = S.sheetLinks([desc, d.excerpt || '', pageHtml.replace(/<a [^>]*href="([^"]+)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, ' ')].join('\n')).slice(0, 3);
    for (const l of links) { const t = await sheetText(l, log); if (t) found.push(...S.listedFromText(t, 'sheet')) }
    // keep each entry once, short
    const seen = new Set(); found = found.filter(e => { const k = (e.head || '').replace(/["'״׳,\s]+/g, ' ').trim(); return k.length >= 3 && !seen.has(k) && seen.add(k) }).slice(0, 80)
      .map(e => ({ head: e.head, from: e.from, ...(e.raw && e.raw !== e.head ? { raw: e.raw.slice(0, 200) } : {}), ...(e.text ? { text: e.text.slice(0, 600) } : {}) }));
    fs.writeFileSync(fp, JSON.stringify({ uid, at: new Date().toISOString(), found, log }));
    const cf = path.join(CONTENT, c + '.json'); if (fs.existsSync(cf)) { d.srcFound = found; fs.writeFileSync(cf, JSON.stringify(d)) }
    console.log(`${uid} (${s.source}): ${found.length} entries`, JSON.stringify(log));
    done.push(c);
    fs.writeFileSync(STATE, JSON.stringify(st));
  }
  fs.writeFileSync(STATE, JSON.stringify(st));
  if (done.length) {
    cp.execFileSync('node', [path.join(__dirname, 'srclinks.js'), '--only', done.join(',')], { stdio: 'inherit', env: { ...process.env, SRC_MINUTES: String(Math.max(2, Math.round((DEADLINE - Date.now()) / 60000))) } });
    fs.writeFileSync(path.join(ROOT, '.deploy-needed'), '1');
  }
  console.log(`processed ${done.length}, still queued ${Object.keys(st.queue).length}`);
})();
