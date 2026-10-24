#!/usr/bin/env python3
"""Written shiurim (articles, VBM lessons, parasha sheets, columns) for the rabbis already in the app.
Each item is a text item: "text": 1, plus either the text itself ("contentHtml", sanitized, when the site publishes it as
web text through its own public API) or a document link ("doc": PDF on the site) shown with a "קריאה במקור" button.
Titles verbatim. Hebrew only. Non-shiur posts (eulogies, interviews, announcements, news/politics) are skipped.
For the content-only rabbis (see CONTENT_ONLY) only Tanach / machshava / holidays / parasha, never Gemara or halacha.
Items already in the app as audio/video from the same site are skipped; same-title items elsewhere are merged by build.py.
  python3 importers/texts.py [etzion|hatanakh|rosenberg|siach|mikyab|shabaton ...]   (default: all)
Writes data/sources/text-<site>-<rav>.json. Incremental: items already stored are kept, only new ones are fetched."""
import sys, os, re, json, html, time, subprocess, urllib.parse, glob
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json, sanitize_html
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
UA = "Mozilla/5.0 (ShiurimAggregator personal study app)"
CONTENT_ONLY = {"medan", "grossman", "lichtenstein", "amital", "spiegelman", "samet", "fargeon", "rosenberg"}
EXCL = {k: v.get("excludeTitle", []) for k, v in load_json(os.path.join(ROOT, "data", "ravs.json"), {}).items()}
NONSHIUR = re.compile(r'הספד|לזכר|לזכרו|לע"נ|אזכרה|יום השנה ל|ראיון|ריאיון|בגבורותיו|לכבודו של|דברי פתיחה|דברי ברכה|טקס |מודעה|הודעה|הרשמה|מוזמנים|'
                      r'פרומו|טריילר|שיר |ניגון|קליפ|מזל טוב|ברכת מזל|חדשות|עדכון|תוכנית הלימודים|לוח זמנים|מבצע|מכרז|דרושים')
GEMARA = re.compile(r'גמרא|תלמוד (בבלי|ירושלמי)|סוגי(ה|ית|א|ות) |סוגיית|מסכת|דף היומי|שיעור כללי|בבא (קמא|מציעא|בתרא)|^הלכות |הלכות (פסח|חנוכה|פורים|שבת|תפילה)|'
                    r'שו"ע|שולחן ערוך|משנה ברורה|רשב"א|ריטב"א|תוספות|קצות|הלכתי|פסיקה|בירור הלכה|דיני ')
HEB = re.compile(r"[\u0590-\u05FF]")

def get(url, data=None, ctype=None, tries=4, raw=False):
    cmd = ["curl", "-sS", "-L", "-m", "90", "-A", UA, "--compressed"]
    if data is not None: cmd += ["-H", f"Content-Type: {ctype or 'application/json'}", "--data-binary", "@-"]
    for a in range(tries):
        r = subprocess.run(cmd + [url], input=data.encode() if isinstance(data, str) else data, capture_output=True)
        if r.returncode == 0 and r.stdout: return r.stdout if raw else r.stdout.decode("utf-8", "replace")
        print("  err", url[:100], r.returncode, r.stderr[:120], flush=True); time.sleep(5 * (a + 1))
    return b"" if raw else ""

def getj(url, **k):
    t = get(url, **k)
    try: return json.loads(t)
    except Exception: return None

