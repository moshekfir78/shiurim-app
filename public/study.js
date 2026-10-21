'use strict';
/* Study area: everything is stored ONLY on this device (IndexedDB + localStorage). No server. */
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => { t = Math.floor(t || 0); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0') };
const parseTs = str => { const p = str.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1] };

// ---------- IndexedDB ----------
let dbp;
const db = () => dbp || (dbp = new Promise((ok, no) => { const r = indexedDB.open('shiurim-study', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('study', { keyPath: 'uid' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) }));
const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction('study', mode); const st = t.objectStore('study'); const res = fn(st); t.oncomplete = () => ok(res instanceof IDBRequest ? res.result : res); t.onerror = () => no(t.error) }) };
const getRec = async uid => (await tx('readonly', st => st.get(uid))) || { uid, notes: [], versions: [], trVersions: [] };
const allRecs = () => tx('readonly', st => st.getAll());
const putRec = async rec => { rec.updated = Date.now(); window.touchShiur && touchShiur(rec.uid); await tx('readwrite', st => st.put(rec)); INDEX[rec.uid] = textOf(rec); if (isMine(rec)) MINE[rec.uid] = 1; else delete MINE[rec.uid] };
// in-memory text index for search
const strip = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || '' };
const textOf = r => [strip(r.summary), strip(r.trEdit), ...(r.notes || []).map(n => n.text)].join(' ');
const INDEX = {}, MINE = {};
const isMine = r => !!(strip(r.summary).trim() || r.trEdit || (r.notes || []).length || r.fileName);
allRecs().then(rs => { rs.forEach(r => { INDEX[r.uid] = textOf(r); if (isMine(r)) MINE[r.uid] = 1 }); if (/^#\/(search|cat|topics|home|par)?/.test(location.hash)) window.render && render() }).catch(() => {});

// ---------- sanitizing (whitelist) ----------
const OK = new Set(['P', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'DIV', 'BLOCKQUOTE', 'SPAN', 'A']);
function clean(html) {
  const d = document.createElement('div'); d.innerHTML = html;
  const walk = n => [...n.childNodes].forEach(c => {
    if (c.nodeType === 1) {
      if (!OK.has(c.tagName)) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT)$/.test(c.tagName)) { c.remove(); return } const f = document.createDocumentFragment(); while (c.firstChild) f.appendChild(c.firstChild); c.replaceWith(f); walk(n); return }
      [...c.attributes].forEach(a => { if (!(c.tagName === 'A' && a.name === 'href' && /^https:\/\//.test(a.value)) && !(a.name === 'data-t')) c.removeAttribute(a.name) });
      if (c.tagName === 'H1') {} walk(c);
    } else if (c.nodeType !== 3) c.remove();
  });
  walk(d); return d.innerHTML;
}
const TSRE = /^\s*[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d+)?[\])]?\s*[-–—]?\s*/;
// make leading timestamps of paragraphs/list items clickable
function timed(html) {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('p,li,div,h2,h3').forEach(el => {
    const f = el.firstChild; if (!f || f.nodeType !== 3) return; const m = f.textContent.match(TSRE); if (!m) return;
    f.textContent = f.textContent.slice(m[0].length);
    const a = document.createElement('a'); a.className = 'ts'; a.dataset.t = parseTs(m[1]); a.textContent = m[1]; el.insertBefore(a, f); el.insertBefore(document.createTextNode(' '), f);
  });
  return d.innerHTML;
}
const linesToHtml = txt => txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('');
function parseSubs(txt) { // .srt / .vtt -> "[mm:ss] text" lines (keeps timestamps)
  const out = []; txt.replace(/\r/g, '').split(/\n\n+/).forEach(b => {
    const m = b.match(/(\d{1,2}:)?(\d{1,2}):(\d{2})[.,]\d+\s*-->/); if (!m) return;
    const text = b.split('\n').filter(l => !/-->/.test(l) && !/^\d+$/.test(l.trim()) && !/^WEBVTT/.test(l)).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) out.push(`<p>[${fmt((+(m[1] || '0:').slice(0, -1)) * 3600 + +m[2] * 60 + +m[3])}] ${esc(text)}</p>`);
  }); return out.join('');
}
const loadScript = src => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s) });
async function fileToHtml(f) {
  const n = f.name.toLowerCase();
  if (/\.(srt|vtt)$/.test(n)) return parseSubs(await f.text());
  if (n.endsWith('.docx')) { await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js'); return clean((await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() })).value) }
  if (n.endsWith('.pdf')) {
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise; let lines = [];
    for (let i = 1; i <= doc.numPages; i++) { const c = await (await doc.getPage(i)).getTextContent(); const rows = [];
      c.items.forEach(it => { if (!it.str) return; const yy = it.transform[5]; let r = rows.find(r => Math.abs(r.y - yy) < 3); if (!r) rows.push(r = { y: yy, it: [] }); r.it.push(it) });
      rows.sort((a, b) => b.y - a.y).forEach(r => { const heb = r.it.some(x => /[\u0590-\u05FF]/.test(x.str));
        r.it.sort((a, b) => heb ? b.transform[4] - a.transform[4] : a.transform[4] - b.transform[4]);
        lines.push(r.it.map(x => x.str).join(' ').replace(/\s+/g, ' ').trim()) }) }
    return linesToHtml(lines.join('\n'));
  }
  return linesToHtml(await f.text());
}

// ---------- player bridge (audio element or YouTube iframe) ----------
// current YouTube time comes from the page's single YouTube bridge in app.js (window.ytTime)
const ytCmd = (func, args = []) => { const f = $('#ytf'); f && f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*') };
const nowT = () => { const au = $('#au'); if (au) return au.currentTime; if ($('#ytf')) return window.ytTime || 0; return null };
function seek(t) { const au = $('#au'); if (au) { au.currentTime = t; au.play() } else if ($('#ytf')) { ytCmd('seekTo', [t, true]); ytCmd('playVideo') } }
document.addEventListener('click', e => { const a = e.target.closest('#study .ts[data-t], #trbox .ts[data-t]'); if (a) { e.preventDefault(); seek(+a.dataset.t) } });

// ---------- sources detection -> Sefaria (Hebrew) ----------
const BOOKS = { 'בראשית': 'Genesis', 'שמות': 'Exodus', 'ויקרא': 'Leviticus', 'במדבר': 'Numbers', 'דברים': 'Deuteronomy', 'יהושע': 'Joshua', 'שופטים': 'Judges', 'שמואל א': 'I_Samuel', 'שמואל ב': 'II_Samuel', 'מלכים א': 'I_Kings', 'מלכים ב': 'II_Kings',
  'ישעיהו': 'Isaiah', 'ישעיה': 'Isaiah', 'ירמיהו': 'Jeremiah', 'ירמיה': 'Jeremiah', 'יחזקאל': 'Ezekiel', 'הושע': 'Hosea', 'יואל': 'Joel', 'עמוס': 'Amos', 'עובדיה': 'Obadiah', 'יונה': 'Jonah', 'מיכה': 'Micah', 'נחום': 'Nahum', 'חבקוק': 'Habakkuk', 'צפניה': 'Zephaniah', 'חגי': 'Haggai', 'זכריה': 'Zechariah', 'מלאכי': 'Malachi',
  'תהילים': 'Psalms', 'תהלים': 'Psalms', 'משלי': 'Proverbs', 'איוב': 'Job', 'שיר השירים': 'Song_of_Songs', 'רות': 'Ruth', 'איכה': 'Lamentations', 'קהלת': 'Ecclesiastes', 'אסתר': 'Esther', 'דניאל': 'Daniel', 'עזרא': 'Ezra', 'נחמיה': 'Nehemiah', 'דברי הימים א': 'I_Chronicles', 'דברי הימים ב': 'II_Chronicles' };
const MAS = { 'ברכות': 'Berakhot', 'שבת': 'Shabbat', 'עירובין': 'Eruvin', 'פסחים': 'Pesachim', 'יומא': 'Yoma', 'סוכה': 'Sukkah', 'ביצה': 'Beitzah', 'ראש השנה': 'Rosh_Hashanah', 'תענית': 'Taanit', 'מגילה': 'Megillah', 'מועד קטן': 'Moed_Katan', 'חגיגה': 'Chagigah', 'יבמות': 'Yevamot', 'כתובות': 'Ketubot', 'נדרים': 'Nedarim', 'נזיר': 'Nazir', 'סוטה': 'Sotah', 'גיטין': 'Gittin', 'קידושין': 'Kiddushin',
  'בבא קמא': 'Bava_Kamma', 'בבא מציעא': 'Bava_Metzia', 'בבא בתרא': 'Bava_Batra', 'סנהדרין': 'Sanhedrin', 'מכות': 'Makkot', 'שבועות': 'Shevuot', 'עבודה זרה': 'Avodah_Zarah', 'הוריות': 'Horayot', 'זבחים': 'Zevachim', 'מנחות': 'Menachot', 'חולין': 'Chullin', 'בכורות': 'Bekhorot', 'ערכין': 'Arakhin', 'תמורה': 'Temurah', 'כריתות': 'Keritot', 'מעילה': 'Meilah', 'נדה': 'Niddah' };
const GV = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 };
const gem = s => [...s.replace(/["'״׳]/g, '')].reduce((n, c) => n + (GV[c] || 0), 0);
const N = `([א-ת]{1,3}["'״׳]?[א-ת]?|\\d{1,3})`, num = x => /\d/.test(x) ? +x : gem(x);
const alt = o => Object.keys(o).sort((a, b) => b.length - a.length).map(k => k.replace(/ /g, '\\s+')).join('|');
const PS_RE = new RegExp(`(?<![א-ת])(?:[ובלמ]{1,2}(?=[א-ת]))?(${alt(BOOKS)})\\s+(?:פרק\\s+)?${N}(?:\\s*[,:]\\s*|\\s+(?:פסוק|פס['׳])\\s*)${N}(?![א-ת])`, 'g');
const GM_RE = new RegExp(`(?:מסכת\\s+|(?<![א-ת])(?:[ובלמ]{1,2}(?=[א-ת]))?)(${alt(MAS)})\\s+(?:דף\\s+)?${N}\\s*(?:(?:עמוד\\s+|ע["״]?)([אב])["'״׳]?|([.:]))`, 'g');
function sources(text) {
  const out = new Map(); text = text.replace(/\s+/g, ' ');
  for (const m of text.matchAll(PS_RE)) { const bk = BOOKS[m[1].replace(/\s+/g, ' ')], c = num(m[2]), v = num(m[3]); if (bk && c && v && c < 160 && v < 180) out.set(`${bk}.${c}.${v}`, m[0].trim()) }
  for (const m of text.matchAll(GM_RE)) { const ms = MAS[m[1].replace(/\s+/g, ' ')], d = num(m[2]); const side = m[3] ? (m[3] === 'א' ? 'a' : 'b') : m[4] === '.' ? 'a' : 'b'; if (ms && d >= 2 && d < 180) out.set(`${ms}.${d}${side}`, m[0].trim()) }
  return [...out].map(([ref, label]) => ({ ref, label, url: `https://www.sefaria.org.il/${ref}?lang=he` }));
}

// ---------- editor ----------
const TOOLS = [['formatBlock', 'h2', 'כותרת'], ['formatBlock', 'h3', 'כותרת משנה'], ['formatBlock', 'p', 'פסקה'], ['bold', null, '<b>B</b>'], ['insertUnorderedList', null, '• רשימה'], ['insertOrderedList', null, '1. רשימה']];
const toolbar = id => `<div class="etb" role="toolbar">${TOOLS.map(([c, v, l]) => `<button type="button" class="btn" onmousedown="event.preventDefault();document.execCommand('${c}',false,${v ? `'${v}'` : 'null'});document.getElementById('${id}').dispatchEvent(new Event('input'))">${l}</button>`).join('')}
  <button type="button" class="btn" onmousedown="event.preventDefault();Study.insTime('${id}')">⏱ זמן נוכחי</button></div>`;
window.Study = window.Study || {};
Study.insTime = id => { const t = nowT(); if (t == null) return; document.getElementById(id).focus(); document.execCommand('insertText', false, `[${fmt(t)}] `) };

let cur = null, curS = null;
function pushVersion(list, html) { const last = list[0]; if (last && last.html === html) return; if (last && Date.now() - last.at < 60000) last.html = html, last.at = Date.now(); else list.unshift({ html, at: Date.now() }); list.length = Math.min(list.length, 10) }

// Sources on demand: saved results (site sheet / srcFound from the worker) show instantly; otherwise the title,
// the description and a linked Google Docs source sheet are read here, and the worker is asked once to search the
// origin (Drive PDFs/Word, short links, YouTube descriptions) and save the result for every later visitor.
async function srcOnDemand(s, c) {
  const catT = (typeof DB !== 'undefined' && DB && DB.categories[s.cat] || {}).title || '';
  if (Array.isArray(c.srcFound)) return { found: c.srcFound };
  let found = [];
  try { found = SrcLink.titleEntries(s.title, catT).concat(SrcLink.descEntries(c.excerpt || '')) } catch (e) { }
  try { found = found.concat(await SrcLink.sheetEntries(c.excerpt || '')) } catch (e) { }
  if (s.rav === 'sketches' || (c.srcRes && Object.keys(c.srcRes).length)) return { found };
  const at = await SrcLink.requestSearch(s.uid);
  const mins = at ? Math.max(0, Math.round((Date.now() - at) / 60000)) : null;
  const note = at ? `🔎 מחפש מקורות נוספים בעמוד המקור של השיעור${SrcLink.sheetLinks(c.excerpt || '').length ? ' ובדף המקורות המקושר' : ''}… התוצאה תישמר כאן לכל הלומדים (בדרך כלל תוך 10–20 דקות${mins ? `; הבקשה נשלחה לפני ${mins} דק׳` : ''}).` : '';
  return { found, note, pending: !!at && !found.length };
}
async function mount(s) {
  const box = $('#study'); if (!box) return; curS = s; cur = await getRec(s.uid);
  const c = window.PTR ? await PTR.content(s) : await fetch('data/content/' + s.c + '.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({}));
  const autoTr = c.transcript ? c.transcript.map(g => /^\s*>/.test(g.t) ? `<blockquote>${esc(g.t.replace(/^\s*>\s*/, '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</blockquote>` : `<p>[${fmt(g.s)}] ${esc(g.t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`).join('') : '';
  const hasT = nowT() !== null;
  const notes = (cur.notes || []).slice().sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
  // keep references to page parts that live inside tabs (auto transcript box, site's own source text)
  const trbEl = $('#trbox'), txtEl = $('#txt'), txtHead = txtEl && txtEl.previousElementSibling && txtEl.previousElementSibling.tagName === 'H2' ? txtEl.previousElementSibling : (box.querySelector('#stSiteHead') || null);
  const siteLabel = txtHead ? txtHead.textContent : 'מקורות השיעור';
  box.innerHTML = `<h2 class="sec">אזור לימוד <span class="muted">נשמר רק במכשיר הזה</span></h2>
  <div class="card study">
    <div class="st-tabs" role="tablist">
      <button class="btn on" data-p="sum">הסיכום שלי</button><button class="btn" data-p="src">מקורות</button><button class="btn" data-p="tr">תמלול</button><button class="btn" data-p="notes">הערות (${notes.length})</button><button class="btn" data-p="exp">ייצוא ושיתוף</button>
    </div>
    <section data-pane="sum">
      <div class="row"><label class="btn">📄 העלאת קובץ<input type="file" id="stFile" accept=".txt,.docx,.pdf,.srt,.vtt,text/plain" hidden></label>
        <button class="btn" id="stPaste">הדבקת טקסט</button><span class="muted" id="stSaved"></span></div>
      <div id="stPasteBox" hidden><textarea id="stPasteTa" rows="6" placeholder="הדביקו כאן סיכום או תמלול. שורות שמתחילות בזמן (למשל 12:30 או [1:02:05]) יהפכו לנקודות קפיצה."></textarea>
        <div class="row"><button class="btn pri" id="stPasteOk">הוסף לסיכום</button></div></div>
      ${toolbar('stEd')}
      <div id="stEd" class="text editor" contenteditable="true" dir="rtl" data-ph="כתבו כאן את הסיכום שלכם…">${cur.summary || ''}</div>
      <div class="row"><button class="btn" id="stView">תצוגה עם נקודות קפיצה</button>${cur.versions && cur.versions.length ? `<select class="btn" id="stVer"><option value="">היסטוריית גרסאות (${cur.versions.length})</option>${cur.versions.map((v, i) => `<option value="${i}">${new Date(v.at).toLocaleString('he-IL')}</option>`).join('')}</select>` : ''}</div>
      <div id="stPreview" class="text tr" hidden></div>
    </section>
    <section data-pane="notes" hidden>
      <div class="row"><input id="stNote" class="inp" placeholder="${hasT ? 'הערה בזמן הנוכחי…' : 'הערה…'}"><button class="btn pri" id="stAdd">הוסף הערה${hasT ? ' ⏱' : ''}</button></div>
      <div class="list">${notes.map(n => `<div class="note">${n.t != null ? `<a class="ts" data-t="${n.t}">${fmt(n.t)}</a>` : ''}<span>${esc(n.text)}</span><button class="btn x" data-del="${n.id}" aria-label="מחק">✕</button></div>`).join('') || '<div class="muted">אין עדיין הערות.</div>'}</div>
    </section>
    <section data-pane="tr" hidden><div id="stTrHost"></div>
      ${autoTr ? `<details class="grp"><summary>תיקון התמלול <b>עותק מקומי</b></summary><p class="muted">עורכים עותק מקומי; התמלול המקורי נשמר.${cur.trEdit ? ' <button class="btn" id="stTrReset">חזרה למקור</button>' : ''}</p>
      ${toolbar('stTr')}<div id="stTr" class="text editor" contenteditable="true" dir="rtl">${cur.trEdit || autoTr}</div></details>` : ''}${(c.trStories || []).length ? `<h3 class="sub-h">נספח סיפורים</h3><ul>${c.trStories.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>
    <section data-pane="src" hidden><h3 class="sub-h">מקורות ומראי מקומות</h3><div id="stRefs"><p class="muted">טוען…</p></div>${(c.trSources || []).length ? `<details class="grp"><summary>רשימת המקורות מהתמלול (טקסט מלא)</summary><ul class="muted">${c.trSources.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}<h3 class="sub-h" id="stSiteHead">${esc(siteLabel)}</h3><div id="stSiteSrc"></div></section>
    <section data-pane="exp" hidden><div class="row"><button class="btn" id="stDocx">Word (.docx)</button><button class="btn" id="stPdf">PDF</button><button class="btn" id="stShare">שיתוף…</button><a class="btn" id="stWa" target="_blank" rel="noopener">וואטסאפ</a></div></section>
  </div>`;
  // move the auto transcript box and the site's source text into their tabs (no copying into the user's summary)
  if (trbEl) $('#stTrHost').appendChild(trbEl);
  if (txtEl) { $('#stSiteSrc').appendChild(txtEl); if (txtHead && txtHead.id !== 'stSiteHead') txtHead.remove() } else $('#stSiteHead').remove();
  // tabs
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { box.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b)); box.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== b.dataset.p);
    if (b.dataset.p === 'src' && !box._refsDone) { box._refsDone = 1; const ed = $('#stEd'), tr = $('#stTr');
      const segs = (c.transcript || []).map(g => ({ s: g.s, t: g.t }));
      const extras = (c.trSources || []).filter(Boolean);
      const body = [s.title, c.excerpt || '', strip(c.html || ''), strip(tr ? tr.innerHTML : autoTr),
        segs.map(g => g.t).join('\n'), ...(cur.notes || []).map(n => n.text)].join('\n');
      // sources stay in מקורות only — never copied into הסיכום שלי
      srcOnDemand(s, c).then(o => SrcLink.render($('#stRefs'), body, { segments: segs, extras, html: c.html || '', pre: c.srcRes || {}, ...o })) } });
  Study._seek = t => { const au = $('#au'); if (au) { au.currentTime = t; au.play() } else { try { seek(t) } catch (e) {} } };
  // summary autosave
  const ed = $('#stEd'); let deb;
  const save = async () => { cur.summary = clean(ed.innerHTML); cur.versions = cur.versions || []; pushVersion(cur.versions, cur.summary); await putRec(cur); $('#stSaved').textContent = 'נשמר ' + new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) };
  ed.oninput = () => { clearTimeout(deb); deb = setTimeout(save, 800) };
  $('#stVer') && ($('#stVer').onchange = e => { const v = cur.versions[+e.target.value]; if (v && confirm('לשחזר את הגרסה הזו? הגרסה הנוכחית תישמר בהיסטוריה.')) { ed.innerHTML = v.html; save() } });
  $('#stView').onclick = () => { const p = $('#stPreview'); p.hidden = !p.hidden; p.innerHTML = timed(clean(ed.innerHTML)) || '<span class="muted">ריק</span>' };
  $('#stPaste').onclick = () => $('#stPasteBox').hidden = !$('#stPasteBox').hidden;
  const addHtml = h => { ed.innerHTML = (ed.innerHTML.trim() ? ed.innerHTML + '<p></p>' : '') + h; save(); $('#stPreview').hidden = false; $('#stPreview').innerHTML = timed(clean(ed.innerHTML)) };
  $('#stPasteOk').onclick = () => { const t = $('#stPasteTa').value; if (!t.trim()) return; addHtml(/-->/.test(t) ? parseSubs(t) : linesToHtml(t)); $('#stPasteTa').value = ''; $('#stPasteBox').hidden = true };
  $('#stFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; $('#stSaved').textContent = 'טוען קובץ…'; try { addHtml(await fileToHtml(f)) } catch (err) { $('#stSaved').textContent = 'לא ניתן לקרוא את הקובץ: ' + err.message } };
  // notes
  $('#stAdd').onclick = async () => { const v = $('#stNote').value.trim(); if (!v) return; const t = nowT(); cur.notes = cur.notes || []; cur.notes.push({ id: Date.now().toString(36), t: t == null ? null : Math.floor(t), text: v, at: Date.now() }); await putRec(cur); mount(s).then(() => box.querySelector('[data-p="notes"]').click()) };
  $('#stNote').onkeydown = e => { if (e.key === 'Enter') $('#stAdd').click() };
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { cur.notes = cur.notes.filter(n => n.id !== b.dataset.del); await putRec(cur); mount(s).then(() => box.querySelector('[data-p="notes"]').click()) });
  // transcript correction (local copy, original kept)
  const tr = $('#stTr'); let deb2;
  if (tr) { tr.oninput = () => { clearTimeout(deb2); deb2 = setTimeout(async () => { cur.trEdit = clean(tr.innerHTML); cur.trVersions = cur.trVersions || []; pushVersion(cur.trVersions, cur.trEdit); await putRec(cur); showEditedTr() }, 800) };
    $('#stTrReset') && ($('#stTrReset').onclick = async () => { if (!confirm('למחוק את העריכה המקומית ולחזור לתמלול המקורי?')) return; delete cur.trEdit; await putRec(cur); location.reload() }); }
  showEditedTr();
  // export / share
  $('#stDocx').onclick = () => exportDocx(s).then(f => download(f));
  $('#stPdf').onclick = () => printPdf(s);
  $('#stShare').onclick = async () => { const f = await exportDocx(s); if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: s.title }).catch(() => {}); else if (navigator.share) navigator.share({ title: s.title, text: plain(s) }).catch(() => {}); else download(f) };
  $('#stWa').href = 'https://wa.me/?text=' + encodeURIComponent(plain(s).slice(0, 3500));
  // deep link ?t=123 from "my notes"
  const qt = new URLSearchParams(location.hash.split('?')[1] || '').get('t'); if (qt) setTimeout(() => seek(+qt), 1200);
}
function showEditedTr() { // show the corrected transcript (if any) in the transcript box, with a toggle to the original
  const trb = $('#trbox'); if (!trb || !cur || !cur.trEdit) return; const orig = trb.querySelector('.text.tr'); if (!orig) return;
  let ed = trb.querySelector('.tr-edited'); if (!ed) { ed = document.createElement('div'); ed.className = 'text tr tr-edited'; orig.before(ed);
    const t = document.createElement('p'); t.className = 'muted'; t.innerHTML = 'מוצג התמלול המתוקן שלך · <a class="lnk">הצג מקור</a>'; ed.before(t); orig.hidden = true;
    t.querySelector('a').onclick = () => { orig.hidden = !orig.hidden; ed.hidden = !orig.hidden; t.querySelector('a').textContent = orig.hidden ? 'הצג מקור' : 'הצג מתוקן' } }
  ed.innerHTML = timed(cur.trEdit);
}
const plain = s => { const n = (cur.notes || []).slice().sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9)); return s.title + '\n\n' + (strip(cur.summary).trim() ? 'סיכום:\n' + htmlToLines(cur.summary).join('\n') + '\n\n' : '') + (n.length ? 'הערות:\n' + n.map(x => (x.t != null ? fmt(x.t) + ' – ' : '') + x.text).join('\n') : '') };
function htmlToLines(h) { const d = document.createElement('div'); d.innerHTML = h || ''; const out = []; d.querySelectorAll('h2,h3,p,li').forEach(e => { const t = e.textContent.trim(); if (t) out.push((e.tagName === 'LI' ? '• ' : '') + t) }); if (!out.length && d.textContent.trim()) out.push(d.textContent.trim()); return out }
const download = f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000) };
const safeName = t => t.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'shiur';
async function exportDocx(s) {
  await loadScript('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
  const P = (text, o = {}) => new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, ...o, children: [new TextRun({ text, rightToLeft: true, bold: o.bold, font: 'Arial' })] });
  const kids = [P(s.title, { heading: HeadingLevel.HEADING_1 }), P((window.DBravName || (() => ''))(s.rav))];
  const d = document.createElement('div'); d.innerHTML = cur.summary || '';
  if (d.textContent.trim()) { kids.push(P('סיכום', { heading: HeadingLevel.HEADING_2 }));
    d.querySelectorAll('h2,h3,p,li').forEach(e => { const t = e.textContent.trim(); if (!t) return; kids.push(e.tagName === 'H2' ? P(t, { heading: HeadingLevel.HEADING_2 }) : e.tagName === 'H3' ? P(t, { heading: HeadingLevel.HEADING_3 }) : e.tagName === 'LI' ? P('• ' + t) : P(t)) }) }
  const n = (cur.notes || []).slice().sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
  if (n.length) { kids.push(P('הערות', { heading: HeadingLevel.HEADING_2 })); n.forEach(x => kids.push(P((x.t != null ? fmt(x.t) + ' – ' : '') + x.text))) }
  const blob = await Packer.toBlob(new Document({ sections: [{ properties: {}, children: kids }] }));
  return new File([blob], safeName(s.title) + '.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
function printPdf(s) {
  const w = window.open('', '_blank'); if (!w) return alert('אפשרו חלונות קופצים כדי לייצא PDF');
  const n = (cur.notes || []).slice().sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
  w.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(s.title)}</title><style>body{font-family:Rubik,Arial,sans-serif;max-width:720px;margin:24px auto;line-height:1.7;color:#1f2633}h1{font-size:1.4rem;white-space:pre-wrap}h2{font-size:1.15rem;margin-top:1.4em}.t{color:#22385c;font-family:monospace}</style></head><body>
    <h1>${esc(s.title)}</h1>${(cur.summary || '').trim() ? '<h2>סיכום</h2>' + clean(cur.summary) : ''}${n.length ? '<h2>הערות</h2>' + n.map(x => `<p>${x.t != null ? `<span class="t">${fmt(x.t)}</span> – ` : ''}${esc(x.text)}</p>`).join('') : ''}
    <script>onload=()=>{print()}<\/script></body></html>`); w.document.close();
}

// ---------- "my notes" page + backup/restore ----------
async function notesView(app) {
  const rs = (await allRecs()).filter(r => (r.notes && r.notes.length) || strip(r.summary).trim() || r.trEdit).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const by = window.byUidRef || {};
  app.innerHTML = `<h1 class="page">ההערות והסיכומים שלי</h1><p class="muted">כל הנתונים שמורים רק במכשיר הזה. מומלץ לגבות מדי פעם.</p>
  <div class="row"><button class="btn" id="bkOut">גיבוי לקובץ JSON</button><label class="btn">שחזור מגיבוי<input type="file" id="bkIn" accept=".json,application/json" hidden></label></div>
  ${rs.length ? rs.map(r => { const s = by[r.uid]; const n = (r.notes || []).slice().sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
    return `<div class="card study"><a class="title" href="#/s/${encodeURIComponent(r.uid)}">${esc(s ? s.title : r.uid)}</a>
      ${strip(r.summary).trim() ? `<div class="muted">סיכום: ${esc(strip(r.summary).slice(0, 140))}…</div>` : ''}${r.trEdit ? '<div class="muted">✎ תמלול מתוקן</div>' : ''}
      ${n.map(x => `<div class="note">${x.t != null ? `<a class="ts" href="#/s/${encodeURIComponent(r.uid)}?t=${x.t}">${fmt(x.t)}</a>` : ''}<span>${esc(x.text)}</span></div>`).join('')}</div>` }).join('') : '<div class="empty">עדיין אין הערות או סיכומים. פתחו שיעור והוסיפו באזור הלימוד.</div>'}`;
  $('#bkOut').onclick = async () => { const data = { app: 'shiurim', version: 1, exported: new Date().toISOString(), study: await allRecs(), local: {} };
    ['favs', 'pos', 'speed', 'rav', 'trReq'].forEach(k => { const v = localStorage.getItem(k); if (v != null) data.local[k] = v });
    download(new File([JSON.stringify(data)], 'shiurim-backup-' + new Date().toISOString().slice(0, 10) + '.json', { type: 'application/json' })) };
  $('#bkIn').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (d.app !== 'shiurim') throw new Error('קובץ לא מוכר');
      if (!confirm(`לשחזר ${d.study.length} רשומות? רשומות קיימות לאותם שיעורים יוחלפו.`)) return;
      for (const r of d.study) await tx('readwrite', st => st.put(r)); Object.entries(d.local || {}).forEach(([k, v]) => localStorage.setItem(k, v));
      d.study.forEach(r => INDEX[r.uid] = textOf(r)); alert('השחזור הושלם'); notesView(app) } catch (err) { alert('שחזור נכשל: ' + err.message) } };
}
Object.assign(Study, { mount, notesView, sources, timed, parseSubs, mine: uid => !!MINE[uid], has: (uid, words) => { const t = INDEX[uid]; return !!t && words.every(w => t.includes(w)) }, _db: { allRecs, putRec, getRec } });
})();
