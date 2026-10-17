'use strict';
/* Personal transcription: the user's own Gemini key (stored ONLY in this browser's localStorage, sent only to Google's
   Gemini API). Results are stored on the device (IndexedDB 'shiurim-ptr') and synced to the user's own Drive (sync.js,
   one file per shiur in appDataFolder). A personal transcript takes precedence over the public one. */
(() => {
const KEYK = 'gemini_key_personal', API = 'https://generativelanguage.googleapis.com';
const LABEL = 'Gemini · אישי (נשמר בדרייב שלך)';
const cleanKey = v => (String(v || '').match(/AIza[0-9A-Za-z_\-]{30,}|AQ\.[0-9A-Za-z_.\-]{20,}/) || [String(v || '').replace(/[^0-9A-Za-z_.\-]/g, '')])[0];
const key = () => cleanKey(localStorage.getItem(KEYK));
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
  if (p && p.segments && p.segments.length) Object.assign(c, { transcript: p.segments, trSources: p.sources || [], trStories: p.stories || [],
    trSource: LABEL, trModel: p.model, trMode: 'personal', trRaw: false, personal: true, publicTranscript: c.transcript || null });
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
  const rec = { uid: s.uid, segments: segs, sources: src, stories: st, model: used, at: Date.now(), seconds: Math.round((Date.now() - t0) / 1000) };
  await put(rec); return rec;
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
window.PTR = { get, all, put, content, transcribe, hasKey: () => !!key(), Busy, Cors, LABEL, _wrap: wrap };
})();