def plain(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()

def clean_html(h):
    h = re.sub(r"(?is)<(figure|noscript|form|button|svg)[^>]*>.*?</\1>", "", h or "")
    h = sanitize_html(h).replace("&nbsp;", " ")
    h = re.sub(r"<(p|span|b|strong|i|em|u|h\d)>\s*</\1>", "", h)
    h = re.sub(r"(<br>\s*){3,}", "<br><br>", h)
    h = re.sub(r"[ \t]{2,}", " ", h)
    return re.sub(r"\n{3,}", "\n\n", h).strip()

def ok_title(slug, t, extra=""):
    if not t or not HEB.search(t): return False
    if NONSHIUR.search(t) or any(k in t for k in EXCL.get(slug, [])): return False
    if slug in CONTENT_ONLY and (GEMARA.search(t) or GEMARA.search(extra)): return False
    return True

def store(src_id, name, site, rav, S, extra=None):
    path = os.path.join(ROOT, "data", "sources", f"text-{src_id}.json")
    save_json(path, {"source": {"id": f"text-{src_id}", "name": name, "site": site, "rav": rav, "kind": "text"}, "shiurim": S, **(extra or {})})
    print(f"text-{src_id}: {len(S)} text items", flush=True)

def old_of(src_id):
    d = load_json(os.path.join(ROOT, "data", "sources", f"text-{src_id}.json"), {"shiurim": {}})
    return d["shiurim"], set(d.get("checked", []))

def media_ids(prefix):
    """source ids of items already imported as audio/video from the same site (any rav)"""
    out = set()
    for f in glob.glob(os.path.join(ROOT, "data", "sources", prefix + "*.json")):
        for r in load_json(f, {"shiurim": {}})["shiurim"].values(): out.add(str(r.get("sourceId")))
    return out

def item(uid, src, rav, title, path, date, page, body=None, doc=None, desc="", tags=None):
    r = {"uid": uid, "source": src, "sourceId": uid.split(":", 1)[1], "rav": rav, "title": title, "text": 1,
         "excerpt": desc[:600], "tags": tags or [], "path": path, "date": date, "audio": [], "pageUrl": page}
    if body: r["contentHtml"] = body
    if doc: r["doc"] = doc
    return r

# ---------------------------------------------------------------- תורת הר עציון (VBM) — public GraphQL, full lesson text
def etzion(slugs=None):
    import etzion as E
    have = media_ids("etzion-")
    for slug in slugs or E.RAVS:
        aid = E.RAVS[slug]; sid = f"etzion-{slug}"
        OLD, checked = old_of(sid)
        q = lambda size, f: json.dumps({"query": '{getSearch(search:{authors:["%s"],lang:["he"],from:0,size:%d}){total %s}}' % (aid, size, f)})
        tot = (getj("https://www.etzion.org.il/graphql", data=q(1, "")) or {}).get("data", {}).get("getSearch", {}).get("total")
        if not tot: print(sid, "API unavailable, keeping", len(OLD)); continue
        r = getj("https://www.etzion.org.il/graphql", data=q(tot + 50, "results{nid title body field_lesson_date field_series hierarchy_terms field_media}"))
        res = ((r or {}).get("data") or {}).get("getSearch", {}).get("results") or []
        if not res: print(sid, "results unavailable, keeping", len(OLD)); continue
        S, st = {}, {"media": 0, "filtered": 0, "short": 0}
        for x in res:
            nid = str(x["nid"]); t = html.unescape(x.get("title") or "")
            if nid in have: st["media"] += 1; continue                 # already in the app as audio/video (etzion importer)
            ser = html.unescape(x.get("field_series") or "")
            if not ok_title(slug, t, ser) or any(k in t for k in E.SKIP) or not E.keep(slug, x, t): st["filtered"] += 1; continue
            if str(x.get("field_media")) in ("35", "6814"): st["filtered"] += 1; continue   # books, source sheets
            uid = f"etzion:{nid}"
            if uid in OLD: S[uid] = OLD[uid]; continue
            body = x.get("body") or ""; doc = None
            if len(plain(body)) < 800:
                if nid in checked: st["short"] += 1; continue
                p = get(f"https://www.etzion.org.il/he/node/{nid}"); time.sleep(1)
                pdfs = re.findall(r'href="(https?://[^"]+?\.pdf)"', p) or [urllib.parse.urljoin("https://www.etzion.org.il", u) for u in re.findall(r'href="(/[^"]+?\.pdf)"', p)]
                if not pdfs:
                    if p: checked.add(nid)
                    st["short"] += 1; continue
                doc = pdfs[0]; body = ""
            d = x.get("field_lesson_date"); iso = None
            if d and re.match(r"\d+/\d+/\d{4}", d): dd, m, y = d.split("/"); iso = f"{y}-{int(m):02d}-{int(dd):02d}T00:00:00+00:00"
            S[uid] = item(uid, f"text-{sid}", slug, t, [{"id": f"etzion:{slug}", "title": "תורת הר עציון"}, {"id": f"etzion:{slug}:{ser or 'שיעורים'}", "title": ser or "שיעורים"}],
                          iso, f"https://www.etzion.org.il/he/node/{nid}", body=clean_html(body) if body else None, doc=doc,
                          tags=[h for h in (x.get("hierarchy_terms") or []) if h])
        store(sid, "תורת הר עציון – שיעורים כתובים", "https://www.etzion.org.il", slug, S, {"checked": sorted(checked)})
        print("  ", slug, st, flush=True)

# ---------------------------------------------------------------- אתר התנ"ך (hatanakh.com) — articles: PDF + the site's own abstract
def hatanakh(slugs=None):
    import hatanakh as H
    for slug in slugs or H.AUTHORS:
        sid = f"hatanakh-{slug}"; OLD, checked = old_of(sid)
        page = get(H.SITE + "/" + urllib.parse.quote("מחברים/" + H.AUTHORS[slug]))
        rows = re.findall(r'<li class="search-result ([a-z_ -]+)"><h3 class="title"><a href="([^"]+)">(.*?)</a></h3>(.*?)</li>', page, re.S)
        if not rows: print(sid, "listing unavailable, keeping", len(OLD)); continue
        S = {}
        for typ, href, title, rest in rows:
            if typ.strip() != "article": continue
            title = html.unescape(re.sub(r"<[^>]+>", "", title)).strip()
            uid = f"hatanakh:{urllib.parse.unquote(href).rsplit('/', 1)[-1]}"
            if not ok_title(slug, title): continue
            if uid in OLD: S[uid] = OLD[uid]; continue
            if uid in checked: continue
            p = get(H.SITE + href); time.sleep(0.8)
            if not p: continue
            pdf = re.search(r'href="(https://www\.hatanakh\.com/sites/default/files/[^"]+?\.pdf)"', p)
            teaser = re.search(r'field-name-field-teaser.*?<div class="field-item[^"]*">(.*?)</div>', p, re.S)
            body = re.search(r'field-name-body.*?<div class="field-item[^"]*">(.*?)</div>\s*</div>\s*</div>', p, re.S)
            if not pdf and not (body and len(plain(body.group(1))) >= 800): checked.add(uid); continue
            date = re.search(r'property="article:published_time" content="([^"]+)"', p)
            refs = re.findall(r"<div class='tanach-ref'><a [^>]*>([^<]+)</a>", p)
            S[uid] = item(uid, f"text-{sid}", slug, title, [{"id": f"hatanakh:{slug}", "title": "אתר התנ\"ך - מכללת הרצוג"}, {"id": f"hatanakh:{slug}:מאמרים", "title": "מאמרים"}],
                          date.group(1) if date else None, H.SITE + urllib.parse.unquote(href),
                          body=clean_html(body.group(1)) if body and len(plain(body.group(1))) >= 800 else None,
                          doc=pdf.group(1) if pdf else None, desc=plain(teaser.group(1)) if teaser else "", tags=[html.unescape(x) for x in refs])
        store(sid, "אתר התנ\"ך – מאמרים", H.SITE, slug, S, {"checked": sorted(checked)})

# ---------------------------------------------------------------- אתר הרב שלום רוזנברג — WP REST, articles (PDF documents)
RS_SKIP_CATS = {9, 110, 111, 40, 105, 109, 38, 5, 39, 8}    # video, books, English books, interviews, French, English, current affairs, elections, essays on politics, audio
def rosenberg():
    sid = "shalomrosenberg-rosenberg"; OLD, _ = old_of(sid)
    site = "https://www.shalomrosenberg.com"
    cats = {c["id"]: html.unescape(c["name"]) for c in (getj(site + "/wp-json/wp/v2/categories?per_page=100&_fields=id,name") or [])}
    posts, page = [], 1
    while True:
        r = getj(site + f"/wp-json/wp/v2/posts?per_page=100&page={page}&_fields=id,date,link,title,content,categories")
        if not isinstance(r, list) or not r: break
        posts += r; page += 1; time.sleep(1)
        if len(r) < 100: break
    if not posts: print(sid, "API unavailable, keeping", len(OLD)); return
    S, seen = {}, set()
    for x in sorted(posts, key=lambda x: x["id"]):
        t = html.unescape(x["title"]["rendered"]).strip()
        cs = set(x.get("categories") or [])
        if cs & RS_SKIP_CATS or not ok_title("rosenberg", t): continue
        c = x["content"]["rendered"]
        pdf = re.search(r'(https?://www\.shalomrosenberg\.com/wp-content/uploads/[^"&\s]+?\.pdf)', urllib.parse.unquote(c))
        body = clean_html(c) if len(plain(c)) >= 800 else None
        if not pdf and not body: continue
        key = pdf.group(1) if pdf else t
        if key in seen or t in seen: continue                   # same article listed in several categories
        seen.update({key, t})
        uid = f"shalomrosenberg:post-{x['id']}"
        names = [cats[i] for i in cs if i in cats]
        S[uid] = OLD.get(uid) or item(uid, f"text-{sid}", "rosenberg", t, [{"id": "shalomrosenberg", "title": "אתר הרב שלום רוזנברג"}, {"id": "shalomrosenberg:מאמרים", "title": "מאמרים"}],
                                      x["date"] + "+00:00" if x.get("date") else None, x["link"], body=body,
                                      doc=urllib.parse.quote(pdf.group(1), safe=":/") if pdf else None, tags=names)
    store(sid, "אתר הרב שלום רוזנברג – מאמרים", site, "rosenberg", S)

# ---------------------------------------------------------------- ישיבת שיח יצחק — WP posts that are written (no audio/video)
def siach():
    import siach as SI
    sid = "siach-text"; OLD, _ = old_of(sid)
    media = load_json(os.path.join(SI.CACHE, "media.json"), {})
    cats, page = {}, 1
    while True:
        r = getj(f"{SI.SITE}/wp-json/wp/v2/categories?per_page=100&page={page}&_fields=id,name,parent")
        if not isinstance(r, list) or not r: break
        cats.update({c["id"]: (html.unescape(c["name"]), c["parent"]) for c in r}); page += 1
        if len(r) < 100: break
    posts, page = [], 1
    while True:
        r = getj(f"{SI.SITE}/wp-json/wp/v2/posts?per_page=100&page={page}&_fields=id,date,title,categories,link")
        if not isinstance(r, list) or not r: break
        posts += r; page += 1; time.sleep(1)
    if not posts or not cats: print(sid, "API unavailable, keeping", len(OLD)); return
    ravcats = {i for i, (n, par) in cats.items() if par == 1015 and n != "מרצים אורחים"}
    cand = []
    for p in posts:
        if "/en/" in p["link"]: continue
        m = media.get(str(p["id"]))
        if m is None or m.get("yt") or m.get("au"): continue      # media posts are imported by siach.py
        t = html.unescape(p["title"]["rendered"])
        if SI.bad(t) or not ok_title("siach", t): continue
        if set(p["categories"]) & SI.SKIPCATS and not set(p["categories"]) & ravcats: continue
        cand.append(p)
    need = [p for p in cand if f"siach:{p['id']}" not in OLD]
    content = {}
    for i in range(0, len(need), 50):
        ids = ",".join(str(p["id"]) for p in need[i:i + 50])
        r = getj(f"{SI.SITE}/wp-json/wp/v2/posts?include={ids}&per_page=50&_fields=id,content,excerpt")
        for x in r or []: content[x["id"]] = x["content"]["rendered"]
        time.sleep(1.5)
    S = {}
    for p in cand:
        uid = f"siach:{p['id']}"
        if uid in OLD: S[uid] = OLD[uid]; continue
        c = content.get(p["id"])
        if c is None or len(plain(c)) < 1000: continue          # short notices / announcements / not fetched (retried next run)
        t = html.unescape(p["title"]["rendered"])
        names = [cats[c2][0] for c2 in p["categories"] if c2 in cats]
        ravn = next((cats[c2][0] for c2 in p["categories"] if c2 in ravcats), None) or SI.rav_of(t)
        series = next((n.split(":", 1)[1].strip() for n in names if ":" in n and ravn and n.split(":")[0].strip() in (ravn, ravn.replace("הרב ", ""))), None)
        if not series:
            ser = [cats[c2][0] for c2 in p["categories"] if c2 in cats and c2 not in ravcats and c2 not in SI.SKIPCATS and ":" not in cats[c2][0]]
            series = ser[0] if ser else "שונות"
        S[uid] = item(uid, f"text-{sid}", "siach", t, SI.node(ravn or SI.GEN, series), p["date"], p["link"], body=clean_html(c), tags=names)
    store(sid, "ישיבת שיח יצחק – מאמרים ושיעורים כתובים", SI.SITE, "siach", S)

# ---------------------------------------------------------------- הרב מיכאל אברהם — the columns ("טורים") on mikyab.net
POLITICS = re.compile(r'ממשל|בחירות|פוליטי|קואליצ|נתניהו|ביבי|הפגנ|הרפורמה|המהפכה המשפטית|ליכוד|מפלג|הכנסת|ח"כ|סמוטריץ|בן גביר|לפיד|בנט|טראמפ|'
                      r'עזה|חמאס|חטופים|7 באוקטובר|שבעה באוקטובר|קורונה|חיסונ|שמאלית|ימנית|אינתיפאד|מלחמת|מלחמה ב|הסכם|ממשלה|בג"ץ|היועמ"ש|תקשורת')
def mikyab():
    sid = "mikyab-avraham"; OLD, _ = old_of(sid); site = "https://mikyab.net"
    posts, page = [], 1
    while True:
        r = getj(site + f"/wp-json/wp/v2/posts?per_page=50&page={page}&_fields=id,date,link,title" + ("" if page > 1 or not OLD else ""))
        if not isinstance(r, list) or not r: break
        posts += r; page += 1; time.sleep(1.5)
        if len(r) < 50: break
    if not posts: print(sid, "API unavailable, keeping", len(OLD)); return
    keep = [p for p in posts if ok_title("avraham", html.unescape(p["title"]["rendered"])) and not POLITICS.search(html.unescape(p["title"]["rendered"]))]
    need = [p for p in keep if f"mikyab:{p['id']}" not in OLD]
    content = {}
    for i in range(0, len(need), 20):
        r = getj(site + f"/wp-json/wp/v2/posts?include={','.join(str(p['id']) for p in need[i:i + 20])}&per_page=20&_fields=id,content")
        for x in r or []: content[x["id"]] = x["content"]["rendered"]
        time.sleep(2)
    S = {}
    for p in keep:
        uid = f"mikyab:{p['id']}"
        if uid in OLD: S[uid] = OLD[uid]; continue
        c = content.get(p["id"])
        if not c or len(plain(c)) < 1500: continue
        t = html.unescape(p["title"]["rendered"])
        S[uid] = item(uid, f"text-{sid}", "avraham", t, [{"id": "mikyab", "title": "טורים באתר הרב מיכאל אברהם"}], p["date"] + "+00:00", p["link"], body=clean_html(c))
    store(sid, "אתר הרב מיכאל אברהם – טורים", site, "avraham", S)

# ---------------------------------------------------------------- שבתון (shabaton1.co.il) — weekly parasha columns (link to the original only)
SHABATON = {"mashiach": "אמיר משיח", "piron": "שי פירון"}
def shabaton():
    site = "https://shabaton1.co.il"
    for slug, q in SHABATON.items():
        sid = f"shabaton-{slug}"; OLD, _ = old_of(sid)
        users = getj(site + "/?rest_route=/wp/v2/users&search=" + urllib.parse.quote(q) + "&_fields=id,name") or []
        if not isinstance(users, list) or not users: print(sid, "API unavailable, keeping", len(OLD)); continue
        posts = []
        for u in users:
            page = 1
            while True:
                r = getj(site + f"/?rest_route=/wp/v2/posts&author={u['id']}&per_page=100&page={page}&_fields=id,date,link,title,content")
                if not isinstance(r, list) or not r: break
                posts += r; page += 1; time.sleep(1)
                if len(r) < 100: break
        S, seen = {}, set()
        for x in sorted(posts, key=lambda x: x["id"]):
            t = html.unescape(x["title"]["rendered"]).strip(); c = x["content"]["rendered"]
            if not ok_title(slug, t) or t in seen or len(plain(c)) < 1000: continue
            seen.add(t); uid = f"shabaton:{x['id']}"
            S[uid] = OLD.get(uid) or item(uid, f"text-{sid}", slug, t, [{"id": f"shabaton:{slug}", "title": "שבתון – מאמרים לפרשת השבוע"}], x["date"] + "+00:00", x["link"])   # newspaper column: rights unclear -> title + link to the original only
        store(sid, "שבתון – מאמרים", site, slug, S)

RUN = {"etzion": etzion, "hatanakh": hatanakh, "rosenberg": rosenberg, "siach": siach, "mikyab": mikyab, "shabaton": shabaton}
if __name__ == "__main__":
    for k in sys.argv[1:] or RUN:
        try: RUN[k]()
        except Exception as e: print("::warning::texts", k, "failed:", e, flush=True)
