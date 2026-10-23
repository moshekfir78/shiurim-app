#!/usr/bin/env python3
"""מערכונים (comedy sketches) – a separate top-level folder, NOT a rav and NOT shiurim.
Config: data/sketches.json (YouTube ids per performer; titles verbatim).
Rescan (from a machine that can reach YouTube): python3 importers/sketches_scan.py
then commit data/sketches.json. CI only rebuilds from the committed list (YouTube often blocks runners).
Rules: Hebrew titles only, no Shorts (<=60s), no duplicates; no 15-min minimum.
Writes data/sources/youtube-sketches.json."""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from common import save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
cfg = json.load(open(os.path.join(ROOT, "data", "sketches.json"), encoding="utf-8"))
# data/yt_embed.json (importers/yt_embed_check.js): deleted/private videos are dropped; no-embed ones are kept
# (build.py marks them ytNoEmbed -> "watch on YouTube" card)
_ye = os.path.join(ROOT, "data", "yt_embed.json")
_YE = json.load(open(_ye, encoding="utf-8")) if os.path.exists(_ye) else {}
GONE = {k for k, e in _YE.items() if e["s"] == "gone"}
EXCL = set(cfg.get("exclude", []))   # curated removals (interviews/news/non-sketches, content judgment)
# "alts": other uploads of the same sketch that play embedded (for videos region-/embed-blocked at the source).
# Only alternates whose last check was not a failure are passed on; the player tries them in order before the fallback card.
alt_ok = lambda a: (_YE.get(a) or {}).get("s", "ok") in ("ok", "unknown", "region")
S, seen = {}, set()
for p in cfg["performers"]:
    n = 0
    for v in p["videos"]:
        t = v["title"]
        if v["id"] in seen or v["id"] in GONE or v["id"] in EXCL or (v.get("duration") or 0) <= 60 or not re.search(r"[\u0590-\u05FF]", t):
            continue
        seen.add(v["id"]); n += 1
        uid = f"yt-sk:{v['id']}"
        S[uid] = {"uid": uid, "source": "youtube-sketches", "sourceId": v["id"], "rav": "sketches", "title": t, "excerpt": "",
                  "tags": [], "duration": v.get("duration"), "path": [{"id": f"sk:{p['id']}", "title": p["name"]}], "date": None,
                  "audio": [], "pageUrl": f"https://www.youtube.com/watch?v={v['id']}", "youtube": v["id"]}
        alts = [a for a in v.get("alts", []) if a != v["id"] and alt_ok(a)]
        if alts: S[uid]["ytAlt"] = alts
    print(p["name"], n)
save_json(os.path.join(ROOT, "data", "sources", "youtube-sketches.json"),
          {"source": {"id": "youtube-sketches", "name": "מערכונים – יוטיוב", "site": "https://www.youtube.com", "rav": "sketches"}, "shiurim": S})
