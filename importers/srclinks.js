#!/usr/bin/env node
// Build-time resolver for the מקורות tab: every entry the app lists (site source sheet + transcript sources)
// is resolved here to an exact Sefaria location (or the book/section page), verified against the quoted text,
// and saved to data/srclinks.json. build.py merges it into each shiur's content JSON (field "srcRes"),
// so the app shows the links instantly and does not depend on live lookups.
// Usage: node importers/srclinks.js [--all] [--limit N] [--only <contentId,...>]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'public', 'data', 'content');
const OUT = path.join(ROOT, 'data', 'srclinks.json');
const CACHE = process.env.SRC_CACHE || path.join(os.tmpdir(), 'srclinks-http-cache.json');
const VERSION = 2;
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const LIMIT = +(args[args.indexOf('--limit') + 1] || 0) || (args.includes('--limit') ? 0 : 1e9);
const ONLY = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const DEADLINE = Date.now() + (+(process.env.SRC_MINUTES || 40)) * 60000;

// ---------- HTTP with disk cache + polite throttling ----------
let hc = {}; try { hc = JSON.parse(fs.readFileSync(CACHE, 'utf8')) } catch (e) { }
let dirty = 0; const saveCache = () => { if (dirty) { fs.writeFileSync(CACHE, JSON.stringify(hc)); dirty = 0 } };
process.on('SIGTERM', () => { try { saveCache() } catch (e) { } process.exit(1) });
const realFetch = global.fetch;
let last = 0, active = 0; const MAXC = 3, GAP = 150; const waiters = [];
async function slot() { while (active >= MAXC) await new Promise(r => waiters.push(r)); active++; const w = last + GAP - Date.now(); last = Math.max(Date.now(), last + GAP); if (w > 0) await new Promise(r => setTimeout(r, w)) }
function release() { active--; const w = waiters.shift(); if (w) w() }
async function http(url, opt = {}) {
  const key = (opt.method || 'GET') + ' ' + url + (opt.body ? ' ' + opt.body : '');
  if (key in hc) return hc[key];
  let v = null;
  for (let i = 0; i < 4; i++) {
    await slot();
    try {
      const r = await realFetch(url, { ...opt, headers: { 'User-Agent': 'shiurim-app source linker (github.com/moshekfir78/shiurim-app)', ...(opt.headers || {}) }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) { release(); await new Promise(z => setTimeout(z, 3000 * (i + 1))); continue }
      v = r.ok ? await r.json().catch(() => null) : null; release(); break;
    } catch (e) { release(); await new Promise(z => setTimeout(z, 2000 * (i + 1))) }
  }
  hc[key] = v; dirty++; if (dirty > 1500) saveCache(); return v;
}
// sources.js (the app's own extraction/resolution code) runs here with a cached fetch
global.fetch = async (url, opt) => { const v = await http(String(url), opt || {}); return { ok: v != null, status: v != null ? 200 : 404, json: async () => v } };
global.window = {}; global.localStorage = { getItem: () => null, setItem: () => { } };
eval(fs.readFileSync(path.join(ROOT, 'public', 'sources.js'), 'utf8'));
const S = window.SrcLink;

// ---------- Text helpers ----------
const NIK = s => String(s || '').replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '').replace(/\u05BE/g, ' ');
const norm = s => NIK(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/[״“”„]/g, '"').replace(/[׳`’‘]/g, "'").replace(/\([^)]{0,80}\)|\[[^\]]{0,80}\]/g, ' ');
const FIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const toks = s => norm(s).replace(/['"]/g, '').replace(/[^א-ת\s]/g, ' ').split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/[ךםןףץ]/g, c => FIN[c]).replace(/^ו(?=..)/, '').replace(/י|ו/g, ''));
const grams = (s, n = 3) => { const t = toks(s), g = new Set(); for (let i = 0; i + n <= t.length; i++) g.add(t.slice(i, i + n).join(' ')); return g };
function overlap(passage, text) {
  const P = [...grams(passage.split(/\s+/).slice(0, 90).join(' '))], T = grams(text);
  if (!P.length) return { n: 0, r: 0 };
  const n = P.filter(g => T.has(g)).length; return { n, r: n / Math.min(P.length, 40) };
}
const flatSegs = (base, t, idx = []) => Array.isArray(t) ? t.flatMap((x, i) => flatSegs(base, x, idx.concat(i + 1))) : [{ ref: idx.length ? base + (/\d[ab]?$/.test(base) ? ':' : ' ') + idx.join(':') : base, t: String(t || '') }];
const urlOf = ref => ref.replace(/ /g, '_').replace(/_(\d+[ab]?(?::\d+)*(?:-\d+[ab]?(?::\d+)*)?)$/, '.$1').replace(/:/g, '.');
async function textOf(ref) {
  const d = await http('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(ref) + '?version=hebrew&return_format=text_only');
  if (!d || !d.versions || !d.versions[0]) return null;
  return { ref: d.ref, he: d.heRef, segs: flatSegs(d.ref, d.versions[0].text) };
}
async function nameApi(q) { return await http('https://www.sefaria.org/api/name/' + encodeURIComponent(q) + '?limit=8') }
async function search(q, pathF, loose) {
  const body = { query: q, type: 'text', field: loose ? 'naive_lemmatizer' : 'exact', slop: loose ? 4 : 0, size: 10, source_proj: ['ref', 'heRef', 'path'] };
  if (pathF) Object.assign(body, { filters: [pathF], filter_fields: ['path'] });
  const d = await http('https://www.sefaria.org/api/search-wrapper', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const seen = new Set();
  return ((d && d.hits && d.hits.hits) || []).map(x => x._source || {}).filter(x => x.ref && !seen.has(x.ref) && seen.add(x.ref));
}
async function wsSearch(q) {
  const d = await http('https://he.wikisource.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=' + encodeURIComponent('"' + q + '"'));
  return ((d && d.query && d.query.search) || []).map(x => x.title);
}

// ---------- Book identification ----------
const BOOKS = {}; // index title -> {he, path}
async function loadToc() {
  const t = await http('https://www.sefaria.org/api/index');
  const walk = (n, p) => { for (const c of n || []) { if (c.contents) walk(c.contents, p.concat(c.category)); else if (c.title) BOOKS[c.title] = { he: c.heTitle, path: p.concat(c.title).join('/') } } };
  walk(t, []);
  for (const [title, b] of Object.entries(BOOKS)) { const k = hk(b.he || ''); if (k && !(k in HEMAP)) HEMAP[k] = title }
}
const HEMAP = {};
const ABBR = [[/^שפ"א(?=[\s,]|$)/, 'שפת אמת'], [/^אסת"ר/, 'אסתר רבה'], [/^במדב"ר/, 'במדבר רבה'], [/^שמו"ר/, 'שמות רבה'], [/^ב"ר(?=\s)/, 'בראשית רבה'], [/^ויק"ר/, 'ויקרא רבה'], [/^דב"ר/, 'דברים רבה'], [/^דבר"ר/, 'דברים רבה'], [/^ילקו"ש/, 'ילקוט שמעוני'], [/^זח"([אבג])/, 'זוהר ח"$1'],
  [/^(?:ספר\s+)?ה?(?:זהר|זוהר)(?:\s+הקדוש)?(?=[\s,]|$)/, 'זוהר'], [/^ת(?:י)?קוני\s+ה?(?:זהר|זוהר)/, 'תיקוני זוהר'], [/^ליקוטי מוהר"ן\s+קמא/, 'ליקוטי מוהר"ן']];
const BOOK_ALIAS = { 'זוהר': 'Zohar', 'תיקוני זוהר': 'Tikkunei Zohar', 'בעל שם טוב': "Ba'al Shem Tov", 'מקור מים חיים': 'Mekor Mayim Chayim on Baal Shem Tov', 'שפת אמת': 'Sefat Emet', 'מאור עינים': "Me'or Einayim", 'מאור עיניים': "Me'or Einayim", 'תניא': 'Tanya' };
const NOT_ON_SEFARIA = /^(?:תורת המגיד|כתבי קודש|ליקוטים יקרים|אור הגנוז לצדיקים|שיח שרפי קדש|אוצר החיים|זוהר חי)/;
const bookCache = {};
async function bookOf(name) {
  name = (name || '').replace(/^ספר\s+/, '').replace(/[,\s]+$/, '').trim();
  if (!name || name.length < 2) return null;
  if (name in bookCache) return bookCache[name];
  let title = BOOK_ALIAS[name] || null;
  if (!title) { const w = name.split(' '); for (let k = w.length; k >= 1 && !title; k--) { const t = HEMAP[hk(w.slice(0, k).join(' '))]; if (t && hk(w.slice(0, k).join(' ')).length >= 3) title = t } }
  if (!title) {
    const w = name.split(' ');
    for (let k = w.length; k >= 1 && !title; k--) {
      const q = w.slice(0, k).join(' '); if (q.length < 3) break;
      const d = await nameApi(q);
      if (d && d.is_ref && d.index && (d.is_book || k === w.length)) { title = d.index; break }
      const comp = d && (d.completions || []).find(c => c.replace(/["״]/g, '') === q.replace(/["״]/g, '') || c.replace(/["״]/g, '').startsWith(q.replace(/["״]/g, '') + ' על '));
      if (comp) { const d2 = await nameApi(comp); if (d2 && d2.is_ref && d2.index) title = d2.index }
    }
  }
  if (title && BOOKS[title] && !BOOK_ALIAS[name]) { // reject loose matches ("רש"י" -> Rashi on Haggai, "תרגום אונקלוס" -> Onkelos Exodus)
    const H = hk(BOOKS[title].he || ''), N = hk(name);
    if (!(H.startsWith(N) && !/ על /.test(H.slice(N.length))) && !N.startsWith(H)) title = null;
  }
  if (NOT_ON_SEFARIA.test(name)) title = null;
  const b = title && BOOKS[title] ? { title, he: BOOKS[title].he, path: BOOKS[title].path } : null;
  return bookCache[name] = b;
}


// ---------- Zohar by volume + daf (Sefaria "Daf" alt structure) ----------
const HEV = c => ({ 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ל': 30, 'מ': 40, 'נ': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'צ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 }[c] || 0);
const heNum = t => { t = String(t).replace(/["'״׳]/g, '').replace(/[ךםןףץ]/g, c => FIN[c]); return /^\d+$/.test(t) ? +t : [...t].reduce((n, c) => n + HEV(c), 0) };
function zoharParse(head) {
  const h = NIK(head).replace(/[״]/g, '"').replace(/[׳]/g, "'").replace(/&[a-z]+;/g, ' ');
  if (!/(?:^|\s)(?:ספר\s+)?ה?(?:זוהר|זהר|זוה"ק)|^ח"[אבג]\s+(?:דף\s+)?[א-ת"']+\s+(?:ע"|עמוד\s+)?[אב]/.test(h)) return null;
  const vm = h.match(/(?:כרך|חלק|ח")\s*([אבג])'?(?=[\s,(]|$)/) || h.match(/^ח"([אבג])/) || h.match(/(?:זוהר|זהר)\s+([אבג])'?(?=[\s,]|$)/);
  const N = `([א-ת]{1,3}["']?[א-ת]?|\\d{1,3})`;
  const m = h.match(new RegExp(`דף\\s+${N}(?:\\s*,?\\s*(?:ע"|עמוד\\s+)([אב]))?`)) || h.match(new RegExp(`(?:^|[\\s,])${N}\\s*,?\\s*(?:ע"|עמוד\\s+)([אב])(?=[\\s,\\-–.']|$)`)) || h.match(new RegExp(`(?:^|[\\s,])${N}\\s+([אב])'?\\s*$`));
  if (!m) return null;
  const daf = heNum(m[1]); if (!daf || daf > 300) return null;
  const pm = h.match(new RegExp(`(?:פרשת|לפרשת)\\s+(${PARASHOT.concat(['לך', 'חיי', 'תשא', 'בחקותי', 'פנחס', 'תבא', 'תצא', 'שלח לך']).sort((a, b) => b.length - a.length).join('|')})(?=[\\s,]|$)`)) || h.match(new RegExp(`(?:זוהר|זהר)\\s+(${PARASHOT.filter(p => !['בראשית', 'שמות', 'ויקרא', 'במדבר', 'דברים'].includes(p)).join('|')})(?=[\\s,]|$)`));
  const cm = h.match(/(?:^|[\s,(])(בראשית|שמות|ויקרא|במדבר|דברים)(?=[\s,)]|$)/);
  const vol = vm ? HEV(vm[1]) : cm ? { 'בראשית': 1, 'שמות': 2, 'ויקרא': 3, 'במדבר': 3, 'דברים': 3 }[cm[1]] : 0;
  return { vol, daf, amud: m[2] === 'ב' ? 1 : 0, par: pm ? pm[1] : null };
}
async function zoharRef(z) {
  const d = await http('https://www.sefaria.org/api/v2/index/Zohar');
  const vols = d && d.alts && d.alts.Daf && d.alts.Daf.nodes; if (!vols) return [];
  const want = (z.daf - 1) * 2 + z.amud; const out = [];
  vols.forEach((v, vi) => {
    if (z.vol && z.vol !== vi + 1) return;
    const leaves = []; const walk = (n, par) => { if (n.refs && n.startingAddress) leaves.push({ n, par }); for (const c of n.nodes || []) walk(c, n.refs ? par : (c.heTitle && !c.refs ? c.heTitle : par || c.heTitle)) };
    for (const c of v.nodes || []) walk(c, c.heTitle);
    for (const { n, par } of leaves) {
      const sa = String(n.startingAddress || '1a').match(/^(\d+)([ab])$/); if (!sa || !n.refs) continue;
      const i = want - ((+sa[1] - 1) * 2 + (sa[2] === 'b' ? 1 : 0)); if (i < 0 || i >= n.refs.length) continue;
      out.push({ ref: n.refs[i], par: par || n.heTitle || '', vol: vi + 1 });
    }
  });
  if (z.par && out.length > 1) { const k = nodeKey(z.par).slice(0, 3); const f = out.filter(o => nodeKey(o.par).startsWith(k)); if (f.length) return f }
  return out;
}
// ---------- Sefat Emet: parasha/holiday + year + piece ----------
const ORD = { 'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6, 'ששי': 6, 'שביעי': 7, 'שמיני': 8, 'תשיעי': 9, 'עשירי': 10 };
const gv = t => S.analyze('x אות ' + t).n ? [...t.replace(/["']/g, '')].reduce((n, c) => n + ({ 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 }[c] || 0), 0) : 0;
const nodeKey = s => NIK(s).replace(/["'״׳,]/g, ' ').replace(/^\s*פרשת\s+/, '').replace(/(\S)[יו]+/g, '$1').replace(/\s+/g, ' ').trim();
const unL = s => s.replace(/(^|\s)ל(?=\S{2})/g, '$1');
const idxCache = {};
async function leafNodes(title) {
  if (title in idxCache) return idxCache[title];
  const d = await http('https://www.sefaria.org/api/v2/index/' + encodeURIComponent(title));
  const out = [];
  const walk = (n, enP, heP) => {
    const en = n.title || n.key, he = n.heTitle || ((n.titles || []).find(t => t.lang === 'he' && t.primary) || {}).text || '';
    const hes = (n.titles || []).filter(t => t.lang === 'he').map(t => t.text);
    const E = enP.concat(en && n !== d.schema ? [en] : []), H = heP.concat(he && n !== d.schema ? [he] : []);
    if (n.nodes) n.nodes.forEach(c => walk(c, E, H)); else if (n !== d.schema) out.push({ en: E.join(', '), he: H, names: hes.length ? hes : [he], depth: n.depth });
  };
  if (d && d.schema) walk(d.schema, [title], []);
  return idxCache[title] = out;
}
const YEAR_RE = /(?:^|[\s,])(?:שנת\s+|שנה\s+)?(ת(?:ר|ריו|רי)?["']?[א-ת]{0,2}["']?[א-ת]?)(?=[\s,\-–]|$)/;
function seYear(rest) {
  const m = rest.match(/(?:^|[\s,])(?:שנת\s+|שנה\s+)?(תר[א-ת"']{0,4}|תר"[א-ת])(?=[\s,\-–]|$)/);
  if (!m) return null; const y = m[1].replace(/["']/g, ''); return y.length >= 2 && y.length <= 4 ? y : null;
}
async function sefatEmet(head, rest, shiurPar) {
  const nodes = await leafNodes('Sefat Emet');
  const r1 = ' ' + nodeKey(rest).replace(/(^|\s)פרשת\s+/g, '$1') + ' ', r2 = unL(r1);
  let best = null;
  for (const n of nodes) for (const nm of n.names) {
    const k = nodeKey(nm); if (!k) continue;
    const isChum = ['בראשית', 'שמות', 'ויקרא', 'במדבר', 'דברים'].includes(nm);
    const has = (hay, key) => hay.includes(' ' + key + ' ');
    let sc = -1;
    if (has(r1, k)) sc = k.length * 2; else if (has(r2, unL(k)) && unL(k).length >= 2) sc = unL(k).length * 2 - 1;
    if (sc < 0) continue; if (isChum) sc -= 20;
    if (!best || sc > best.sc) best = { n, sc };
  }
  // "ספר שמות" style (no parasha) / missing node: fall back to the shiur's own parasha if given
  if (!best && shiurPar) { const k = nodeKey(shiurPar); const n = nodes.find(n => n.names.some(nm => nodeKey(nm) === k)); if (n) best = { n, sc: 0, fromShiur: 1 } }
  if (!best) return null;
  const year = seYear(rest);
  const pm = rest.match(/קטע\s+([א-ת"']{1,6})(?=[\s,]|$)/);
  let piece = pm ? (ORD[pm[1]] || gv(pm[1]) || 0) : 0;
  const t = await textOf(best.n.en); if (!t) return null;
  const node = { ref: t.ref, he: t.he, lv: 2 };
  if (!year) return { ...node, segs: t.segs, fromShiur: best.fromShiur };
  const yk = year.replace(/["']/g, '');
  // first segment of each section is the year
  const secs = {}; for (const s of t.segs) { const m = s.ref.match(/ (\d+):(\d+)$/); if (!m) continue; (secs[m[1]] = secs[m[1]] || []).push(s) }
  const sec = Object.values(secs).find(a => a[0] && NIK(a[0].t).replace(/["'״׳\s.]/g, '') === yk);
  if (!sec) return { ...node, segs: t.segs };
  const body = sec.slice(1).filter(s => !(/^ב"?ה(?=[\s.]|$)/.test(NIK(s.t).replace(/״/g, '"')) && NIK(s.t).length < 20));
  const secRef = sec[0].ref.replace(/:\d+$/, '');
  const he = await textOf(secRef);
  if (piece && body[piece - 1]) { const sg = await textOf(body[piece - 1].ref); return { ref: body[piece - 1].ref, he: sg ? sg.he : body[piece - 1].ref, lv: 3, segs: body, secRef, how: 'ref' } }
  return { ref: secRef, he: he ? he.he : secRef, lv: 3, segs: body, secRef, how: 'ref' };
}

// ---------- Phrase search (quoted text) ----------
function passagePhrases(text, n) {
  const first = S.phrasesFrom(String(text).slice(0, 420), Math.ceil(n / 2));
  const all = S.phrasesFrom(String(text), n);
  return [...new Set(first.concat(all))].slice(0, n);
}
async function byText(passage, book, opts = {}) {
  const phs = passagePhrases(passage, 5); if (!phs.length) return null;
  const votes = {}, meta = {};
  for (const ph of phs) {
    let hits = book ? await search(ph, book.path) : [];
    let filtered = !!book;
    if (!hits.length && !opts.bookOnly) { hits = await search(ph); filtered = false; if (book) hits = hits.filter(h => (h.path || '').startsWith(book.path)).concat(hits.filter(h => !(h.path || '').startsWith(book.path))) }
    if (!hits.length) continue;
    if (!filtered && hits.length > 6) continue; // too common
    hits.slice(0, filtered ? 3 : 4).forEach((h, i) => { votes[h.ref] = (votes[h.ref] || 0) + (i === 0 ? 2 : 1) + (filtered ? 1 : 0); meta[h.ref] = h });
  }
  // nothing inside the named book with exact wording: retry inside the book with loose matching (spelling/abbreviation differences)
  if (book && !Object.values(meta).some(h => (h.path || '').startsWith(book.path))) {
    for (const ph of phs.slice(0, 4)) { const hits = await search(ph, book.path, true); hits.slice(0, 2).forEach((h, i) => { votes[h.ref] = (votes[h.ref] || 0) + (i === 0 ? 3 : 1); meta[h.ref] = h }) }
  }
  const ranked = Object.keys(votes).sort((a, b) => votes[b] - votes[a] || (((meta[b].path || '').startsWith(book ? book.path : '\0')) - ((meta[a].path || '').startsWith(book ? book.path : '\0'))));
  for (const ref of ranked.slice(0, 4)) {
    const h = meta[ref];
    if (opts.noTanakh && /^Tanakh\//.test(h.path || '') ) continue;
    const t = await textOf(ref); if (!t) continue;
    const ov = overlap(passage, t.segs.map(s => s.t).join(' '));
    const inBook = book && (h.path || '').startsWith(book.path);
    if (ov.n >= 6 || ov.r >= 0.3 || (inBook && (ov.n >= 3 || votes[ref] >= 4)) || votes[ref] >= 5) return { ref: t.ref, he: t.he, lv: 3, how: 'text', ov: ov.n, inBook, path: h.path };
  }
  return null;
}

// ---------- One entry ----------
const PARASHOT = 'בראשית|נח|לך לך|וירא|חיי שרה|תולדות|ויצא|וישלח|וישב|מקץ|ויגש|ויחי|שמות|וארא|בא|בשלח|יתרו|משפטים|תרומה|תצוה|כי תשא|ויקהל|פקודי|ויקרא|צו|שמיני|תזריע|מצורע|אחרי מות|קדושים|אמור|בהר|בחקתי|במדבר|נשא|בהעלותך|שלח|קרח|חקת|בלק|פינחס|מטות|מסעי|דברים|ואתחנן|עקב|ראה|שופטים|כי תצא|כי תבוא|נצבים|וילך|האזינו|וזאת הברכה'.split('|');
function prepHead(head) {
  let h = head.replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, to] of ABBR) h = h.replace(re, to);
  const ORDN = { 'ראשון': 'א', 'שני': 'ב', 'שלישי': 'ג', 'רביעי': 'ד', 'חמישי': 'ה', 'שישי': 'ו', 'ששי': 'ו', 'שביעי': 'ז', 'שמיני': 'ח', 'תשיעי': 'ט', 'עשירי': 'י' };
  h = h.replace(/(פרק|שער|מאמר)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|ששי|שביעי|שמיני|תשיעי|עשירי)(?=[\s,]|$)/g, (m, a, b) => a + ' ' + ORDN[b]);
  return h;
}
// generic: parasha / holiday / named-section node of a structured book + optional numbers
function matchNode(nodes, rest) {
  const r1 = ' ' + nodeKey(NIK(rest).replace(/(^|[\s,])(?:פרשת|ספר|הלכות|הל')\s+/g, '$1 ')) + ' ', r2 = unL(r1); let best = null;
  for (const n of nodes) for (const nm of n.names) {
    const k = nodeKey(String(nm).replace(/^(?:ספר|הלכות)\s+/, '')); if (!k) continue;
    let sc = r1.includes(' ' + k + ' ') ? k.length * 2 : (unL(k).length >= 2 && r2.includes(' ' + unL(k) + ' ') ? unL(k).length * 2 - 1 : -1);
    if (sc < 0) continue;
    if (['בראשית', 'שמות', 'ויקרא', 'במדבר', 'דברים'].includes(nm)) sc -= 20;
    sc += n.he.slice(0, -1).filter(p => r1.includes(' ' + nodeKey(p) + ' ')).length * 3; // parent names present too
    if (!best || sc > best.sc) best = { n, sc, k };
  }
  return best;
}
const NUMT = `([א-ת]{1,3}["']?[א-ת]?|\\d{1,3})`;
const okNum = t => { const v = heNum(t); return v > 0 && v < 1000 && String(t).replace(/["']/g, '').length <= 4 };
function numsOf(rest) {
  const two = rest.match(new RegExp(`(?:פרק|סימן|שער|מאמר|הלכה)\\s+${NUMT}\\s*,?\\s*(?:אות|הלכה|משנה|סעיף|ס"ק|פסקה)\\s+${NUMT}(?=[\\s,.:;)]|$)`));
  if (two && okNum(two[1]) && okNum(two[2])) return [heNum(two[1]), heNum(two[2])];
  const one = rest.match(new RegExp(`(?:^|[\\s,])(?:אות|סימן|סי'|פרק|תורה|הלכה|מאמר|פסקה|ס"ק|סעיף|משנה|שיחה|מעשה)\\s+${NUMT}(?=[\\s,.:;)]|$)`));
  if (one && okNum(one[1])) return [heNum(one[1])];
  const tail = rest.match(new RegExp(`(?:^|\\s)${NUMT}\\s*$`)); if (tail && okNum(tail[1]) && /["']/.test(tail[1]) ) return [heNum(tail[1])];
  return [];
}
async function nodeResolve(book, head) {
  const nodes = await leafNodes(book.title); if (nodes.length < 2) return null;
  const rest = head.replace(/^(?:ספר\s+)?/, '');
  const m = matchNode(nodes, rest); if (!m) return null;
  const after = nodeKey(rest).split(m.k).slice(1).join(' ') || rest;
  const nums = numsOf(after.length > 1 ? rest : rest);
  if (nums.length) { const t = await textOf(`${m.n.en} ${nums.join(':')}`); if (t && t.segs.some(x => x.t)) return { ref: t.ref, he: t.he, lv: 3, how: 'ref' } }
  const t = await textOf(m.n.en); if (!t) return null;
  return { ref: t.ref, he: t.he, lv: 2, how: 'section', segs: t.segs };
}
const simplify = h => h.replace(/(?:^|\s)מסכת\s+/g, ' ').replace(/(?:^|\s)(?:פרשה|פר')\s+(?=[א-ת]{1,3}["']?[א-ת]?(?:[\s,]|$))/g, ' ').replace(/פרק\s+([א-ת]{1,3}["']?[א-ת]?)\s*,?\s*(?:משנה|הלכה|אות)\s+([א-ת]{1,3}["']?[א-ת]?)/, '$1:$2').replace(/^משנה\s*,\s*/, 'משנה ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
const hk = s => NIK(s).replace(/["'״׳]/g, '').replace(/^ספר\s+/, '').replace(/(^|\s)ה(?=\S{3})/g, '$1').replace(/[יו]/g, '').replace(/\s+/g, ' ').trim();
const GENERIC = new Set(['ספר', 'פרשת', 'פרשה', 'דף', 'קטע', 'אות', 'פרק', 'רבי', 'הרב', 'סימן', 'חלק', 'עמוד', 'עמ', 'שם', 'על', 'התורה', 'תרה', 'ספרי', 'ריש', 'סוף', 'בסופו', 'ליקוטים', 'לקטים', 'מאמר', 'שער', 'הלכה', 'לכה']);
function crossBook(found, a) { // is the found text in a different book than the one the entry names?
  if (!a.book || S.candidates(a.head || '').length) return false;
  const F = hk(String(found || '').split(/\s+\S*\d|[׳״]/)[0]);
  const Bw = hk(a.book).split(' ').filter(w => w.length >= 3 && !GENERIC.has(w) && !/^תר/.test(w) && !PARASHOT.map(hk).includes(w));
  return Bw.length > 0 && !Bw.some(w => F.includes(w));
}

function commTitle(heName, bookEn) { // "בעל הטורים" + Exodus -> "Kitzur Ba'al HaTurim on Exodus"
  const k = hk(heName); let best = null;
  for (const [t, b] of Object.entries(BOOKS)) if (t.endsWith(' on ' + bookEn) && hk(b.he || '').includes(k) && (!best || t.length < best.length)) best = t;
  return best;
}
async function resolveEntry(e, ctx) {
  let head = prepHead(e.head);
  // Bar-Ilan style "רמב"ן במדבר פרשת בהעלותך פרק ט פסוק יט" / "בראשית רבה וילנא פרשת לך לך פרשה מז": the parasha is redundant
  if (/^(?:\S+\s+){0,3}(?:בראשית|שמות|ויקרא|במדבר|דברים)(?:\s+רבה)?\s+(?:וילנא\s+)?פרשת\s/.test(head)) head = head.replace(/\s+וילנא(?=\s)/, '').replace(/\s+פרשת\s+[א-ת"' ]+?(?=\s+(?:פרק|פרשה)\s)/, '');
  const a = S.analyze(head); a.head = head;
  let book = a.book ? await bookOf(a.book) : null;
  // Sefat Emet in translation: "פרשת ואתחנן תרל"ג קטע ב", "חנוכה תרמ"ב" (year of the Sefat Emet, no book name)
  const yr = (head.match(/(?:^|\s)(תר[א-ת"']{1,4})(?=[\s,]|$)/) || [])[1];
  const seLike = !!yr && okNum(yr) && /^תר/.test(yr) && (/קטע/.test(head) || /^(?:פרשת\s+)?(?:\S+\s+){0,2}תר/.test(head));
  if ((!book || !hk(head).includes(hk(book.he || '').split(' ')[0]) || /^(?:פרשת|ראש השנה|חנוכה|פורים|פסח|שבועות|סוכות)/.test(head)) && seLike && !/^(?:ספר\s+)?(?:שפת אמת)/.test(head) && (!book || !/[א-ת]{1,3}\s+ע"[אב]/.test(head))) book = await bookOf('שפת אמת');
  if (book) ctx.books.add(book.title);
  const passage = (e.text || '').trim();
  const longHeadPassage = !book && head.split(' ').length >= 6 && !/[0-9]/.test(head) ? head : '';
  let struct = null, alt = null;
  if (book && book.title === 'Sefat Emet') struct = await sefatEmet(head, head.replace(/^(?:ספר\s+)?שפת אמת[,\s]*/, ''), ctx.par);
  if (!struct && (!book || book.title === 'Zohar')) {
    const z = zoharParse(head);
    if (z) {
      const cands = await zoharRef(z);
      if (cands.length > 1 && cands.every(c => c.par === cands[0].par && c.vol === cands[0].vol)) cands.splice(1);
      if (cands.length === 1) { const t = await textOf(cands[0].ref); if (t) struct = { ref: t.ref, he: t.he, lv: 3, how: 'ref' } }
      else if (cands.length > 1 && passage) { let bestc = null; for (const c of cands) { const t = await textOf(c.ref); if (!t) continue; const o = overlap(passage, t.segs.map(x => x.t).join(' ')).n; if (!bestc || o > bestc.o) bestc = { o, ref: t.ref, he: t.he } } if (bestc && bestc.o >= 3) struct = { ref: bestc.ref, he: bestc.he, lv: 3, how: 'ref' } }
      if (struct && !book) book = await bookOf('זוהר');
    }
  }
  // "רש"י, שם" / "רמב"ן שם פס' טז": ibid = the last Tanakh chapter cited in this sheet
  const CE = { 'רש"י': 'Rashi', 'רמב"ן': 'Ramban', 'אבן עזרא': 'Ibn Ezra', 'ספורנו': 'Sforno', 'אור החיים': 'Or HaChaim', 'כלי יקר': 'Kli Yakar', 'רשב"ם': 'Rashbam', 'בעל הטורים': 'Baal HaTurim', 'דעת זקנים': 'Daat Zkenim', 'העמק דבר': 'Haamek Davar', 'מלבי"ם': 'Malbim', 'רד"ק': 'Radak' };
  if (!struct) {
    const ib = head.match(/^(רש"י|רמב"ן|אבן עזרא|ספורנו|אור החיים|כלי יקר|רשב"ם|בעל הטורים|דעת זקנים|העמק דבר|מלבי"ם|רד"ק)\s*,?\s+שם(?:\s*,?\s*(?:פס(?:וק|')?\s+)?([א-ת]{1,3}["']?[א-ת]?|\d{1,3}))?\s*$/);
    if (ib && ctx.lastTk) { const q = `${commTitle(ib[1], ctx.lastTk.book) || CE[ib[1]] + ' on ' + ctx.lastTk.book} ${ctx.lastTk.ch}${ib[2] ? ':' + heNum(ib[2]) : (ctx.lastTk.v ? ':' + ctx.lastTk.v : '')}`; const t = await textOf(q); if (t && t.segs.some(x => x.t)) struct = { ref: t.ref, he: t.he, lv: 3, how: 'ref' } }
  }
  // commentator + book + chapter without verse ("רד"ק ירמיהו פרק ב")
  if (!struct) {
    const cm = head.match(/^(רש"י|רמב"ן|אבן עזרא|ספורנו|אור החיים|כלי יקר|רשב"ם|בעל הטורים|דעת זקנים|העמק דבר|מלבי"ם|רד"ק)\s*,?\s+(?:על\s+)?(?:ספר\s+)?([א-ת' ]+?)\s*,?\s+(?:פרק\s+)?([א-ת]{1,3}["']?[א-ת]?|\d{1,3})(?:\s*[,:]?\s*(?:פסוק\s+|פס'\s*)?([א-ת]{1,3}["']?[א-ת]?|\d{1,3}))?(?:\s*[-–].*)?\s*$/);
    if (cm && okNum(cm[3])) { const d = await nameApi(cm[2].trim()); if (d && d.is_book && d.index && BOOKS[d.index] && /^Tanakh\//.test(BOOKS[d.index].path)) { const v = cm[4] && okNum(cm[4]) ? ':' + heNum(cm[4]) : ''; const t = await textOf(`${commTitle(cm[1], d.index) || CE[cm[1]] + ' on ' + d.index} ${heNum(cm[3])}${v}`); if (t && t.segs.some(x => x.t)) struct = { ref: t.ref, he: t.he, lv: 3, how: 'ref' } } }
  }
  // Talmud commentators on a daf: "תוס', בבא בתרא ב ע"א, ד"ה …" / "רש"י מסכת סנהדרין דף צז עמוד ב"
  if (!struct) {
    const TC = { "תוס'": 'תוספות', 'תוספות': 'תוספות', "תוס' ישנים": 'תוספות ישנים', 'תוספות ישנים': 'תוספות ישנים', 'רש"י': 'רש"י', 'רשב"ם': 'רשב"ם', 'ר"ן': 'ר"ן', 'ריטב"א': 'ריטב"א', 'חידושי הריטב"א': 'ריטב"א', 'רשב"א': 'רשב"א', 'חידושי הרשב"א': 'רשב"א', 'רמב"ן': 'רמב"ן', 'חידושי הרמב"ן': 'רמב"ן', 'מאירי': 'מאירי', 'רבינו חננאל': 'רבינו חננאל' };
    const km = head.match(new RegExp(`^(${Object.keys(TC).sort((x, y) => y.length - x.length).join('|')})\\s*,?\\s*(?:על\\s+)?(?:מסכת\\s+|מס'\\s*)?(.*)$`));
    const tms = [];
    if (km) { const w = km[2].replace(/,/g, ' ').split(/\s+/).filter(Boolean); for (let k = 1; k <= 3 && k < w.length; k++) { let r = w.slice(k); if (r[0] === 'דף') r = r.slice(1); if (r[0] && okNum(r[0])) { const sm = (r.slice(1, 3).join(' ').match(/^(?:ע(?:מוד\s+|"|')?\s*([אב]))/) || []); tms.push([null, km[1], w.slice(0, k).join(' '), r[0], sm[1]]) } } }
    for (const tm of tms) {
      if (struct) break;
    if (tm && okNum(tm[3])) {
      const d = await nameApi(tm[2].trim());
      if (d && d.is_book && d.index && BOOKS[d.index] && /^Talmud\/Bavli/.test(BOOKS[d.index].path)) {
        const want = hk(TC[tm[1]]); const ct = Object.entries(BOOKS).filter(([t, b]) => t.endsWith(' on ' + d.index) && hk(b.he || '').startsWith(want)).sort((x, y) => x[0].length - y[0].length)[0];
        const daf = heNum(tm[3]) + (tm[4] === 'ב' ? 'b' : 'a');
        if (ct) { const t = await textOf(`${ct[0]} ${daf}`); if (t && t.segs.some(x => x.t)) struct = { ref: t.ref, he: t.he, lv: tm[4] ? 3 : 2, how: 'ref' } }
      }
    }
  }
  }
  // Rambam: "רמב"ם, הלכות עבודה זרה, פרק א (הלכה ב)"
  if (!struct) {
    const rm = head.match(/^(?:ה?רמב"ם|משנה תורה)\s*,?\s*(?:ספר\s+\S+\s*,?\s*)?(?:הלכות|הל')\s+([^,]+?)\s*,?\s*(?:פרק|פ')\s*([א-ת]{1,3}["']?[א-ת]?|\d{1,3})(?:\s*,?\s*(?:הלכה|ה')\s*([א-ת]{1,3}["']?[א-ת]?|\d{1,3}))?/);
    if (rm && okNum(rm[2])) {
      const want = hk('הלכות ' + rm[1]);
      const cand = Object.entries(BOOKS).filter(([t, b]) => /^Mishneh Torah, /.test(t) && hk((b.he || '').replace(/^משנה תורה,\s*/, '')).startsWith(want)).sort((x, y) => x[1].he.length - y[1].he.length)[0];
      if (cand) { const t = await textOf(`${cand[0]} ${heNum(rm[2])}${rm[3] && okNum(rm[3]) ? ':' + heNum(rm[3]) : ''}`); if (t && t.segs.some(x => x.t)) struct = { ref: t.ref, he: t.he, lv: 3, how: 'ref' } }
    }
  }
  if (!struct) {
    let r = await S.resolveListed(head);
    if (!(r && r.url && r.level >= 3)) { const sh = simplify(head); if (sh !== head) { const r2 = await S.resolveListed(sh); if (r2 && r2.url && (!r || !r.url || r2.level > r.level)) r = r2 } }
    if (!(r && r.url && r.level >= 2)) { const d = await nameApi(simplify(head)); if (d && d.is_ref && d.url && d.index && /\d/.test(d.ref || '') && (book ? d.index === book.title : hk(simplify(head)).replace(/^(?:תלמד בבלי|מסכת|משנה)\s+/, '').startsWith(hk((BOOKS[d.index] || {}).he || '\0').replace(/^(?:משנה)\s+/, '')))) r = { url: d.url, ref: d.ref, he: d.ref, level: /\d+:\d+$|\d[ab]$/.test(d.ref) ? 3 : 2 } }
    if (r && r.url && r.level >= 1) {
      const ref = r.ref || (await textOf(r.url.replace(/_/g, ' ')) || {}).ref || null;
      let lv = r.level;
      if (lv < 3 && ref && /\d+:\d+$|\d[ab]$/.test(ref) && !/-/.test(ref)) lv = 3;           // already a precise ref
      if (lv === 1 && ref && /\d/.test(ref)) lv = 2;                                        // chapter / parasha range
      struct = { url: r.url, ref, he: r.he || r.book, lv, how: 'ref' };
    }
  }
  // "חלק א' פרק נ"ד" (Guide for the Perplexed, Kuzari-like part/chapter books)
  if (book && (!struct || struct.lv < 3)) {
    const pc = head.match(/(?:חלק|ח")\s*([א-ד])'?\s*,?\s*(?:פרק|פ')\s*([א-ת]{1,3}["']?[א-ת]?|\d{1,3})(?=[\s,.]|$)/);
    if (pc && okNum(pc[2])) for (const q of [`${book.title} ${heNum(pc[1])}:${heNum(pc[2])}`, `${book.title}, Part ${heNum(pc[1])} ${heNum(pc[2])}`, `${book.title}, Part ${['I', 'II', 'III', 'IV'][heNum(pc[1]) - 1]} ${heNum(pc[2])}`]) { const t = await textOf(q); if (t && t.segs.some(x => x.t)) { struct = { ref: t.ref, he: t.he, lv: 3, how: 'ref' }; break } }
  }
  if (book && (!struct || struct.lv < 3)) { const n = await nodeResolve(book, head); if (n && (!struct || n.lv > struct.lv)) struct = n }
  if (struct && struct.he && !/[א-ת]/.test(struct.he) && struct.ref) { const t = await textOf(struct.ref); if (t && t.he) struct.he = t.he }
  if (struct && struct.lv === 2) alt = { u: urlOf(struct.ref || struct.url), he: struct.he };
  // verify structural exact refs against the quoted text when we have one
  let txt = null;
  const P = passage.split(/\s+/).length >= 8 ? passage : longHeadPassage;
  if (P) {
    if (struct && struct.lv >= 3 && struct.ref) {
      const t = await textOf(struct.ref); const ov = t ? overlap(P, t.segs.map(s => s.t).join(' ')) : { n: 0, r: 0 };
      if (t && (ov.n >= 3 || ov.r >= 0.2)) {
        if (t.segs.length > 1) { const b = t.segs.map(s => ({ s, o: overlap(P, s.t).n })).sort((x, y) => y.o - x.o)[0]; if (b && b.o >= 4 && b.o >= ov.n * 0.6) { const sg = await textOf(b.s.ref); if (sg) return pack({ ref: sg.ref, he: sg.he, lv: 3 }, 'ref+text') } }
        return pack(struct, 'ref+text');
      }
      struct.unverified = 1;
      if (struct.segs && struct.secRef) { const best = struct.segs.map(s => ({ s, o: overlap(P, s.t).n })).sort((x, y) => y.o - x.o)[0]; if (best && best.o >= 3) { const sg = await textOf(best.s.ref); return pack({ ref: best.s.ref, he: sg ? sg.he : best.s.ref, lv: 3 }, 'ref+text') } }
    }
    if (struct && struct.segs && !struct.secRef) { // parasha/section known, no exact number: locate the passage inside it
      const best = struct.segs.map(s => ({ s, o: overlap(P, s.t).n })).sort((x, y) => y.o - x.o)[0];
      if (best && best.o >= 4) { const sg = await textOf(best.s.ref); return pack({ ref: best.s.ref, he: sg ? sg.he : best.s.ref, lv: 3 }, 'text') }
    }
    txt = await byText(P, book, { noTanakh: !!book && !/^Tanakh\//.test(book.path) });
    if (txt) txt.x = crossBook(txt.he, a) ? 1 : 0;
    // the passage found elsewhere in the same book beats a structural guess; an explicit ref in another book does not
    if (txt && (!struct || struct.lv < 3 || (txt.inBook && (txt.ov >= 8 || struct.unverified)))) { if (txt.x && alt) txt.alt = alt; return pack(txt, 'text') }
  }
  if (struct && struct.lv >= 3) return pack(struct, 'ref');
  if (txt) return pack(txt, 'text');
  if (struct && !(struct.fromShiur && struct.lv < 3)) return pack(struct, struct.lv >= 2 ? 'section' : 'book');
  if (book) return pack({ ref: book.title, he: book.he, lv: 1 }, 'book');
  // not on Sefaria: try Wikisource with the quoted text
  if (P) for (const ph of S.phrasesFrom(P, 2)) { const ws = await wsSearch(ph); if (ws.length) return { u: 'https://he.wikisource.org/wiki/' + encodeURIComponent(ws[0].replace(/ /g, '_')), he: ws[0], lv: 3, how: 'wikisource' } }
  return null;
}
function noteTk(ctx, r) { const m = r && r.u && r.u.match(/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I_Samuel|II_Samuel|I_Kings|II_Kings|Isaiah|Jeremiah|Ezekiel|Psalms|Proverbs|Job|Esther|Ruth|Song_of_Songs|Lamentations|Ecclesiastes|Daniel|Ezra|Nehemiah|Hosea|Jonah|Micah|Habakkuk|Zechariah|Malachi)\.(\d+)(?:\.(\d+))?/); if (m) ctx.lastTk = { book: m[1].replace(/_/g, ' '), ch: m[2], v: m[3] || null } }
function pack(r, how) {
  const ref = r.ref || null; const u = r.url || (ref ? urlOf(ref) : null);
  if (!u) return null;
  const o = { u, he: r.he || ref, lv: r.lv, how };
  if (r.x) o.x = 1; // the passage was found quoted in another book (the named book is not on Sefaria / not found there)
  if (r.alt) o.alt = r.alt;
  return o;
}

// ---------- Main ----------
module.exports = { resolveEntry, zoharParse, zoharRef, bookOf, loadToc, saveCache };
if (require.main === module) (async () => {
  await loadToc();
  let store = { version: VERSION, items: {} }; try { const o = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (o.version === VERSION) store = o } catch (e) { }
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'index.json'), 'utf8'));
  const parOf = {}; const PL = idx.parashot || [];
  for (const s of idx.shiurim || []) if (s.par && s.par.length) { const p = PL[s.par[0]]; parOf[s.c] = typeof p === 'string' ? p : (p && (p.he || p.name || p.title)) || null }
  const files = fs.readdirSync(CONTENT).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(c => !ONLY || ONLY.has(c));
  let done = 0, newE = 0;
  const jobs = [];
  for (const c of files) {
    const d = JSON.parse(fs.readFileSync(path.join(CONTENT, c + '.json'), 'utf8'));
    const ents = S.listedEntries(d.html || '', (d.trSources || []).filter(Boolean));
    { const have = new Set(ents.map(e => e.head)); for (const e of d.srcFound || []) if (e.head && !have.has(e.head)) { have.add(e.head); ents.push({ raw: e.raw || e.head, head: e.head, from: e.from, text: e.text || '' }) } }  // on-demand finds (importers/srcreq.js)
    if (!ents.length) { delete store.items[c]; continue }
    const have = store.items[c] || {};
    const todo = ents.filter(e => ALL || !(e.head in have));
    if (!todo.length) continue;
    jobs.push({ c, ents, todo, have });
  }
  console.log(`shiurim with sources: ${jobs.length} to process`);
  const POOL = 3; let ji = 0;
  async function worker() {
    while (ji < jobs.length && newE < LIMIT && Date.now() < DEADLINE) {
      const j = jobs[ji++]; const ctx = { books: new Set(), par: parOf[j.c] || null };
      const res = ALL ? {} : { ...j.have };
      for (const e of j.ents) { if (!ALL && e.head in res) { continue } try { const r = await resolveEntry(e, ctx); res[e.head] = r || { lv: 0 }; noteTk(ctx, r) } catch (x) { console.error('ERR', j.c, e.head, x.message); res[e.head] = { lv: 0 } } newE++ }
      // drop entries the app no longer lists
      const keep = new Set(j.ents.map(e => e.head)); for (const k of Object.keys(res)) if (!keep.has(k)) delete res[k];
      store.items[j.c] = res; done++;
      if (done % 10 === 0) { fs.writeFileSync(OUT, JSON.stringify(store)); saveCache(); console.log(`${done}/${jobs.length} shiurim, ${newE} entries`) }
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));
  const sorted = {}; for (const k of Object.keys(store.items).sort()) sorted[k] = store.items[k];
  store.items = sorted; fs.writeFileSync(OUT, JSON.stringify(store, null, 0)); saveCache();
  // patch the already-built content files so this deploy has the links without a second build
  let patched = 0;
  for (const [c, v] of Object.entries(store.items)) {
    const fp = path.join(CONTENT, c + '.json'); if (!fs.existsSync(fp)) continue;
    const d = JSON.parse(fs.readFileSync(fp, 'utf8')); if (JSON.stringify(d.srcRes || null) === JSON.stringify(v)) continue;
    d.srcRes = v; fs.writeFileSync(fp, JSON.stringify(d)); patched++;
  }
  console.log(`patched ${patched} content files`);
  const all = Object.values(store.items).flatMap(o => Object.values(o));
  const ex = all.filter(x => x.lv >= 3).length, bk = all.filter(x => x.lv >= 1).length;
  console.log(`done: ${done} shiurim; entries ${all.length}: exact ${ex}, at least book ${bk}, unresolved ${all.length - bk}`);
})();
