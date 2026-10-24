#!/usr/bin/env python3
"""ישיבת ברכת משה, מעלה אדומים (ybm.org.il): the site's own public JSON API (the one its pages use).
  python3 importers/ybm.py [samet|spiegelman|medan|hendler|cherlow]
Lessons are listed per rabbi and per top category (a category includes its sub-categories); audio is the site's mp3.
For CONTENT_ONLY ravs only Tanach / machshava / holidays / series are kept, never Gemara, halacha or Rambam halachot
(lessons that also sit in those categories are dropped, plus title keywords), no events/eulogies/promos.
Titles verbatim (LessonName). Short clips (< MIN_LEN) are skipped. Writes data/sources/ybm-<rav>.json"""
import sys, os, re, json, time, datetime, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
API = "https://www.ybm.org.il/api/"
UA = {"User-Agent": "Mozilla/5.0 (ShiurimAggregator personal study app)", "Content-Type": "application/json"}
RAVS = {"samet": 13, "spiegelman": 138, "medan": 351, "hendler": 183, "cherlow": 175}
CONTENT_ONLY = {"samet", "spiegelman", "medan"}
KEEP_CATS = [26, 60, 53, 322]                 # תנ"ך, מחשבה, חגים וזמנים, סדרות
BAD_CATS = [57, 1674, 41, 161]                # גמרא, הלכה, רמב"ם, אירועים ופרסומים
ALL_CATS = [26, 60, 53, 57, 1674, 41, 322]    # other ravs: everything except events
MIN_LEN = 600
GEMARA = re.compile(r'גמרא|גמ\'|תלמוד|סוגי(ה|ית|א|ות)|מסכת|דף היומי|שיעור כללי|בבא (קמא|מציעא|בתרא)|^הלכות|הלכות |הלכתי|שו"ע|שולחן ערוך|משנה ברורה|פסיקה|רשב"א|ריטב"א|תוספות|קצות')
SKIP = re.compile(r'ראיון|ריאיון|הספד|אזכרה|לזכר|טקס|פאנל|טריילר|פרומו|השקת|השקה|שיר |ניגון|קליפ|דברי פתיחה|ברכות לחתן|סיום מסכת')
EXCL = {k: v.get("excludeTitle", []) for k, v in load_json(os.path.join(ROOT, "data", "ravs.json"), {}).items()}

def post(ep, body):
    for a in range(5):
        try:
            r = urllib.request.urlopen(urllib.request.Request(API + ep, data=json.dumps(body).encode(), headers=UA), timeout=60).read()
            time.sleep(0.6)   # polite
            return json.loads(r) if r.strip() else None
        except Exception as e: print("  err", ep, e, flush=True); time.sleep(5 * (a + 1))
    return None

def lessons(rabi, cat):
    out, page = [], 1
    while True:
        d = post("LessonsList/LessonsList", {"CatId": cat, "Page": page, "Rabi": {"Id": rabi}, "OrderType": -1})
        if not d or not d.get("Lessons"): break
        out += [x for x in d["Lessons"] if x.get("RabiId") == rabi]
        if page >= (d.get("TotalPages") or 1): break
        page += 1
    return out

# ---- Hebrew date ("כ"ג חשון התש"ף") -> ISO, without dependencies ----
GEM = dict(zip("אבגדהוזחטיכלמנסעפצקרשת", [1,2,3,4,5,6,7,8,9,10,20,30,40,50,60,70,80,90,100,200,300,400]))
GEM.update({"ך": 20, "ם": 40, "ן": 50, "ף": 80, "ץ": 90})
def gem(s): return sum(GEM.get(c, 0) for c in s)
def _elapsed(y):
    m = (235 * y - 234) // 19; d = 29 * m + (12084 + 13753 * m) // 25920
    return d + 1 if (3 * (d + 1)) % 7 < 3 else d
def _delay(y):
    a, b, c = _elapsed(y - 1), _elapsed(y), _elapsed(y + 1)
    return 2 if c - b == 356 else 1 if b - a == 382 else 0
def _ny(y): return -1373427 + _elapsed(y) + _delay(y)
def _leap(y): return (7 * y + 1) % 19 < 7
def _mlen(y, m):
    n = _ny(y + 1) - _ny(y)
    if m in (2, 4, 6, 10, 13) or (m == 12 and not _leap(y)) or (m == 8 and n % 10 != 5) or (m == 9 and n % 10 == 3): return 29
    return 30
MONTHS = [("מרחשון", 8), ("חשון", 8), ("חשוון", 8), ("תשרי", 7), ("כסלו", 9), ("כסליו", 9), ("טבת", 10), ("שבט", 11), ("אדר א", 12), ("אדר ב", 13), ("אדר", 0),
          ("ניסן", 1), ("אייר", 2), ("איר", 2), ("סיון", 3), ("סיוון", 3), ("תמוז", 4), ("מנחם אב", 5), ("אב", 5), ("אלול", 6)]
def heb2iso(s):
    m = re.match(r'\s*([א-ת"\'״׳]+)\s+(.+?)\s+ה?([א-ת"\'״׳]+)\s*$', s or "")
    if not m: return None
    day, mon, yr = gem(m.group(1)), m.group(2).strip(), gem(m.group(3))
    y = 5000 + yr if yr < 1000 else yr
    mm = next((n for k, n in MONTHS if mon.startswith(k)), None)
    if mm is None or not (1 <= day <= 30) or y < 5700: return None
    if mm == 0: mm = 13 if _leap(y) else 12
    order = list(range(7, (14 if _leap(y) else 13))) + list(range(1, 7))
    rd = _ny(y) + sum(_mlen(y, k) for k in order[:order.index(mm)]) + day - 1
    return datetime.date.fromordinal(rd).isoformat() + "T00:00:00+00:00"

