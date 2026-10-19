// On-demand source detection + Sefaria resolution (מקורות tab only; cached on device)
(function () {
  const TN = {
    'בראשית': 'Genesis', 'שמות': 'Exodus', 'ויקרא': 'Leviticus', 'במדבר': 'Numbers', 'דברים': 'Deuteronomy',
    'יהושע': 'Joshua', 'שופטים': 'Judges', 'שמואל א': 'I Samuel', 'שמואל א\'': 'I Samuel', 'שמואל ב': 'II Samuel', 'שמואל ב\'': 'II Samuel',
    'מלכים א': 'I Kings', 'מלכים א\'': 'I Kings', 'מלכים ב': 'II Kings', 'מלכים ב\'': 'II Kings',
    'ישעיהו': 'Isaiah', 'ישעיה': 'Isaiah', 'ירמיהו': 'Jeremiah', 'ירמיה': 'Jeremiah', 'יחזקאל': 'Ezekiel',
    'הושע': 'Hosea', 'יואל': 'Joel', 'עמוס': 'Amos', 'עובדיה': 'Obadiah', 'יונה': 'Jonah', 'מיכה': 'Micah',
    'נחום': 'Nahum', 'חבקוק': 'Habakkuk', 'צפניה': 'Zephaniah', 'חגי': 'Haggai', 'זכריה': 'Zechariah', 'מלאכי': 'Malachi',
    'תהילים': 'Psalms', 'תהלים': 'Psalms', 'משלי': 'Proverbs', 'איוב': 'Job', 'שיר השירים': 'Song of Songs',
    'רות': 'Ruth', 'איכה': 'Lamentations', 'קהלת': 'Ecclesiastes', 'אסתר': 'Esther', 'דניאל': 'Daniel',
    'עזרא': 'Ezra', 'נחמיה': 'Nehemiah', 'דברי הימים א': 'I Chronicles', 'דברי הימים א\'': 'I Chronicles',
    'דברי הימים ב': 'II Chronicles', 'דברי הימים ב\'': 'II Chronicles'
  };
  const MAS = {
    'ברכות': 'Berakhot', 'שבת': 'Shabbat', 'עירובין': 'Eruvin', 'פסחים': 'Pesachim', 'יומא': 'Yoma', 'סוכה': 'Sukkah',
    'ביצה': 'Beitzah', 'ראש השנה': 'Rosh Hashanah', 'תענית': 'Taanit', 'מגילה': 'Megillah', 'מועד קטן': 'Moed Katan',
    'חגיגה': 'Chagigah', 'יבמות': 'Yevamot', 'כתובות': 'Ketubot', 'נדרים': 'Nedarim', 'נזיר': 'Nazir', 'סוטה': 'Sotah',
    'גיטין': 'Gittin', 'קידושין': 'Kiddushin', 'בבא קמא': 'Bava Kamma', 'בבא מציעא': 'Bava Metzia', 'בבא בתרא': 'Bava Batra',
    'סנהדרין': 'Sanhedrin', 'מכות': 'Makkot', 'שבועות': 'Shevuot', 'עבודה זרה': 'Avodah Zarah', 'הוריות': 'Horayot',
    'זבחים': 'Zevachim', 'מנחות': 'Menachot', 'חולין': 'Chullin', 'בכורות': 'Bekhorot', 'ערכין': 'Arakhin',
    'תמורה': 'Temurah', 'כריתות': 'Keritot', 'מעילה': 'Meilah', 'נדה': 'Niddah', 'שקלים': 'Shekalim'
  };
  const MISH = 'פאה|דמאי|כלאים|שביעית|תרומות|מעשרות|מעשר שני|חלה|ערלה|ביכורים|עדויות|אבות|מדות|מידות|קנים|כלים|אהלות|נגעים|פרה|טהרות|מקואות|מכשירין|זבים|טבול יום|ידים|עוקצין'.split('|');
  const RAMBAM = {
    'תשובה': 'Repentance', 'יסודי התורה': 'Foundations of the Torah', 'דעות': 'Human Dispositions', 'תלמוד תורה': 'Torah Study',
    'עבודה זרה': 'Foreign Worship and Customs of the Nations', 'תפילה': 'Prayer and the Priestly Blessing', 'תפילין': 'Tefillin, Mezuzah and the Torah Scroll',
    'שבת': 'Sabbath', 'חמץ ומצה': 'Leavened and Unleavened Bread', 'שופר': 'Shofar, Sukkah and Lulav', 'מגילה': 'Megillah and Chanukah',
    'אישות': 'Marriage', 'גירושין': 'Divorce', 'קדושה': 'Forbidden Intercourse', 'מאכלות אסורות': 'Forbidden Foods',
    'שחיטה': 'Shechitah', 'נזקי ממון': 'Damages to Property', 'גניבה': 'Theft', 'גזילה ואבידה': 'Robbery and Lost Property',
    'חובל ומזיק': 'One Who Injures a Person or Property', 'רוצח': 'Murderer and the Preservation of Life', 'מכירה': 'Sales',
    'שכנים': 'Neighbors', 'שלוחין ושותפין': 'Agents and Partners', 'עבדים': 'Slaves', 'שכירות': 'Hiring',
    'שאלה ופקדון': 'Borrowing and Deposit', 'מלווה ולווה': 'Creditor and Debtor', 'טוען ונטען': 'Plaintiff and Defendant',
    'נחלות': 'Inheritances', 'סנהדרין': 'Sanhedrin and the Penalties Under Their Jurisdiction', 'עדות': 'Witnesses',
    'ממרים': 'Rebels', 'אבל': 'Mourning', 'מלכים': 'Kings and Wars', 'תשובה ': 'Repentance'
  };
  const SA = { 'אורח חיים': 'Orach Chayim', 'או"ח': 'Orach Chayim', 'או״ח': 'Orach Chayim', 'יורה דעה': 'Yoreh Deah', 'יו"ד': 'Yoreh Deah', 'יו״ד': 'Yoreh Deah', 'אבן העזר': 'Even HaEzer', 'אה"ע': 'Even HaEzer', 'אה״ע': 'Even HaEzer', 'חושן משפט': 'Choshen Mishpat', 'חו"מ': 'Choshen Mishpat', 'חו״מ': 'Choshen Mishpat' };
  const COMM = ['רש"י', 'רשי', 'רמב"ן', 'רמבן', 'אבן עזרא', 'ספורנו', 'אור החיים', 'כלי יקר', 'רשב"ם', 'רשבם', 'מלבי"ם', 'מלבים', 'רד"ק', 'רדק', 'העמק דבר', 'משך חכמה', 'בעל הטורים'];
  const CMAP = { 'רשי': 'רש"י', 'רמבן': 'רמב"ן', 'רשבם': 'רשב"ם', 'מלבים': 'מלבי"ם', 'רדק': 'רד"ק' };
  const RABBAH = ['בראשית רבה', 'שמות רבה', 'ויקרא רבה', 'במדבר רבה', 'דברים רבה', 'שיר השירים רבה', 'איכה רבה', 'קהלת רבה', 'רות רבה', 'אסתר רבה'];
  const PARASHOT = 'בראשית|נח|לך לך|וירא|חיי שרה|תולדות|ויצא|וישלח|וישב|מקץ|ויגש|ויחי|שמות|וארא|בא|בשלח|יתרו|משפטים|תרומה|תצוה|כי תשא|ויקהל|פקודי|ויקרא|צו|שמיני|תזריע|מצורע|אחרי מות|קדושים|אמור|בהר|בחקתי|במדבר|נשא|בהעלותך|שלח|קרח|חקת|בלק|פינחס|מטות|מסעי|דברים|ואתחנן|עקב|ראה|שופטים|כי תצא|כי תבוא|נצבים|וילך|האזינו|וזאת הברכה'.split('|');

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alt = xs => [...new Set(xs)].sort((a, b) => b.length - a.length).map(x => esc(x).replace(/ /g, '\\s+')).join('|');
  const GV = {}; [...'אבגדהוזחטיכךלמםנןסעפףצץקרשת'].forEach((c, i) => { GV[c] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 20, 30, 40, 40, 50, 50, 60, 70, 80, 80, 90, 90, 100, 200, 300, 400][i] });
  const stripQ = t => String(t || '').replace(/["'״׳`]/g, '');
  const okn = t => { t = stripQ(t); if (/^\d+$/.test(t)) return +t > 0 && +t < 1000; if (t === 'טו' || t === 'טז') return true; const v = [...t].map(c => GV[c] || 0); return v.length && v.every(Boolean) && v.every((x, i) => i === v.length - 1 || x >= v[i + 1] || (x === 400 && v[i + 1] === 400)) };
  const toArab = t => { t = stripQ(t); if (/^\d+$/.test(t)) return +t; if (t === 'טו') return 15; if (t === 'טז') return 16; return [...t].reduce((n, c) => n + (GV[c] || 0), 0) };
  const NUM = `(?:\\d{1,3}|[א-ת]{1,3}["'״׳]?[א-ת]?)`;
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const normBook = s => (s || '').replace(/\s+/g, ' ').replace(/["'״׳]/g, '').trim();

  function candidates(text) {
    text = String(text || '').replace(/״/g, '"').replace(/[׳`]/g, "'").replace(/\s+/g, ' ');
    const out = [], taken = [];
    const add = (a, b, q, label, kind) => {
      if (taken.some(([x, y]) => x < b && a < y)) return;
      q = q.replace(/\s+/g, ' ').trim(); if (!q) return;
      taken.push([a, b]); out.push({ q, label: (label || '').trim() || q, pos: a, kind });
    };
    const books = alt(Object.keys(TN)), mas = alt(Object.keys(MAS)), mish = alt(MISH), sa = alt(Object.keys(SA));
    // Compact Tanakh: ספר? BOOK NUM[,: ]NUM   e.g. בראשית ב', י"ט / תהלים ל"ט, ה' / דברים ז:ז
    for (const m of text.matchAll(new RegExp(`(?<![א-ת])(?:ספר\\s+)?(${books})\\s*,?\\s+(?:פרק\\s+)?(${NUM})\\s*[,:־\\-]\\s*(?:פסוק\\s+|פס['״׳]?\\s*)?(${NUM})(?![א-ת])`, 'g'))) {
      const bk = normBook(m[1]), c = stripQ(m[2]), v = stripQ(m[3]); if (!okn(c) || !okn(v)) continue;
      add(m.index, m.index + m[0].length, `${bk} ${c}:${v}`, m[0], 'tanakh');
    }
    // Keyword Tanakh: ספר? BOOK פרק X פסוק Y  (and ranges פסוק י"א-י"ב)
    for (const m of text.matchAll(new RegExp(`(?<![א-ת])(?:ספר\\s+)?(${books})\\s*,?\\s+פרק\\s+(${NUM})\\s*,?\\s+פסוק(?:ים)?\\s+(${NUM})(?:\\s*[–\\-]\\s*(${NUM}))?`, 'g'))) {
      const bk = normBook(m[1]), c = stripQ(m[2]), v = stripQ(m[3]); if (!okn(c) || !okn(v)) continue;
      const q = m[4] && okn(m[4]) ? `${bk} ${c}:${v}-${stripQ(m[4])}` : `${bk} ${c}:${v}`;
      add(m.index, m.index + m[0].length, q, m[0], 'tanakh');
    }
    // Yerushalmi
    for (const m of text.matchAll(new RegExp(`(?:ירושלמי|תלמוד\\s+ירושלמי)\\s+(?:מסכת\\s+)?(${mas})\\s+(${NUM})\\s*[,:]\\s*(${NUM})`, 'g'))) {
      if (!okn(m[2]) || !okn(m[3])) continue;
      add(m.index, m.index + m[0].length, `ירושלמי ${normBook(m[1])} ${stripQ(m[2])}:${stripQ(m[3])}`, m[0], 'yer');
    }
    // Bavli: (תלמוד בבלי,)? MAS דף? NUM ע"?[אב]?
    for (const m of text.matchAll(new RegExp(`(?:תלמוד\\s+בבלי\\s*,?\\s*)?(?:מסכת\\s+)?(${mas})\\s*,?\\s+(?:דף\\s+)?(${NUM})\\s*(?:ע(?:מוד\\s+|["'״]?)([אב])["'״׳]?)?`, 'g'))) {
      const ms = normBook(m[1]), d = stripQ(m[2]); if (!okn(d)) continue;
      const side = m[3] || '';
      add(m.index, m.index + m[0].length, side ? `${ms} ${d} ${side}` : `${ms} ${d}`, m[0], 'bavli');
    }
    // Rambam: רמב"ם / משנה תורה, הלכות X פרק? N הלכה? M
    for (const m of text.matchAll(new RegExp(`(?:רמב["״]ם|רמבם|משנה\\s+תורה)\\s*,?\\s*(?:הלכות|הל['״׳])\\s+([א-ת"]+(?:\\s+(?!פרק|הלכה)[א-ת"]+){0,3})\\s*,?\\s*(?:פרק\\s+)?(${NUM})(?:\\s*,?\\s*(?:הלכה|הל['״׳])\\s+(${NUM}))?`, 'g'))) {
      const hil = m[1].replace(/\s+/g, ' ').trim(), p = stripQ(m[2]); if (!okn(p)) continue;
      const q = m[3] && okn(m[3]) ? `רמב"ם הלכות ${hil} ${p}:${stripQ(m[3])}` : `רמב"ם הלכות ${hil} ${p}`;
      add(m.index, m.index + m[0].length, q, m[0], 'rambam');
    }
    // Shulchan Aruch
    for (const m of text.matchAll(new RegExp(`(?:שולחן\\s+ערוך|שו["״]ע|שוע)\\s*,?\\s*(${sa})\\s*,?\\s*(?:סימן|סי['״׳])?\\s*(${NUM})`, 'g'))) {
      const sec = SA[normBook(m[1])] ? normBook(m[1]) : m[1], n = stripQ(m[2]); if (!okn(n)) continue;
      add(m.index, m.index + m[0].length, `שולחן ערוך ${Object.keys(SA).includes(sec) ? sec : m[1].replace(/\s+/g, ' ')} ${n}`, m[0], 'sa');
    }
    // Mishnah Berurah
    for (const m of text.matchAll(new RegExp(`(?:משנה\\s+ברורה|מ["״]ב)\\s+(?:סימן\\s+)?(${NUM})`, 'g'))) {
      if (!okn(m[1])) continue; add(m.index, m.index + m[0].length, `משנה ברורה ${stripQ(m[1])}`, m[0], 'mb');
    }
    // Midrash Rabbah
    for (const m of text.matchAll(new RegExp(`(${alt(RABBAH)})\\s+(${NUM})\\s*[,:]\\s*(${NUM})`, 'g'))) {
      if (!okn(m[2]) || !okn(m[3])) continue;
      add(m.index, m.index + m[0].length, `${m[1]} ${stripQ(m[2])}:${stripQ(m[3])}`, m[0], 'rabbah');
    }
    // Mishna
    const mishBooks = alt(Object.keys(MAS).concat(MISH));
    for (const m of text.matchAll(new RegExp(`(?<![א-ת])(?:משנה|משנת|מתני['״׳]?)\\s+(?:מסכת\\s+)?(${mishBooks})\\s+(?:פרק\\s+)?(${NUM})\\s*(?:[,:]\\s*|\\s+משנה\\s+)(${NUM})`, 'g'))) {
      if (!okn(m[2]) || !okn(m[3])) continue;
      add(m.index, m.index + m[0].length, `משנה ${normBook(m[1])} ${stripQ(m[2])}:${stripQ(m[3])}`, m[0], 'mishna');
    }

    // Zohar: זוהר ... דף NUM ע"?[אב]?
    for (const m of text.matchAll(new RegExp(`(?:ספר\\s+)?(?:ה)?זוהר[^.\\n]{0,80}?דף\\s+(${NUM})\\s*(?:ע(?:מוד\\s+|["'״]?)([אב])["'״׳]?)?`, 'g'))) {
      if (!okn(m[1])) continue;
      const side = m[2] || 'א';
      const paraM = m[0].match(new RegExp(`פרשת?\\s+(${alt(PARASHOT)})`));
      const para = paraM ? ` פרשת ${paraM[1]}` : '';
      add(m.index, m.index + m[0].length, `זוהר${para} דף ${stripQ(m[1])} ע"${side}`, m[0], 'zohar');
    }
    
    // Commentary on Torah: רש"י על בראשית ...
    for (const m of text.matchAll(new RegExp(`(${alt(COMM)})\\s*,?\\s+(?:על\\s+(?:התורה\\s+)?|ל)?(?:ה)?(${books})\\s+,?\\s*(?:פרק\\s+)?(${NUM})\\s*[,:]\\s*(?:פסוק\\s+)?(${NUM})`, 'g'))) {
      if (!okn(m[3]) || !okn(m[4])) continue;
      const cm = CMAP[stripQ(m[1])] || m[1];
      add(m.index, m.index + m[0].length, `${cm} על ${normBook(m[2])} ${stripQ(m[3])}:${stripQ(m[4])}`, m[0], 'comm');
    }

    const seen = new Set();
    return out.sort((a, b) => a.pos - b.pos).filter(c => !seen.has(c.q) && seen.add(c.q));
  }

  // Build alternate queries for Sefaria /api/name
  function queriesFor(c) {
    const qs = [c.q];
    const parts = c.q.match(/^(\S+(?:\s+\S+)?)\s+(.+)$/);
    if (c.kind === 'tanakh') {
      const m = c.q.match(/^(.+?)\s+(\S+):(\S+)(?:-(\S+))?$/);
      if (m) {
        const bk = normBook(m[1]), en = TN[bk] || TN[m[1]];
        const a = toArab(m[2]), b = toArab(m[3]), c2 = m[4] ? toArab(m[4]) : null;
        qs.push(`${bk} ${stripQ(m[2])}:${stripQ(m[3])}`);
        if (en) qs.push(c2 ? `${en} ${a}:${b}-${c2}` : `${en} ${a}:${b}`);
        qs.push(`${bk} ${a}:${b}`);
      }
    } else if (c.kind === 'bavli') {
      const m = c.q.match(/^(.+?)\s+(\S+)(?:\s+([אב]))?$/);
      if (m) {
        const ms = normBook(m[1]), en = MAS[ms], d = toArab(m[2]), side = m[3] || '';
        qs.push(side ? `${ms} ${stripQ(m[2])} ${side}` : `${ms} ${stripQ(m[2])}`);
        if (en) { qs.push(side ? `${en} ${d}${side === 'א' ? 'a' : 'b'}` : `${en} ${d}`); if (!side) qs.push(`${en} ${d}a`, `${ms} ${stripQ(m[2])} א`) }
      }
    } else if (c.kind === 'rambam') {
      const m = c.q.match(/הלכות\s+(.+?)\s+(\S+)(?::(\S+))?$/);
      if (m) {
        const hil = m[1].trim(), en = RAMBAM[hil], p = toArab(m[2]), h2 = m[3] ? toArab(m[3]) : null;
        qs.push(`רמב"ם הלכות ${hil} ${stripQ(m[2])}`);
        qs.push(`הלכות ${hil} ${stripQ(m[2])}`);
        if (en) qs.push(h2 ? `Mishneh Torah, ${en} ${p}:${h2}` : `Mishneh Torah, ${en} ${p}`);
      }
    } else if (c.kind === 'sa') {
      const m = c.q.match(/שולחן ערוך\s+(.+?)\s+(\S+)$/);
      if (m) { const sec = normBook(m[1]), en = SA[sec], n = toArab(m[2]); if (en) qs.push(`Shulchan Arukh, ${en} ${n}`) }
    } else if (c.kind === 'zohar') {
      qs.push('Zohar', 'זוהר');
      const m = c.q.match(/דף\s+(\S+)\s+ע"([אב])/);
      if (m) qs.push(`Zohar ${toArab(m[1])}${m[2] === 'א' ? 'a' : 'b'}`);
    }
    return [...new Set(qs)];
  }

  const CK = 'sefcache3', cache = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(CK)) || '{}');
  const saveC = () => { try { localStorage.setItem(CK, JSON.stringify(cache)) } catch (e) { } };
  const flat = t => { while (Array.isArray(t)) t = t.find(Boolean) || ''; return String(t || '').replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ') };

  async function resolveOne(q) {
    const d = await fetch('https://www.sefaria.org/api/name/' + encodeURIComponent(q) + '?limit=0').then(r => r.json());
    if (d && d.is_ref && d.url && (/\d/.test(d.ref || '') || /[ab]$/.test(d.url))) {
      const t = await fetch('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(d.url) + '?version=hebrew&return_format=text_only').then(r => r.ok ? r.json() : null).catch(() => null);
      const prev = t && t.versions && t.versions[0] ? flat(t.versions[0].text).slice(0, 180) : '';
      return { ref: (t && t.ref) || d.ref, he: (t && t.heRef) || d.ref || q, url: d.url, prev };
    }
    return null;
  }

  async function resolve(c) {
    const key = c.q;
    if (key in cache) return cache[key];
    try {
      for (const q of queriesFor(c)) {
        const res = await resolveOne(q);
        if (res) { cache[key] = res; saveC(); return res }
      }
      // soft miss: still offer Sefaria search + Google
      const miss = { ref: c.q, he: c.label || c.q, url: null, prev: '', search: true };
      cache[key] = miss; saveC(); return miss;
    } catch (e) { return undefined }
  }

  function snippetAt(text, pos, label) {
    if (pos == null || pos < 0) return label;
    const a = Math.max(0, pos - 40), b = Math.min(text.length, pos + (label || '').length + 80);
    let s = text.slice(a, b).trim(); if (a > 0) s = '…' + s; if (b < text.length) s += '…'; return s;
  }

  // Attach nearest transcript timestamp when segments are provided
  function withTimes(cs, segments) {
    if (!segments || !segments.length) return cs;
    const joined = []; let off = 0;
    for (const g of segments) { const t = (g.t || '').replace(/^\s*>\s*/, ''); joined.push({ s: g.s, a: off, b: off + t.length + 1 }); off += t.length + 1 }
    const full = segments.map(g => (g.t || '').replace(/^\s*>\s*/, '')).join('\n');
    return cs.map(c => {
      let best = null, pos = full.indexOf(c.label);
      if (pos < 0) pos = c.pos;
      if (pos != null && pos >= 0) {
        for (const j of joined) if (pos >= j.a && pos < j.b) { best = j.s; break }
        if (best == null) { for (let i = joined.length - 1; i >= 0; i--) if (joined[i].a <= pos) { best = joined[i].s; break } }
      }
      return { ...c, t: best, snip: snippetAt(full, pos, c.label), pos: pos >= 0 ? pos : c.pos };
    });
  }

  const sefSearch = q => `https://www.sefaria.org.il/search?q=${encodeURIComponent(q)}&tab=text&tvar=1&tsort=relevance&var=1&vsort=relevance`;
  const gSearch = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const fmtT = t => { t = Math.floor(t || 0); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0') };

  async function render(host, text, opts = {}) {
    const segments = opts.segments || null;
    const extras = opts.extras || []; // trSources strings
    let raw = String(text || '');
    if (extras.length) raw += '\n' + extras.join('\n');
    let cs = candidates(raw);
    // also run candidates on each extra alone (cleaner labels)
    for (const e of extras) for (const c of candidates(e)) if (!cs.some(x => x.q === c.q)) cs.push(c);
    cs = withTimes(cs, segments).slice(0, 80);
    if (!cs.length) { host.innerHTML = '<p class="muted">לא זוהו מראי מקומות בטקסט של השיעור, בסיכום, בתמלול ובהערות.</p>'; return { total: 0, hit: 0 } }
    host.innerHTML = `<p class="muted" id="srcProg">מאתר ${cs.length} מקורות בספריא…</p><div class="list srclist"></div>`;
    const list = host.querySelector('.srclist'), seen = new Set(); let hit = 0, soft = 0;
    for (let i = 0; i < cs.length; i += 3) {
      const rs = await Promise.all(cs.slice(i, i + 3).map(c => resolve(c).then(r => [c, r])));
      for (const [c, r] of rs) {
        if (r === undefined) { soft++; list.insertAdjacentHTML('beforeend', `<div class="srcl miss"><b>${h(c.label)}</b> <a href="${gSearch(c.q)}" target="_blank" rel="noopener">חיפוש בגוגל ↗</a>${c.snip ? `<span class="srcprev">${h(c.snip)}</span>` : ''}</div>`); continue }
        const key = r.url || c.q; if (seen.has(key)) continue; seen.add(key);
        if (r.url && !r.search) {
          hit++;
          const seek = c.t != null ? `<a class="ts" data-t="${c.t}" href="#">${fmtT(c.t)}</a> ` : '';
          list.insertAdjacentHTML('beforeend', `<a class="srcl" href="https://www.sefaria.org.il/${encodeURI(r.url)}?lang=he" target="_blank" rel="noopener"><b>${h(r.he)}</b> <span class="muted">ספריא ↗</span>${r.prev ? `<span class="srcprev">${h(r.prev)}…</span>` : ''}${c.snip ? `<span class="srcprev">${seek}${h(c.snip)}</span>` : ''}</a>`);
        } else {
          soft++;
          const seek = c.t != null ? `<a class="ts" data-t="${c.t}" href="#">${fmtT(c.t)}</a> ` : '';
          list.insertAdjacentHTML('beforeend', `<div class="srcl soft"><b>${h(c.label)}</b> <a href="${sefSearch(c.q)}" target="_blank" rel="noopener">חיפוש בספריא ↗</a> · <a href="${gSearch(c.q)}" target="_blank" rel="noopener">גוגל ↗</a>${c.snip ? `<span class="srcprev">${seek}${h(c.snip)}</span>` : ''}</div>`);
        }
      }
      const p = host.querySelector('#srcProg'); if (p) p.textContent = `מאתר מקורות… (${Math.min(i + 3, cs.length)}/${cs.length})`;
    }
    // wire seek clicks
    list.querySelectorAll('a.ts').forEach(a => a.onclick = e => { e.preventDefault(); e.stopPropagation(); const t = +a.dataset.t; if (window.Study && Study._seek) Study._seek(t); else { const au = document.querySelector('#au'); if (au) { au.currentTime = t; au.play() } else if (typeof seek === 'function') seek(t) } });
    const p = host.querySelector('#srcProg');
    if (p) p.textContent = hit ? `נמצאו ${hit} מקורות בספריא` + (soft ? ` · ${soft} עם קישור לחיפוש` : '') : (soft ? `זוהו ${soft} מקורות — נפתח חיפוש בספריא/גוגל` : 'לא נמצאו מקורות');
    return { total: cs.length, hit, soft };
  }

  window.SrcLink = { candidates, render, queriesFor, resolve };
})();
