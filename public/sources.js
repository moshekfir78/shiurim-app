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

  // ---------- Listed entries (site source sheet + trSources): ALWAYS shown, resolved best-effort ----------
  const NIK = s => String(s || '').replace(/[\u0591-\u05C7]/g, m => (m === '\u05BE' ? ' ' : (m === '\u05F3' ? "'" : (m === '\u05F4' ? '"' : ''))));
  const normE = s => NIK(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/[״“”„]/g, '"').replace(/[׳`’‘]/g, "'").replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
  const CHUMS = ['בראשית', 'שמות', 'ויקרא', 'במדבר', 'דברים'];
  const CHUM_OF = {}; PARASHOT.forEach((p, i) => { CHUM_OF[p] = CHUMS[i < 12 ? 0 : i < 23 ? 1 : i < 33 ? 2 : i < 43 ? 3 : 4] });
  const PAR_ALIAS = { 'לך': 'לך לך', 'חיי': 'חיי שרה', 'תשא': 'כי תשא', 'בחקותי': 'בחקתי', 'בחוקותי': 'בחקתי', 'בחוקתי': 'בחקתי', 'תצא': 'כי תצא', 'תבא': 'כי תבוא', 'תבוא': 'כי תבוא', 'כי תבא': 'כי תבוא', 'אחרי': 'אחרי מות', 'פנחס': 'פינחס', 'תצווה': 'תצוה', 'מטה': 'מטות', 'וזאת': 'וזאת הברכה', 'ברכה': 'וזאת הברכה', 'שלח לך': 'שלח', 'בהעלתך': 'בהעלותך', 'קורח': 'קרח', 'חוקת': 'חקת', 'ויקהל פקודי': 'ויקהל', 'עקב': 'עקב' };
  const PAR_ALT = { 'בחקתי': ['בחוקותי', 'בחוקתי'], 'כי תבוא': ['כי תבא'], 'תצוה': ['תצווה'], 'פינחס': ['פנחס'], 'בהעלותך': ['בהעלתך'] };
  const ALIAS = {
    'בעל שם טוב': 'בעל שם טוב על התורה', 'הבעל שם טוב': 'בעל שם טוב על התורה', 'בעש"ט': 'בעל שם טוב על התורה', 'ספר בעל שם טוב': 'בעל שם טוב על התורה',
    'מקור מים חיים': 'מקור מים חיים על בעל שם טוב', 'מאור עיניים': 'מאור עינים', 'מי השילוח': 'מי השלוח', 'הכוזרי': 'כוזרי', 'ספר הכוזרי': 'כוזרי', 'הכוזרי': 'כוזרי',
    'מורה הנבוכים': 'מורה נבוכים', 'דרך השם': "דרך ה'", 'דרך ה': "דרך ה'", 'נועם אלימלך': 'נועם אלימלך', 'שפת אמת': 'שפת אמת', 'צוואת הריבש': 'צוואת הריב"ש',
    'ליקוטי מוהרן': 'ליקוטי מוהר"ן', 'לקוטי מוהר"ן': 'ליקוטי מוהר"ן', 'לקוטי מוהרן': 'ליקוטי מוהר"ן', 'לקוטי הלכות': 'ליקוטי הלכות', 'לקוטי תורה': 'ליקוטי תורה',
    'מסלת ישרים': 'מסילת ישרים', 'בית יעקב': 'בית יעקב על התורה', 'גור אריה': 'גור אריה', 'מאור ושמש': 'מאור ושמש', 'אור החיים הקדוש': 'אור החיים',
    'מהר"ל': 'מהר"ל', 'אורות הקדש': 'אורות הקודש', 'תולדות יעקב יוסף': 'תולדות יעקב יוסף', 'עין איה': 'עין איה', 'הזהר': 'זוהר', 'הזוהר': 'זוהר', 'זהר': 'זוהר', 'תקוני הזהר': 'תיקוני זוהר', 'תקוני זהר': 'תיקוני זוהר', 'תיקוני הזוהר': 'תיקוני זוהר', 'שמו"ר': 'שמות רבה', 'דבר"ר': 'דברים רבה', 'ב"ר': 'בראשית רבה', 'ויק"ר': 'ויקרא רבה', 'במ"ר': 'במדבר רבה'
  };
  const MARK = `(?:פרשת|פרשה|פרק|פרקים|אות|אותיות|סימן|סי'|דף|עמ'|עמוד|הערה|חלק|ח"[א-ד]|שער|מאמר|תורה|הלכה|הלכות|ד"ה|בהקדמה|הקדמה|סוף|ריש|בסופו|תנינא|תניינא|קמא|בליקוטים|ליקוטים|בהפטרת|הפטרת|לפרשת|לימי|לסוכות|לשבת|לפסח|לשבועות|לראש|דרוש|ח'|פס'|${CHUMS.join('|')})`;
  const MARK_RE = new RegExp(`(?:,|\\s${MARK}(?=[\\s,]|$))`);
  const REFW = /(פרשת|פרק|אות|סימן|דף|חלק|ח"[א-ד]|שער|מאמר|הלכה|תורה|הערה|ע"[א-ד])/;
  const PAR_RE = new RegExp(`(?:^|\\s)(?:פרשת\\s+|פרשה\\s+|לפרשת\\s+)?(${alt(PARASHOT.concat(Object.keys(PAR_ALIAS)))})(?=[\\s,.:;)]|$)`, 'g');
  const gem = t => stripQ(t).replace(/[^א-ת0-9]/g, '');
  const AUTHOR_RE = /^(?:ה?רמב"ם|ה?מהר"ל(?: מפראג)?|ה?רמח"ל|ה?רמב"ן|הרב קוק|הראי"ה(?: קוק)?|הרב אברהם יצחק הכהן קוק|בעל התניא|אדמו"ר הזקן|(?:ר'|רבי|רבינו|הרב|האדמו"ר)\s+[א-ת"']+(?:\s+(?:הכהן|מ[א-ת"']+|בן\s+[א-ת"']+|[א-ת"']+))?(?:\s+מ[א-ת"']+)?)(?=[\s,:]|$)[\s,:]*/;

  // Extract the entries explicitly listed in the site's source sheet (headings + trailing "(…)" citations)
  const BOOK_HINT = new RegExp(`^(?:${alt(Object.keys(ALIAS).concat(['דגל מחנה אפרים', 'צוואת הריב"ש', 'כתר שם טוב', 'בן פורת יוסף', 'צפנת פענח', 'כתונת פסים', 'ליקוטי אמרים', 'מגיד דבריו ליעקב', 'אור תורה', 'קדושת לוי', 'תניא', 'נתיבות שלום', 'אורות', 'עולת ראיה', 'מסילת ישרים', 'נפש החיים', 'ערבי נחל', 'אוהב ישראל', 'באר מים חיים', 'אור המאיר', 'בני יששכר', 'שם משמואל', 'פרי צדיק', 'צדקת הצדיק', 'זוהר', 'תיקוני זוהר', 'ילקוט שמעוני', 'מדרש תנחומא', 'תנחומא', 'נצח ישראל', 'גבורות השם', 'תפארת ישראל', 'דרך חיים', 'באר הגולה', 'חובות הלבבות', 'עץ חיים', 'שני לוחות הברית', 'של"ה', 'ליקוטי הלכות', 'ליקוטי תורה', 'תורה אור', 'מאור עינים', 'נועם אלימלך', 'אגרא דכלה', 'עבודת ישראל', 'פרי הארץ', 'רסיסי לילה', 'ישמח משה', 'אור החיים']))})(?=[\\s,]|$)`);
  function entryHead(raw) {
    let s = normE(raw).replace(/^\d+\s*[.)]\s*/, '').replace(/^מפרשים על התנ"ך,?\s*/, '').replace(/^[-–•*]\s*/, '');
    let head = s;
    const qi = head.search(/:\s*"/);
    if (qi > 0) head = head.slice(0, qi);
    else { const ci = head.indexOf(':'); if (ci > 0) { const after = head.slice(ci + 1).split(/[,;]/)[0]; head = head.slice(0, ci) + (REFW.test(after) && after.length < 45 ? ' ' + after : '') } }
    { const parts = head.split(/\s[–—-]\s/); head = parts.length > 1 && AUTHOR_RE.test(parts[0] + ' ') && new RegExp(AUTHOR_RE.source + '$').test(parts[0].trim() + ' ') ? parts[1] : parts[0] }
    head = head.replace(/\s*\.\.\..*$/, '').replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').replace(/[.,;:\s]+$/, '').trim();
    return head;
  }

  function analyze(head) {
    let t = head.replace(/^ספר\s+/, '').replace(/\s+ז"ל/g, '').replace(/\s+זצ"ל|\s+זי"ע|\s+זלה"ה/g, '').trim();
    const a = { head, book: '', par: null, n: null, part: null, daf: null, bst: false };
    // "בעל שם טוב, <other book> …" = quoted inside the BST collection
    const bm = t.match(/^(?:ה)?בעל שם טוב,\s+(.+)$/);
    if (bm && (BOOK_HINT.test(bm[1]) && !/^(?:בעל שם טוב|פרשת)/.test(bm[1]) || !new RegExp(`^(?:פרשת|${CHUMS.join('|')}|${alt(PARASHOT)})(?=[\\s,]|$)`).test(bm[1]))) { a.bst = true; t = bm[1] }
    const am = t.match(AUTHOR_RE); if (am && t.slice(am[0].length).trim().length > 2 && !new RegExp(`^(?:על\\s+)?(?:${alt(Object.keys(TN))})(?=[\\s,]|$)`).test(t.slice(am[0].length))) t = t.slice(am[0].length).replace(/^[\s,:–-]+/, '').trim();
    let book, rest; const km = t.match(BOOK_HINT);
    if (km) { book = km[0].trim(); rest = t.slice(km[0].length) }
    else { const mi = t.slice(1).search(MARK_RE); book = (mi >= 0 ? t.slice(0, mi + 1) : t).trim(); rest = mi >= 0 ? t.slice(mi + 1) : '' }
    // trailing parasha glued to book ("מקור מים חיים לך לך", "תולדות יעקב יוסף פקודי")
    const bw = book.split(' ');
    if (!km) for (let k = Math.min(2, bw.length - 2); k >= 1; k--) { const tail = bw.slice(-k).join(' '); if (PARASHOT.includes(tail) || PAR_ALIAS[tail]) { rest = tail + ' ' + rest; book = bw.slice(0, -k).join(' '); break } }
    book = book.replace(/[,\s]+$/, '');
    { const w = book.split(' '); const last = w[w.length - 1]; if (w.length >= 2 && /^[א-ת]{1,3}'?$|^[א-ת]{1,2}"[א-ת]$/.test(last) && okn(last) && (ALIAS[w.slice(0, -1).join(' ')] || /רבה$|ר"$/.test(w[w.length - 2]))) { a.sec = gem(last); book = w.slice(0, -1).join(' ') } }
    a.book = book;
    { const lm = rest.match(/^\s*([א-ת]{1,3}'?|[א-ת]{1,2}"[א-ת])(?=\s*,|\s+(?:אות|סימן|פסקה)\s)/); if (!a.sec && lm && okn(lm[1])) a.sec = gem(lm[1]) }
    const msm = rest.match(/מסכת\s+([א-ת"']+(?:\s+(?:קמא|מציעא|בתרא|השנה|קטן|זרה))?)/); if (msm) a.mas = msm[1];
    const tkm = rest.match(new RegExp(`(?:^|[\\s,])(${alt(Object.keys(TN))})\\s+(?:פרק\\s+)?([א-ת]{1,3}["']?[א-ת]?|\\d{1,3})(?:\\s*[,:]?\\s*(?:פסוק|פס')?\\s*([א-ת]{1,3}["']?[א-ת]?|\\d{1,3}))?(?=[\\s,.:;\\-–]|$)`));
    if (tkm && okn(tkm[2])) { a.tk = TN[tkm[1].trim()]; a.tkHe = tkm[1].trim(); a.tc = gem(tkm[2]); a.tv = tkm[3] && okn(tkm[3]) ? gem(tkm[3]) : null; a.tcN = toArab(tkm[2]); a.tvN = a.tv ? toArab(tkm[3]) : null }
    // parasha
    let pm = rest.match(new RegExp(`(?:פרשת|פרשה|לפרשת|בפרשת)\\s+(${alt(PARASHOT.concat(Object.keys(PAR_ALIAS)))})(?=[\\s,.:;)]|$)`));
    let par = pm ? pm[1] : null;
    if (!par) { const all = [...rest.matchAll(PAR_RE)].map(m => m[1]); par = all.find(x => !CHUMS.includes(x)) || all[0] || null }
    if (par) { par = par.replace(/\s+/g, ' '); a.par = PAR_ALIAS[par] || par }
    const nm = rest.match(/(?:^|\s)(?:אות|אותיות|סימן|סי'|פרק|הערה|תורה|הלכה|מאמר|ס"ק|סעיף)\s+([א-ת]{1,4}["']?[א-ת]?|\d{1,4})(?=[\s,.:;)\-–]|$)/);
    if (nm && okn(nm[1])) a.n = gem(nm[1]);
    { const pk = rest.match(/(?:^|\s)פרק\s+([א-ת]{1,3}["']?[א-ת]?|\d{1,3})(?=[\s,]|$)/), ot = rest.match(/(?:^|\s)(?:אות|הלכה|משנה)\s+([א-ת]{1,3}["']?[א-ת]?|\d{1,3})(?=[\s,.]|$)/); if (pk && ot && okn(pk[1]) && okn(ot[1])) { a.sec = a.sec || gem(pk[1]); a.n = gem(ot[1]) } }
    if (/תני?ינא|ח"ב|חלק\s+ב'?(?=\s|,|$)|חלק שני/.test(rest)) a.part = 'ב';
    else if (/ח"א|חלק\s+א'?(?=\s|,|$)|חלק ראשון|קמא/.test(rest)) a.part = 'א';
    const sm = rest.match(/(?:שער|מאמר)\s+([א-ת]{1,3}["']?[א-ת]?)(?=[\s,]|$)/); if (sm && okn(sm[1])) a.sec = gem(sm[1]);
    const dm = rest.match(/דף\s+([א-ת]{1,3}["']?[א-ת]?|\d+)(?:\s+(?:סוף\s+)?ע"([א-ד]))?/); if (dm) a.daf = gem(dm[1]) + (dm[2] ? ' ' + dm[2] : '');
    return a;
  }

  const NK = 'sefname1', ncache = (() => { try { return JSON.parse(localStorage.getItem(NK) || '{}') } catch (e) { return {} } })();
  let nDirty = 0; const saveN = () => { if (nDirty) { try { localStorage.setItem(NK, JSON.stringify(ncache)) } catch (e) { } nDirty = 0 } };
  async function nameQ(q) {
    if (q in ncache) return ncache[q];
    const d = await fetch('https://www.sefaria.org/api/name/' + encodeURIComponent(q) + '?limit=12').then(r => r.json());
    const v = { r: !!(d && d.is_ref), u: d && d.url || null, ref: d && d.ref || null, b: !!(d && d.is_book), c: (d && d.completions || []).slice(0, 12) };
    ncache[q] = v; nDirty = 1; return v;
  }
  const nb = s => stripQ(s).replace(/\s+/g, ' ').trim();

  async function bookTitle(book) {
    const tries = []; const al = ALIAS[book] || ALIAS[nb(book)];
    if (al) tries.push(al);
    tries.push(book); if (!/^ספר /.test(book)) tries.push('ספר ' + book);
    const w = book.split(' '); for (let k = w.length - 1; k >= 2; k--) tries.push(w.slice(0, k).join(' '));
    for (const b of [...new Set(tries)].slice(0, 5)) {
      const r = await nameQ(b);
      if (r.r) return b;
      const comp = r.c.find(c => nb(c) === nb(b)) || r.c.find(c => nb(c).startsWith(nb(b) + ' ') && !c.includes(','));
      if (comp) { const r2 = await nameQ(comp); if (r2.r) return comp }
    }
    return null;
  }

  async function resolveEntry(a) {
    let best = null; const take = (q, r, level) => { if (r && r.r && r.u && (!best || level > best.level)) best = { q, url: r.u, ref: r.ref, level } };
    if (!a.book || a.book.length < 2) return null;
    // Tanya / Likutei Moharan / Kuzari special numbering
    if (/^תניא/.test(a.book) && a.n) take('', await nameQ(`Tanya, Part I; Likkutei Amarim ${toArab(a.n)}`), 3);
    if (a.tk) {
      const ch = a.tcN + (a.tvN ? ':' + a.tvN : ''), en = a.tk;
      for (const q of [`${a.book} על ${a.tkHe} ${a.tc}${a.tv ? ':' + a.tv : ''}`, `${a.book}, ${a.tkHe} ${a.tc}${a.tv ? ':' + a.tv : ''}`, `${a.book} ${en} ${ch}`]) { const r = await nameQ(q); if (r.r && /\d/.test(r.ref || '')) { take(q, r, 3); return best } }
    }
    const T = await bookTitle(a.book);
    if (!T) return best;
    take(T, await nameQ(T), 1);
    if (a.mas) {
      for (const q of [`${T}, ${a.mas}${a.sec ? ' ' + a.sec + (a.n ? ':' + a.n : '') : ''}`, `${T}, ${a.mas}`]) { const r = await nameQ(q); if (r.r) { take(q, r, /\d/.test(r.ref || '') ? 3 : 2); return best } }
      return best;
    }
    take(T, await nameQ(T), 1);
    let S = null;
    if (a.par) {
      const pars = [a.par].concat(PAR_ALT[a.par] || []), C = CHUM_OF[a.par];
      outer: for (const P of pars) {
        const qs = [`${T}, ${P}`]; if (C) qs.push(`${T}, ${C}, ${P}`, `${T}, ספר ${C}, ${P}`);
        for (const q of qs) {
          const r = await nameQ(q);
          if (r.r) { S = q; take(q, r, 2); break outer }
          const comp = r.c.find(c => nb(c).startsWith(nb(T.split(' ')[0])) && (nb(c).endsWith(nb(P)) || nb(c).includes(', ' + nb(P) + ' ')) && c.includes(','));
          if (comp) { const r2 = await nameQ(comp); if (r2.r) { S = comp; take(comp, r2, 2); break outer } }
        }
      }
    }
    const base = S || T;
    if (a.n) {
      const qs = [];
      if (S) qs.push(`${S} ${a.n}`);
      else {
        if (a.part) qs.push(`${T} ${a.part}, ${a.n}`);
        if (a.sec) qs.push(`${T} ${a.sec}:${a.n}`, `${T} ${a.sec}, ${a.n}`);
        qs.push(`${T} ${a.n}`, `${T}, ${a.n}`);
      }
      for (const q of qs) { const r = await nameQ(q); if (r.r && /\d/.test(r.ref || '')) { take(q, r, 3); break } }
    } else if (!S && a.sec) { const r = await nameQ(`${T} ${a.sec}`); if (r.r) take(`${T} ${a.sec}`, r, 2) }
    void base; return best;
  }

  const EK = 'sefent1', ecache = (() => { try { return JSON.parse(localStorage.getItem(EK) || '{}') } catch (e) { return {} } })();
  const saveE = () => { try { localStorage.setItem(EK, JSON.stringify(ecache)) } catch (e) { } };
  async function resolveListed(head) {
    if (head in ecache) return ecache[head];
    let out = null;
    try {
      const a = analyze(head);
      const knownBook = a.book && (ALIAS[a.book] || ALIAS[nb(a.book)]);
      // explicit Tanakh/Talmud/Rambam/… refs at the start of the entry
      const ch = head.replace(/(^|\s)פרק\s+/, '$1').replace(/,?\s+פס(?:וקים|וק|')\s+/, ', ').replace(/([א-ת"']+)\s*[-–]\s*[א-ת"']+$/, '$1');
      if (a.tk && !TN[a.book]) { const b = await resolveEntry(a); if (b && b.level >= 3) out = { level: 3, url: b.url, he: b.q, prev: '', book: a.book, _fetch: 1 } }
      const cs = (knownBook || out) ? [] : candidates(ch).sort((x, y) => x.pos - y.pos);
      for (const c of cs.slice(0, 3)) { const r = await resolve(c); if (r && r.url && !r.search) { out = { level: 3, url: r.url, he: r.he, prev: r.prev, extra: cs.length > 1 ? cs.slice(1).map(x => x.label) : null }; break } }
      if (out && out._fetch) { const t = await fetch('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(out.url) + '?version=hebrew&return_format=text_only').then(r => r.ok ? r.json() : null).catch(() => null); if (t) { out.he = t.heRef || out.he; out.prev = t.versions && t.versions[0] ? flat(t.versions[0].text).slice(0, 180) : '' } delete out._fetch }
      if (!out) {
        const b = await resolveEntry(a);
        if (b) {
          let he = b.q || b.ref, prev = '';
          if (b.level >= 2) {
            const t = await fetch('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(b.url) + '?version=hebrew&return_format=text_only').then(r => r.ok ? r.json() : null).catch(() => null);
            if (t) { he = t.heRef || he; prev = t.versions && t.versions[0] ? flat(t.versions[0].text).slice(0, 180) : '' }
          }
          out = { level: b.level, url: b.url, he, prev, book: a.book };
        }
      }
      if (!out) out = { level: 0, book: a.book };
      saveN(); ecache[head] = out; saveE();
    } catch (e) { saveN(); return { level: -1, book: '' } }
    return out;
  }

  const GEN_HINT = /^(?:מדרש|ספרי|מכילתא|רש"י|רמב"ן|רמב"ם|שולחן ערוך|משנה|תלמוד|גמרא|ילקוט|תרגום|ספר|ר' |רבי )/;
  const looksRef = s => REFW.test(s) || BOOK_HINT.test(s) || GEN_HINT.test(s) || candidates(s).some(c => c.pos < 6);
  const BAD = /^(?:ו?עיין|ועי'|עי'|ו?נתבאר|כנ"ל|כדלעיל|לעיל|לקמן|ו?שם|ראה|כמבואר|כמו ש|היינו|כלומר|פירוש)/;
  function splitList(s) {
    return s.split(/\s\/\s|\s+ו?גם\s+(?=בעל שם טוב)/).flatMap(p => p.split(/,\s+(?=[^,]{3,}\sדף\s)|;\s+(?=[א-ת][^;]{6,}\s(?:דף|פרשת)\s)/)).map(x => x.trim()).filter(Boolean);
  }
  function listedFromHtml(html) {
    html = String(html || ''); const out = [];
    const push = (s, from) => { for (const p of splitList(s)) { const hd = entryHead(p); const w = hd.split(' ').length; if (hd.length < 4 || w > 16 || BAD.test(hd)) continue; if (!looksRef(hd)) continue; out.push({ raw: p, head: hd, from }) } };
    for (const m of html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) push(normE(m[1]), 'site');
    for (const m of html.matchAll(/<p[^>]*>\s*<(?:strong|b)>([^<]{4,140})<\/(?:strong|b)>\s*<\/p>/gi)) push(normE(m[1]), 'site');
    for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const t = normE(m[1]); const pm = t.match(/\(([^()]{4,140})\)\s*[:.]?\s*$/);
      if (pm && pm[1].split(' ').length <= 14) push(pm[1], 'site');
    }
    return out;
  }
  function listedEntries(html, trSources) {
    const all = listedFromHtml(html).concat((trSources || []).flatMap(s => splitList(normE(s)).map(p => ({ raw: p, head: entryHead(p), from: 'tr' }))).filter(e => e.head.length >= 3));
    const seen = new Map(), out = [];
    for (const e of all) { const k = nb(e.head).replace(/[,\s]+/g, ' '); if (seen.has(k)) { if (e.from === 'tr' && !seen.get(k).raw.includes('"')) seen.get(k).raw = e.raw; continue } seen.set(k, e); out.push(e) }
    return out;
  }
  const hbSearch = q => `https://www.google.com/search?q=${encodeURIComponent(q + ' site:hebrewbooks.org')}`;
  const otzSearch = q => `https://www.google.com/search?q=${encodeURIComponent(q + ' site:otzar.org')}`;

  async function render(host, text, opts = {}) {
    const segments = opts.segments || null;
    const extras = opts.extras || []; // trSources strings
    const listed = listedEntries(opts.html || '', extras);
    let raw = String(text || '');
    if (extras.length) raw += '\n' + extras.join('\n');
    let cs = candidates(raw);
    for (const e of extras) for (const c of candidates(e)) if (!cs.some(x => x.q === c.q)) cs.push(c);
    cs = withTimes(cs, segments).slice(0, 80);
    // timestamps for listed entries: look for the book name / first quoted words in the transcript
    const full = segments && segments.length ? segments.map(g => (g.t || '').replace(/^\s*>\s*/, '')).join('\n') : '';
    const lts = listed.map(e => {
      if (!full) return e;
      const a = analyze(e.head); const keys = [];
      const q = (e.raw.match(/"([^"]{8,})/) || [])[1]; if (q) keys.push(q.split(' ').slice(0, 4).join(' '));
      if (a.book && a.book.length > 3) keys.push(a.book);
      for (const k of keys) { const pos = full.indexOf(k); if (pos >= 0) { const [w] = withTimes([{ label: k, pos }], segments); return { ...e, t: w.t, snip: w.snip } } }
      return e;
    });
    if (!cs.length && !lts.length) { host.innerHTML = '<p class="muted">לא זוהו מראי מקומות בטקסט של השיעור, בסיכום, בתמלול ובהערות.</p>'; return { total: 0, hit: 0 } }
    host.innerHTML = `<p class="muted" id="srcProg">מאתר מקורות בספריא…</p>${lts.length ? `<h4 class="sub-h">מקורות מדף המקורות של השיעור (${lts.length})</h4><div class="list srclist" id="srcListed"></div>` : ''}<h4 class="sub-h" id="srcMoreH" hidden>מראי מקומות נוספים בטקסט ובתמלול</h4><div class="list srclist" id="srcMore"></div>`;
    const seek = c => c.t != null ? `<a class="ts" data-t="${c.t}" href="#">${fmtT(c.t)}</a> ` : '';
    const seen = new Set(); let hit = 0, soft = 0, part = 0;
    const L = host.querySelector('#srcListed');
    for (let i = 0; i < lts.length; i += 3) {
      const rs = await Promise.all(lts.slice(i, i + 3).map(e => resolveListed(e.head).then(r => [e, r])));
      for (const [e, r] of rs) {
        const bk = (r && r.book) || analyze(e.head).book || e.head;
        const look = `<a href="${sefSearch(e.head)}" target="_blank" rel="noopener">חיפוש בספריא</a> · <a href="${gSearch(e.head)}" target="_blank" rel="noopener">גוגל</a> · <a href="${hbSearch(bk)}" target="_blank" rel="noopener">HebrewBooks</a> · <a href="${otzSearch(e.head)}" target="_blank" rel="noopener">אוצר החכמה</a>`;
        const ctx = e.snip ? `<span class="srcprev">${seek(e)}${h(e.snip)}</span>` : (e.t != null ? `<span class="srcprev">${seek(e)}</span>` : '');
        const src = e.from === 'tr' ? 'מהתמלול' : 'מדף המקורות';
        if (r && r.url && r.level >= 2) {
          hit++; seen.add(r.url);
          L.insertAdjacentHTML('beforeend', `<div class="srcl ent"><b>${h(e.head)}</b> <span class="muted">· ${src}</span><br><a href="https://www.sefaria.org.il/${encodeURI(r.url)}?lang=he" target="_blank" rel="noopener">${h(r.he)} · ספריא ↗</a>${r.level === 2 ? ' <span class="muted">(פרשה/פרק)</span>' : ''}${r.prev ? `<span class="srcprev">${h(r.prev)}…</span>` : ''}${ctx}</div>`);
        } else if (r && r.url) {
          part++; seen.add(r.url);
          L.insertAdjacentHTML('beforeend', `<div class="srcl ent soft"><b>${h(e.head)}</b> <span class="muted">· ${src}</span><br><a href="https://www.sefaria.org.il/${encodeURI(r.url)}?lang=he" target="_blank" rel="noopener">הספר ${h(r.he)} בספריא ↗</a> · ${look}${ctx}</div>`);
        } else {
          soft++;
          L.insertAdjacentHTML('beforeend', `<div class="srcl ent soft"><b>${h(e.head)}</b> <span class="muted">· ${src}</span><br>${look}${ctx}</div>`);
        }
      }
      const p = host.querySelector('#srcProg'); if (p) p.textContent = `מאתר מקורות… (${Math.min(i + 3, lts.length)}/${lts.length})`;
    }
    const list = host.querySelector('#srcMore'); let more = 0;
    const listedQ = new Set(lts.map(e => nb(e.head)));
    for (let i = 0; i < cs.length; i += 3) {
      const rs = await Promise.all(cs.slice(i, i + 3).map(c => resolve(c).then(r => [c, r])));
      for (const [c, r] of rs) {
        if (r === undefined) { more++; list.insertAdjacentHTML('beforeend', `<div class="srcl miss"><b>${h(c.label)}</b> <a href="${gSearch(c.q)}" target="_blank" rel="noopener">חיפוש בגוגל ↗</a>${c.snip ? `<span class="srcprev">${h(c.snip)}</span>` : ''}</div>`); continue }
        const key = r.url || c.q; if (seen.has(key) || listedQ.has(nb(c.label))) continue; seen.add(key);
        more++;
        if (r.url && !r.search) {
          hit++;
          list.insertAdjacentHTML('beforeend', `<a class="srcl" href="https://www.sefaria.org.il/${encodeURI(r.url)}?lang=he" target="_blank" rel="noopener"><b>${h(r.he)}</b> <span class="muted">ספריא ↗</span>${r.prev ? `<span class="srcprev">${h(r.prev)}…</span>` : ''}${c.snip ? `<span class="srcprev">${seek(c)}${h(c.snip)}</span>` : ''}</a>`);
        } else {
          soft++;
          list.insertAdjacentHTML('beforeend', `<div class="srcl soft"><b>${h(c.label)}</b> <a href="${sefSearch(c.q)}" target="_blank" rel="noopener">חיפוש בספריא ↗</a> · <a href="${gSearch(c.q)}" target="_blank" rel="noopener">גוגל ↗</a>${c.snip ? `<span class="srcprev">${seek(c)}${h(c.snip)}</span>` : ''}</div>`);
        }
      }
      const p = host.querySelector('#srcProg'); if (p) p.textContent = `מאתר מראי מקומות… (${Math.min(i + 3, cs.length)}/${cs.length})`;
    }
    if (more) host.querySelector('#srcMoreH').hidden = false;
    host.querySelectorAll('a.ts').forEach(a => a.onclick = e => { e.preventDefault(); e.stopPropagation(); const t = +a.dataset.t; if (window.Study && Study._seek) Study._seek(t); else { const au = document.querySelector('#au'); if (au) { au.currentTime = t; au.play() } else if (typeof seek === 'function') seek(t) } });
    const p = host.querySelector('#srcProg');
    if (p) p.textContent = [hit ? `${hit} מקורות מקושרים לספריא` : '', part ? `${part} עם קישור לספר` : '', soft ? `${soft} עם קישורי חיפוש` : ''].filter(Boolean).join(' · ') || 'לא נמצאו מקורות';
    return { total: lts.length + cs.length, listed: lts.length, hit, part, soft };
  }

  window.SrcLink = { candidates, render, queriesFor, resolve, entryHead, analyze, resolveEntry, resolveListed, listedEntries, listedFromHtml };
})();
