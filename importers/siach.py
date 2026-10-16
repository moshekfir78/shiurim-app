#!/usr/bin/env python3
"""ישיבת שיח יצחק (siach.org.il, Efrat).
Site: WP REST posts (Hebrew only, /en/ skipped); media is only on the rendered page (audio files / YouTube embeds),
so each post page is scraped once and cached in data/siach_cache/media.json. Text-only posts are skipped.
YouTube: channel UC6NOUXQTudSzyF_8CITU8FQ via yt-dlp with lang=iw (original Hebrew titles, not auto-translated);
playlists give the series folder. No Shorts, min 15 min, excludes non-shiur titles.
All items get rav="siach" (top folder = the yeshiva); first folder is the speaker, then series.
Titles verbatim (only HTML entities decoded). Writes data/sources/siach-site.json, siach-youtube.json.
Usage: siach.py [site|youtube|all] [--refresh-playlists]"""
import sys, os, re, json, html, time, subprocess, urllib.request, glob
import concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
from common import save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CACHE = os.path.join(ROOT, "data", "siach_cache"); os.makedirs(CACHE, exist_ok=True)
SITE = "https://siach.org.il"; CH = "UC6NOUXQTudSzyF_8CITU8FQ"; MIN_DUR = 900
EXCL = ["ניגון", "ניגונים", "שיר ", "שירה ", "הקפות", "טקס", "תדמית", "פרומו", "טיזר", "קליפ", "הרשמה", "מוזמנים",
        "ברוכים הבאים", "ריאיון", "ראיון", "הלוויה", "לוויית", "חתונה", "ביאור חמץ: 2 דקות", "Teaser", "teaser",
        "שידור חי של ישיבת שיח יצחק", "זכרונות מהגבעה", "דברי פתיחה", "דברי ברכה", ": שיחה עם ", "| שיחה עם "]
GENERIC_PL = {"שיעורי אורחים בישיבת שיח יצחק"}
# rav name -> regex for title matching (YouTube)
RAVS = {"הרב יאיר דרייפוס": r"דרי?יפוס", "הרב נעם סמט": r"(נעם|נועם) סמט|הרב נעם\b|הרב נועם\b", "הרב אורי ליפשיץ": r"ליפשיץ|הרב אורי\b",
        "הרב אלחנן ניר": r"אלחנן ניר", "הרב בניה ינאי": r"בניה ינאי", "הרב אבישי שרייבר": r"שרייבר|הרב אבישי\b",
        "איתן אברמוביץ": r"אברמוביץ", "הרב אחיה סנדובסקי": r"סנדובסקי", "הרב אלי לריאה": r"לריאה",
        "הרב שג\"ר": r"הרב שג\"ר",
        "זוהר מאור": r"זוהר מאור", "אבישר הר שפי": r"הר[- ]שפי", "הרב יוסי גמליאל": r"גמליאל", "הרב אודי דבורקין": r"דבורקין"}
SHAGAR_NOT = r"לזכר|לע\"נ|לעילוי|לפטירת|יום עיון|ערב השקה|תורת הרב|רבותיו|מאמרי|שערים לרב|בכתבי|כמתרגם|מפגשים עם|יארצייט|של הרב שג|לפי הרב שג|עם הרב שג|מי היה|הרב שג\"ר[^|/:]*$(?<!הרב שג\"ר)"
GEN = "שיעורים ומפגשים"
SKIPCATS = {1011, 1163, 1156, 1025, 1155, 1, 1000, 32, 1139, 1043, 1013, 1015, 1001, 1009, 1203, 1012}
UA = {"User-Agent": "Mozilla/5.0"}

def get(url, tries=3):
    for i in range(tries):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(5 * (i + 1))

def rav_of(title):
    hits = sorted((m.start(), n) for n, rx in RAVS.items() for m in [re.search(rx, title)] if m)
    hits = [h for h in hits if h[1] != 'הרב שג"ר'] or [h for h in hits if not re.search(SHAGAR_NOT, title)]
    return hits[0][1] if hits else None

