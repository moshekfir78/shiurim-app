#!/usr/bin/env python3
"""Thorough YouTube rescan for מערכונים. Channels + playlists + broad searches."""
import json, os, re, subprocess, sys, time
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "_sketches_scan")
YTD = ["yt-dlp", "--flat-playlist", "--dump-json", "--ignore-errors", "--no-warnings",
       "--extractor-args", "youtube:lang=iw"]
ARTISTS = [
  {"id": "gashash", "name": "הגשש החיוור",
   "channels": ["https://www.youtube.com/channel/UCT86jK7JSJDfbms90YJbLkQ"],
   "searches": [
     "הגשש החיוור מערכון", "הגשש החיוור", "Hagashash Hachiwer sketch",
     "הגשש החיוור עובדים עלינו", "הגשש החיוור הקרב בסופרמרקט", "הגשש החיוור בנקים עליך",
     "הגשש החיוור יועץ לענייני נישואין", "הגשש החיוור חסכו ואמצו", "הגשש החיוור אמן כן יהי רצון",
     "הגשש החיוור אופסייד סטורי", "הגשש החיוור בין הזמנים", "הגשש החיוור הקבלנים",
     "הגשש החיוור שיח טבחים", "הגשש החיוור כדורגל מקצועי", "הגשש החיוור בית המשפט",
     "הגשש החיוור אנגלנדר", "הגשש החיוור הצ'ופצ'יק", "הגשש החיוור קפיטריה",
     "הגשש החיוור נימוסין", "הגשש החיוור תן לי את הארנק", "הגשש החיוור הצוללת",
     "הגשש החיוור כבוד השופט", "הגשש החיוור פרדיס", "הגשש החיוור החתונה",
     "הגשש החיוור הרופא", "הגשש החיוור טייס", "הגשש החיוור השמלה", "הגשש החיוור רדיו",
     "הגשש החיוור סע לך", "הגשש החיוור מלחמה", "הגשש החיוור חיים שלי",
     "הגשש החיוור אוסף מערכונים", "הגשש החיוור מקבץ"]},
  {"id": "miller", "name": "אדיר מילר",
   "channels": [],  # no reliable official channel; rely on searches
   "searches": [
     "אדיר מילר מערכון", "אדיר מילר", "Adir Miller sketch", "אדיר מילר קומדי סטור",
     "אדיר מילר בקומדי בר", "אדיר מילר סטנדאפ", "אדיר מילר מערכונים",
     "אדיר מילר שבת", "אדיר מילר חתונה", "אדיר מילר אמא", "אדיר מילר צבא",
     "אדיר מילר אוטובוס", "אדיר מילר רופא", "אדיר מילר טיסה", "אדיר מילר בית קפה",
     "אדיר מילר שכנים", "אדיר מילר ילדים", "אדיר מילר זוגיות", "אדיר מילר שוטרת",
     "אדיר מילר טלוויזיה", "אדיר מילר מכולת", "אדיר מילר מונית", "אדיר מילר בנק",
     "אדיר מילר אוסף", "אדיר מילר מקבץ מערכונים"]},
  {"id": "gavni", "name": "יוסי גבני",
   "channels": ["https://www.youtube.com/channel/UCnaYetnLMLOAIa7GM13jgDg"],
   "searches": [
     "יוסי גבני מערכון", "יוסי גבני", "Yossi Gavni", "יוסי גבני סטנדאפ",
     "יוסי גבני קומדי", "יוסי גבני הופעה", "יוסי גבני מערכונים",
     "יוסי גבני חתונה", "יוסי גבני אמא", "יוסי גבני צבא", "יוסי גבני שבת",
     "יוסי גבני טיסה", "יוסי גבני רופא", "יוסי גבני ילדים", "יוסי גבני בית ספר",
     "יוסי גבני אוטובוס", "יוסי גבני בנק", "יוסי גבני אוסף"]},
  {"id": "hizkiah", "name": "אורי חזקיה",
   "channels": ["https://www.youtube.com/channel/UCg-f-fRx5FlpK05ZpsZmUoQ"],
   "searches": [
     "אורי חזקיה מערכון", "אורי חזקיה", "Uri Hizkia", "אורי חזקיה סטנדאפ",
     "אורי חזקיה קומדי בר", "אורי חזקיה הופעה", "אורי חזקיה מערכונים",
     "אורי חזקיה חתונה", "אורי חזקיה אמא", "אורי חזקיה צבא", "אורי חזקיה שבת",
     "אורי חזקיה טיסה", "אורי חזקיה רופא", "אורי חזקיה ילדים", "אורי חזקיה בית ספר",
     "אורי חזקיה אוטובוס", "אורי חזקיה אוסף"]},
]
BAD = re.compile(r"(קליפ\b|מוזיקה|music video|\bsong\b|interview|ראיון|פודקאסט|podcast|"
                 r"טריילר|trailer|מאחורי הקלעים|behind the scenes|פרסומת|\bpromo\b|פרומו|"
                 r"טיזר|teaser|\breact\b|תגובה ל|חדשות|\bnews\b|live stream|לייב\b)", re.I)
