"""Content-based folder tree per rav (source-agnostic). Titles are read only, never changed.
For every item returns a new path [{id,title},...] under the rav (or rav/speaker for institutions):
  1. series  – same series across sources (playlist / podcast show / site category / title prefix / numbered parts), >=3 items
  2. פרשת השבוע › ספר › פרשה, מועדים › חג
  3. topic folders (תנ"ך › book, גמרא › מסכת, הלכה, מחשבה ואמונה, חסידות, הרב קוק ...)
  4. small leftover "שונות"
Folders over MAX are split (series: by year or by part ranges; topics: by sub-topic, then year). Folders under MIN are dissolved.
Also returns an order key "o" (part number) for series ordering."""
import re, hashlib, collections
MIN, MAX = 3, 80
GENERIC = re.compile(r"^(יוטיוב\s*·.*|ספוטיפיי\s*·.*|.*\sחדש[ות]?$|יוטיוב|פודקאסטים?|ספוטיפיי|שיעורים|שיעורים נוספים|שונות|כללי|וידאו|סרטונים|אודיו|הקלטות|ארכיון|כל השיעורים|שיעורי וידאו|שיעורי אודיו|uncategorized|ללא קטגוריה|ישיבת.*|.*ערוץ.*|English|שיעורים ומפגשים)$", re.I)
TOPICLIKE = re.compile(r"^(פרשת השבוע|פרשה|פרשות השבוע|הלכה|הלכות|גמרא|תלמוד|מועדים|חגים|חגים ומועדים|תנ\"ך|מחשבה|מחשבת ישראל|אמונה|חסידות|קבלה|מוסר|אקטואליה|שיעורים בפרשת השבוע|פרשת שבוע|תפילה|חינוך)$")
HEB_NUM = {c: v for c, v in zip("אבגדהוזחטיכלמנסעפצקרשת", [1,2,3,4,5,6,7,8,9,10,20,30,40,50,60,70,80,90,100,200,300,400])}
TOPIC_ORDER = ["tanach", "gemara", "mishna", "halacha", "kook", "chasidut", "kabbala", "emuna", "musar", "tefila", "eretz", "chinuch", "current"]
NEST_ORDER = ["kook", "chasidut", "kabbala", "gemara", "halacha", "mishna", "emuna", "musar", "tefila", "tanach", "eretz", "chinuch", "current"]
TOPIC_NAME = {"tanach": 'תנ"ך', "gemara": "גמרא", "mishna": "משנה", "halacha": "הלכה", "kook": "הרב קוק", "chasidut": "חסידות", "kabbala": "קבלה",
              "emuna": "מחשבה ואמונה", "musar": "מוסר ומידות", "tefila": "תפילה", "eretz": "ארץ ישראל וציונות", "chinuch": "חינוך ומשפחה", "current": "אקטואליה"}
SEFARIM = ["בראשית", "שמות", "ויקרא", "במדבר", "דברים"]

def heb_num(s):
    s = s.replace('"', "").replace("'", "").replace("״", "").replace("׳", "")
    if not s or any(c not in HEB_NUM for c in s) or len(s) > 3: return None
    return sum(HEB_NUM[c] for c in s)

NUM_RX = re.compile(r"(?:שיעור|חלק|פרק|הרצאה|מפגש|סימן|#|מס'|מספר)\s*(\d+|[א-ת]{1,2}(?:['\"׳״][א-ת]?)?)(?![א-ת])|\((\d+)\)|(?<![\d:])(\d{1,3})(?![\d:])")
def part_no(t):
    for m in NUM_RX.finditer(t):
        g = m.group(1) or m.group(2) or m.group(3)
        if g is None: continue
        if g.isdigit():
            v = int(g)
            if v < 400 and not (m.group(3) and 1900 < v): return v
        else:
            v = heb_num(g)
            if v: return v
    return None

