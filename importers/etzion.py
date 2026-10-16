#!/usr/bin/env python3
"""תורת הר עציון (etzion.org.il) — public GraphQL (getSearch by author id), then each lesson page for audio/YouTube.
  python3 importers/etzion.py [rachmani|cherlow]
Titles verbatim from the API. Keeps lessons with audio, video or substantial text (VBM articles).
Lessons whose YouTube id is already in data/sources/youtube-<rav>.json are skipped. Writes data/sources/etzion-<rav>.json"""
import sys, os, re, json, time, html, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json, sanitize_html
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RAVS = {"rachmani": "5710", "cherlow": "5843"}
UA = {"User-Agent": "Mozilla/5.0 (ShiurimAggregator personal study app)", "Content-Type": "application/json"}
SKIP = ["אזכרה", "דברי פתיחה", "מושב ראשון", "מושב שני", "יו\"ר", "הספד", "ברכות", "טקס"]

def req(url, data=None):
    for a in range(6):
        try: return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=60).read().decode("utf-8", "replace")
        except Exception as e: print("  err", e, flush=True); time.sleep(10 * (a + 1))
    return ""

def run(slug):
    yt = set(v.get("youtube") for v in load_json(os.path.join(ROOT, "data", "sources", f"youtube-{slug}.json"), {"shiurim": {}})["shiurim"].values())
    S, frm = {}, 0
    while True:
        q = '{getSearch(search:{authors:["%s"],lang:["he"],from:%d,size:50}){total results{nid title body field_lesson_date field_series arr_author_name}}}' % (RAVS[slug], frm)
        r = json.loads(req("https://www.etzion.org.il/graphql", json.dumps({"query": q}).encode()))["data"]["getSearch"]
        for x in r["results"]:
            t = html.unescape(x["title"] or "")
            if not re.search(r"[\u0590-\u05FF]", html.unescape(x["title"]["rendered"] if isinstance(x["title"], dict) else x["title"] or "")): continue   # Hebrew only (user rule)
            if any(k in t for k in SKIP): continue
            page = req(f"https://www.etzion.org.il/he/node/{x['nid']}"); time.sleep(1)
            link = (re.search(r'canonical" href="([^"]+)"', page) or [None, f"https://www.etzion.org.il/he/node/{x['nid']}"])[1]
            audio = sorted(set(re.findall(r'https?://[^"\'\s<>]+\.mp3', page)))
            vids = [v for v in re.findall(r'youtube(?:-nocookie)?\.com/embed/([\w-]{11})', page)]
            body = x.get("body") or ""
            plain = html.unescape(re.sub(r"<[^>]+>", " ", body)).strip()
            if vids and vids[0] in yt: continue
            if not audio and not vids: continue                   # media only (user rule)
            d = x.get("field_lesson_date"); iso = None
            if d and re.match(r"\d+/\d+/\d{4}", d): m, dd, y = d.split("/"); iso = f"{y}-{int(m):02d}-{int(dd):02d}T00:00:00+00:00"
            ser = html.unescape(x.get("field_series") or "שיעורים")
            uid = f"etzion:{x['nid']}"
            S[uid] = {"uid": uid, "source": f"etzion-{slug}", "sourceId": x["nid"], "rav": slug, "title": t,
                      "excerpt": re.sub(r"\s+", " ", plain)[:1500], "contentHtml": sanitize_html(body) if len(plain) >= 500 else None,
                      "tags": [], "path": [{"id": f"etzion:{slug}", "title": "תורת הר עציון"}, {"id": f"etzion:{slug}:{ser}", "title": ser}],
                      "date": iso, "audio": audio, "pageUrl": link, **({"youtube": vids[0]} if vids else {})}
        frm += 50; print(slug, frm, len(S), "/", r["total"], flush=True)
        if frm >= r["total"]: break
    save_json(os.path.join(ROOT, "data", "sources", f"etzion-{slug}.json"),
              {"source": {"id": f"etzion-{slug}", "name": "תורת הר עציון", "site": "https://www.etzion.org.il", "rav": slug}, "shiurim": S})
    print(slug, len(S), "lessons")

if __name__ == "__main__":
    for s in sys.argv[1:] or RAVS: run(s)