# songs: only exclude if clearly a song clip, not "שירי" in sketch titles carelessly
SONG = re.compile(r"(^|\s)(שיר|שירים|קליפ מוזיקלי|סופר סטאר)(\s|$)", re.I)
HE = re.compile(r"[\u0590-\u05FF]")

def run(args, timeout=240):
    try:
        r = subprocess.run(YTD + args, capture_output=True, text=True, timeout=timeout)
        out = []
        for l in r.stdout.splitlines():
            l = l.strip()
            if l.startswith("{"):
                try: out.append(json.loads(l))
                except: pass
        return out
    except Exception as e:
        print("ERR", e, file=sys.stderr); return []

def search(q, n=60):
    print(f"  search[{n}]: {q}", flush=True)
    return run([f"ytsearch{n}:{q}"], timeout=300)

def channel_all(url):
    print(f"  channel: {url}", flush=True)
    vids = run([url.rstrip("/") + "/videos"], timeout=400)
    if not vids: vids = run([url], timeout=400)
    print(f"    videos tab: {len(vids)}", flush=True)
    pls = run([url.rstrip("/") + "/playlists"], timeout=200)
    print(f"    playlists: {len(pls)}", flush=True)
    for pl in pls[:40]:
        pid = pl.get("id") or ""
        if not pid: continue
        urlp = pid if str(pid).startswith("http") else f"https://www.youtube.com/playlist?list={pid}"
        print(f"    pl: {(pl.get('title') or '')[:50]}", flush=True)
        vids += run([urlp], timeout=300)
        time.sleep(0.3)
    return vids

def keep(v, artist_name, from_ch=False):
    vid = v.get("id")
    if not vid or not re.fullmatch(r"[\w-]{11}", str(vid)): return None
    title = (v.get("title") or "").strip()
    if not title or not HE.search(title): return None
    dur = v.get("duration")
    try: dur = int(dur) if dur is not None else 0
    except: dur = 0
    if dur and dur <= 60: return None
    # full-length shows (>40 min) only keep if sketch compilation
    if dur > 40 * 60:
        comp = any(x in title for x in ("אוסף", "מקבץ", "מערכונים", "compilation", "best of", "הטובים"))
        if not comp:
            if dur > 90 * 60 or any(x in title for x in ("הופעה מלאה", "מופע מלא", "full show", "סטנדאפ מלא", "ערב מלא")):
                return None
            if dur > 60 * 60: return None
    if BAD.search(title) or SONG.search(title): return None
    # artist name should appear, unless from their channel
    if not from_ch:
        compact = title.replace(" ", "")
        an = artist_name.replace(" ", "")
        if artist_name not in title and an not in compact:
            # still allow if search was artist-scoped and title looks like a sketch
            if not any(x in title for x in ("מערכון", "סטנד", "קומדי", "מצחיק")):
                # require at least first name token
                first = artist_name.split()[0]
                if first not in title: return None
    views = v.get("view_count") or 0
    try: views = int(views)
    except: views = 0
    return {"id": vid, "title": title, "duration": dur or None,
            "channel": v.get("channel") or v.get("uploader"), "views": views}

