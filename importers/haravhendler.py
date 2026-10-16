#!/usr/bin/env python3
"""Importer for https://www.haravhendler.co.il (Next.js + Firebase internal JSON API).

Usage:
  python3 importers/haravhendler.py full            # crawl whole category tree
  python3 importers/haravhendler.py update          # incremental: /api/latest-lessons
  python3 importers/haravhendler.py seed FILE.json  # load a previous raw crawl
  add --content to also fetch full source-sheet HTML (/api/lesson?id=) for shiurim missing it
Writes data/sources/haravhendler.json. Then run: python3 build.py
Titles are stored byte-for-byte as received (never stripped/normalized).
"""
import sys, os, datetime
sys.path.insert(0, os.path.dirname(__file__))
from common import Fetcher, load_json, save_json, sanitize_html

SOURCE = "haravhendler"
BASE = "https://www.haravhendler.co.il"
BUCKET = "https://firebasestorage.googleapis.com/v0/b/rav-hendler2.appspot.com/o/"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "sources", SOURCE + ".json")
META = {"id": SOURCE, "name": "אתר הרב הנדלר", "site": BASE + "/", "rav": "hendler"}

def normalize(raw, prev=None):
    sec = (raw.get("time") or {}).get("_seconds")
    audio = raw.get("audio")
    rec = {
        "uid": f"{SOURCE}:{raw['id']}",
        "source": SOURCE,
        "sourceId": raw["id"],
        "title": raw["title"],                       # verbatim
        "excerpt": raw.get("content") or "",
        "tags": raw.get("tags") or [],
        "path": [{"id": f"{SOURCE}:{p['id']}", "title": p["title"]} for p in (raw.get("path") or [])],
        "date": datetime.datetime.fromtimestamp(sec, datetime.timezone.utc).isoformat() if sec else None,
        "audio": [BUCKET + "audio%2F" + audio + "?alt=media",
                  BUCKET + "audio_compression%2F" + audio + "?alt=media"] if audio else [],
        "pageUrl": f"{BASE}/lesson/{raw['id']}",
        "isPublic": raw.get("isPublic", True),
    }
    if prev and prev.get("contentHtml"): rec["contentHtml"] = prev["contentHtml"]
    if (raw.get("content") or "").lstrip().startswith("<"):  # full HTML from /api/lesson
        rec["contentHtml"] = sanitize_html(raw["content"])
    return rec

def main():
    args = sys.argv[1:]
    if not args: print(__doc__); return
    mode, want_content = args[0], "--content" in args
    store = load_json(OUT, {"source": META, "shiurim": {}})
    store["source"] = META
    S = store["shiurim"]; f = Fetcher()
    def put(raw):
        if raw.get("isPublic") is False: return
        uid = f"{SOURCE}:{raw['id']}"
        new = uid not in S
        S[uid] = normalize(raw, S.get(uid)); return new
    added = 0
    if mode == "seed":
        for raw in load_json(args[1], {}).values(): added += bool(put(raw))
    elif mode == "full":
        q, seen = [c["id"] for c in f.get_json(BASE + "/api/surface-categories")], set()
        while q:
            c = q.pop()
            if c in seen: continue
            seen.add(c)
            d = f.get_json(f"{BASE}/api/category?id={c}")
            q += [s["id"] for s in d.get("subCategories", [])]
            for raw in d.get("lessons", []): added += bool(put(raw))
            print(f"\rcategories {len(seen)}  shiurim {len(S)}", end="", flush=True)
        print()
    elif mode == "update":
        for raw in f.get_json(BASE + "/api/latest-lessons"): added += bool(put(raw))
    else:
        print(__doc__); return
    save_json(OUT, store)
    print(f"{mode}: {added} new, {len(S)} total")
    if want_content:
        todo = [u for u, r in S.items() if "contentHtml" not in r]
        for i, uid in enumerate(todo, 1):
            try:
                raw = f.get_json(f"{BASE}/api/lesson?id={S[uid]['sourceId']}")
                S[uid]["contentHtml"] = sanitize_html(raw.get("content") or "")
            except Exception as e:
                print("content failed", uid, e)
            if i % 25 == 0 or i == len(todo):
                save_json(OUT, store); print(f"content {i}/{len(todo)}", flush=True)

if __name__ == "__main__":
    main()
