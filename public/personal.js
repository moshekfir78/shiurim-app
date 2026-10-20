'use strict';
/* Personal transcription: the user's own Gemini key (stored ONLY in this browser's localStorage, sent only to Google's
   Gemini API). Results are stored on the device (IndexedDB 'shiurim-ptr') and synced to the user's own Drive (sync.js,
   one file per shiur in appDataFolder). A personal transcript takes precedence over the public one. */
(() => {
const KEYK = 'gemini_key_personal', API = 'https://generativelanguage.googleapis.com';
const LABEL = 'Gemini · אישי (נשמר בדרייב שלך)';
const cleanKey = v => (String(v || '').match(/AIza[0-9A-Za-z_\-]{30,}|AQ\.[0-9A-Za-z_.\-]{20,}/) || [String(v || '').replace(/[^0-9A-Za-z_.\-]/g, '')])[0];
const key = () => cleanKey(localStorage.getItem(KEYK));
// ---------- transcript cleanup (same rules as tr_clean.py): stutters, filler sounds, needless repetition ----------
const trClean = (() => {
  const KEEP = new Set(['לך לך', 'קדוש קדוש', 'קדוש קדוש קדוש', 'צדק צדק', 'אברהם אברהם', 'משה משה', 'יעקב יעקב', 'שמואל שמואל',
    'נחמו נחמו', 'עורי עורי', 'אלי אלי', "ה' ה'", 'ה׳ ה׳', 'אבי אבי', 'בני בני', 'ארץ ארץ', 'ארץ ארץ ארץ', 'שלום שלום',
    'איש איש', 'שנים שנים', 'שניים שניים', 'שבעה שבעה', 'מעט מעט', 'לאט לאט', 'אט אט', 'מאד מאד', 'מאוד מאוד',
    'סוף סוף', 'בין בין', 'צעד צעד', 'אחד אחד', 'יום יום', 'שנה שנה', 'דור דור', 'טיפה טיפה', 'קמעא קמעא',
    'עמוק עמוק', 'עמק עמק', 'רע רע', 'הוי הוי', 'אמן אמן', 'שבוע שבוע', 'חודש חודש', 'פעם פעם', 'למעלה למעלה',
    'מטה מטה', 'יחד יחד', 'זוג זוג', 'איי איי איי', 'אוי אוי אוי', 'נורא נורא', 'המון המון', 'ממש ממש', 'הרבה הרבה',
    'אותו אותו', 'אותה אותה', 'אותם אותם', 'אותן אותן']);
  const FILLER = /^(?:א+ה+|א+מ+|ה+מ+|מ{2,}|אה+מ+|אֶה)$/, PUNCT = '.,;:!?()[]{}…–—"״«»-*', QCH = '"״«»“”';
  const STUTTER = /(?<![\p{L}\p{N}_\-־])(([א-ת])-(?:\2-)*)(?=\2[א-ת])|(?<![\p{L}\p{N}_\-־])(([א-ת]{2,4})-(?:\4-)+)(?=\4[א-ת])/gu;
  const strip = (s, ch) => { let a = 0, b = s.length; while (a < b && ch.includes(s[a])) a++; while (b > a && ch.includes(s[b - 1])) b--; return s.slice(a, b) };
  const lstrip = (s, ch) => { let a = 0; while (a < s.length && ch.includes(s[a])) a++; return s.slice(a) };
  const core = t => strip(t, PUNCT + '“”').replace(/[\u0591-\u05C7]/g, '');
  const tail = t => { const c = core(t); return c ? t.slice(t.lastIndexOf(c) + c.length) : t };
  const rstripP = s => { let b = s.length; while (b && '.,;:!?)…'.includes(s[b - 1])) b--; return s.slice(0, b) };
  const quoted = toks => { const m = []; let inq = false;
    for (const t of toks) { const start = QCH.includes(t[0] || '\0') || ['("', '(״'].includes(t.slice(0, 2));
      const end = /["״»”][.,;:!?)\]…]*$/.test(t) && core(t).length > 0 && !/[א-ת]["״][א-ת]$/.test(rstripP(t));
      if (start) inq = true; m.push(inq); if (end && inq && !(start && t.length < 2)) inq = false }
    return m };
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function once(t) {
    if (!t || !t.trim()) return t;
    if (t.trimStart().startsWith('>')) return t;
    const t2 = t.replace(STUTTER, '');
    let toks = t2.split(' ').filter(x => x !== ''); let q = quoted(toks); const out = [];
    toks.forEach((tok, i) => { const c = core(tok), nxt = i + 1 < toks.length ? core(toks[i + 1]) : '', last = tok.trimEnd().slice(-1);
      if (c && FILLER.test(c) && !q[i] && !tok.includes('*') && !(last && '!?'.includes(last)) && !(c === 'אהה' && (nxt.startsWith('ה') || nxt.startsWith('אד') || nxt.startsWith('אל')))) {
        if (last && '.:'.includes(last) && out.length && !'.?!:,'.includes(out[out.length - 1].slice(-1) || '\0')) out[out.length - 1] += last;
        return }
      out.push(tok) });
    toks = out; let changed = true;
    while (changed) { changed = false;
      for (const n of [1, 2, 3, 4]) { q = quoted(toks); let i = 0; const res = [];
        while (i < toks.length) {
          const ph = toks.slice(i, i + n).map(core);
          if (ph.length === n && ph.every(Boolean) && !q.slice(i, i + 2 * n).some(Boolean) && !toks.slice(i, i + 2 * n).some(x => x.includes('*'))) {
            const inner = k => toks.slice(k, k + n - 1).every(x => tail(x) === '' && !(QCH + '([').includes(x[0]));
            let j = i + n, reps = 1; const seps = [];
            while (inner(i) && eq(toks.slice(j, j + n).map(core), ph) && inner(j) && !q.slice(j, j + n).some(Boolean) && !toks.slice(j, j + n).some(x => x.includes('*'))
                   && /^(?:[,…\-–—]*|\.\.\.)$/.test(tail(toks[j - 1])) && !(QCH + '([').includes(toks[j][0])) { seps.push(tail(toks[j - 1])); j += n; reps++ }
            const rep = k => Array(k).fill(ph).flat().join(' ');
            let ok = reps > 1 && !KEEP.has(rep(reps)) && !KEEP.has(rep(2)) && !(n === 1 && /^\d+$/.test(ph[0]));
            if (ok && n === 1 && reps === 2 && seps.some(Boolean)) ok = false;
            if (ok && n > 1 && new Set(ph).size === 1) ok = false;
            if (ok && ph[0].startsWith('ו') && i >= n) { const prev = toks.slice(i - n, i).map(core); if (eq(prev, [ph[0].slice(1), ...ph.slice(1)]) || eq(prev, ph)) ok = false }
            if (ok && n === 1 && ph[0].length === 1) ok = false;
            if (ok && n > 1) { const win = toks.slice(Math.max(0, i - n), i + n).map(core); if (ph.some(x => x.startsWith('ו') && win.includes(x.slice(1)))) ok = false }
            if (reps > 1 && !ok) { res.push(...toks.slice(i, j)); i = j; continue }
            if (ok) { const first = toks[i], last = toks.slice(j - n, j), lead = first.slice(0, first.length - lstrip(first, PUNCT).length);
              res.push(lead + lstrip(last[0], PUNCT), ...last.slice(1)); i = j; changed = true; continue }
          }
          res.push(toks[i]); i++ }
        toks = res } }
    while (toks.length && !core(toks[0]) && /^[.,;:…]+$/.test(toks[0])) toks.shift();
    toks = toks.filter((x, k) => !(k && /^[.,;:]+$/.test(x) && /[.,;:?!…]$/.test(toks[k - 1])));
    const s = toks.join(' ');
    if (s === t.trim() && t2 === t) return t;
    return s.replace(/ {2,}/g, ' ').trim();
  }
  const text = t => { for (let k = 0; k < 4; k++) { const c = once(t); if (c === t) return t; t = c } return t };
  const segs = a => { const o = (a || []).map(g => ({ ...g, t: text(g.t || '') })); const f = o.filter(g => (g.t || '').trim()); return f.length ? f : o };
  return { text, segs };
})();
// ---------- IndexedDB ----------
const db = () => new Promise((ok, no) => { const r = indexedDB.open('shiurim-ptr', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('ptr', { keyPath: 'uid' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) });
const tx = async (mode, f) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction('ptr', mode); const q = f(t.objectStore('ptr')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error) }) };
const get = uid => tx('readonly', st => st.get(uid)), all = () => tx('readonly', st => st.getAll());
const put = (rec, fromSync) => tx('readwrite', st => st.put(rec)).then(() => { if (!fromSync) window.dispatchEvent(new Event('ptr-changed')) });
// content json with the personal transcript (if any) taking precedence
async function content(s) {
  const c = await fetch('data/content/' + s.c + '.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({}));
  const p = await get(s.uid).catch(() => null);
  if (c.transcript) c.transcript = trClean.segs(c.transcript);
  if (p && p.segments && p.segments.length) Object.assign(c, { transcript: trClean.segs(p.segments), trSources: p.sources || [], trStories: p.stories || [],
    trSource: LABEL, trModel: p.model, trMode: 'personal', trRaw: false, personal: true, trAt: p.at ? new Date(p.at).toISOString() : null, publicTranscript: c.transcript || null });
  return c;
}
// ---------- prompt + output parsing (same as the worker) ----------
let PROMPT = null, MODELS = null;
const prompt = async ref => (PROMPT = PROMPT || await fetch('data/prompt_he.txt').then(r => r.text())).replace('{referenceText}', ref);
const models = async () => MODELS = MODELS || await fetch('data/gemini_models.json').then(r => r.json()).catch(() => [['gemini-3.8-flash', false], ['gemini-3-flash-preview', false], ['gemini-flash-latest', false]]);
function split3(text) {
  const sec = { tr: [], src: [], st: [] }; let cur = 'tr';
  for (const ln of text.split('\n')) { const h = ln.trim().replace(/^#+/, '').trim();
    if (ln.trim().startsWith('#')) { cur = h.includes('סיפור') ? 'st' : h.includes('מקורות') ? 'src' : h.startsWith('תמלול') ? 'tr' : cur; continue }
    sec[cur].push(ln) }
  const cl = l => l.replace(/^\s*(?:[-•]|\*(?!\*))\s*/, '').replace(/\*\*/g, '').trim();
  const L = a => a.map(cl).filter(x => x && x !== 'אין');
  return [sec.tr.join('\n'), L(sec.src), L(sec.st)];
}
const TS = /^\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*/;
function parse(text, offset = 0, span = 0) {
  const out = []; const total = Math.max(1, text.length); let pos = 0; const anyts = TS.test(text.trimStart().slice(0, 20));
  for (let para of text.split(/\n\s*\n|\n/)) { para = para.trim(); if (!para) continue;
    const m = para.match(TS); let s = offset + (span && !anyts ? span * pos / total : 0); pos += para.length + 1;
    if (m) { const [a, b, c] = [m[1], m[2], m[3]]; s = offset + (c ? +a * 3600 + +b * 60 + +c : +a * 60 + +b); para = para.slice(m[0].length).trim() }
    else if (out.length && anyts) s = out[out.length - 1].s;
    if (para) out.push({ s: Math.round(s * 10) / 10, t: para }) }
  return out;
}
// ---------- Gemini REST ----------
class Busy extends Error {}
async function req(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { 'x-goog-api-key': key(), ...(opt.headers || {}) } });
  if (!r.ok) { const t = await r.text().catch(() => ''); const e = new Error(`Gemini ${r.status}: ${t.slice(0, 160)}`); e.status = r.status; throw e }
  return r;
}
async function generate(part, ref, onStep) {
  const txt = await prompt(ref.slice(0, 8000)), errs = [];
  for (const [m, search] of await models()) {
    onStep && onStep(m);
    const body = { contents: [{ parts: [part, { text: txt }] }], generationConfig: { temperature: 0, maxOutputTokens: 65536 } };
    if (search) body.tools = [{ google_search: {} }];
    try {
      const j = await (await req(`${API}/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      const out = ((j.candidates || [])[0] || {}).content; const t = out ? out.parts.filter(p => !p.thought).map(p => p.text || '').join('') : '';
      if (t.trim()) return { text: t, model: m + (search ? ' +search' : '') };
      errs.push(m + ':empty');
    } catch (e) { if (e.status === 400 && /API key/i.test(e.message)) throw new Error('מפתח Gemini לא תקין'); if (e.status === 403) throw new Error('המפתח חסום לשימוש הזה (403)'); errs.push(m + ':' + (e.status || 'net')) }
  }
  if (errs.every(e => /:(429|503|500|404|empty)$/.test(e))) throw new Busy('כל המודלים החינמיים של Gemini עמוסים או שהמכסה היומית נגמרה. נסו שוב מאוחר יותר.');
  throw new Error('Gemini: ' + errs.join(', '));
}
async function upload(blob, mime) {
  const r = await req(`${API}/upload/v1beta/files`, { method: 'POST', headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': String(blob.size), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' }, body: JSON.stringify({ file: { display_name: 'shiur' } }) });
  const url = r.headers.get('X-Goog-Upload-URL'); if (!url) throw new Error('Gemini upload: missing upload URL (CORS)');
  let f = (await (await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: blob })).json()).file;
  while (f && f.state === 'PROCESSING') { await new Promise(x => setTimeout(x, 4000)); f = await (await req(`${API}/v1beta/${f.name}`)).json() }
  if (!f || f.state === 'FAILED') throw new Error('Gemini לא הצליח לעבד את קובץ השמע');
  return f;
}
const delFile = f => req(`${API}/v1beta/${f.name}`, { method: 'DELETE' }).catch(() => {});
class Cors extends Error {}
async function fetchAudio(urls) {
  let last;
  for (const u of urls) { try { const r = await fetch(u, { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.blob() } catch (e) { last = e } }
  throw new Cors('שרת השמע של השיעור לא מאפשר הורדה ישירה מהדפדפן (CORS). ' + (last ? '(' + last.message + ')' : ''));
}
const CHUNK_SEC = 40 * 60;
async function transcribe(s, onStep) {
  if (!key()) throw new Error('אין מפתח Gemini אישי');
  const c = await fetch('data/content/' + s.c + '.json').then(r => r.json()).catch(() => ({}));
  const ref = s.title + '\n' + (c.html || c.excerpt || '').replace(/<[^>]+>/g, ' ');
  const t0 = Date.now(); let segs = [], src = [], st = [], used = '';
  const add = (res, off, span) => { const [tr, a, b] = split3(res.text); segs = segs.concat(parse(tr, off, span)); src = src.concat(a); st = st.concat(b); used = res.model };
  if (s.youtube && !s.audio.length) {
    onStep('שולח את קישור היוטיוב ל־Gemini…');
    add(await generate({ file_data: { file_uri: 'https://www.youtube.com/watch?v=' + s.youtube } }, ref, m => onStep('מתמלל עם ' + m + '…')), 0, s.duration || 0);
  } else {
    onStep('מוריד את קובץ השמע…');
    const blob = await fetchAudio(s.audio), mime = blob.type && blob.type.startsWith('audio') ? blob.type : 'audio/mpeg';
    const dur = s.duration || 0, n = dur > CHUNK_SEC * 1.5 ? Math.ceil(dur / CHUNK_SEC) : 1;   // long mp3: byte-slice into ~40-min parts
    for (let i = 0; i < n; i++) {
      const part = n === 1 ? blob : blob.slice(Math.floor(blob.size * i / n), Math.floor(blob.size * (i + 1) / n), mime);
      onStep(`מעלה ל־Gemini${n > 1 ? ` (חלק ${i + 1}/${n})` : ''}…`);
      const f = await upload(part, mime);
      try { add(await generate({ file_data: { mime_type: f.mimeType, file_uri: f.uri } }, ref, m => onStep(`מתמלל${n > 1 ? ` חלק ${i + 1}/${n}` : ''} עם ${m}…`)), n === 1 ? 0 : dur * i / n, n === 1 ? dur : dur / n) }
      finally { delFile(f) }
    }
  }
  if (!segs.length) throw new Error('Gemini החזיר תשובה ריקה');
  segs = trClean.segs(segs);   // quick cleanup pass: stutters, filler sounds, needless repetition
  const rec = { uid: s.uid, segments: segs, sources: src, stories: st, model: used, at: Date.now(), seconds: Math.round((Date.now() - t0) / 1000) };
  await put2(rec); return rec;
}
// ---------- settings UI (on the "הערות" page, next to Drive sync) ----------
function keyBox() {
  const el = document.createElement('div'); el.className = 'card syncbox'; el.id = 'gemKeyBox';
  const fill = () => { const k = key();
    el.innerHTML = `<b>מפתח Gemini אישי</b>
      <div class="muted">עם מפתח אישי, "⚡ תמלול מהיר" מתמלל ישירות מהמכשיר שלך, והתמלול נשמר אצלך וב־Google Drive שלך.</div>
      <div class="muted">1. היכנסו ל־<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> ולחצו Create API key.<br>2. העתיקו את המפתח והדביקו כאן. הוא נשמר רק במכשיר הזה ונשלח רק ל־Google.</div>
      <div class="row">${k ? `<span class="muted">✓ מפתח שמור (…${k.slice(-4).replace(/./g, '•')})</span><button class="btn" id="gkClear">מחק מפתח</button>`
        : `<input id="gkIn" type="password" autocomplete="off" placeholder="הדביקו מפתח Gemini" style="flex:1;min-width:180px;padding:8px 12px;border:1px solid var(--line);border-radius:999px;font:inherit"><button class="btn on" id="gkSave">שמור</button>`}</div>`;
    const b = id => el.querySelector('#' + id);
    b('gkSave') && (b('gkSave').onclick = () => { const v = cleanKey(b('gkIn').value); if (v.length < 20) return alert('המפתח לא נראה תקין'); localStorage.setItem(KEYK, v); fill() });
    b('gkClear') && (b('gkClear').onclick = () => { if (confirm('למחוק את מפתח Gemini מהמכשיר?')) { localStorage.removeItem(KEYK); fill() } });
  };
  fill(); return el;
}
const wrap = () => { if (!window.Study || Study._keyWrapped) return; const orig = Study.notesView; Study._keyWrapped = true;
  Study.notesView = async app => { await orig(app); const box = keyBox(); const anchor = app.querySelector('#syncBox') || app.querySelector('.row'); anchor ? anchor.after(box) : app.prepend(box) } };
wrap();
const PHAS = {}; all().then(rs => rs.forEach(r => { if (r.segments && r.segments.length) PHAS[r.uid] = 1 })).catch(() => {});
const _put0 = put; 
async function put2(rec, fromSync) { await _put0(rec, fromSync); if (rec.segments && rec.segments.length) PHAS[rec.uid] = 1; else delete PHAS[rec.uid]; if (!fromSync && window.render) try { render() } catch {} }
window.PTR = { clean: trClean, get, all, put: put2, content, transcribe, hasKey: () => !!key(), Busy, Cors, LABEL, _wrap: wrap, _has: uid => !!PHAS[uid] };
})();
