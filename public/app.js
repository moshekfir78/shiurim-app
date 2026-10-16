'use strict';
const $ = s => document.querySelector(s), app = $('#app');
let DB = null, byUid = {};
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)) }
};
const favs = () => LS.get('favs', []);
const positions = () => LS.get('pos', {});
const recents = () => LS.get('recent', {});
function touch(uid) { if (!uid) return; const r = recents(); if (Date.now() - (r[uid] || 0) < 2000) return; r[uid] = Date.now(); const k = Object.keys(r).sort((a, b) => r[b] - r[a]).slice(0, 200); LS.set('recent', Object.fromEntries(k.map(u => [u, r[u]]))) }
const whenStr = ts => new Date(ts).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const lastHeard = uid => { const p = positions()[uid]; return p && p.at ? 'נשמע לאחרונה: ' + whenStr(p.at) + (p.t > 5 ? ' · נעצר ב־' + fmtTime(p.t) : '') : '' };
window.touchShiur = touch;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }) : '';
const fmtTime = t => { t = Math.floor(t || 0); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0') };
const catPath = id => { const out = []; while (id) { const c = DB.categories[id]; if (!c) break; out.unshift(c); id = c.parent } return out };
const srcName = id => (DB.sources.find(s => s.id === id) || {}).name || id;
const isSk = id => { const p = catPath(id)[0]; return !!(p && DB.extras && DB.extras.some(r => 'rav:' + r.id === p.id)) };
const extrasSec = () => (DB.extras || []).length ? `<h2 class="sec">פנאי</h2>` + tiles(DB.extras.map(x => 'rav:' + x.id)) : '';
const skCard = () => (DB.extras || []).length ? `<div class="skrow">${DB.extras.map(x => `<a class="skchip" href="#/cat/rav:${x.id}">🎭 ${esc(x.name)}</a>`).join('')}</div>` : '';
const ravName = id => (DB.ravs.find(r => r.id === id) || {}).name || '';
let Q = new URLSearchParams();
const curRav = () => Q.has('r') ? Q.get('r') : LS.get('rav', '');
const byRav = arr => { const r = curRav(); return r ? arr.filter(s => s.rav === r) : arr };
const PAL = ['#2f4a6d', '#4f6d7a', '#5a5f7d', '#3f6b63', '#6b5e4e', '#56657f', '#41575f', '#6a6f7a', '#4a5d73', '#5e6b5a'];
const ravColor = id => PAL[Math.max(0, DB.ravs.findIndex(r => r.id === id)) % PAL.length];
const initials = n => (n || '').replace(/^הרב\s+/, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('');
const av = id => `<i class="av" style="--c:${ravColor(id)}" aria-hidden="true">${esc(initials(ravName(id)))}</i>`;
const TICON = { parasha: '📜', chag: '🎉', tanach: '📖', gemara: '🕯️', mishna: '📚', halacha: '⚖️', emuna: '💡', chasidut: '🔥', kabbala: '✨', kook: '🌅', musar: '🌱', tefila: '🙏', eretz: '🇮🇱', chinuch: '👨‍👩‍👧', current: '📰',
  'chag:rosh-hashana': '🍎', 'chag:kippur': '🤍', 'chag:sukkot': '🌿', 'chag:chanuka': '🕎', 'chag:tuBshvat': '🌳', 'chag:purim': '🎭', 'chag:pesach': '🍷', 'chag:omer': '🔥', 'chag:atzmaut': '🇮🇱', 'chag:shavuot': '🌾', 'chag:tisha': '🕊️', 'chag:shabbat': '🕯️', 'chasidut:tanya': '📘' };
const TCOL = ['#ff6b6b', '#ffa94d', '#fab005', '#82c91e', '#20c997', '#15aabf', '#4d96ff', '#7950f2', '#be4bdb', '#f06595'];
const tColor = id => TCOL[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TCOL.length];
window.setRav = r => { LS.set('rav', r); setF('r', r) };
function ravChips() {
  const r = curRav();
  return `<div class="chips ravs"><a class="chip ${!r ? 'sel' : ''}" onclick="setRav('')">כל הרבנים<b>${DB.shiurim.length}</b></a>` +
    DB.ravs.filter(x => x.count).map(x => `<a class="chip rc ${r === x.id ? 'sel' : ''}" style="--c:${ravColor(x.id)}" onclick="setRav('${x.id}')">${av(x.id)}${esc(x.name)}<b>${x.count}</b></a>`).join('') + '</div>';
}

function ytStart(uid) { const p = positions()[uid]; return p && p.t > 5 && (!p.d || p.t < p.d - 10) ? '&start=' + Math.floor(p.t) : '' }
function item(s) {
  const p = positions()[s.uid], c = catPath(s.cat).slice(curRav() ? 1 : 0).map(x => x.title).join(' › ');
  const pct = p && p.d ? Math.min(100, p.t / p.d * 100) : 0;
  // title rendered verbatim (white-space:pre-wrap keeps leading/trailing/multiple spaces)
  return `<a class="item" href="#/s/${encodeURIComponent(s.uid)}">
    <div style="--c:${ravColor(s.rav)}" class="play ${!s.audio.length ? (s.youtube ? 'yt' : s.spotify ? 'sp' : '') : ''}">${s.audio.length || s.youtube || s.spotify ? '▶' : '📄'}</div>
    <div class="body"><div class="title">${esc(s.title)}</div>${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ''}${s.tr ? '<div class="sub">📝 יש תמלול</div>' : ''}${p && p.at ? `<div class="sub heard">${esc(lastHeard(s.uid))}</div>` : ''}
    <div class="meta">${s.duration ? fmtTime(s.duration).replace(/:\d\d$/, '') + (s.duration >= 3600 ? ' שע׳' : ' דק׳') + ' · ' : ''}${esc(fmtDate(s.date))}${c ? ' · ' + esc(c) : ''}</div>
    ${pct ? `<div class="prog"><i style="width:${pct}%"></i></div>` : ''}</div></a>`;
}
function pagedList(arr, key, step = 30) {
  const n = window['_n_' + key] || step;
  return `<div class="list">${arr.slice(0, n).map(item).join('')}</div>` +
    (arr.length > n ? `<button class="btn more" onclick="window['_n_${key}']=${n + step};render()">עוד (${arr.length - n})</button>` : '');
}
function descendantsShiurim(catId) {
  const ids = new Set(); const walk = id => { ids.add(id); DB.categories[id].children.forEach(walk) }; walk(catId);
  return DB.all.filter(s => ids.has(s.cat));
}
function tiles(ids) {
  return `<div class="grid">${ids.map(id => DB.categories[id]).map(c =>
    `<a class="tile ${c.rav ? 'ravt' : ''}" style="--c:${c.rav ? ravColor(c.rav) : tColor(c.id)}" href="#/cat/${encodeURIComponent(c.id)}">${c.rav ? av(c.rav) : ''}<div class="t">${esc(c.title)}</div><div class="n">${c.count} ${isSk(c.id) ? 'סרטונים' : 'שיעורים'}</div></a>`).join('')}</div>`;
}

function currentParasha() {
  // upcoming Shabbat (Israel) reading; today counts if it is Shabbat
  const t = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return (DB.schedule || []).find(w => w.date >= t);
}
const parShiurim = i => byRav(DB.shiurim).filter(s => (s.par || []).includes(i));
function parCard() {
  const w = currentParasha(); if (!w || !w.par.length) return '';
  const n = w.par.reduce((k, i) => k + parShiurim(i).length, 0);
  return `<a class="parcard" href="#/par/${w.par[0]}"><div class="lbl">פרשת השבוע · שבת ${esc(new Date(w.date + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }))}</div>
    <div class="nm">${esc(w.name)}</div><div class="lbl">${n} שיעורים ›</div></a>`;
}
// ---------- filters (persisted in URL query: #/view/arg?r=&t=&m=&len=&from=&to=&src=&sort=) ----------
const LEN = [['0', 'עד 15 דק׳', 0, 900], ['1', '15–30 דק׳', 900, 1800], ['2', '30–60 דק׳', 1800, 3600], ['3', 'מעל שעה', 3600, 1e9]];
const topicName = id => (DB.topics.find(t => t.id === id) || {}).name || id;
const isVideo = s => !!(s.youtube || s.spotifyVideo), isAudio = s => !!(s.audio.length || (s.spotify && !s.spotifyVideo));
const year = s => (s.date || '').slice(0, 4);
function setF(k, v) {
  if (v === '' || v == null) Q.delete(k); else Q.set(k, v);
  const base = location.hash.split('?')[0] || '#/'; const qs = Q.toString();
  location.hash = base + (qs ? '?' + qs : '');
}
window.setF = setF;
window.clearF = () => { ['t', 'm', 'len', 'from', 'to', 'src', 'sort'].forEach(k => Q.delete(k)); setF('x', '') };
function applyF(arr) {
  const t = Q.get('t'), m = Q.get('m'), len = LEN.find(l => l[0] === Q.get('len')), from = Q.get('from'), to = Q.get('to'), src = Q.get('src');
  let out = byRav(arr).filter(s => (!t || (s.tp || []).includes(t)) && (!m || (m === 'v' ? isVideo(s) : isAudio(s))) &&
    (!len || (s.duration && s.duration >= len[2] && s.duration < len[3])) && (!from || year(s) >= from) && (!to || (year(s) && year(s) <= to)) && (!src || s.source === src));
  if (Q.get('sort') === 'old') out = out.slice().sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  return out;
}
const fKey = () => ['r', 't', 'm', 'len', 'from', 'to', 'src', 'sort'].map(k => Q.get(k) || '').join('|');
function filterUI(base) {
  base = byRav(base);
  const cnt = {}; base.forEach(s => (s.tp || []).forEach(t => cnt[t] = (cnt[t] || 0) + 1));
  const srcs = {}; base.forEach(s => srcs[s.source] = (srcs[s.source] || 0) + 1);
  const years = [...new Set(base.map(year).filter(Boolean))].sort();
  const opt = (k, v, label, n) => `<option value="${esc(v)}" ${(Q.get(k) || '') === v ? 'selected' : ''}>${esc(label)}${n != null ? ' (' + n + ')' : ''}</option>`;
  const sel = (k, label, opts) => `<label class="fl"><span>${label}</span><select onchange="setF('${k}',this.value)">${opts}</select></label>`;
  const tops = DB.topics.filter(t => cnt[t.id]).map(t => opt('t', t.id, (t.parent ? '— ' : '') + t.name, cnt[t.id])).join('');
  const active = [['r', v => ravName(v)], ['t', topicName], ['m', v => v === 'v' ? 'וידאו' : 'שמע'], ['len', v => (LEN.find(l => l[0] === v) || [])[1]],
    ['from', v => 'משנת ' + v], ['to', v => 'עד ' + v], ['src', srcName], ['sort', v => v === 'old' ? 'מהישן לחדש' : '']].filter(([k]) => Q.get(k));
  const n = active.filter(([k]) => k !== 'r').length;
  return `<div class="fbar"><button class="btn ${n ? 'on' : ''}" onclick="document.getElementById('fsheet').classList.add('open')">⚙ סינון${n ? ' (' + n + ')' : ''}</button>
    <div class="chips act">${active.map(([k, f]) => `<a class="chip sel" onclick="setF('${k}','')">${esc(f(Q.get(k)))} ✕</a>`).join('')}</div></div>
  <div id="fsheet" class="sheet" onclick="if(event.target===this)this.classList.remove('open')"><div class="sheet-in">
    <div class="sheet-h"><b>סינון ומיון</b><button class="btn" onclick="document.getElementById('fsheet').classList.remove('open')">סגור</button></div>
    ${sel('r', 'רב', opt('r', '', 'כל הרבנים') + DB.ravs.filter(x => x.count).map(x => opt('r', x.id, x.name)).join(''))}
    ${sel('t', 'נושא', opt('t', '', 'כל הנושאים') + tops)}
    ${sel('m', 'סוג מדיה', opt('m', '', 'הכול') + opt('m', 'a', 'שמע') + opt('m', 'v', 'וידאו'))}
    ${sel('len', 'אורך', opt('len', '', 'כל אורך') + LEN.map(l => opt('len', l[0], l[1])).join(''))}
    <div class="frow">${sel('from', 'משנה', opt('from', '', '—') + years.map(y => opt('from', y, y)).join(''))}${sel('to', 'עד שנה', opt('to', '', '—') + years.map(y => opt('to', y, y)).join(''))}</div>
    ${sel('sort', 'מיון', opt('sort', '', 'מהחדש לישן') + opt('sort', 'old', 'מהישן לחדש'))}
    ${sel('src', 'מקור', opt('src', '', 'כל המקורות') + Object.entries(srcs).sort((a, b) => b[1] - a[1]).map(([id, k]) => opt('src', id, srcName(id), k)).join(''))}
    <button class="btn" onclick="clearF()">נקה הכול</button></div></div>`;
}
// group a big flat list by its most specific topic (parasha / masechet / book / holiday / Tanya …)
function groupsOf(arr) {
  const fine = groupsOf1(arr, false);
  return fine.length > 20 ? groupsOf1(arr, true) : fine;
}
const seriesOf = s => { const segs = s.title.split(/\s[|｜]\s|\s-\s/).map(x => x.trim().replace(/\s*#?\d+#?\s*$/, '').replace(/^#|#$/g, '').trim()).filter(x => x && !/^הרב /.test(x) && x.length < 40); return segs.length > 1 ? segs[0] : '' };
function groupsOf1(arr, coarse) {
  const ser = {}; arr.forEach(s => { const x = seriesOf(s); if (x) ser[x] = (ser[x] || 0) + 1 });
  const freq = {}; arr.forEach(s => (s.tp || []).forEach(t => freq[t] = (freq[t] || 0) + 1));
  const g = {};
  arr.forEach(s => {
    let k, label, ord = 1e6;
    if (s.par && s.par.length) { if (coarse) { k = 'parasha'; label = 'פרשת השבוע'; ord = 1000 } else { k = 'p' + s.par[0]; label = 'פרשת ' + DB.parashot[s.par[0]].name; ord = s.par[0] } }
    else {
      const tp = (s.tp || []).filter(t => t !== 'parasha'), leaf = coarse ? [] : tp.filter(t => t.includes(':'));
      const pick = (leaf.length ? leaf : coarse ? tp.filter(t => !t.includes(':')) : tp).sort((a, b) => freq[b] - freq[a])[0];
      const sr = seriesOf(s);
      if (pick) { k = pick; label = topicName(pick); ord = 1000 }
      else if (sr && ser[sr] >= 4) { k = 'sr:' + sr; label = sr; ord = 2000 }
      else { k = '~'; label = 'שונות'; ord = 1e7 }
    }
    (g[k] = g[k] || { k, label, ord, items: [] }).items.push(s);
  });
  return Object.values(g).sort((a, b) => a.ord !== b.ord ? a.ord - b.ord : b.items.length - a.items.length);
}
function list(base, key, grouped) {
  const arr = applyF(base), k = key + fKey();
  let body;
  const gs = grouped && arr.length > 40 ? groupsOf(arr) : null;
  if (gs && gs.length > 1 && gs[0].items.length < arr.length * 0.9 && !Q.get('flat'))
    body = `<div class="muted gnote">מחולק ל־${gs.length} קבוצות · <a onclick="setF('flat','1')">הצג כרשימה אחת</a></div>` +
      gs.map(g => `<details class="grp" ${gs.length <= 3 ? 'open' : ''}><summary>${esc(g.label)} <b>${g.items.length}</b></summary>${pagedList(g.items, k + g.k, 20)}</details>`).join('');
  else body = (Q.get('flat') && grouped ? `<div class="muted gnote"><a onclick="setF('flat','')">הצג בקבוצות</a></div>` : '') + (arr.length ? pagedList(arr, k) : '<div class="empty">אין שיעורים התואמים לסינון</div>');
  return filterUI(base) + `<div class="muted">${arr.length} שיעורים</div>` + body;
}
function topicTiles(ids, base) {
  return `<div class="grid">${ids.map(id => { const n = base.filter(s => (s.tp || []).includes(id)).length; return n ? `<a class="tile tt" style="--c:${tColor(id)}" href="#/topics/${encodeURIComponent(id)}${location.hash.includes('?') ? '?' + Q : ''}"><div class="t">${esc(topicName(id))}</div><div class="n">${n} שיעורים</div></a>` : '' }).join('')}</div>`;
}
const views = {
  topics(id) {
    const base = byRav(DB.shiurim);
    if (!id) {
      const n = base.filter(s => s.tp).length;
      return ravChips() + `<h1 class="page">נושאים</h1><div class="muted">${n} מתוך ${base.length} שיעורים מסווגים לנושא</div>` + topicTiles(DB.topics.filter(t => !t.parent).map(t => t.id), base);
    }
    const t = DB.topics.find(x => x.id === id); if (!t) return '<div class="empty">נושא לא נמצא</div>';
    const kids = DB.topics.filter(x => x.parent === id).map(x => x.id);
    const pool = DB.shiurim.filter(s => (s.tp || []).includes(id));
    return `<nav class="crumbs"><a href="#/">בית</a><span class="sep">›</span><a href="#/topics">נושאים</a>${t.parent ? `<span class="sep">›</span><a href="#/topics/${encodeURIComponent(t.parent)}">${esc(topicName(t.parent))}</a>` : ''}</nav>` +
      ravChips() + `<h1 class="page">${esc(t.name)}</h1>` + (id === 'parasha' ? '<p><a class="btn" href="#/par">לתצוגת הפרשות ›</a></p>' : '') +
      (kids.length ? `<h2 class="sec">תתי־נושאים</h2>` + topicTiles(kids, base) : '') + `<h2 class="sec">שיעורים</h2>` + list(pool, 'tp' + id, true);
  },
  par(i) {
    const cur = (currentParasha() || { par: [] }).par;
    if (i === '' || i === undefined) {
      let h = ravChips() + parCard() + `<h1 class="page">פרשת השבוע</h1>`;
      ['בראשית', 'שמות', 'ויקרא', 'במדבר', 'דברים'].forEach(book => {
        h += `<h2 class="sec">ספר ${book}</h2><div class="pgrid">` + DB.parashot.map((p, k) => [p, k]).filter(([p]) => p.book === book).map(([p, k]) => {
          const n = parShiurim(k).length;
          return `<a class="ptile ${cur.includes(k) ? 'cur' : ''} ${n ? '' : 'none'}" href="#/par/${k}"><span>${esc(p.name)}</span><b>${n}</b></a>`;
        }).join('') + '</div>';
      });
      return h;
    }
    i = +i; const p = DB.parashot[i]; if (!p) return '<div class="empty">פרשה לא נמצאה</div>';
    const plist = parShiurim(i);
    const nav = `<div class="prow">${i > 0 ? `<a class="btn" href="#/par/${i - 1}">› פרשת ${esc(DB.parashot[i - 1].name)}</a>` : ''}<span style="flex:1"></span>${i < 53 ? `<a class="btn" href="#/par/${i + 1}">פרשת ${esc(DB.parashot[i + 1].name)} ‹</a>` : ''}</div>`;
    return `<nav class="crumbs"><a href="#/">בית</a><span class="sep">›</span><a href="#/par">פרשת השבוע</a><span class="sep">›</span><span>ספר ${esc(p.book)}</span></nav>` + ravChips() +
      `<h1 class="page">פרשת ${esc(p.name)}${cur.includes(i) ? ' <span class="badge">השבוע</span>' : ''}</h1>` + nav +
      (plist.length ? list(DB.shiurim.filter(s => (s.par || []).includes(i)), 'par' + i, false) : '<div class="empty">אין עדיין שיעורים לפרשה זו</div>') + nav;
  },
  home() {
    const pos = positions();
    const cont = Object.entries(pos).filter(([u]) => !curRav() || (byUid[u] || {}).rav === curRav()).filter(([u, p]) => byUid[u] && p.d && p.t > 15 && p.t < p.d - 20)
      .sort((a, b) => b[1].at - a[1].at).slice(0, 5).map(([u]) => byUid[u]);
    const r = curRav();
    let h = skCard() + ravChips() + parCard();
    const rc = recents(), recent = Object.keys(rc).filter(u => byUid[u] && (!curRav() || byUid[u].rav === curRav())).sort((a, b) => rc[b] - rc[a]).slice(0, 10).map(u => byUid[u]);
    if (recent.length) h += `<h2 class="sec">לאחרונה</h2><div class="list">${recent.map(item).join('')}</div>`;
    else if (cont.length) h += `<h2 class="sec">המשך האזנה</h2><div class="list">${cont.map(item).join('')}</div>`;
    if (r) h += `<h2 class="sec">נושאים <a href="#/cat/rav:${r}">הכול</a></h2>` + tiles(DB.categories['rav:' + r].children.slice(0, 12));
    else h += `<h2 class="sec">רבנים</h2>` + tiles(DB.ravs.filter(x => x.count).map(x => 'rav:' + x.id)) + extrasSec();
    h += `<h2 class="sec">שיעורים אחרונים</h2>` + pagedList(byRav(DB.shiurim), 'home' + r, 15);
    return h;
  },
  cat(id) {
    if (!id) {
      if (curRav()) id = 'rav:' + curRav();
      else return ravChips() + `<h1 class="page">רבנים</h1>` + tiles(DB.ravs.filter(x => x.count).map(x => 'rav:' + x.id)) + extrasSec();
    }
    const c = DB.categories[id]; if (!c) return `<div class="empty">הנושא לא נמצא</div>`;
    const path = catPath(id);
    let h = crumbs(path.slice(0, -1)) + `<h1 class="page">${esc(c.title)}</h1><div class="muted">${c.count} ${isSk(id) ? 'סרטונים' : 'שיעורים'}</div>`;
    if (c.children.length) h += `<h2 class="sec">תתי־נושאים</h2>` + tiles(c.children);
    if (isSk(id)) return c.children.length ? h : h + `<h2 class="sec">סרטונים</h2>` + pagedList(DB.all.filter(s => s.cat === id), 'sk' + id, 100);
    let own = DB.all.filter(s => s.cat === id);
    if (own.some(s => s.o != null)) own = own.slice().sort((a, b) => ((a.o ?? 9999) - (b.o ?? 9999)) || (a.date || '').localeCompare(b.date || ''));
    const lst = own.length ? own : descendantsShiurim(id);
    h += `<h2 class="sec">${own.length ? 'שיעורים' : 'כל השיעורים בנושא'}</h2>` + list(lst, 'c' + id, !own.length);
    return h;
  },
  search(q) {
    q = (q || '').trim(); $('#q').value = q;
    if (!q) return `<div class="empty">הקלידו מילה לחיפוש בכותרות ובתגיות השיעורים</div>`;
    const words = q.split(/\s+/);
    if (!TRSEARCH) { fetch('data/transcripts-search.json', { cache: 'no-cache' }).then(r => r.json()).then(j => { TRSEARCH = j; render() }).catch(() => TRSEARCH = {}); TRSEARCH = {} }
    const inTr = s => (s.tr && TRSEARCH[s.c] && words.every(w => TRSEARCH[s.c].includes(w))) || (window.Study && Study.has(s.uid, words));
    const res = DB.shiurim.filter(s => { if (inTr(s)) return true; const hay = s.title + ' ' + s.tags.join(' ') + ' ' + catPath(s.cat).map(c => c.title).join(' '); return words.every(w => hay.includes(w)) });
    return ravChips() + `<h2 class="sec">תוצאות עבור "${esc(q)}"</h2>` + (res.length ? list(res, 'q' + q, false) : '<div class="empty">לא נמצאו שיעורים</div>');
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
      <div class="muted">${esc(ravName(s.rav))}${s.date ? ' · ' + esc(fmtDate(s.date)) : ''}</div>
      ${s.sub ? `<div class="sub big">${esc(s.sub)}</div>` : ''}
      ${s.spotify && !s.youtube ? `<div class="sp-wrap ${s.spotifyVideo ? 'vid' : ''}"><iframe id="spf" src="https://open.spotify.com/embed/episode/${encodeURIComponent(s.spotify)}${s.spotifyVideo ? '/video' : ''}?utm_source=generator" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Spotify"></iframe></div>` : ''}
      ${s.youtube ? `<div class="yt-wrap"><iframe id="ytf" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.youtube)}?rel=0&enablejsapi=1${ytStart(uid)}" title="YouTube" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : ''}
      ${s.tags.length ? `<div class="tags">${s.tags.map(t => `<a class="tag" href="#/search/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
      ${s.audio.length ? `<div class="player"><audio id="au" controls preload="metadata"></audio>
        <div class="prow"><button class="btn" id="b15">↻ 15 שנ׳</button><button class="btn" id="f15">30 שנ׳ ↺</button>
        <button class="btn ${isFav ? 'on' : ''}" id="fav">${isFav ? '★ במועדפים' : '☆ למועדפים'}</button>
        <select class="btn speed" id="spd">${[0.75, 1, 1.25, 1.5, 1.75, 2].map(v => `<option value="${v}" ${v == (LS.get('speed', 1)) ? 'selected' : ''}>×${v}</option>`).join('')}</select></div>
        <div class="muted" id="resume" style="margin-top:6px"></div></div>` :
        `<div class="prow" style="margin:12px 0"><button class="btn ${isFav ? 'on' : ''}" id="fav">${isFav ? '★ במועדפים' : '☆ למועדפים'}</button></div>`}
      <div class="muted heard" id="heard">${esc(lastHeard(uid))}${s.youtube && !s.audio.length && ytStart(uid) ? ' · ממשיכים מ־' + fmtTime(positions()[uid].t) : ''}</div>
      <div id="trbox"></div><div id="study"></div>
      <h2 class="sec">${s.source.startsWith('haravhendler') ? 'מקורות השיעור' : 'תיאור'}</h2><div class="text" id="txt"><span class="muted">טוען…</span></div>
      <p class="prow"><a class="btn pri" href="${esc(s.pageUrl)}" target="_blank" rel="noopener">${s.youtube && !s.audio.length ? 'צפייה ביוטיוב ↗' : s.spotify && !s.audio.length ? 'האזנה בספוטיפיי ↗' : 'לעמוד המקורי ↗'}</a>
      ${(s.alsoAt || []).map(u => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">גם ב${u.includes('youtube') ? 'יוטיוב' : 'מקור נוסף'} ↗</a>`).join('')}</p>`;
  }
};
function crumbs(path) {
  return `<nav class="crumbs"><a href="#/">בית</a>${path.map(c => `<span class="sep">›</span><a href="#/cat/${encodeURIComponent(c.id)}">${esc(c.title)}</a>`).join('')}</nav>`;
}
let ytSave = null;
window.addEventListener('message', e => { if (!/youtube/.test(e.origin) || !ytSave) return; try { const d = JSON.parse(e.data); if (d.info) ytSave(d.info) } catch {} });
async function setupShiur(s) {
  touch(s.uid);
  app.onclick = e => { if (e.target.closest('button,a,[data-p],select,.ts')) touch(s.uid) };
  app.oninput = () => touch(s.uid);
  const yf = $('#ytf');
  if (yf && !s.audio.length) {
    let yt = { t: 0, d: 0 }, last = 0;
    const save = () => { if (!(yt.t > 0)) return; const p = positions(); p[s.uid] = { t: yt.t, d: yt.d, at: Date.now() }; LS.set('pos', p) };
    ytSave = i => { if (typeof i.currentTime === 'number') yt.t = i.currentTime; if (i.duration) yt.d = i.duration;
      if (i.playerState === 1) touch(s.uid);
      if (i.playerState === 2 || i.playerState === 0 || (i.playerState === 1 && Date.now() - last > 5000) || (typeof i.currentTime === 'number' && Date.now() - last > 5000 && yt.t > 0 && i.playerState !== -1)) { last = Date.now(); if (yt.t > 0) save() } };
    const hello = () => yf.contentWindow && yf.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 2 }), '*');
    yf.addEventListener('load', hello); setTimeout(hello, 1500);
    const off = () => { save(); window.removeEventListener('pagehide', off); window.removeEventListener('hashchange', off); ytSave = null };
    window.addEventListener('pagehide', off); window.addEventListener('hashchange', off);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && ytSave && save());
  }
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
    au.onpause = save; au.onended = save; au.onplay = () => touch(s.uid);
    window.addEventListener('pagehide', () => au.currentTime > 0 && save(), { once: true });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && $('#au') === au && au.currentTime > 0 && save());
    $('#b15').onclick = () => au.currentTime = Math.max(0, au.currentTime - 15);
    $('#f15').onclick = () => au.currentTime += 30;
    $('#spd').onchange = e => { au.playbackRate = +e.target.value; LS.set('speed', +e.target.value) };
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: ravName(s.rav), artwork: [{ src: 'icons/icon-512.png', sizes: '512x512' }] });
  }
  Promise.resolve(renderTr(s)).then(() => window.Study && Study.mount(s));
  const t = $('#txt');
  try {
    const c = await (await fetch('data/content/' + s.c + '.json', { cache: 'no-cache' })).json();
    if (c.html) t.innerHTML = c.html; // sanitized by importer whitelist
    else if (c.excerpt) { t.classList.add('plain'); t.textContent = c.excerpt.trim() }
    else t.innerHTML = '<span class="muted">אין טקסט לשיעור זה</span>';
  } catch { t.innerHTML = '<span class="muted">לא ניתן לטעון את המקורות</span>' }
}
const REPO = 'moshekfir78/shiurim-app';
let TRST = null;
const trStatus = async () => TRST || (TRST = await fetch('data/transcripts-status.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({})));
const canTr = s => s.audio.length || s.youtube;
async function renderTr(s) {
  const box = $('#trbox'); if (!box) return;
  const st = (await trStatus())[s.uid], asked = LS.get('trReq', {})[s.uid];
  const c = await fetch('data/content/' + s.c + '.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({}));
  if (c.transcript) {
    box.innerHTML = `<h2 class="sec">תמלול <span class="muted">(אוטומטי, עשוי להכיל שגיאות)</span> ${c.trSource ? `<span class="trsrc">מקור: ${esc(c.trSource)}</span>` : ''}${c.trRaw ? '<span class="trsrc">טרם עוצב</span>' : ''}</h2><div class="text tr">${c.transcript.map(g => { const q = /^\s*>/.test(g.t), h = esc(g.t.replace(/^\s*>\s*/, '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); return q ? `<blockquote class="trq">${h}</blockquote>` : `<p><a class="ts" data-t="${g.s}">${fmtTime(g.s)}</a> ${h}</p>` }).join('')}</div>`;
    box.querySelectorAll('.ts').forEach(x => x.onclick = () => { const au = $('#au'); if (au) { au.currentTime = +x.dataset.t; au.play() } });
    if (c.trMode !== 'accurate' && s.audio.length) {
      const up = asked && asked.mode === 'accurate' && Date.now() - asked.at < 24 * 3600e3;
      box.insertAdjacentHTML('beforeend', up ? `<p class="trst">⏳ ביקשת תמלול מדויק — הוא יחליף את הנוכחי כשיסתיים.</p>` : `<p class="prow"><button class="btn" id="trUp">🎯 שדרג לתמלול מדויק (איטי)</button></p>`);
      $('#trUp') && ($('#trUp').onclick = () => reqTr(s, 'accurate'));
    }
    return;
  }
  if (!canTr(s)) { box.innerHTML = `<p class="muted">תמלול לא זמין: השיעור זמין רק בספוטיפיי ואין גישה ציבורית לקובץ השמע.</p>`; return }
  if (st && st.status === 'working') { box.innerHTML = `<p class="trst">⏳ בתמלול… התמלול יופיע כאן כשיסתיים.</p>`; clearTimeout(window._trPoll); window._trPoll = setTimeout(() => { if (location.hash.includes(s.uid)) { TRST = null; renderTr(s) } }, 30000); return }
  if (st && st.status === 'failed') { box.innerHTML = `<p class="muted">התמלול נכשל: ${esc(st.reason || '')}</p>`; return }
  const POLL = () => { clearTimeout(window._trPoll); window._trPoll = setTimeout(() => { if ($('#trbox') && location.hash.includes(encodeURIComponent(s.uid).replace(/%3A/g, ':')) || location.hash.includes(s.uid)) { TRST = null; renderTr(s) } }, 30000) };
  if (asked && Date.now() - (asked.at || asked) < 6 * 3600e3) { box.innerHTML = `<p class="trst">⏳ הבקשה נשלחה — התמלול יופיע כאן תוך כמה דקות.</p>`; POLL(); return }
  box.innerHTML = `<p class="prow"><button class="btn" id="trFast">⚡ תמלול מהיר</button>${s.audio.length ? '<button class="btn" id="trAcc">🎯 תמלול מדויק (איטי)</button>' : ''}</p>
    <p class="muted" style="font-size:.8rem">מהיר: כמה דקות. מדויק: מודל ivrit.ai הגדול, יכול לקחת זמן רב יותר.</p>`;
  $('#trFast').onclick = () => reqTr(s, 'fast');
  $('#trAcc') && ($('#trAcc').onclick = () => reqTr(s, 'accurate'));
}
async function reqTr(s, mode) {
  touch(s.uid); document.querySelectorAll('#trbox button').forEach(b => b.disabled = true);
  try { await fetch('https://ntfy.sh/sh-tr-eda8b9c188a97097a43564f400f7a2d2', { method: 'POST', body: s.uid + '|' + mode }) } catch (e) { document.querySelectorAll('#trbox button').forEach(b => b.disabled = false); alert('שליחת הבקשה נכשלה, נסו שוב'); return }
  const r = LS.get('trReq', {}); r[s.uid] = { at: Date.now(), mode }; LS.set('trReq', r); TRST = null; renderTr(s);
}
let TRSEARCH = null;
function render() {
  if (!DB) return;
  const [h0, qs] = location.hash.replace(/^#\/?/, '').split('?'); Q = new URLSearchParams(qs || ''); Q.delete('x');
  const parts = h0.split('/');
  const view = views[parts[0]] ? parts[0] : 'home';
  const arg = parts.slice(1).map(decodeURIComponent).join('/');
  app.innerHTML = views[view](arg);
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('act', a.dataset.tab === (view === 's' ? '' : view)));
}
window.render = render;
views.notes = () => { setTimeout(() => Study.notesView(app), 0); return '<div class="loading">טוען…</div>' };
// ---------- back navigation ----------
const navD = () => (history.state && history.state.d) || 0;
let lastD = navD();
if (!history.state) history.replaceState({ d: 0 }, '');
function parentRoute() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0], p = h.split('/');
  if (p[0] === 's') { const s = byUid[decodeURIComponent(p.slice(1).join('/'))]; return s && s.cat ? '#/cat/' + encodeURIComponent(s.cat) : '#/' }
  if (p[0] === 'cat' && p[1]) { const c = DB.categories[decodeURIComponent(p.slice(1).join('/'))]; return c && c.parent ? '#/cat/' + encodeURIComponent(c.parent) : '#/cat' }
  if ((p[0] === 'topics' || p[0] === 'par') && p[1]) return '#/' + p[0];
  return '#/';
}
window.goBack = () => { const sh = document.querySelector('.sheet.open'); if (sh) { sh.classList.remove('open'); return } navD() > 0 ? history.back() : (location.hash = parentRoute()) };
function updBack() { const h = location.hash.replace(/^#\/?/, '').split('?')[0]; $('#backBtn').hidden = !h; }
window.addEventListener('popstate', () => { const sh = document.querySelector('.sheet.open'); if (sh) sh.classList.remove('open') });
document.addEventListener('click', e => { if (e.target.closest('.fbar .btn')) setTimeout(() => { if (document.querySelector('.sheet.open')) history.pushState({ d: navD() + 1, sheet: 1 }, '') }, 0) });
window.addEventListener('hashchange', () => { if (!history.state) history.replaceState({ d: lastD + 1 }, ''); lastD = navD(); render(); updBack(); scrollTo(0, 0) });
$('#searchForm').onsubmit = e => { e.preventDefault(); location.hash = '#/search/' + encodeURIComponent($('#q').value.trim()) + (location.hash.includes('?') ? '?' + Q : '') };
let deb; $('#q').oninput = e => { clearTimeout(deb); deb = setTimeout(() => { const v = e.target.value.trim(); if (v.length > 1) (location.hash.startsWith('#/search/') ? history.replaceState(history.state, '', '#/search/' + encodeURIComponent(v)) : history.pushState({ d: navD() + 1 }, '', '#/search/' + encodeURIComponent(v))), render() }, 300) };
fetch('data/index.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { DB = d; window.byUidRef = byUid; window.DBravName = ravName; d.shiurim.forEach(s => byUid[s.uid] = s); const SKR = new Set(d.ravs.filter(r => r.kind === 'sketches').map(r => r.id)); d.all = d.shiurim; d.extras = d.ravs.filter(r => SKR.has(r.id) && r.count); d.shiurim = d.shiurim.filter(s => !SKR.has(s.rav)); d.ravs = d.ravs.filter(r => !SKR.has(r.id)); render(); updBack() })
  .catch(() => app.innerHTML = '<div class="empty">שגיאה בטעינת הנתונים</div>');
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update());
  let reloaded = false; // when a new version takes over, reload once so fresh code + data are used
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && navigator.serviceWorker.controller) { reloaded = true; location.reload() } });
}
