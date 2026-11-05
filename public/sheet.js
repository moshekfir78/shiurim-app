'use strict';
/* "דף המקורות שלי": pick sources from the מקורות tab, order them, add your own, export a classic source sheet as Word (.docx).
   Fully client-side: the .docx is assembled here (no library, no server). Source texts are fetched from Sefaria when exporting. */
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const HL = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
const hebNum = n => { let s = ''; for (const [v, c] of HL) while (n >= v) { if (n === 15) { s += 'טו'; n = 0; break } if (n === 16) { s += 'טז'; n = 0; break } s += c; n -= v } return s };

// ---------- picking sources from the rendered list ----------
const itemOf = el => {
  const b = el.querySelector('b'); const head = (b ? b.textContent : el.textContent).trim().replace(/\s+/g, ' ');
  const anchors = el.tagName === 'A' ? [el] : [...el.querySelectorAll('a[href]')];
  let ref = '', url = '', label = '';
  for (const a of anchors) { const m = a.href.match(/^https:\/\/www\.sefaria\.org(?:\.il)?\/([^?#]+)/);
    if (m && !/\/search/.test(a.href) && !/^search/.test(m[1])) { try { ref = decodeURIComponent(m[1]).replace(/_/g, ' ') } catch (e) { ref = m[1] } url = a.href; label = a.textContent.replace(/·?\s*ספריא\s*↗?/g, '').replace(/↗/g, '').trim(); break }
    if (/he\.wikisource\.org/.test(a.href) && !url) { url = a.href; label = a.textContent.replace(/·?\s*ויקיטקסט\s*↗?/g, '').trim() } }
  return { head: head || label, ref, url, label };
};
const keyOf = it => it.ref || it.url || it.head;

let S = null; // {host, refs, s, rec, put}
const sheet = () => (S.rec.sheet = S.rec.sheet || { title: S.s.title || '', items: [], cols: 0 });
const save = () => S.put(S.rec);
const has = it => sheet().items.some(x => keyOf(x) === keyOf(it));

function decorate(el) {
  if (el._sh) return; el._sh = 1;
  const it = itemOf(el); if (!it.head) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'sh-add';
  const upd = () => { const on = has(it); btn.textContent = on ? '✓' : '＋'; btn.classList.toggle('on', on); btn.title = on ? 'הסר מדף המקורות שלי' : 'הוסף לדף המקורות שלי'; btn.setAttribute('aria-label', btn.title) };
  btn.onclick = e => { e.preventDefault(); e.stopPropagation(); const sh = sheet();
    if (has(it)) sh.items = sh.items.filter(x => keyOf(x) !== keyOf(it)); else sh.items.push({ ...it, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) });
    save(); upd(); panel() };
  el._shUpd = upd; upd(); el.prepend(btn);
}
const refreshButtons = () => S.refs.querySelectorAll('.srcl').forEach(el => el._shUpd && el._shUpd());

// ---------- the panel ----------
function panel() {
  const sh = sheet(), n = sh.items.length, h = S.host;
  if (!n && !h._open) { h.innerHTML = `<div class="mys-hint muted">📜 רוצים להעביר את השיעור בעצמכם? לחצו ＋ ליד מקור כדי לבנות <b>דף מקורות משלכם</b> ולהוריד אותו כקובץ Word. <button class="lnk" id="shOwn0">או הוסיפו מקור משלכם</button></div>`;
    h.querySelector('#shOwn0').onclick = () => { h._open = 1; panel(); setTimeout(() => { const i = h.querySelector('#shOwnH'); i && i.focus() }, 0) }; return }
  h.innerHTML = `<div class="card mysheet">
    <div class="row mys-top"><b>📜 דף המקורות שלי</b> <span class="muted">(${n})</span><span style="flex:1"></span><button class="btn pri" id="shDl" ${n ? '' : 'disabled'}>הורדה כ־Word</button></div>
    <label class="mys-lbl">כותרת הדף<input class="inp" id="shTitle" value="${esc(sh.title)}"></label>
    <ol class="mys-list">${sh.items.map((x, i) => `<li><span class="mys-n">${hebNum(i + 1)}.</span><span class="mys-h">${esc(x.head)}${x.own ? ' <span class="muted">(מקור שלי)</span>' : x.ref || x.url ? '' : ' <span class="muted">(בלי נוסח, רק השם)</span>'}</span>
      <button class="btn x" data-up="${i}" ${i ? '' : 'disabled'} aria-label="למעלה">↑</button><button class="btn x" data-dn="${i}" ${i < n - 1 ? '' : 'disabled'} aria-label="למטה">↓</button><button class="btn x" data-rm="${i}" aria-label="הסר">✕</button></li>`).join('')}</ol>
    <details class="grp" ${h._open && !n ? 'open' : ''}><summary>הוספת מקור משלי</summary>
      <input class="inp" id="shOwnH" placeholder="שם המקור (למשל: רמב״ן בראשית א, א)">
      <textarea id="shOwnT" rows="4" placeholder="נוסח המקור (אפשר להשאיר ריק ולמלא אחר כך ב־Word)"></textarea>
      <div class="row"><button class="btn" id="shOwnAdd">הוסף לדף</button></div></details>
    <label class="row muted mys-cols"><input type="checkbox" id="shCols" ${sh.cols ? 'checked' : ''}> שני טורים (מתאים לדף ארוך)</label>
    <p class="muted" id="shMsg"></p></div>`;
  const $ = q => h.querySelector(q);
  $('#shTitle').oninput = e => { sh.title = e.target.value; clearTimeout(h._t); h._t = setTimeout(save, 500) };
  $('#shCols').onchange = e => { sh.cols = e.target.checked ? 1 : 0; save() };
  const mv = (i, d) => { const a = sh.items; [a[i], a[i + d]] = [a[i + d], a[i]]; save(); panel() };
  h.querySelectorAll('[data-up]').forEach(b => b.onclick = () => mv(+b.dataset.up, -1));
  h.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => mv(+b.dataset.dn, 1));
  h.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { sh.items.splice(+b.dataset.rm, 1); save(); panel(); refreshButtons() });
  $('#shOwnAdd').onclick = () => { const hd = $('#shOwnH').value.trim(), t = $('#shOwnT').value.trim(); if (!hd && !t) return;
    sh.items.push({ id: Date.now().toString(36), head: hd || 'מקור', text: t, own: 1 }); save(); h._open = 0; panel() };
  $('#shDl').onclick = async () => { const b = $('#shDl'), m = $('#shMsg'); b.disabled = true; m.textContent = 'מכין את הדף ומביא את נוסח המקורות…';
    try { const f = await build(sh, (i, k) => m.textContent = `מביא נוסח מקורות… (${i}/${k})`);
      if (navigator.canShare && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: sh.title }) } catch (e) { dl(f) } } else dl(f);
      m.textContent = 'הקובץ מוכן ✓'; } catch (e) { m.textContent = 'לא הצלחתי ליצור את הקובץ: ' + e.message } b.disabled = false };
}
const dl = f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000) };

