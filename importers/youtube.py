#!/usr/bin/env python3
"""YouTube importer (yt-dlp). Config: data/ravs.json.
  python3 importers/youtube.py            # all ravs
  python3 importers/youtube.py piron      # one rav
Rules: titles verbatim; no Shorts (/shorts/ URLs or duration <= 60s are dropped; shiur min length MIN_DUR);
non-shiur clips filtered by keyword/channel lists; third-party videos must name the rav in the title.
Writes data/sources/youtube-<rav>.json.
"""
import sys, os, json, subprocess, datetime, hashlib
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MIN_DUR = 900
PRUNE_ONLY = "--prune" in sys.argv  # 15 minutes
YTDLP = os.environ.get("YTDLP", os.path.expanduser("~/.local/bin/yt-dlp"))

def flat(url):
    out = subprocess.run([YTDLP, "--flat-playlist", "-j", url], capture_output=True, text=True).stdout
    return [json.loads(l) for l in out.splitlines() if l.strip()]

def details(vid):
    out = subprocess.run([YTDLP, "-j", "--skip-download", "--no-warnings", f"https://www.youtube.com/watch?v={vid}"],
                         capture_output=True, text=True).stdout
    return json.loads(out) if out.strip() else None

def is_short(e): return "/shorts/" in (e.get("url") or "") or (e.get("duration") or 0) <= 60

def run(slug, cfg):
    path = os.path.join(ROOT, "data", "sources", f"youtube-{slug}.json")
    store = load_json(path, {"shiurim": {}})
    store["source"] = {"id": f"youtube-{slug}", "name": "YouTube", "site": "https://www.youtube.com", "rav": slug}
    S = store["shiurim"]
    # prune anything that the current filters reject (filters may have been tightened)
    for uid in [u for u, v in S.items() if any(k in v["title"] for k in cfg.get("excludeTitle", [])) or (v.get("duration") or 0) <= 60]:
        del S[uid]
    for uid, v in S.items():   # repair items stored without a channel id
        if v["path"][0]["id"].endswith(":None"):
            d = details(v["sourceId"]) or {}
            if d.get("channel_id"): v["path"] = [{"id": f"yt:{slug}:{d['channel_id']}", "title": "יוטיוב · " + d.get("channel", "").strip()}]
    if PRUNE_ONLY: save_json(path, store); print(f"{slug}: pruned -> {len(S)}"); return
    has_kw = lambda t: any(k in t for k in cfg["keywords"])
    bad_t = lambda t: any(k in t for k in cfg.get("excludeTitle", []))
    cand = {}
    for ch in cfg.get("ownChannels", []):
        for e in flat(f"https://www.youtube.com/channel/{ch}/videos") + flat(f"https://www.youtube.com/channel/{ch}/streams"):
            t = e.get("title") or ""
            if not __import__("re").search(r"[\u0590-\u05FF]", t): continue   # Hebrew only (user rule)
            if is_short(e) or (e.get("duration") or 0) < MIN_DUR or bad_t(t) or any(k in t for k in cfg.get("ownExclude", [])): continue
            cand[e["id"]] = e
    third = []
    for ch in cfg.get("scanChannels", []): third += flat(f"https://www.youtube.com/channel/{ch}/videos")
    for q in cfg.get("search", []): third += flat(f"ytsearch100:{q}")
    for e in third:
        t = e.get("title") or ""
        if not __import__("re").search(r"[\u0590-\u05FF]", t): continue   # Hebrew only (user rule)
        if e.get("channel_id") in cfg.get("excludeChannels", []) or is_short(e): continue
        if not has_kw(t) or bad_t(t) or (e.get("duration") or 0) < MIN_DUR: continue
        cand.setdefault(e["id"], e)
    print(f"{slug}: {len(cand)} candidates")
    for i, (vid, e) in enumerate(cand.items(), 1):
        uid = f"youtube:{vid}"
        if uid in S: continue
        d = details(vid) or {}
        if d.get("duration", e.get("duration") or 0) <= 60: continue
        ud = d.get("upload_date")
        S[uid] = {
            "uid": uid, "source": f"youtube-{slug}", "sourceId": vid, "rav": slug,
            "title": d.get("title") or e["title"],              # verbatim YouTube title
            "excerpt": (d.get("description") or "")[:1500],
            "tags": [], "duration": d.get("duration") or e.get("duration"),
            "path": [{"id": f"yt:{slug}:{d.get('channel_id') or e.get('channel_id') or 'ch-' + hashlib.sha1(('יוטיוב · ' + (d.get('channel') or e.get('channel') or '').strip()).encode()).hexdigest()[:10]}", "title": "יוטיוב · " + (d.get("channel") or e.get("channel") or "").strip()}],
            "date": datetime.datetime.strptime(ud, "%Y%m%d").replace(tzinfo=datetime.timezone.utc).isoformat() if ud else None,
            "audio": [], "youtube": vid, "pageUrl": f"https://www.youtube.com/watch?v={vid}",
        }
        if i % 20 == 0: save_json(path, store); print(f"  {i}/{len(cand)}", flush=True)
    save_json(path, store)
    print(f"{slug}: {len(S)} videos stored")

if __name__ == "__main__":
    ravs = load_json(os.path.join(ROOT, "data", "ravs.json"), {})
    for slug in ([a for a in sys.argv[1:] if not a.startswith("--")] or ravs):
        if ravs[slug].get("institution"): continue   # e.g. siach: own importer (importers/siach.py)
        run(slug, ravs[slug])
