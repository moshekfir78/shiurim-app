// On-demand source detection + Sefaria resolution (runs only when the מקורות tab is opened; cached on device)
(function () {
  const TN = ['בראשית','שמות','ויקרא','במדבר','דברים','יהושע','שופטים','שמואל א','שמואל ב','מלכים א','מלכים ב','ישעיהו','ישעיה','ירמיהו','ירמיה','יחזקאל','הושע','יואל','עמוס','עובדיה','יונה','מיכה','נחום','חבקוק','צפניה','חגי','זכריה','מלאכי','תהילים','תהלים','משלי','איוב','שיר השירים','רות','איכה','קהלת','אסתר','דניאל','עזרא','נחמיה','דברי הימים א','דברי הימים ב'];
  const MAS = 'ברכות|שבת|עירובין|פסחים|יומא|סוכה|ביצה|ראש השנה|תענית|מגילה|מועד קטן|חגיגה|יבמות|כתובות|נדרים|נזיר|סוטה|גיטין|קידושין|בבא קמא|בבא מציעא|בבא בתרא|סנהדרין|מכות|שבועות|עבודה זרה|הוריות|זבחים|מנחות|חולין|בכורות|ערכין|תמורה|כריתות|מעילה|נדה|שקלים'.split('|');
  const MISH = 'פאה|דמאי|כלאים|שביעית|תרומות|מעשרות|מעשר שני|חלה|ערלה|ביכורים|עדויות|אבות|מדות|מידות|קנים|כלים|אהלות|נגעים|פרה|טהרות|מקואות|מכשירין|זבים|טבול יום|ידים|עוקצין'.split('|');
  const COMM = ['רש"י','רשי','רמב"ן','רמבן','אבן עזרא','ספורנו','אור החיים','כלי יקר','רשב"ם','רשבם','מלבי"ם','מלבים','רד"ק','רדק','העמק דבר','משך חכמה','בעל הטורים'];
  const CMAP = { 'רשי': 'רש"י', 'רמבן': 'רמב"ן', 'רשבם': 'רשב"ם', 'מלבים': 'מלבי"ם', 'רדק': 'רד"ק' };
  const RABBAH = ['בראשית רבה','שמות רבה','ויקרא רבה','במדבר רבה','דברים רבה','שיר השירים רבה','איכה רבה','קהלת רבה','רות רבה','אסתר רבה'];
  const SA = { 'אורח חיים': 'אורח חיים', 'או"ח': 'אורח חיים', 'יורה דעה': 'יורה דעה', 'יו"ד': 'יורה דעה', 'אבן העזר': 'אבן העזר', 'אה"ע': 'אבן העזר', 'חושן משפט': 'חושן משפט', 'חו"מ': 'חושן משפט' };
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alt = xs => [...new Set(xs)].sort((a, b) => b.length - a.length).map(x => esc(x).replace(/ /g, '\\s+')).join('|');
  const NUM = `(?:\\d{1,3}|[א-ת]{1,2}["']?[א-ת]?(?![א-ת]))`;
  const NUM2 = `(?!רש"|רמב|רד"|רשב|רי"|ר"ת|רא"ש|ש"ס|ת"ח|ת"ת)` + NUM;
  const KW = `(?:פרק|פרשה|פסוק|פס'|הלכה|הל'|משנה|סימן|סי'|סעיף|סע'|ס"ק|דף|עמוד|ע"[אב])`;
  const SEP = `(?:\\s*[,:.\\-]\\s*|\\s+)`, PRE = `(?<![א-ת"])(?:[ובלמה]{1,2}(?=[א-ת]))?`;
  const seq = n => `((?:${KW}\\s*)?${NUM}(?:${SEP}(?:${KW}\\s*)?${NUM2}){${n - 1},2})`;
  const R = s => new RegExp(s, 'g');
  const PATS = [
    ['comm', R(`${PRE}(${alt(COMM)})\\s+(?:על\\s+(?:התורה\\s+)?|ל)?(?:ה)?(${alt(TN)})\\s+${seq(2)}`)],
    ['rabbah', R(`${PRE}(${alt(RABBAH)})\\s+${seq(1)}`)],
    ['sa', R(`${PRE}(?:שולחן ערוך|שו"ע|שוע)\\s*,?\\s*(${alt(Object.keys(SA))})\\s*,?\\s+${seq(1)}`)],
    ['mb', R(`${PRE}(משנה ברורה|מ"ב)\\s+${seq(1)}`)],
    ['rambam', R(`${PRE}(?:רמב"ם|רמבם|משנה תורה)\\s*,?\\s*(?:הלכות|הל')\\s+([א-ת"]+(?:\\s+(?!פרק)[א-ת"]+)?)\\s+${seq(2)}`)],
    ['mishna', R(`(?<![א-ת])(?:ב|ו)?(משנה|משנת|מתני'?)\\s+(?:מסכת\\s+)?(${alt(MAS.concat(MISH))})\\s+${seq(2)}`)],
    ['mishna2', R(`${PRE}(?:מסכת\\s+)?(${alt(MISH)})\\s+(?:פרק\\s+)${seq(2)}`)],
    ['yer', R(`${PRE}(?:ירושלמי|תלמוד ירושלמי)\\s+(?:מסכת\\s+)?(${alt(MAS.concat(MISH))})\\s+${seq(2)}`)],
    ['tanakh', R(`${PRE}(?:ספר\\s+)?(${alt(TN)})\\s+${seq(2)}`)],
    ['bavli', R(`(?:מסכת\\s+|${PRE})(${alt(MAS)})\\s+(?:דף\\s+)?(${NUM})\\s*(?:(?:עמוד\\s+|ע"?\\s*)([אב])(?![א-ת])["']?|([.:])(?!\\d))`)],
  ];
  const GV = {}; [...'אבגדהוזחטיכךלמםנןסעפףצץקרשת'].forEach((c, i) => GV[c] = [1,2,3,4,5,6,7,8,9,10,20,20,30,40,40,50,50,60,70,80,80,90,90,100,200,300,400][i]);
  const okn = t => { t = t.replace(/["']/g, ''); if (/^\d+$/.test(t)) return +t > 0 && +t < 1000; const v = [...t].map(c => GV[c] || 0); return v.every(Boolean) && (t === 'טו' || t === 'טז' || v.every((x, i) => i === v.length - 1 || x > v[i + 1] || (x === 400 && v[i + 1] === 400))) };
  const nums = s => { const out = []; for (const t of s.replace(R(KW), ' ').replace(/[,:.\-]/g, ' ').split(/\s+/).filter(Boolean)) { if (!okn(t)) break; out.push(t.replace(/["']/g, '')) } return out };
  const MINN = { tanakh: 2, comm: 2, mishna: 2, mishna2: 2, yer: 2, rambam: 2 };
  function candidates(text) {
    text = text.replace(/״/g, '"').replace(/[׳`]/g, "'").replace(/\s+/g, ' ');
    const out = [], taken = [];
    for (const [k, rx] of PATS) for (const m of text.matchAll(rx)) {
      const a = m.index, b = a + m[0].length; if (taken.some(([x, y]) => x < b && a < y)) continue;
      const g = m.slice(1), last = g.filter(x => x !== undefined).pop(); let q;
      if (k !== 'bavli') { const n = nums(k === 'bavli' ? '' : g[g.length - 1] || ''); if (n.length < (MINN[k] || 1)) continue;
        const ns = (k === 'tanakh' && n.length === 3) ? `${n[0]} ${n[1]}-${n[2]}` : n.join(' ');
        q = { comm: () => `${CMAP[g[0]] || g[0]} על ${g[1]} ${ns}`, rabbah: () => `${g[0]} ${ns}`, sa: () => `שולחן ערוך ${SA[g[0].replace(/\s+/g, ' ')]} ${ns}`, mb: () => `משנה ברורה ${ns}`, rambam: () => `משנה תורה, הלכות ${g[0]} ${ns}`, mishna: () => `משנה ${g[1]} ${ns}`, mishna2: () => `משנה ${g[0]} ${ns}`, yer: () => `ירושלמי ${g[0]} ${ns}`, tanakh: () => `${g[0]} ${ns}` }[k]();
      } else { if (!okn(g[1])) continue; q = `${g[0]} ${g[1].replace(/["']/g, '')} ${g[2] || (g[3] === '.' ? 'א' : 'ב')}` }
      taken.push([a, b]); out.push({ q: q.replace(/\s+/g, ' ').trim(), label: m[0].trim(), pos: a });
    }
    const seen = new Set(); return out.sort((x, y) => x.pos - y.pos).filter(c => !seen.has(c.q) && seen.add(c.q));
  }
  const CK = 'sefcache1', cache = JSON.parse(localStorage.getItem(CK) || '{}');
  const saveC = () => { try { localStorage.setItem(CK, JSON.stringify(cache)) } catch (e) { } };
  const flat = t => { while (Array.isArray(t)) t = t.find(Boolean) || ''; return String(t || '').replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ') };
  async function resolve(q) {
    if (q in cache) return cache[q];
    try {
      const d = await fetch('https://www.sefaria.org/api/name/' + encodeURIComponent(q) + '?limit=0').then(r => r.json());
      let res = null;
      if (d && d.is_ref && d.url && /\d/.test(d.ref || '')) {
        const t = await fetch('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(d.url) + '?version=hebrew&return_format=text_only').then(r => r.ok ? r.json() : null).catch(() => null);
        const prev = t && t.versions && t.versions[0] ? flat(t.versions[0].text).slice(0, 160) : '';
        if (t && prev) res = { ref: t.ref || d.ref, he: t.heRef || q, url: d.url, prev };
        else if (!t) res = { ref: d.ref, he: q, url: d.url, prev: '' };
      }
      cache[q] = res; saveC(); return res;
    } catch (e) { return undefined }   // network error: not cached
  }
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fallback = c => `https://www.google.com/search?q=${encodeURIComponent(c.q)}`;
  async function render(host, text) {
    const cs = candidates(text).slice(0, 60);
    if (!cs.length) { host.innerHTML = '<p class="muted">לא זוהו מראי מקומות בטקסט של השיעור, בסיכום, בתמלול ובהערות.</p>'; return }
    host.innerHTML = `<p class="muted" id="srcProg">מאתר ${cs.length} מקורות בספריא…</p><div class="list srclist"></div>`;
    const list = host.querySelector('.srclist'), seen = new Set(); let ok = 0, miss = [];
    for (let i = 0; i < cs.length; i += 4) {
      const rs = await Promise.all(cs.slice(i, i + 4).map(c => resolve(c.q).then(r => [c, r])));
      for (const [c, r] of rs) {
        if (r && !seen.has(r.url)) { seen.add(r.url); ok++;
          list.insertAdjacentHTML('beforeend', `<a class="srcl" href="https://www.sefaria.org.il/${encodeURI(r.url)}?lang=he" target="_blank" rel="noopener"><b>${h(r.he)}</b> <span class="muted">ספריא ↗</span>${r.prev ? `<span class="srcprev">${h(r.prev)}…</span>` : ''}</a>`) }
        else if (r === undefined) miss.push(c);
      }
      const p = host.querySelector('#srcProg'); if (p) p.textContent = `מאתר מקורות בספריא… (${Math.min(i + 4, cs.length)}/${cs.length})`;
    }
    const p = host.querySelector('#srcProg');
    if (p) p.textContent = ok ? `נמצאו ${ok} מקורות בספריא` : 'לא נמצאו בספריא מקורות תקינים לציטוטים שזוהו.';
    if (miss.length) host.insertAdjacentHTML('beforeend', `<p class="muted">לא ניתן היה להתחבר לספריא עבור ${miss.length} מקורות (אין רשת?). חיפוש: ${miss.map(c => `<a href="${fallback(c)}" target="_blank" rel="noopener">${h(c.label)}</a>`).join(' · ')}</p>`);
  }
  window.SrcLink = { candidates, render };
})();
