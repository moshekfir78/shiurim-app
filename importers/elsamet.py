#!/usr/bin/env python3
"""אתר הרב אלחנן סמט (elsamet.co.il) — WordPress REST list of "lessons", then each lesson page for its
audio (elsamet-audio.b-cdn.net) or embedded YouTube. Tanach / chagim only (the site's own scope); titles verbatim.
Text-only lessons are skipped (media only) and remembered in "checked". Lessons whose YouTube id is already in
data/sources/youtube-samet.json are skipped (dedupe). Writes data/sources/elsamet-samet.json"""
import sys, os, re, json, time, html, subprocess, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
API = "https://elsamet.co.il/wp-json/wp/v2/"
UA = {"User-Agent": "Mozilla/5.0 (ShiurimAggregator personal study app)"}
GEMARA = re.compile(r"גמרא|מסכת|סוגיי?ת|דף היומי|^הלכות |שולחן ערוך")

def get(url):
    # curl with a hard total deadline (urllib's timeout is per read and a trickling server can hang it)
    for a in range(4):
        r = subprocess.run(["curl", "-sS", "-L", "-m", "60", "-A", UA["User-Agent"], url], capture_output=True)
        if r.returncode == 0 and r.stdout: return r.stdout.decode("utf-8", "replace")
        print("  err", url[:90], r.returncode, r.stderr[:120], flush=True); time.sleep(5 * (a + 1))
    return ""

def terms(tax):
    out, p = {}, 1
    while True:
        r = json.loads(get(f"{API}{tax}?per_page=100&page={p}&_fields=id,name") or "[]")
        if not r: return out
        out.update({t["id"]: html.unescape(t["name"]) for t in r}); p += 1
        if len(r) < 100: return out

def run():
    path = os.path.join(ROOT, "data", "sources", "elsamet-samet.json")
    old = load_json(path, {"shiurim": {}}); OLD, checked = old["shiurim"], set(old.get("checked", []))
    yt = {v.get("youtube") for v in load_json(os.path.join(ROOT, "data", "sources", "youtube-samet.json"), {"shiurim": {}})["shiurim"].values()}
    bible, hol = terms("bible"), terms("holidays")
    L, p = [], 1
    while True:
        r = json.loads(get(f"{API}lessons?per_page=100&page={p}&_fields=id,link,title,date,excerpt,bible,holidays") or "[]")
        if not isinstance(r, list) or not r: break
        L += r; p += 1
        if len(r) < 100: break
    print("elsamet:", len(L), "lessons listed")
    S = {}
    for n, x in enumerate(L, 1):
        uid = f"elsamet:{x['id']}"
        title = html.unescape(x["title"]["rendered"]).strip()          # verbatim
        if not re.search(r"[\u0590-\u05FF]", title) or GEMARA.search(title): continue
        if uid in OLD: S[uid] = OLD[uid]; continue
        if str(x["id"]) in checked: continue
        page = get(x["link"]); time.sleep(0.5)
        if not page: continue                                          # retried next run
        audio = sorted({urllib.parse.quote(urllib.parse.unquote(a), safe=":/") for a in re.findall(r'https://elsamet-audio\.b-cdn\.net/audio/[^"\'\s<>]+?\.mp3', page)})
        vids = list(dict.fromkeys(re.findall(r'youtube(?:-nocookie)?\.com/embed/([\w-]{11})', page)))
        if not audio and not vids: checked.add(str(x["id"])); continue   # media only (user rule)
        if not audio and vids[0] in yt: checked.add(str(x["id"])); continue
        books = [bible[b] for b in x.get("bible") or [] if b in bible] + [hol[h] for h in x.get("holidays") or [] if h in hol]
        ser = next((b for b in books if b not in ("תורה", "נביאים", "כתובים")), books[0] if books else "שיעורים")
        S[uid] = {"uid": uid, "source": "elsamet-samet", "sourceId": x["id"], "rav": "samet", "title": title,
                  "excerpt": re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x["excerpt"]["rendered"]))).strip()[:1500],
                  "tags": books, "path": [{"id": "elsamet", "title": "אתר הרב אלחנן סמט"}, {"id": f"elsamet:{ser}", "title": ser}],
                  "date": x["date"] + "+00:00" if x.get("date") else None, "audio": audio, "pageUrl": urllib.parse.unquote(x["link"]),
                  **({"youtube": vids[0]} if vids else {})}   # same id as a YouTube item -> merged by build.py dedupe
        if n % 50 == 0:
            print("elsamet", n, len(S), flush=True)
            save_json(path, {"source": {"id": "elsamet-samet", "name": "אתר הרב אלחנן סמט", "site": "https://elsamet.co.il", "rav": "samet"}, "shiurim": {**OLD, **S}, "checked": sorted(checked)})
    save_json(path, {"source": {"id": "elsamet-samet", "name": "אתר הרב אלחנן סמט", "site": "https://elsamet.co.il", "rav": "samet"}, "shiurim": S, "checked": sorted(checked)})
    print("elsamet:", len(S), "lessons with media")

if __name__ == "__main__": run()