def node(*parts):
    return [{"id": "siach:" + "/".join(parts[:i + 1]), "title": p} for i, p in enumerate(parts)]

def bad(t): return any(k in t for k in EXCL) or not re.search(r"[\u0590-\u05FF]", t)

def other_yt():
    ids = set()
    for f in glob.glob(os.path.join(ROOT, "data", "sources", "*.json")):
        if "siach" in os.path.basename(f): continue
        for r in json.load(open(f, encoding="utf-8"))["shiurim"].values():
            if r.get("youtube"): ids.add(r["youtube"])
    return ids

def site():
    cats, page = {}, 1
    while True:
        r = json.loads(get(f"{SITE}/wp-json/wp/v2/categories?per_page=100&page={page}&_fields=id,name,parent"))
        if not r: break
        cats.update({c["id"]: (html.unescape(c["name"]), c["parent"]) for c in r}); page += 1
        if len(r) < 100: break
    posts, page = [], 1
    while True:
        try: r = json.loads(get(f"{SITE}/wp-json/wp/v2/posts?per_page=100&page={page}&_fields=id,date,title,categories,link"))
        except Exception: break
        if not isinstance(r, list) or not r: break
        posts += r; page += 1; time.sleep(1)
    mf = os.path.join(CACHE, "media.json"); media = json.load(open(mf)) if os.path.exists(mf) else {}
    todo = [p for p in posts if "/en/" not in p["link"] and str(p["id"]) not in media]
    def scrape(p):
        h = get(p["link"]).split("<footer")[0]
        return str(p["id"]), {"yt": list(dict.fromkeys(re.findall(r"(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?v=)|youtu\.be/)([\w-]{11})", h))),
                              "au": list(dict.fromkeys(re.findall(r"(https?://[^\"'\s<>?]+?\.(?:mp3|ogg|m4a|wav))", h, re.I)))}
    with cf.ThreadPoolExecutor(4) as ex:
        for k, v in ex.map(scrape, todo): media[k] = v
    json.dump(media, open(mf, "w"), ensure_ascii=False)
    ravcats = {i for i, (n, par) in cats.items() if par == 1015 and n != "מרצים אורחים"}
    S, skipped = {}, {"text-only": 0, "english": 0, "excluded": 0}
    for p in posts:
        if "/en/" in p["link"]: skipped["english"] += 1; continue
        m = media.get(str(p["id"]), {}); title = html.unescape(p["title"]["rendered"])
        if not (m.get("yt") or m.get("au")): skipped["text-only"] += 1; continue
        if bad(title): skipped["excluded"] += 1; continue
        if m.get("yt") and m["yt"][0] in OTHER and not m.get("au"): skipped["already-in-app"] = skipped.get("already-in-app", 0) + 1; continue
        names = [cats[c][0] for c in p["categories"] if c in cats]
        ravn = next((cats[c][0] for c in p["categories"] if c in ravcats), None) or rav_of(title)
        if not ravn:
            pre = [n.split(":")[0].strip() for n in names if ":" in n]
            rn = [cats[c][0] for c in ravcats]
            ravn = next((r for r in rn for x in pre if x in (r, r.replace("הרב ", ""))), None)
        if ravn and not ravn.startswith(("הרב", "פרופ", "ד\"ר")) and ravn in ("אחיה סנדובסקי",): ravn = "הרב " + ravn
        series = next((n.split(":", 1)[1].strip() for n in names if ":" in n and ravn and n.split(":")[0].strip() in (ravn, ravn.replace("הרב ", ""))), None)
        if not series:
            ser = [cats[c][0] for c in p["categories"] if c in cats and cats[c][1] in (1013, 0) and c not in SKIPCATS]
            ser += [cats[c][0] for c in p["categories"] if c in cats and c not in ravcats and c not in SKIPCATS and ":" not in cats[c][0]]
            series = ser[0] if ser else "שונות"
        uid = f"siach:{p['id']}"
        S[uid] = {"uid": uid, "source": "siach-site", "sourceId": p["id"], "rav": "siach", "title": title, "excerpt": "",
                  "tags": names, "path": node(ravn or GEN, series), "date": p["date"],
                  "audio": [a.split("?")[0] for a in m.get("au", [])], "pageUrl": p["link"]}
        if m.get("yt"): S[uid]["youtube"] = m["yt"][0]
    save_json(os.path.join(ROOT, "data", "sources", "siach-site.json"),
              {"source": {"id": "siach-site", "name": "ישיבת שיח יצחק – אתר הישיבה", "site": SITE, "rav": "siach"}, "shiurim": S})
    print("siach site:", len(S), "shiurim; skipped", skipped)

