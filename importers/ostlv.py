#!/usr/bin/env python3
"""ישיבת אורות שאול (ostlv.co.il, formerly ypt.co.il) — WordPress REST API, post type `lesson`, taxonomy `rabbi`.
  python3 importers/ostlv.py [granot|eldar]
Titles verbatim (HTML entities decoded only). The site rate-limits with a "One moment, please..." page: we back off and retry.
Lessons whose YouTube video is already in data/sources/youtube-<rav>.json are skipped (no duplicates).
Writes data/sources/ostlv-<rav>.json"""
import sys, os, re, json, time, html, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json, sanitize_html
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
API = "https://ostlv.co.il/wp-json/wp/v2/"
RAVS = {"granot": [1520, 1618], "eldar": [1521, 1618, 1728], "cherlow": [1518]}   # rabbi term ids (1618 = both, 1728 = Eldar + R. Medan)
SKIP_CATS = {"אקטואליה", "אירועים והתוועדויות"}   # speeches/events, not shiurim
UA = "Mozilla/5.0 (ShiurimAggregator personal study app)"

def get(url, tries=10):
    for a in range(tries):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"}), timeout=60).read()
            if raw.lstrip()[:1] in (b"[", b"{"): return json.loads(raw)
        except Exception as e:
            print("  err", e, flush=True)
        time.sleep(30 * (a + 1)); print("  backoff", a + 1, flush=True)
    raise RuntimeError("giving up " + url)

def run(slug):
    yt = set(v.get("youtube") for v in load_json(os.path.join(ROOT, "data", "sources", f"youtube-{slug}.json"), {"shiurim": {}})["shiurim"].values())
    cats = {c["id"]: html.unescape(c["name"]) for c in get(API + "categories?per_page=100&_fields=id,name")}
    time.sleep(15)
    S, page, retag = {}, 1, {}
    while True:
        items = get(API + f"lesson?rabbi={','.join(map(str, RAVS[slug]))}&per_page=100&page={page}&_fields=id,date,link,title,content,excerpt,categories")
        for x in items:
            c = x["content"]["rendered"]
            vids = re.findall(r"youtube(?:-nocookie)?\.com/embed/([\w-]{11})", c)
            text = re.sub(r"<div class=\"video-container.*?</div>", "", c, flags=re.S)
            plain = html.unescape(re.sub(r"<[^>]+>", " ", text)).strip()
            if not re.search(r"[\u0590-\u05FF]", html.unescape(x["title"]["rendered"] if isinstance(x["title"], dict) else x["title"] or "")): continue   # Hebrew only (user rule)
            audio = sorted(set(re.findall(r'https?://[^"\'\s<>]+\.(?:mp3|m4a)', c)))
            if not vids and not audio: continue                    # media only (user rule)
            cat = next((cats[i] for i in x.get("categories", []) if i in cats and cats[i] != "Uncategorized"), "שיעורים")
            if cat in SKIP_CATS: continue
            if vids and vids[0] in yt and not audio:              # already imported from YouTube: give it the site's organization
                retag[vids[0]] = cat; continue
            uid = f"ostlv:{x['id']}"
            S[uid] = {"uid": uid, "source": f"ostlv-{slug}", "sourceId": x["id"], "rav": slug,
                      "title": html.unescape(x["title"]["rendered"]),
                      "excerpt": re.sub(r"\s+", " ", plain)[:1500], "contentHtml": sanitize_html(text) if len(plain) >= 200 else None,
                      "tags": [], "path": [{"id": f"ostlv:{slug}", "title": "ישיבת אורות שאול"}, {"id": f"ostlv:{slug}:{cat}", "title": cat}],
                      "date": x["date"], "audio": audio, "pageUrl": x["link"], **({"youtube": vids[0]} if vids else {})}
        print(slug, "page", page, len(S), flush=True)
        if len(items) < 100: break
        page += 1; time.sleep(20)
    save_json(os.path.join(ROOT, "data", "sources", f"ostlv-{slug}.json"),
              {"source": {"id": f"ostlv-{slug}", "name": "ישיבת אורות שאול", "site": "https://ostlv.co.il", "rav": slug}, "shiurim": S})
    yp = os.path.join(ROOT, "data", "sources", f"youtube-{slug}.json"); ys = load_json(yp, None)
    if ys and retag:
        for v in ys["shiurim"].values():
            if v.get("youtube") in retag:
                v["path"] = [{"id": f"ostlv:{slug}", "title": "ישיבת אורות שאול"}, {"id": f"ostlv:{slug}:{retag[v['youtube']]}", "title": retag[v["youtube"]]}]
        save_json(yp, ys)
    print(slug, len(S), "lessons;", len(retag), "YouTube items re-tagged with site categories")

if __name__ == "__main__":
    for s in sys.argv[1:] or RAVS: run(s)