def run(slug):
    rabi = RAVS[slug]; path = os.path.join(ROOT, "data", "sources", f"ybm-{slug}.json")
    old = load_json(path, {"shiurim": {}})["shiurim"]
    co = slug in CONTENT_ONLY
    got = {}
    for c in (KEEP_CATS if co else ALL_CATS):
        for x in lessons(rabi, c): got.setdefault(x["Id"], (x, c))
    bad = {x["Id"] for c in BAD_CATS for x in lessons(rabi, c)} if co else {x["Id"] for x in lessons(rabi, 161)}
    if not got: print(f"ybm {slug}: API unavailable, keeping", len(old)); return
    # the yeshiva's own podcast republishes some lessons as "<title> | <series> | <rav>": don't list them twice
    import glob
    pod = {(r.get("title") or "").split(" | ")[0].strip() for f in glob.glob(os.path.join(ROOT, "data", "sources", f"podcast-*-{slug}.json"))
           for r in load_json(f, {"shiurim": {}})["shiurim"].values() if " | " in (r.get("title") or "")}
    tpath = os.path.join(ROOT, "data", "sources", f"text-ybm-{slug}.json"); old_t = load_json(tpath, {"shiurim": {}})["shiurim"]; T = {}
    S, st = {}, {"podcast-dup": 0, "bad-cat": 0, "gemara/halacha": 0, "skip": 0, "short/no-audio": 0}
    for i, (x, c) in got.items():
        t = (x.get("LessonName") or "").strip()            # verbatim
        ser = (x.get("SidraName") or "").strip()
        if not re.search(r"[\u0590-\u05FF]", t): continue
        if t in pod: st["podcast-dup"] += 1; continue
        if i in bad: st["bad-cat"] += 1; continue
        if co and (GEMARA.search(t) or GEMARA.search(ser)): st["gemara/halacha"] += 1; continue
        if SKIP.search(t) or SKIP.search(ser) or any(k in t for k in EXCL.get(slug, [])): st["skip"] += 1; continue
        uid = f"ybm:{i}"
        pdf = f"https://www.ybm.org.il/admin/uploaddata/LessonsFiles/Pdf/{i}.pdf" if x.get("HasPdf") else None
        if not x.get("HasAudio") and not x.get("HasVideo") and pdf:   # a written lesson (PDF only): text item, link to the PDF
            T[uid] = old_t.get(uid) or {"uid": uid, "source": f"text-ybm-{slug}", "sourceId": i, "rav": slug, "title": t, "text": 1, "doc": pdf,
                "excerpt": (x.get("ShortDescription") or "").strip()[:600], "tags": [],
                "path": [{"id": "ybm", "title": "ישיבת ברכת משה"}, {"id": f"ybm:{slug}:{ser or c}", "title": ser or {26: 'תנ"ך', 60: "מחשבה", 53: "חגים וזמנים", 322: "סדרות", 57: "גמרא", 1674: "הלכה", 41: 'רמב"ם'}.get(c, "שיעורים")}],
                "date": heb2iso(x.get("HebrewDate")), "audio": [], "pageUrl": f"https://www.ybm.org.il/lesson?lesson={i}"}
            continue
        if not x.get("HasAudio") or (x.get("LessonLength") or 0) < MIN_LEN: st["short/no-audio"] += 1; continue
        S[uid] = old.get(uid) or {"uid": uid, "source": f"ybm-{slug}", "sourceId": i, "rav": slug, "title": t,
            "excerpt": (x.get("ShortDescription") or "").strip()[:1500], "tags": [], "duration": x.get("LessonLength"),
            "path": [{"id": "ybm", "title": "ישיבת ברכת משה"}, {"id": f"ybm:{slug}:{ser or c}", "title": ser or {26: 'תנ"ך', 60: "מחשבה", 53: "חגים וזמנים", 322: "סדרות", 57: "גמרא", 1674: "הלכה", 41: 'רמב"ם'}.get(c, "שיעורים")}],
            "date": heb2iso(x.get("HebrewDate")), "audio": [f"https://www.ybm.org.il/admin/uploaddata/LessonsFiles/Audio/{i}.mp3"],
            "pageUrl": f"https://www.ybm.org.il/lesson?lesson={i}"}
        if pdf: S[uid]["doc"] = pdf                         # the lesson's written sheet (PDF) on the site
    from texts import keep_written
    T = keep_written(T, f"ybm-{slug}")                  # only shiurim written in advance (real written article, not a sheet / transcript)
    save_json(tpath, {"source": {"id": f"text-ybm-{slug}", "name": "ישיבת ברכת משה – שיעורים כתובים", "site": "https://www.ybm.org.il", "rav": slug, "kind": "text"}, "shiurim": T})
    save_json(path, {"source": {"id": f"ybm-{slug}", "name": "ישיבת ברכת משה", "site": "https://www.ybm.org.il", "rav": slug}, "shiurim": S})
    print(f"ybm {slug}: {len(got)} listed -> {len(S)} kept, {len(T)} written (PDF)", st, flush=True)

if __name__ == "__main__":
    for s in sys.argv[1:] or RAVS: run(s)
