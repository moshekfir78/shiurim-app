#!/usr/bin/env python3
"""Podcast RSS importer. Config: data/podcasts.json. Titles verbatim from <title>.
Episodes shorter than MIN_DUR (clips/songs) are skipped. Writes data/sources/podcast-<id>.json"""
import sys, os, re, urllib.request, xml.etree.ElementTree as ET, email.utils, html
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json, sanitize_html
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MIN_DUR = 900
IT = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"

def dur(s):
    if not s: return None
    p = [int(x) for x in re.findall(r"\d+", s)]
    return p[0] if len(p) == 1 else sum(v * 60 ** i for i, v in enumerate(reversed(p)))

def run(cfg):
    raw = urllib.request.urlopen(urllib.request.Request(cfg["feed"], headers={"User-Agent": "ShiurimAggregator/1.0"}), timeout=60).read()
    ch = ET.fromstring(raw).find("channel")
    out = os.path.join(ROOT, "data", "sources", f"podcast-{cfg['id']}.json")
    S = {}
    for it in ch.findall("item"):
        title = it.findtext("title") or ""          # verbatim
        enc = it.find("enclosure"); d = dur(it.findtext(IT + "duration"))
        if enc is None or (d is not None and d < MIN_DUR): continue
        if cfg.get("titleMustContain") and not any(k in title for k in cfg["titleMustContain"]): continue
        if any(k in title for k in cfg.get("titleExclude", [])): continue
        if not re.search(r"[\u0590-\u05FF]", title): continue   # Hebrew only (user rule)
        guid = (it.findtext("guid") or enc.get("url")).strip()
        uid = f"podcast:{cfg['id']}:{abs(hash(guid)) if len(guid) > 60 else guid}"
        pd = it.findtext("pubDate")
        desc = it.findtext("description") or it.findtext(IT + "summary") or ""
        S[uid] = {"uid": uid, "source": f"podcast-{cfg['id']}", "sourceId": guid, "rav": cfg["rav"], "title": title,
                  "excerpt": html.unescape(re.sub(r"<[^>]+>", " ", desc)).strip()[:1500], "tags": [], "duration": d,
                  "path": [{"id": f"pod:{cfg['id']}", "title": "פודקאסט · " + cfg["name"]}],
                  "date": email.utils.parsedate_to_datetime(pd).isoformat() if pd else None,
                  "audio": [enc.get("url")], "pageUrl": it.findtext("link") or cfg.get("spotify") or cfg["feed"]}
    save_json(out, {"source": {"id": f"podcast-{cfg['id']}", "name": cfg["name"], "site": cfg.get("spotify") or cfg["feed"], "rav": cfg["rav"]}, "shiurim": S})
    print(cfg["id"], len(S), "episodes")

if __name__ == "__main__":
    for c in load_json(os.path.join(ROOT, "data", "podcasts.json"), []): run(c)
