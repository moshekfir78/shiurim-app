#!/usr/bin/env python3
"""מערכונים (comedy sketches) – a separate top-level folder, NOT a rav and NOT shiurim.
Config: data/sketches.json (curated YouTube ids per performer; titles verbatim from yt-dlp with lang=iw).
Rules: Hebrew titles only, no Shorts (<=60s), no duplicates; no 15-min minimum (sketches are short).
build.py skips parasha/topic classification for rav kind "sketches"; app.js keeps it out of rav lists/recommendations.
Writes data/sources/youtube-sketches.json."""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from common import save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
cfg = json.load(open(os.path.join(ROOT, "data", "sketches.json"), encoding="utf-8"))
S, seen = {}, set()
for p in cfg["performers"]:
    n = 0
    for v in p["videos"]:
        t = v["title"]
        if v["id"] in seen or (v.get("duration") or 0) <= 60 or not re.search(r"[\u0590-\u05FF]", t): continue
        seen.add(v["id"]); n += 1
        uid = f"yt-sk:{v['id']}"
        S[uid] = {"uid": uid, "source": "youtube-sketches", "sourceId": v["id"], "rav": "sketches", "title": t, "excerpt": "",
                  "tags": [], "duration": v.get("duration"), "path": [{"id": f"sk:{p['id']}", "title": p["name"]}], "date": None,
                  "audio": [], "pageUrl": f"https://www.youtube.com/watch?v={v['id']}", "youtube": v["id"]}
    print(p["name"], n)
save_json(os.path.join(ROOT, "data", "sources", "youtube-sketches.json"),
          {"source": {"id": "youtube-sketches", "name": "מערכונים – יוטיוב", "site": "https://www.youtube.com", "rav": "sketches"}, "shiurim": S})
