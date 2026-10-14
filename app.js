'use strict';
const $ = s => document.querySelector(s), app = $('#app');
let DB = null, byUid = {};
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)) }
};
const favs = () => LS.get('favs', []);
const positions = () => LS.get('pos', {});
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }) : '';
const fmtTime = t => { t = Math.floor(t || 0); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0') };
const catPath = id => { const out = []; while (id) { const c = DB.categories[id]; if (!c) break; out.unshift(c); id = c.parent } return out };
const srcName = id => (DB.sources.find(s => s.id === id) || {}).name || id;

function item(s) {
  const p = positions()[s.uid], c = catPath(s.cat).slice(1).map(x => x.title).join(' › ');
  const pct = p && p.d ? Math.min(100, p.t / p.d * 100) : 0;
  // title rendered verbatim (white-space:pre-wrap keeps leading/trailing/multiple spaces)
  return `<a class="item" href="#/s/${encodeURIComponent(s.uid)}">
    <div class="play">${s.audio.length ? '▶' : '📄'}</div>
    <div class="body"><div class="title">${esc(s.title)}</div>
    <div class="meta">${esc(fmtDate(s.date))}${c ? ' · ' + esc(c) : ''}</div>
    ${pct ? `<div class="prog"><i style="width:${pct}%"></i></div>` : ''}</div></a>`;
}
function pagedList(arr, key, step = 30) {
  const n = window['_n_' + key] || step;
  return `<div class="list">${arr.slice(0, n).map(item).join('')}</div>` +
    (arr.length > n ? `<button class="btn more" onclick="window['_n_${key}']=${n + step};render()">עוד (${arr.length - n})</button>` : '');
}
function descendantsShiurim(catId) {
  const ids = new Set(); const walk = id => { ids.add(id); DB.categories[id].children.forEach(walk) }; walk(catId);
  return DB.shiurim.filter(s => ids.has(s.cat));
}
function tiles(ids) {
  return `<div class="grid">${ids.map(id => DB.categories[id]).map(c =>
    `<a class="tile" href="#/cat/${encodeURIComponent(c.id)}"><div class="t">${esc(c.title)}</div><div class="n">${c.count} שיעורים</div></a>`).join('')}</div>`;
}

const views = {
  home() {
    const pos = positions();
    const cont = Object.entries(pos).filter(([u, p]) => byUid[u] && p.d && p.t > 15 && p.t < p.d - 20)
      .sort((a, b) => b[1].at - a[1].at).slice(0, 5).map(([u]) => byUid[u]);
    const roots = Object.values(DB.categories).filter(c => !c.parent);
    let h = '';
    if (cont.length) h += `<h2 class="sec">המשך האזנה</h2><div class="list">${cont.map(item).join('')}</div>`;
    h += `<h2 class="sec">נושאים <a href="#/cat">הכול</a></h2>`;
    roots.forEach(r => { h += (roots.length > 1 ? `<div class="muted">${esc(r.title)}</div>` : '') + tiles(r.children.slice().sort((a, b) => DB.categories[b].count - DB.categories[a].count)) });
    h += `<h2 class="sec">שיעורים אחרונים</h2>` + pagedList(DB.shiurim, 'home', 15);
    return h;
  },
  cat(id) {
    if (!id) {
      const roots = Object.values(DB.categories).filter(c => !c.parent);
      if (roots.length === 1) id = roots[0].id;
      else return `<h1 class="page">מקורות</h1>` + tiles(roots.map(r => r.id));
    }
    const c = DB.categories[id]; if (!c) return `<div class="empty">הנושא לא נמצא</div>`;
    const path = catPath(id);
    let h = crumbs(path.slice(0, -1)) + `<h1 class="page">${esc(c.title)}</h1><div class="muted">${c.count} שיעורים</div>`;
    if (c.children.length) h += `<h2 class="sec">תתי־נושאים</h2>` + tiles(c.children);
    const own = DB.shiurim.filter(s => s.cat === id);
    const list = own.length ? own : descendantsShiurim(id);
    h += `<h2 class="sec">${own.length ? 'שיעורים' : 'כל השיעורים בנושא'}</h2>` + pagedList(list, 'c' + id);
    return h;
  },
  search(q) {
    q = (q || '').trim(); $('#q').value = q;
    if (!q) return `<div class="empty">הקלידו מילה לחיפוש בכותרות ובתגיות השיעורים</div>`;
    const words = q.split(/\s+/);
    const res = DB.shiurim.filter(s => { const hay = s.title + ' ' + s.tags.join(' ') + ' ' + catPath(s.cat).map(c => c.title).join(' '); return words.every(w => hay.includes(w)) });
    return `<h2 class="sec">${res.length} תוצאות עבור "${esc(q)}"</h2>` + (res.length ? pagedList(res, 'q' + q) : '<div class="empty">לא נמצאו שיעורים</div>');
  },
  fav() {
    const f = favs().map(u => byUid[u]).filter(Boolean);
    return `<h1 class="page">מועדפים</h1>` + (f.length ? `<div class="list">${f.map(item).join('')}</div>` : '<div class="empty">עדיין אין מועדפים. לחצו ☆ בעמוד שיעור כדי לשמור.</div>');
  },
  s(uid) {
    const s = byUid[uid]; if (!s) return `<div class="empty">השיעור לא נמצא</div>`;
    const isFav = favs().includes(uid);
    setTimeout(() => setupShiur(s), 0);
    return crumbs(catPath(s.cat)) +
      `<h1 class="page">${esc(s.title)}</h1>
      <div class="muted">${esc(fmtDate(s.date))} · ${esc(srcName(s.source))}</div>
      ${s.tags.length ? `<div class="tags">${s.tags.map(t => `<a class="tag" href="#/search/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
      ${s.audio.length ? `<div class="player"><audio id="au" controls preload="metadata"></audio>
        <div class="prow"><button class="btn" id="b15">↻ 15 שנ׳</button><button class="btn" id="f15">30 שנ׳ ↺</button>
        <button class="btn ${isFav ? 'on' : ''}" id="fav">${isFav ? '★ במועדפים' : '☆ למועדפים'}</button>
        <select class="btn speed" id="spd">${[0.75, 1, 1.25, 1.5, 1.75, 2].map(v => `<option value="${v}" ${v == (LS.get('speed', 1)) ? 'selected' : ''}>×${v}</option>`).join('')}</select></div>
        <div class="muted" id="resume" style="margin-top:6px"></div></div>` :
        `<div class="prow"><button class="btn ${isFav ? 'on' : ''}" id="fav">${isFav ? '★ במועדפים' : '☆ למועדפים'}</button></div>`}
      <h2 class="sec">מקורות השיעור</h2><div class="text" id="txt"><span class="muted">טוען…</span></div>
      <p><a class="btn pri" href="${esc(s.pageUrl)}" target="_blank" rel="noopener">לעמוד המקורי באתר ↗</a></p>`;
  }
};
function crumbs(path) {
  return `<nav class="crumbs"><a href="#/">בית</a>${path.map(c => `<span class="sep">›</span><a href="#/cat/${encodeURIComponent(c.id)}">${esc(c.title)}</a>`).join('')}</nav>`;
}
async function setupShiur(s) {
  const fb = $('#fav');
  fb && (fb.onclick = () => { let f = favs(); const on = f.includes(s.uid); f = on ? f.filter(u => u !== s.uid) : [s.uid, ...f]; LS.set('favs', f); fb.classList.toggle('on', !on); fb.textContent = on ? '☆ למועדפים' : '★ במועדפים' });
  const au = $('#au');
  if (au) {
    let i = 0; const saved = positions()[s.uid];
    au.src = s.audio[0];
    au.onerror = () => { if (++i < s.audio.length) { au.src = s.audio[i]; au.load() } else $('#resume').textContent = 'לא ניתן לטעון את קובץ השמע' };
    au.onloadedmetadata = () => {
      au.playbackRate = +LS.get('speed', 1);
      if (saved && saved.t > 5 && saved.t < au.duration - 10) { au.currentTime = saved.t; $('#resume').textContent = 'ממשיכים מ־' + fmtTime(saved.t) }
    };
    let last = 0;
    const save = () => { const p = positions(); p[s.uid] = { t: au.currentTime, d: au.duration || 0, at: Date.now() }; LS.set('pos', p) };
    au.ontimeupdate = () => { if (Date.now() - last > 3000) { last = Date.now(); save() } };
    au.onpause = save; au.onended = save;
    $('#b15').onclick = () => au.currentTime = Math.max(0, au.currentTime - 15);
    $('#f15').onclick = () => au.currentTime += 30;
    $('#spd').onchange = e => { au.playbackRate = +e.target.value; LS.set('speed', +e.target.value) };
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: srcName(s.source), artwork: [{ src: 'icons/icon-512.png', sizes: '512x512' }] });
  }
  const t = $('#txt');
  try {
    const c = await (await fetch('data/content/' + s.c + '.json')).json();
    if (c.html) t.innerHTML = c.html; // sanitized by importer whitelist
    else if (c.excerpt) { t.classList.add('plain'); t.textContent = c.excerpt.trim() }
    else t.innerHTML = '<span class="muted">אין מקורות כתובים לשיעור זה</span>';
  } catch { t.innerHTML = '<span class="muted">לא ניתן לטעון את המקורות</span>' }
}
function render() {
  if (!DB) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const view = views[parts[0]] ? parts[0] : 'home';
  const arg = parts.slice(1).map(decodeURIComponent).join('/');
  app.innerHTML = views[view](arg);
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('act', a.dataset.tab === (view === 's' ? '' : view)));
}
window.render = render;
window.addEventListener('hashchange', () => { render(); scrollTo(0, 0) });
$('#searchForm').onsubmit = e => { e.preventDefault(); location.hash = '#/search/' + encodeURIComponent($('#q').value.trim()) };
let deb; $('#q').oninput = e => { clearTimeout(deb); deb = setTimeout(() => { const v = e.target.value.trim(); if (v.length > 1) history.replaceState(null, '', '#/search/' + encodeURIComponent(v)), render() }, 300) };
fetch('data/index.json').then(r => r.json()).then(d => { DB = d; d.shiurim.forEach(s => byUid[s.uid] = s); render() })
  .catch(() => app.innerHTML = '<div class="empty">שגיאה בטעינת הנתונים</div>');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