def norm_key(t, artist):
    t = re.sub(r"\s+", " ", (t or "")).strip().lower()
    t = re.sub(r"[\"'`״׳]", "", t)
    t = re.sub(r"^\d{4}\s*[-–]?\s*", "", t)
    for a in ("הגשש החיוור", "אדיר מילר", "יוסי גבני", "אורי חזקיה", artist):
        t = re.sub(r"^" + re.escape(a.lower()) + r"\s*[-–:|]?\s*", "", t)
    t = re.sub(r"\s*[\(\[][^)\]]*[\)\]]\s*", " ", t)  # drop (1977) etc for matching
    return re.sub(r"\s+", " ", t).strip()

def dedupe(items, artist):
    by_id, by_title = {}, {}
    for it in items:
        by_id[it["id"]] = it  # last write; we'll re-pick best
    # rebuild by best views per id first
    items = list(by_id.values())
    for it in items:
        k = norm_key(it["title"], artist)
        if not k: k = it["id"]
        old = by_title.get(k)
        if not old or (it["views"], it["duration"] or 0) > (old["views"], old["duration"] or 0):
            by_title[k] = it
    return list(by_title.values())

def scan(a):
    found = []
    for url in a["channels"]:
        for v in channel_all(url):
            k = keep(v, a["name"], from_ch=True)
            if k: found.append(k)
        time.sleep(1)
    for q in a["searches"]:
        for v in search(q, 80):
            k = keep(v, a["name"], from_ch=False)
            if k: found.append(k)
        time.sleep(0.4)
    return dedupe(found, a["name"])

def main():
    ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    old = json.load(open(os.path.join(ROOT, "data", "sketches.json"), encoding="utf-8"))
    old_by = {p["id"]: {v["id"]: v for v in p["videos"]} for p in old["performers"]}
    results = {}
    for a in ARTISTS:
        print("===", a["name"], flush=True)
        items = scan(a)
        # ensure old curated kept
        for vid, v in old_by.get(a["id"], {}).items():
            if vid not in {x["id"] for x in items}:
                items.append({"id": vid, "title": v["title"], "duration": v.get("duration"),
                              "channel": v.get("channel"), "views": 0})
        items = dedupe(items, a["name"])
        items.sort(key=lambda x: (-(x["views"] or 0), x["title"]))
        results[a["id"]] = {"name": a["name"], "count": len(items), "videos": items}
        json.dump(results[a["id"]], open(f"{OUT}/{a['id']}.json", "w"), ensure_ascii=False, indent=1)
        print(f"  => {len(items)} (was {len(old_by.get(a['id'], {}))})", flush=True)
    os.makedirs(OUT, exist_ok=True)
    json.dump(results, open(f"{OUT}/all.json", "w"), ensure_ascii=False, indent=1)
    # write data/sketches.json (caller should review; this replaces the curated list)
    performers = [{"id": a["id"], "name": a["name"],
                   "videos": [{"id": v["id"], "title": v["title"], "duration": v.get("duration"), "channel": v.get("channel")}
                              for v in results[a["id"]]["videos"]]} for a in ARTISTS]
    json.dump({"_note": "Auto-rescanned. Review before commit.", "performers": performers},
              open(os.path.join(ROOT, "data", "sketches.json"), "w"), ensure_ascii=False, indent=1)
    print("DONE — wrote data/sketches.json; run importers/sketches.py next", flush=True)

if __name__ == "__main__":
    main()
