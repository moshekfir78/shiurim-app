#!/usr/bin/env python3
"""ישיבת כרם ביבנה (kby.org) Torat Yavneh archive: searches a rav's name, imports lessons with MP3.
Config: RAVS below (slug -> search name). Page encoding is windows-1255. Titles verbatim from the page <h1>/<title>."""
import sys, os, re, html, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from common import save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BASE = "https://www.kby.org/hebrew/torat-yavneh/"
RAVS = {"hendler": ("הנדלר", "הרב אריה הנדלר"), "mashiach": ("אמיר משיח", "הרב אמיר משיח"), "piron": ("שי פירון", "הרב שי פירון")}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "ShiurimAggregator/1.0"}), timeout=40).read().decode("cp1255", "replace")
for slug, (q, full) in RAVS.items():
    s = get(BASE + "results.asp?task=search&x_file_cat1=-9&file_rav=-1&psearch=" + urllib.parse.quote(q.encode("cp1255")))
    S = {}
    for lid in sorted(set(re.findall(r"view\.asp\?id=(\d+)", s))):
        p = get(BASE + f"view.asp?id={lid}")
        t = html.unescape(re.search(r"<title>(.*?)</title>", p, re.S).group(1)).strip()
        if full not in t: continue                          # verify it's this rav
        title = t.split(", " + full)[0]                     # page title is "<shiur title>, <rav> - מאגר תורני ..."
        mp3 = sorted(set(re.findall(r"https://secure\.media-line\.co\.il/Kby/[^\"'\s]+\.mp3", p)))
        mp4 = sorted(set(re.findall(r"https://secure\.media-line\.co\.il/Kby/[^\"'\s]+\.mp4", p)))
        if not mp3: continue
        S[f"kby:{lid}"] = {"uid": f"kby:{lid}", "source": "kby", "sourceId": lid, "rav": slug, "title": title, "excerpt": "",
                           "tags": [], "path": [{"id": "kby", "title": "ישיבת כרם ביבנה"}], "date": None,
                           "audio": [u.replace("Kby//", "Kby/") if False else u for u in mp3], "video": mp4[:1], "pageUrl": BASE + f"view.asp?id={lid}"}
    save_json(os.path.join(ROOT, "data", "sources", f"kby-{slug}.json"),
              {"source": {"id": "kby", "name": "ישיבת כרם ביבנה", "site": "https://www.kby.org", "rav": slug}, "shiurim": S})
    print(slug, len(S))
