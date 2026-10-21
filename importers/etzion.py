#!/usr/bin/env python3
"""תורת הר עציון (etzion.org.il) — public GraphQL (getSearch by author id), then each lesson page for audio/YouTube.
  python3 importers/etzion.py [rachmani|cherlow|medan|grossman|lichtenstein|amital|spiegelman|samet|fargeon|rosenberg]
For CONTENT_ONLY ravs only Tanach / machshava / chagim lessons are kept (site hierarchy), never Gemara or halacha
(also by title/series keywords), no books/source sheets; pages already checked are cached in the store ("checked").
Titles verbatim from the API. Keeps lessons with audio, video or substantial text (VBM articles).
Lessons whose YouTube id is already in data/sources/youtube-<rav>.json are skipped. Writes data/sources/etzion-<rav>.json"""
import sys, os, re, json, time, html, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json, sanitize_html
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RAVS = {"rachmani": "5710", "cherlow": "5843", "medan": "5577", "grossman": "5612", "lichtenstein": "5574", "amital": "5578", "spiegelman": "5730", "samet": "5690", "fargeon": "6852", "rosenberg": "5607"}
CONTENT_ONLY = {"medan", "grossman", "lichtenstein", "amital", "spiegelman", "samet", "fargeon", "rosenberg"}
ALLOW = {'תנ"ך', "מחשבה", "חגים"}           # site hierarchy top level; גמרא / הלכה / פרסומים are excluded
GEMARA = re.compile(r'גמרא|תלמוד (בבלי|ירושלמי)|סוגי(ה|ית|א|ות) |סוגיית|מסכת|דף היומי|דפי לימוד|שיעור כללי|חבורות|בבא (קמא|מציעא|בתרא)|^הלכות |\| הלכות |'
                    r'הלכות (פסח|הפסח|חנוכה|פורים|סוכה|שבת|תשעה|יום|ספירת|תפילה|ברכות|מלכים)|רשב"א|ריטב"א|תוספות|קצות החושן')
SKIP2 = ["ראיון", "ריאיון", "פאנל", "טריילר", "פרומו", "שיחה עם", "הספדים", "מספד", "שר '", "מצגת", "ביקור תלמידים", "סיפורו של הרב",
         "ביום השנה הראשון", "מה שימח", "דברים מפי", "בהגיעו לגבורות", "עציץ נקוב", "בעלות על קבר", "אומדנא", "לשמה במרור", "מלאכה בט' באב",
         "חינוך להסיבה", "האם ראוי לומר הלל"]
SKIP_SERIES = ["ברון יחד", "גבורות ל"]   # sung piyutim; tributes
EXCL = {k: v.get("excludeTitle", []) for k, v in load_json(os.path.join(ROOT, "data", "ravs.json"), {}).items()}   # same title filters as YouTube
UA = {"User-Agent": "Mozilla/5.0 (ShiurimAggregator personal study app)", "Content-Type": "application/json"}
SKIP = ["אזכרה", "דברי פתיחה", "מושב ראשון", "מושב שני", "יו\"ר", "הספד", "ברכות", "טקס"]

def req(url, data=None):
    for a in range(6):
        try: return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=60).read().decode("utf-8", "replace")
        except Exception as e: print("  err", e, flush=True); time.sleep(10 * (a + 1))
    return ""

def keep(slug, x, t):
    if slug not in CONTENT_ONLY: return True
    h = x.get("hierarchy_terms") or []
    if str(x.get("field_media")) in ("35", "6814"): return False          # books, source sheets
    if not h or h[0] not in ALLOW: return False
    if GEMARA.search(t) or GEMARA.search(html.unescape(x.get("field_series") or "")): return False
    if any(k in html.unescape(x.get("field_series") or "") for k in SKIP_SERIES): return False
    return not any(k in t for k in SKIP2 + EXCL.get(slug, []))