def norm_key(s, ravname):
    s = s.replace(ravname, " ")
    s = re.sub(r"הרב\s+[א-ת\"']+\s+[א-ת\"'\-]+", " ", s)
    s = re.sub(r"(שיעור|חלק|פרק|הרצאה|מפגש|סימן)\s*(\d+|[א-ת]{1,2}(?:['\"׳״][א-ת]?)?)(?![א-ת])", " ", s)
    s = re.sub(r"\d+|[\"'״׳＂()\[\]|:\-–—,.!?#_/]", " ", s)
    s = re.sub(r"\b(עם|של|ב|ה)\s*$", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def title_series(t, ravname):
    """series name candidates from the title: prefix before ' - '/' | '/':' (not the rav name), or title minus part number."""
    sur = ravname.split()[-1] if ravname else "@@"
    segs = [x.strip() for x in re.split(r"\s*[|｜]\s*|\s*[-–—]\s+|\s+[-–—]\s*|:\s|\s*//\s*", t) if x.strip()]
    segs = [x for x in segs if not re.match(r"^(הרב|הרבנית|ר'|ד\"ר|פרופ)\s", x) and sur not in x and len(x) < 50]
    out = []
    if len(segs) > 1 or (segs and segs[0] != t.strip()): out.append(segs[0])
    m = re.search(r"\(([^()\d]{2,30}?)\s*\d+\)\s*$", t)
    if m: out.append(m.group(1))
    m = re.match(r"^(.{4,50}?)\s*(?:[-–,:]\s*)?(?:שיעור|חלק|פרק|הרצאה|מפגש)\s*(\d+|[א-ת]{1,2}['\"׳״]?)(?![א-ת])", t)
    if m: out.append(m.group(1))
    m = re.match(r"^(.{4,50}?)\s+(\d{1,3})(?:\s*[-–:|]|$)", t)
    if m: out.append(m.group(1))
    return out

def src_series(path, ravname, srcname):
    for p in reversed(path or []):
        x = re.sub(r"^פודקאסט\s*·\s*", "", p["title"]).strip()
        if not x or GENERIC.match(x) or TOPICLIKE.match(x) or x == ravname or x == srcname or re.search(r"פרש(ת|ות) ה?שבוע", x): continue
        if x in SEFARIM or re.match(r"^(ספר|פרשת)\s", x) and len(x) < 14: continue
        return x
    return None

def clean_label(x):
    x = re.sub(r"^\s*\d{4}\s*-\s*\d{1,2}\s*-\s*\d{1,2}\s*-\s*", "", x)
    x = re.sub(r"\s+(שיעור|חלק)\s*$", "", x)
    x = re.sub(r"\s*(#\s*\d+|\d+\s*#|\(\s*\d+\s*\)|[-–—|:,]\s*(שיעור|חלק|פרק)\s*\S+|\s(שיעור|חלק|פרק)\s*\S+)\s*$", "", x).strip(" -–—|:,")
    return x or "סדרה"

BADKEY = {"שיעור", "שיעורים", "הרצאה", "פרק", "חלק", "סדרה", "שיחה", "דרשה", "ביאור", "קריאה", "פשט", "עיון", "סיכום", "פתיחה", "שיעור לפרשה", "פרשת השבוע", "שיעור בפרשת השבוע"}

def hid(*a): return hashlib.sha1("|".join(a).encode()).hexdigest()[:10]

from topics import taxonomy
TAXN = {t["id"]: t["name"] for t in taxonomy()}

def organize(items, ravnames, srcnames, parashot, group_of):
    """items: list of dicts with rav,title,path,par,tp,date,source. group_of(item)-> (group_id, group_title_path list) prefix nodes."""
    groups = collections.defaultdict(list)
    for r in items: groups[group_of(r)[0]].append(r)
    stats = collections.Counter()
    for gid, arr in groups.items():
        rav = arr[0]["rav"]; ravname = ravnames.get(rav, "")
        prefix = group_of(arr[0])[1]
        # --- 1. series ---
        cand = {}
        cnt = collections.Counter()
        for r in arr:
            ks = []
            for t in title_series(r["title"], ravname):
                k = norm_key(t, ravname)
                if len(k) >= 3: ks.append(("t", k, t.strip()))
            s = src_series(r.get("opath"), ravname, srcnames.get(r["source"], ""))
            if s:
                k = norm_key(s, ravname)
                if len(k) >= 3: ks.append(("s", k, s))
            cand[r["uid"]] = ks
            for k in {k for _, k, _ in ks}: cnt[k] += 1
        from topics import NACH, NACH_ALT, MAS
        PIDX = {pp["name"]: i for i, pp in enumerate(parashot)}
        BOOKN = {b: b for b in NACH}; BOOKN.update({a: b for b, al in NACH_ALT.items() for a in al}); BOOKN.update({'שה"ש': "שיר השירים", "שיר השירים": "שיר השירים"})
        TN_INV = {v: k for k, v in TOPIC_NAME.items()}; TN_INV.update({"הלכה": "halacha", "הרב קוק": "kook", "חסידות": "chasidut", 'תנ"ך': "tanach", "גמרא": "gemara", "אמונה": "emuna", "מחשבה": "emuna", "קבלה": "kabbala"})
        MASN = {m: ("נדה" if m == "נידה" else m) for m in MAS}
        def as_topic(lbl):
            x = re.sub(r"^(שיעור כללי|שיעורים כלליים|בקיאות|שיעורי|שיעורים ב|עיון ב|קריאה ב|עיונים ב|חבורת|לימוד)\s*", "", lbl).strip()
            x = re.sub(r"^ב-?(?=מסכת|ספר)", "", x)
            x = re.sub(r"^(ספר|מגילת|מסכת)\s+", "", x).strip()
            x = re.sub(r"\s+[אב]['׳]?$", "", x).strip()
            if lbl in TN_INV: return (TN_INV[lbl], None)
            if x in BOOKN: return ("tanach", BOOKN[x])
            if x in MASN and x not in ("שבת", "שבועות", "ראש השנה", "סוכה", "מגילה", "תענית", "ברכות", "תמיד"): return ("gemara", MASN[x])
            if lbl.startswith("מסכת ") and x in MASN: return ("gemara", MASN[x])
            return None
        for r in arr:
            if r.get("par"): continue
            seg = re.split(r"\s*[|｜–—]\s*|\s+-\s+|:\s", r["title"].strip())
            for sg in seg[:2]:
                sg = re.sub(r"^(פרשת|פשט|פשט פרשת)\s+", "", sg.strip())
                if sg in PIDX: r["par"] = [PIDX[sg]]; r["par_new"] = True; break
        PN = set()
        for pp in parashot: PN.add(norm_key(pp["name"], "")); PN.add(norm_key("פרשת " + pp["name"], ""))
        for b in SEFARIM: PN.add(b); PN.add("ספר " + b)
        label = {}
        for ks in cand.values():
            for typ, k, disp in ks:
                d2 = " - ".join(x for x in re.split(r"\s*[-–—|]\s*", disp) if x.strip() and ravname.split()[-1] not in x) or disp
                if typ == "s" or k not in label: label[k] = clean_label(d2) if typ == "s" else label.get(k, clean_label(d2))
        assign = {}
        for r in arr:
            ks = [x for x in cand[r["uid"]] if cnt[x[1]] >= MIN and x[1] not in PN and x[1] not in BADKEY]
            if not ks: continue
            # prefer a key that is not parasha/holiday-ish; prefer title key when it is a real sub-series of a big source folder
            mx = max(cnt[y[1]] for y in ks)
            ks.sort(key=lambda x: (bool(re.search(r"פרש", x[1])), -(x[0] == "t" and cnt[x[1]] < 0.9 * mx), x[0] != "s", -cnt[x[1]]))
            k = ks[0][1]
            if re.search(r"פרשת|פרשה|פרשות", k) and r.get("par"): continue
            assign[r["uid"]] = k
        byk = collections.defaultdict(list)
        for r in arr:
            if r["uid"] in assign: byk[assign[r["uid"]]].append(r)
        for k, v in byk.items():
            pc = collections.Counter(tuple(r.get("par") or ()) for r in v)
            top_par, n = pc.most_common(1)[0]
            if top_par and n >= 0.7 * len(v):
                for r in v: assign.pop(r["uid"], None)
        sc = collections.Counter(assign.values())
        assign = {u: k for u, k in assign.items() if sc[k] >= MIN}
        # --- build paths ---
        root = prefix[-1]["id"] if prefix else "rav:" + rav
        def node(kind, *names): return (f"{root}/{kind}:{hid(*names)}", names[-1])
        buckets = collections.defaultdict(list)   # tuple(path nodes) -> items
        for r in arr:
            tp = [t for t in (r.get("tp") or []) if t != "parasha"]
            if r["uid"] in assign:
                k = assign[r["uid"]]; nm = label.get(k, k)
                at = as_topic(nm)
                if at:
                    top, b = at
                    pp = (node("t", TOPIC_NAME[top]),) + ((node("t", TOPIC_NAME[top], b if top == "tanach" else "מסכת " + b),) if b else ())
                    buckets[pp].append(r); stats["topic-series"] += 1; continue
                top = next((t for t in TOPIC_ORDER if t in tp), None)
                p = (node("s", k, nm),)
                buckets[p].append(r); stats["series"] += 1; continue
            if r.get("par"):
                i = r["par"][0]; pn = parashot[i]
                p = (node("par", "פרשת השבוע"), node("par", "פרשת השבוע", "ספר " + pn["book"]), node("par", "פרשת השבוע", pn["book"], "פרשת " + pn["name"]))
                buckets[p].append(r); stats["parasha"] += 1; continue
            ch = [t for t in tp if t.startswith("chag:")]
            if ch:
                from topics import CHAG
                nm = {"chag:" + i: n for i, n, _ in CHAG}.get(ch[0], "מועדים")
                buckets[(node("chag", "מועדים"), node("chag", "מועדים", nm))].append(r); stats["chag"] += 1; continue
            top = next((t for t in TOPIC_ORDER if t in tp), None)
            if top:
                sub = next((t for t in tp if t.startswith(top + ":")), None)
                p = (node("t", TOPIC_NAME[top]),)
                if sub: p += (node("t", TOPIC_NAME[top], sub.split(":", 1)[1] if top == "tanach" else "מסכת " + sub.split(":", 1)[1] if top == "gemara" else sub),)
                buckets[p].append(r); stats["topic"] += 1; continue
            buckets[(node("x", "שונות"),)].append(r); stats["misc"] += 1
        # --- dissolve tiny folders: tiny leaf sub-folders go up one level; tiny top folders go to שונות ---
        changed = True
        while changed:
            changed = False
            for p, its in list(buckets.items()):
                if p not in buckets or len(its) >= MIN: continue
                if len(p) > 1:
                    # parasha: keep under sefer; others: move to parent
                    up = p[:-1]
                    if sum(len(v) for q, v in buckets.items() if q[:len(p)] == p) < MIN:
                        buckets[up] = buckets.get(up, []) + buckets.pop(p); changed = True
                elif p[0][1] != "שונות":
                    if sum(len(v) for q, v in buckets.items() if q[:1] == p) < MIN:
                        x = (node("x", "שונות"),); buckets[x] = buckets.get(x, []) + buckets.pop(p); changed = True
        # parasha: if a sefer has few items, flatten parasha level
        for p in [p for p in list(buckets) if p and p[0][1] == "פרשת השבוע" and len(p) == 3]:
            sef = p[:2]
            tot = sum(len(v) for q, v in buckets.items() if q[:2] == sef)
            if tot <= 15: buckets[sef] = buckets.get(sef, []) + buckets.pop(p)
        # --- many top folders: nest series under their dominant topic folder ---
        if len({p[0] for p in buckets}) > 25:
            for p in [p for p in list(buckets) if p[0][0].split("/")[-1].startswith("s:")]:
                its = buckets[p]
                t, n = collections.Counter(next((t for t in NEST_ORDER if t in (r.get("tp") or [])), None) for r in its).most_common(1)[0]
                if t and n >= 0.5 * len(its):
                    buckets[(node("t", TOPIC_NAME[t]),) + p] = buckets.pop(p)
        # --- split giant leaves ---
        for p, its in list(buckets.items()):
            if len(its) <= MAX: continue
            buckets.pop(p)
            by = collections.defaultdict(list)
            if p[0][0].split("/")[-1].startswith("s:"):
                parts = [part_no(r["title"]) for r in its]
                yrs = collections.Counter((r.get("date") or "")[:4] for r in its)
                if sum(1 for x in parts if x) >= 0.8 * len(its):
                    for r, n in zip(its, parts): by["%d–%d" % (((n or 1) - 1) // 50 * 50 + 1, ((n or 1) - 1) // 50 * 50 + 50)].append(r)
                elif len({next((t for t in (r.get("tp") or []) if ":" in t), "") for r in its}) > 2:
                    for r in its:
                        sub = next((t for t in (r.get("tp") or []) if ":" in t), None)
                        by[TAXN.get(sub, sub.split(":", 1)[1]) if sub else "כללי"].append(r)
                    if max(len(v) for v in by.values()) > MAX:
                        by = collections.defaultdict(list)
                        for r in its: by[(r.get("date") or "")[:4] or "ללא תאריך"].append(r)
                elif len([y for y in yrs if y]) > 1:
                    for r in its: by[(r.get("date") or "")[:4] or "ללא תאריך"].append(r)
                else:
                    for i, r in enumerate(sorted(its, key=lambda r: r.get("date") or "")): by["חלק %d" % (i // 60 + 1)].append(r)
            else:
                for r in its:
                    tp = r.get("tp") or []
                    sub = next((TOPIC_NAME.get(t, t) for t in TOPIC_ORDER if t in tp and TOPIC_NAME[t] != p[-1][1]), None)
                    by[sub or "נוספים"].append(r)
                if len(by) < 2 or max(len(v) for v in by.values()) > MAX:
                    by = collections.defaultdict(list)
                    for r in its: by[(r.get("date") or "")[:4] or "ללא תאריך"].append(r)
            # tiny split groups merge into the largest neighbour
            small = [k for k, v in by.items() if len(v) < MIN]
            if small and len(by) > len(small):
                big = max(by, key=lambda k: len(by[k]))
                for k in small: by[big] += by.pop(k)
            if len(by) < 2: buckets[p] = its; continue
            for k, v in by.items():
                q = p + ((p[-1][0] + "/" + hid(k), k),)
                if len(v) > MAX:
                    v = sorted(v, key=lambda r: r.get("date") or "")
                    n = -(-len(v) // 60)
                    for i in range(n):
                        ch = v[i * len(v) // n:(i + 1) * len(v) // n]
                        buckets[q + ((q[-1][0] + "/%d" % i, "חלק %d" % (i + 1)),)] = ch
                else: buckets[q] = v
        for p, its in buckets.items():
            ser = p[0][0].split("/")[-1].startswith("s:")
            for r in its:
                r["path"] = list(prefix) + [{"id": a, "title": b} for a, b in p]
                if ser:
                    n = part_no(r["title"])
                    r["o"] = n if n is not None else 9999
    return stats