// ---------- fetching the source text ----------
const flat = t => Array.isArray(t) ? t.map(flat).filter(Boolean).join('\n') : String(t || '');
const cleanTxt = t => t.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/[\u0591-\u05AF\u05BD\u05C0\u05C3]/g, '').replace(/\u05BE/g, '־').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const MAX = 5000;
async function textOf(it) {
  if (it.own) return it.text || '';
  if (it.text) return it.text;
  if (it.ref) {
    const d = await fetch('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(it.ref) + '?version=hebrew&return_format=text_only').then(r => r.ok ? r.json() : null).catch(() => null);
    const v = d && d.versions && d.versions[0]; if (v) { let t = cleanTxt(flat(v.text)); if (t.length > MAX) t = t.slice(0, MAX).replace(/\s+\S*$/, '') + ' …'; return t }
  }
  return '';
}

// ---------- minimal .docx writer ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 };
function zip(files) { // stored (no compression) — Word opens it fine
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const [name, str] of files) { const nb = enc.encode(name), data = enc.encode(str), c = crc32(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint32(14, c, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, c, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    cen.push(new Uint8Array(ch.buffer), nb); off += 30 + nb.length + data.length }
  const csz = cen.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
const FONT = 'David';
const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>${o.b ? '<w:b/><w:bCs/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 22}"/><w:szCs w:val="${o.sz || 22}"/><w:rtl/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
const para = (runs, o = {}) => `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}${o.bdr ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="6" w:color="A6A6A6"/></w:pBdr>' : ''}<w:bidi/><w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 60}" w:line="${o.line || 264}" w:lineRule="auto"/><w:jc w:val="${o.jc || 'both'}"/>${o.sect || ''}</w:pPr>${runs}</w:p>`;
const sect = (cols, cont) => `<w:sectPr>${cont ? '' : '<w:footerReference w:type="default" r:id="rIdF"/>'}${cont ? '<w:type w:val="continuous"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1050" w:bottom="1000" w:left="1050" w:header="500" w:footer="500" w:gutter="0"/><w:cols w:num="${cols}" w:space="500"${cols > 1 ? ' w:sep="1"' : ''}/><w:bidi/></w:sectPr>`;

async function build(sh, prog) {
  const items = sh.items; const texts = [];
  for (let i = 0; i < items.length; i += 3) { (await Promise.all(items.slice(i, i + 3).map(textOf))).forEach(t => texts.push(t)); prog && prog(Math.min(i + 3, items.length), items.length) }
  const title = (sh.title || S.s.title || 'דף מקורות').trim();
  const rav = (window.DBravName ? window.DBravName(S.s.rav) : '') || '';
  const cols = sh.cols ? 2 : 1;
  let body = para(run(title, { b: 1, sz: 36 }), { jc: 'center', after: 40 });
  body += para(run('דף מקורות' + (rav ? ' · בעקבות שיעורו של ' + rav : ''), { sz: 20, color: '595959' }), { jc: 'center', after: 200, bdr: 1, sect: cols > 1 ? sect(1, false).replace('<w:footerReference w:type="default" r:id="rIdF"/>', '<w:footerReference w:type="default" r:id="rIdF"/>') : '' });
  items.forEach((it, i) => {
    body += para(run(hebNum(i + 1) + '. ', { b: 1, sz: 24 }) + run(it.head, { b: 1, sz: 24 }), { keep: 1, before: 160, after: 40, jc: 'right' });
    const t = texts[i] || '';
    const lines = t ? t.split(/\n+/) : [''];
    lines.forEach((l, j) => { body += para(run(l, { sz: 22 }), { after: j === lines.length - 1 ? 120 : 20, bdr: j === lines.length - 1 && i < items.length - 1, line: 276 }) });
  });
  const finalSect = cols > 1 ? sect(2, true).replace('<w:type w:val="continuous"/>', '<w:footerReference w:type="default" r:id="rIdF"/><w:type w:val="continuous"/>') : sect(1, false);
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${finalSect}</w:body></w:document>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:eastAsia="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="he-IL" w:eastAsia="en-US" w:bidi="he-IL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:bidi/></w:pPr></w:style></w:styles>`;
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`],
    ['word/document.xml', doc], ['word/styles.xml', styles], ['word/footer1.xml', footer]];
  const name = ('דף מקורות - ' + title).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 70) + '.docx';
  return new File([zip(files)], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

window.Sheet = {
  mount(host, refs, s, rec, put) { if (!host || !refs) return; S = { host, refs, s, rec, put }; host._open = 0; panel();
    refs.querySelectorAll('.srcl').forEach(decorate);
    if (refs._mo) refs._mo.disconnect();
    refs._mo = new MutationObserver(() => refs.querySelectorAll('.srcl').forEach(decorate)); refs._mo.observe(refs, { childList: true, subtree: true }) },
  _build: build, _hebNum: hebNum, _set: x => { S = x }
};
})();