def run(slug):
    path = os.path.join(ROOT, "data", "sources", f"etzion-{slug}.json")
    old = load_json(path, {"shiurim": {}}); OLD, checked = old["shiurim"], set(old.get("checked", []))
    stats = {"gemara/halacha/other": 0}
    yt = set(v.get("youtube") for v in load_json(os.path.join(ROOT, "data", "sources", f"youtube-{slug}.json"), {"shiurim": {}})["shiurim"].values())
    S, frm = {}, 0
    # one request for all results: from/size paging of this API is not stable (pages overlap and skip lessons)
    tot = json.loads(req("https://www.etzion.org.il/graphql", json.dumps({"query": '{getSearch(search:{authors:["%s"],lang:["he"],from:0,size:1}){total}}' % RAVS[slug]}).encode()))["data"]["getSearch"]["total"]
    q = '{getSearch(search:{authors:["%s"],lang:["he"],from:0,size:%d}){total results{nid title body field_lesson_date field_series arr_author_name hierarchy_terms field_media}}}' % (RAVS[slug], tot + 50)
    r = json.loads(req("https://www.etzion.org.il/graphql", json.dumps({"query": q}).encode()))["data"]["getSearch"]
    for n, x in enumerate(r["results"], 1):
        if True:
            t = html.unescape(x["title"] or "")
            if not re.search(r"[\u0590-\u05FF]", html.unescape(x["title"]["rendered"] if isinstance(x["title"], dict) else x["title"] or "")): continue   # Hebrew only (user rule)
            if any(k in t for k in SKIP): continue
            if not keep(slug, x, t): stats["gemara/halacha/other"] += 1; continue
            uid = f"etzion:{x['nid']}"
            if uid in OLD: S[uid] = OLD[uid]; continue           # already imported
            if str(x["nid"]) in checked: continue                 # page already checked: no media
            page = req(f"https://www.etzion.org.il/he/node/{x['nid']}"); time.sleep(1)
            link = (re.search(r'canonical" href="([^"]+)"', page) or [None, f"https://www.etzion.org.il/he/node/{x['nid']}"])[1]
            audio = sorted(set(re.findall(r'https?://[^"\'\s<>]+\.mp3', page)))
            vids = [v for v in re.findall(r'youtube(?:-nocookie)?\.com/embed/([\w-]{11})', page)]
            body = x.get("body") or ""
            plain = html.unescape(re.sub(r"<[^>]+>", " ", body)).strip()
            if vids and vids[0] in yt: continue
            if not audio and not vids:
                if page: checked.add(str(x["nid"]))   # a failed fetch is retried next run
                continue   # media only (user rule)
            d = x.get("field_lesson_date"); iso = None
            if d and re.match(r"\d+/\d+/\d{4}", d): dd, m, y = d.split("/"); iso = f"{y}-{int(m):02d}-{int(dd):02d}T00:00:00+00:00"
            ser = html.unescape(x.get("field_series") or "שיעורים")
            S[uid] = {"uid": uid, "source": f"etzion-{slug}", "sourceId": x["nid"], "rav": slug, "title": t,
                      "excerpt": re.sub(r"\s+", " ", plain)[:1500], "contentHtml": sanitize_html(body) if len(plain) >= 500 else None,
                      "tags": [h for h in (x.get("hierarchy_terms") or []) if h] if slug in CONTENT_ONLY else [], "path": [{"id": f"etzion:{slug}", "title": "תורת הר עציון"}, {"id": f"etzion:{slug}:{ser}", "title": ser}],
                      "date": iso, "audio": audio, "pageUrl": link, **({"youtube": vids[0]} if vids else {})}
        if n % 50 == 0:
            print(slug, n, len(S), "/", r["total"], flush=True)
            save_json(path, {"source": {"id": f"etzion-{slug}", "name": "תורת הר עציון", "site": "https://www.etzion.org.il", "rav": slug}, "shiurim": {**OLD, **S}, "checked": sorted(checked)})
    save_json(path, {"source": {"id": f"etzion-{slug}", "name": "תורת הר עציון", "site": "https://www.etzion.org.il", "rav": slug}, "shiurim": S, "checked": sorted(checked)})
    print(slug, len(S), "lessons", stats)

if __name__ == "__main__":
    for s in sys.argv[1:] or RAVS: run(s)
