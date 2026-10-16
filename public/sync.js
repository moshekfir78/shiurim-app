'use strict';
/* Google Drive sync of on-device study data. Data goes ONLY to the user's own Google Drive (hidden appDataFolder,
   scope drive.appdata). No server of ours. Merge: per item, last write wins (by updatedAt); deletions are tombstones. */
(() => {
const CID = (window.SHIURIM_CONFIG || {}).googleClientId;
if (!CID) return;                       // not configured -> no sync UI at all
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata', FNAME = 'shiurim-sync.json';
const LSK = { on: 'sync_on', tok: 'sync_tok', state: 'sync_state', last: 'sync_last', fid: 'sync_fid' };
const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
const jset = (k, v) => _set.call(localStorage, k, JSON.stringify(v));
const _set = Storage.prototype.setItem;
const WATCH = new Set(['favs', 'pos', 'trReq', 'speed', 'rav']);
let status = 'idle', err = '', busy = false, applying = false, timer = null, tokenClient = null, gisP = null;

// ---------- IndexedDB (same DB as study.js) ----------
const idb = () => new Promise((ok, no) => { const r = indexedDB.open('shiurim-study', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('study', { keyPath: 'uid' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) });
const idbAll = async () => { const d = await idb(); return new Promise((ok, no) => { const q = d.transaction('study').objectStore('study').getAll(); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error) }) };
const idbWrite = async (puts, dels) => { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction('study', 'readwrite'), st = t.objectStore('study');
  puts.forEach(r => st.put(r)); dels.forEach(u => st.delete(u)); t.oncomplete = ok; t.onerror = () => no(t.error) }) };

// ---------- local snapshot as item map ----------
async function localItems() {
  const L = {};
  jget('favs', []).forEach(u => L['fav:' + u] = true);
  Object.entries(jget('pos', {})).forEach(([u, v]) => L['pos:' + u] = v);
  Object.entries(jget('trReq', {})).forEach(([u, v]) => L['tr:' + u] = v);
  ['speed', 'rav'].forEach(k => { const v = localStorage.getItem(k); if (v != null) L['ls:' + k] = jget(k, null) });
  (await idbAll()).forEach(r => L['study:' + r.uid] = r);
  return L;
}
const hint = (k, v) => k.startsWith('pos:') ? v.at || 0 : k.startsWith('study:') ? v.updated || 0 : 0;
// diff current local values against last merged state -> timestamps / tombstones
async function stamp() {
  const S = jget(LSK.state, {}), L = await localItems(), now = Date.now();
  for (const [k, v] of Object.entries(L)) { const p = S[k];
    if (!p || p.v == null || JSON.stringify(p.v) !== JSON.stringify(v)) S[k] = { u: Math.max(now, (p && p.u + 1) || 0, hint(k, v)), v } }
  for (const [k, p] of Object.entries(S)) if (p.v != null && !(k in L)) S[k] = { u: now, v: null };
  return S;
}
function merge(A, B) { const M = { ...A }; for (const [k, b] of Object.entries(B || {})) if (!M[k] || b.u > M[k].u) M[k] = b; return M }
async function apply(M) {
  const old = jget('favs', []), fav = Object.entries(M).filter(([k, x]) => k.startsWith('fav:') && x.v != null).sort((a, b) => b[1].u - a[1].u).map(([k]) => k.slice(4));
  const favs = [...fav.filter(u => !old.includes(u)), ...old.filter(u => fav.includes(u))];
  const pos = {}, tr = {}; const puts = [], dels = [];
  for (const [k, x] of Object.entries(M)) {
    if (k.startsWith('pos:') && x.v != null) pos[k.slice(4)] = x.v;
    else if (k.startsWith('tr:') && x.v != null) tr[k.slice(3)] = x.v;
    else if (k.startsWith('study:')) x.v != null ? puts.push(x.v) : dels.push(k.slice(6));
    else if (k.startsWith('ls:')) x.v != null ? _set.call(localStorage, k.slice(3), JSON.stringify(x.v)) : localStorage.removeItem(k.slice(3));
  }
  jset('favs', favs); jset('pos', pos); jset('trReq', tr);
  const cur = Object.fromEntries((await idbAll()).map(r => [r.uid, r]));
  await idbWrite(puts.filter(r => JSON.stringify(cur[r.uid]) !== JSON.stringify(r)), dels.filter(u => cur[u]));
}

// ---------- Google auth (GIS token client) ----------
const loadGis = () => gisP || (gisP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = ok; s.onerror = () => no(new Error('טעינת Google נכשלה')); document.head.appendChild(s) }));
function token(interactive) {
  const t = jget(LSK.tok, null); if (t && t.exp > Date.now() + 60e3) return Promise.resolve(t.at);
  if (!interactive) return Promise.reject(new Error('need-login'));
  return loadGis().then(() => new Promise((ok, no) => {
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CID, scope: SCOPE, prompt: jget(LSK.on, false) ? '' : 'consent',
      callback: r => { if (r.error) return no(new Error(r.error)); jset(LSK.tok, { at: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 }); ok(r.access_token) },
      error_callback: e => no(new Error(e.type || 'auth')) });
    tokenClient.requestAccessToken();
  }));
}
async function api(url, opt = {}, at) {
  const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + at, ...(opt.headers || {}) } });
  if (r.status === 401) { localStorage.removeItem(LSK.tok); throw new Error('need-login') }
  if (!r.ok) throw new Error('Drive ' + r.status);
  return r;
}
async function fileId(at) {
  let id = localStorage.getItem(LSK.fid); if (id) return id;
  const r = await (await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${FNAME}'`)}&fields=files(id)`, {}, at)).json();
  id = r.files && r.files[0] && r.files[0].id; if (id) _set.call(localStorage, LSK.fid, id); return id || null;
}
async function download(at) {
  const id = await fileId(at); if (!id) return null;
  try { return (await (await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {}, at)).json()).items || {} }
  catch (e) { if (/404/.test(e.message)) { localStorage.removeItem(LSK.fid); return null } throw e }
}
async function upload(at, items) {
  const body = JSON.stringify({ app: 'shiurim', v: 1, saved: new Date().toISOString(), items }), id = await fileId(at);
  if (id) return api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }, at);
  const b = 'shiurimsync' + Date.now(), meta = JSON.stringify({ name: FNAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  const r = await (await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--` }, at)).json();
  _set.call(localStorage, LSK.fid, r.id);
}

// ---------- sync ----------
async function sync(interactive = false) {
  if (busy || (!interactive && !jget(LSK.on, false))) return; busy = true; setStatus('syncing');
  try {
    const at = await token(interactive);
    const S = await stamp(), R = await download(at), M = merge(S, R || {});
    applying = true; try { await apply(M) } finally { applying = false }
    if (!R || JSON.stringify(M) !== JSON.stringify(R)) await upload(at, M);
    jset(LSK.state, M); jset(LSK.on, true); jset(LSK.last, Date.now()); setStatus('ok');
    if (R && JSON.stringify(M) !== JSON.stringify(S) && window.render && !/^#\/s\//.test(location.hash)) window.render();
  } catch (e) { err = e.message; setStatus(e.message === 'need-login' ? 'login' : 'error') }
  finally { busy = false }
}
const schedule = (ms = 4000) => { if (applying || !jget(LSK.on, false)) return; clearTimeout(timer); timer = setTimeout(() => sync(false), ms) };
Storage.prototype.setItem = function (k, v) { _set.call(this, k, v); if (this === localStorage && WATCH.has(k)) schedule() };
const _put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (...a) { if (this.name === 'study') schedule(); return _put.apply(this, a) };
setInterval(() => document.visibilityState === 'visible' && schedule(0), 3 * 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); sync(false) } else schedule(500) });
window.addEventListener('load', () => schedule(1500));

function disconnect() {
  const t = jget(LSK.tok, null);
  if (t && window.google && google.accounts) try { google.accounts.oauth2.revoke(t.at, () => {}) } catch { }
  [LSK.on, LSK.tok, LSK.state, LSK.last, LSK.fid].forEach(k => localStorage.removeItem(k)); setStatus('idle');
}

// ---------- UI (in the "my notes" / backup area) ----------
function label() {
  const last = jget(LSK.last, 0), on = jget(LSK.on, false);
  if (status === 'syncing') return 'מסנכרן…';
  if (status === 'login') return 'צריך להתחבר שוב ל-Google כדי להמשיך לסנכרן';
  if (status === 'error') return 'הסנכרון נכשל: ' + err;
  return on ? '✓ מסונכרן' + (last ? ' · לאחרונה ' + new Date(last).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }) : '') : 'לא מחובר';
}
function setStatus(s) { status = s; topBtn(); const el = document.getElementById('syncBox'); if (el) fill(el); const dot = document.getElementById('syncDot'); if (dot) dot.className = 'syncdot ' + s }
function fill(el) {
  const on = jget(LSK.on, false);
  el.innerHTML = `<b>סנכרון בין מכשירים (Google Drive)</b>
    <div class="muted">הנתונים נשמרים בתיקייה מוסתרת של האפליקציה ב-Google Drive שלך בלבד: סיכומים, הערות, תיקוני תמלול, מועדפים, התקדמות והעדפות.</div>
    <div class="muted" id="syncSt">${label()}</div>
    <div class="row">${on && status !== 'login' ? `<button class="btn" id="syncNow">סנכרן עכשיו</button><button class="btn" id="syncOff">התנתק</button>`
      : `<button class="btn on" id="syncIn">התחבר עם Google לסנכרון</button>${on ? '<button class="btn" id="syncOff">התנתק</button>' : ''}`}</div>`;
  const b = (id, f) => { const x = el.querySelector('#' + id); x && (x.onclick = f) };
  b('syncIn', () => sync(true)); b('syncNow', () => sync(true));
  b('syncOff', () => { if (confirm('להפסיק לסנכרן? הנתונים במכשיר וב-Drive יישארו.')) disconnect() });
}
function topBtn() {
  let b = document.getElementById('gLogin');
  if (!b) { const h = document.querySelector('header.top'); if (!h) return; b = document.createElement('button'); b.id = 'gLogin'; b.className = 'glogin'; h.appendChild(b);
    b.onclick = () => { if (jget(LSK.on, false) && status !== 'login') location.hash = '#/notes'; else sync(true) } }
  const on = jget(LSK.on, false) && status !== 'login';
  b.classList.toggle('on', on);
  b.innerHTML = on ? (status === 'syncing' ? '⟳ מסנכרן' : '✓ מחובר') : '<svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg> התחבר עם Google';
  b.title = on ? 'הנתונים שלך נשמרים ב-Google Drive שלך' : 'התחברות: הסיכומים, ההערות והמועדפים יישמרו ב-Google Drive שלך ויסונכרנו בין המכשירים';
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', topBtn) : topBtn();
const preload = () => loadGis().catch(() => {});
const wrap = () => { if (!window.Study || Study._syncWrapped) return; const orig = Study.notesView; Study._syncWrapped = true;
  Study.notesView = async app => { await orig(app); const box = document.createElement('div'); box.className = 'card syncbox'; box.id = 'syncBox'; fill(box); preload();
    const anchor = app.querySelector('.row'); anchor ? anchor.after(box) : app.prepend(box) } };
wrap(); window.ShiurimSync = { sync, disconnect, _merge: merge };
})();