def ytdlp(url):
    r = subprocess.run(["yt-dlp", "--flat-playlist", "-J", "--extractor-args", "youtube:lang=iw", url], capture_output=True, text=True)
    return json.loads(r.stdout) if r.stdout.strip() else None

def youtube(refresh=False):
    pld = os.path.join(CACHE, "playlists"); os.makedirs(pld, exist_ok=True)
    vids = {}
    for tab in ("videos", "streams"):
        d = ytdlp(f"https://www.youtube.com/channel/{CH}/{tab}")
        for e in (d or {}).get("entries") or []: vids[e["id"]] = e
        time.sleep(3)
    pls = ytdlp(f"https://www.youtube.com/channel/{CH}/playlists") or {"entries": []}
    vpl = {}
    for e in pls["entries"]:
        f = os.path.join(pld, e["id"] + ".json")
        if refresh or not os.path.exists(f):
            d = ytdlp(f"https://www.youtube.com/playlist?list={e['id']}"); time.sleep(3)
            if d: json.dump(d, open(f, "w"), ensure_ascii=False)
        if not os.path.exists(f): continue
        d = json.load(open(f)); t = d.get("title") or e.get("title")
        if t in GENERIC_PL: continue
        for x in d.get("entries") or []: vpl.setdefault(x["id"], []).append(t)
    S, sk = {}, {"short": 0, "excluded/non-hebrew": 0}
    for vid, e in vids.items():
        t = e.get("title") or ""; dur = e.get("duration") or 0
        if "/shorts/" in (e.get("url") or "") or dur < MIN_DUR: sk["short"] += 1; continue
        if bad(t): sk["excluded/non-hebrew"] += 1; continue
        if vid in OTHER: sk["already-in-app"] = sk.get("already-in-app", 0) + 1; continue
        pls = vpl.get(vid, [])
        ravn = rav_of(t) or next((rav_of(x) for x in pls if rav_of(x)), None)
        series = next((x for x in pls if ravn and rav_of(x) == ravn), pls[0] if pls else "יוטיוב")
        if ravn and series.replace(" ", "") .startswith(ravn.replace(" ", "")): series = series[len(ravn):].lstrip(" :|-") or series
        uid = f"yt-siach:{vid}"
        S[uid] = {"uid": uid, "source": "youtube-siach", "sourceId": vid, "rav": "siach", "title": t, "excerpt": "", "tags": [],
                  "duration": dur, "path": node(ravn or GEN, series), "date": None, "audio": [],
                  "pageUrl": f"https://www.youtube.com/watch?v={vid}", "youtube": vid}
    save_json(os.path.join(ROOT, "data", "sources", "youtube-siach.json"),
              {"source": {"id": "youtube-siach", "name": "ישיבת שיח יצחק – יוטיוב", "site": f"https://www.youtube.com/channel/{CH}", "rav": "siach"}, "shiurim": S})
    print("siach youtube:", len(S), "videos; skipped", sk)

if __name__ == "__main__":
    OTHER = other_yt()
    a = sys.argv[1] if len(sys.argv) > 1 else "all"
    if a in ("site", "all"): site()
    if a in ("youtube", "all"): youtube("--refresh-playlists" in sys.argv)
