#!/usr/bin/env python3
"""Spotify shows without a public RSS feed -> Spotify embed items.
Episode ids come from the public show page (open.spotify.com/show/<id>, first page only) plus
config extraEpisodes; metadata (verbatim title, date, duration) from the public embed page.
Config: data/spotify.json. Writes data/sources/spotify-<showid>.json (merges with previous runs, so
episodes accumulate over time)."""
import sys, os, re, json, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
UA = {"User-Agent": "Mozilla/5.0"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode()

def entity(ep):
    s = get(f"https://open.spotify.com/embed/episode/{ep}")
    return json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', s, re.S).group(1))["props"]["pageProps"]["state"]["data"]["entity"]

for cfg in load_json(os.path.join(ROOT, "data", "spotify.json"), []):
    out = os.path.join(ROOT, "data", "sources", f"spotify-{cfg['id']}.json")
    store = load_json(out, {"shiurim": {}})
    store["source"] = {"id": f"spotify-{cfg['id']}", "name": "Spotify · " + cfg["name"], "site": f"https://open.spotify.com/show/{cfg['id']}", "rav": cfg["rav"]}
    page = get(f"https://open.spotify.com/show/{cfg['id']}")
    eps = list(dict.fromkeys(re.findall(r"/episode/([A-Za-z0-9]{22})", page) + cfg.get("extraEpisodes", [])))
    for ep in eps:
        uid = f"spotify:{ep}"
        if uid in store["shiurim"]: continue
        time.sleep(0.5)
        e = entity(ep)
        if e.get("relatedEntityUri") != f"spotify:show:{cfg['id']}": continue
        dur = (e.get("duration") or 0) // 1000
        if dur and dur <= 60: print("  skipped short", ep, dur, repr(e["title"])); continue  # trailers/clips
        store["shiurim"][uid] = {"uid": uid, "source": store["source"]["id"], "sourceId": ep, "rav": cfg["rav"],
            "title": e["title"],                               # verbatim
            "excerpt": "", "tags": [], "duration": dur,
            "path": [{"id": f"pod:spotify-{cfg['id']}", "title": "פודקאסט · " + cfg["name"]}],
            "date": (e.get("releaseDate") or {}).get("isoString"), "audio": [], "spotify": ep, "spotifyVideo": bool(e.get("hasVideo")),
            "pageUrl": f"https://open.spotify.com/episode/{ep}"}
    save_json(out, store)
    print(cfg["name"], len(store["shiurim"]), "episodes")
