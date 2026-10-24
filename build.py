#!/usr/bin/env python3
"""Merge all data/sources/*.json into public/data (index.json + per-shiur content files).
Top level of the tree is the rav (data/ravs.json); under it each source's own categories.
Obvious duplicates (same rav, same title after whitespace/punctuation normalization) are merged:
the first-seen item keeps its data and gains the other's media (e.g. a YouTube embed)."""
import glob, json, os, hashlib, re, sys, collections, datetime, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from topics import classify_topics, taxonomy
from parasha import classify, P as PARASHOT, IDX as PIDX
ROOT = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(ROOT, "public", "data")
os.makedirs(os.path.join(PUB, "content"), exist_ok=True)
RAVS = json.load(open(os.path.join(ROOT, "data", "ravs.json"), encoding="utf-8"))
fname = lambda uid: hashlib.sha1(uid.encode()).hexdigest()[:16]
norm = lambda t: re.sub(r"[\s\-–—|:,.'\"״׳!?()]+", " ", t).strip()

sources, cats, items, seen = [], {}, [], {}
for slug, r in RAVS.items():
    cats["rav:" + slug] = {"id": "rav:" + slug, "title": r["name"], "parent": None, "children": [], "count": 0, "rav": slug}
order = sorted(glob.glob(os.path.join(ROOT, "data", "sources", "*.json")), key=lambda p: (not os.path.basename(p).startswith("haravhendler"), p))
merged = 0
raw = []
for path in order:
    store = json.load(open(path, encoding="utf-8"))
    src = store["source"]; src.setdefault("rav", {"haravhendler": "hendler"}.get(src["id"])); sources.append(src)
    for r in store["shiurim"].values():
        rav = r.get("rav") or src.get("rav") or {"haravhendler": "hendler"}.get(src["id"])
        r = dict(r, rav=rav)
        top = r["path"][0]["id"] if r["path"] else ""
        if top.startswith("yt:"): r["path"] = [{"id": f"yt:{rav}", "title": "יוטיוב"}] + r["path"]
        elif top.startswith("pod:"): r["path"] = [{"id": f"pod-all:{rav}", "title": "פודקאסטים"}] + r["path"]
        elif top == "kby": r["path"] = [{"id": f"kby:{rav}", "title": "ישיבת כרם ביבנה"}]
        raw.append(r)

# ---- DEDUPE (same rav only): same YouTube id / Spotify id / audio URL / normalized title ----
def _dedupe(raw):
    import urllib.parse
    nt = lambda t: re.sub(r"[\s\-–—|:,.'\"״׳!?()\[\]_/]+", " ", t).strip().lower()
    nau = lambda u: urllib.parse.unquote(u.split("?")[0]).rstrip("/").lower().replace("audio_compression/", "audio/")
    kind = lambda s: 0 if not s.startswith(("youtube", "spotify", "podcast")) else 1 if s.startswith("podcast") else 2 if s.startswith("spotify") else 3
    n = len(raw); par = list(range(n)); srcs = [{r["source"]} for r in raw]
    def f(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    def join(i, j, same_src_ok):
        a, b = f(i), f(j)
        if a == b or raw[i]["rav"] != raw[j]["rav"]: return False
        if (srcs[a] & srcs[b]) and not (same_src_ok and (nt(raw[i]["title"]) == nt(raw[j]["title"]) or (len(srcs[a]) == 1 and srcs[a] == srcs[b]))): return False
        par[b] = a; srcs[a] |= srcs[b]; return True
    dur = lambda r: r.get("duration") or 0
    close = lambda a, b, pct, sec: dur(a) and dur(b) and abs(dur(a) - dur(b)) <= max(sec, pct * max(dur(a), dur(b)))
    titles_in_src = collections.Counter((r["source"], nt(r["title"])) for r in raw)
    why = collections.Counter()
    def link(keyfn, label):
        first = {}
        for i, r in enumerate(raw):
            for k in keyfn(r):
                k = (r["rav"], k)
                if k not in first: first[k] = i; continue
                j = first[k]; a, b2 = raw[j], r
                same = a["source"] == b2["source"]
                if label == "title":
                    if same: ok = close(a, b2, 0.01, 5)
                    elif dur(a) and dur(b2): ok = close(a, b2, 0.03, 90)
                    else: ok = len(nt(a["title"])) >= 12 and titles_in_src[(a["source"], k[1])] == 1 and titles_in_src[(b2["source"], k[1])] == 1
                else: ok = (not same) or nt(a["title"]) == nt(b2["title"])
                if ok and join(j, i, same): why[label] += 1
    link(lambda r: [r["youtube"]] if r.get("youtube") else [], "youtube")
    link(lambda r: [r["spotify"]] if r.get("spotify") else [], "spotify")
    link(lambda r: [r["soundcloud"]] if r.get("soundcloud") else [], "soundcloud")
    link(lambda r: sorted({nau(u) for u in r.get("audio") or []}), "audio")
    link(lambda r: [nt(r["title"])], "title")
    groups = collections.defaultdict(list)
    for i in range(n): groups[f(i)].append(i)
    out, pairs = [], collections.Counter()
    for g in groups.values():
        g.sort(key=lambda i: (bool(raw[i].get("text")), kind(raw[i]["source"]), not raw[i].get("audio"), i))   # media items first, written items last
        tgt = dict(raw[g[0]])  # canonical: site metadata/categories + verbatim title
        for i in g[1:]:
            r = raw[i]
            for k in ("youtube", "spotify", "spotifyVideo", "soundcloud", "duration"):
                if r.get(k) and not tgt.get(k): tgt[k] = r[k]
            if r.get("audio") and not tgt.get("audio"): tgt["audio"] = r["audio"]
            # a written item that matches an audio/video shiur is its transcript/summary: dropped (user rule: written-in-advance only)
            if r.get("pageUrl") and r["pageUrl"] != tgt.get("pageUrl"): tgt["alsoAt"] = tgt.get("alsoAt", []) + [r["pageUrl"]]
            pairs[(tgt["rav"], tgt["source"], r["source"])] += 1
        out.append((min(g), tgt))
    out.sort()
    print("dedupe merged:", sum(pairs.values()), "by key:", dict(why))
    per = collections.Counter()
    for (rav, a, b2), c in pairs.items(): per[rav] += c
    print("dedupe per rav:", dict(per))
    for (rav, a, b2), c in pairs.most_common(): print(f"   {c:4d}  {rav}: {a} <- {b2}")
    return [t for _, t in out], sum(pairs.values())
items, merged = _dedupe(raw)


# YouTube playability (data/yt_embed.json, refreshed daily by importers/yt_embed_check.js in a real embedded player):
# deleted/private videos (seen twice in a row) lose their YouTube media; owner-disabled embeds are marked ytNoEmbed so the
# app shows "watch on YouTube" instead of a dead player. Region/copyright verdicts come from a non-Israeli runner -> ignored.
_YTE = json.load(open(os.path.join(ROOT, "data", "yt_embed.json"), encoding="utf-8")) if os.path.exists(os.path.join(ROOT, "data", "yt_embed.json")) else {}
_ytg = collections.Counter()
for r in items:
    e = _YTE.get(r.get("youtube") or "")
    if not e: continue
    if e["s"] == "gone" and e.get("n", 1) >= 2 and r.get("ytAlt"):
        _ytg["gone->alt"] += 1; r["youtube"] = r["ytAlt"].pop(0); r["ytAlt"] or r.pop("ytAlt")   # sketch alternates take over
        if (r.get("pageUrl") or "").startswith("https://www.youtube.com/watch"): r["pageUrl"] = "https://www.youtube.com/watch?v=" + r["youtube"]
    elif e["s"] == "gone" and e.get("n", 1) >= 2:
        _ytg["gone"] += 1; r.pop("youtube", None)
        if (r.get("pageUrl") or "").startswith("https://www.youtube.com/watch") and not r.get("audio"): r["pageUrl"] = ""
    elif e["s"] in ("noembed", "age"): _ytg["noembed"] += 1; r["ytNoEmbed"] = 1
print("youtube not playable:", dict(_ytg) or 0)

# GLOBAL RULE: shiurim with playable media (audio file / YouTube / Spotify / podcast player), or WRITTEN shiurim (text items:
# importers/texts.py etc. mark them "text"; a site page that is itself a long written shiur counts too). Other text-only items are dropped.
has_media = lambda r: bool(r.get("audio") or r.get("youtube") or r.get("spotify") or r.get("spotifyVideo") or r.get("soundcloud"))
_NONSHIUR = re.compile(r'הספד|לזכר|לע"נ|אזכרה|ראיון|ריאיון|בגבורותיו|לכבודו של|דברי פתיחה|מודעה|הודעה|הרשמה')
_plain = lambda h: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h or "")).strip()
dropped, _tx, _txno = {}, collections.Counter(), collections.Counter()
sys.path.insert(0, os.path.join(ROOT, "importers")); from texts import written_reason as _written, save_pdf_cache as _savepdf
for r in items:
    if has_media(r): r.pop("text", None); continue
    if not r.get("text") and len(_plain(r.get("contentHtml"))) >= 1500 and not _NONSHIUR.search(r["title"]): r["text"] = 1
    if r.get("text") and not _written(r): _tx[r["rav"]] += 1; continue      # written in advance as text (importers/texts.py rule)
    if r.get("text"): _txno[_written(r) or "?"] += 1
    r.pop("text", None); k = f'{r["rav"]}/{r["source"]}'; dropped[k] = dropped.get(k, 0) + 1
items = [r for r in items if has_media(r) or r.get("text")]
print("dropped text-only:", dropped or 0)
_savepdf()
print("written (text) shiurim:", sum(_tx.values()), dict(_tx), "| not written-in-advance:", dict(_txno))

# GLOBAL RULE: Hebrew shiurim only. Drop titles that are mainly Latin script (English etc.) and items in
# English-language categories/sources (e.g. Hendler "English", Torah in Motion, Herzog English, VBM English).
# Hebrew titles with a few Latin chars, and bilingual titles, are kept.
_HEB = re.compile(r"[\u0590-\u05FF]"); _LAT = re.compile(r"[A-Za-z]")
_ENG_CTX = re.compile(r"(?<![A-Za-z])English(?![A-Za-z])|אנגלית|Torah in Motion|VBM English|Herzog English", re.I)
def is_non_hebrew(r):
    t = r["title"]; h, l = len(_HEB.findall(t)), len(_LAT.findall(t))
    if l >= 3 and h * 3 < l: return True
    if h == 0 and l == 0 and not re.search(r"\d", t): return False
    ctx = " ".join(p.get("title", "") for p in r.get("path") or []) + " " + r.get("source", "")
    return bool(_ENG_CTX.search(ctx)) and h * 3 < max(l, 1) * 4  # English category: drop unless clearly Hebrew title
nonheb = {}
for r in items:
    if is_non_hebrew(r): k = f'{r["rav"]}/{r["source"]}'; nonheb[k] = nonheb.get(k, 0) + 1
items = [r for r in items if not is_non_hebrew(r)]
print("dropped non-Hebrew:", nonheb or 0)

# ---- classify with the ORIGINAL source categories, then re-organize folders by content (organize.py) ----
from organize import organize
for r in items:
    r["opath"] = r["path"]
    if RAVS.get(r["rav"], {}).get("kind") == "sketches": r["_par"], r["_tp"] = None, None; continue
    cat_titles = [RAVS[r["rav"]]["name"]] + [p["title"] for p in r["path"]]
    r["_par"] = classify([r["title"], r.get("excerpt", "") if r["source"].startswith("spotify") else "", " ".join(r.get("tags") or [])], cat_titles)
    r["_tp"] = classify_topics(r["title"], cat_titles, r.get("tags") or [], "", r["_par"])
if os.environ.get("OLD_TREE") != "1":
    _org = [dict(r, par=r["_par"], tp=r["_tp"]) for r in items if RAVS.get(r["rav"], {}).get("kind") != "sketches"]
    _inst = lambda r: RAVS[r["rav"]].get("institution") and r["opath"]
    sys.path.insert(0, os.path.join(ROOT, "importers"))
    from siach import rav_of as _siach_rav, GEN as _SGEN
    def _grp(r):
        if not _inst(r): return (r["rav"], [])
        p0 = r["opath"][0]
        if p0["id"].startswith(("pod-all:", "yt:")) and r["rav"] == "siach":
            nm = _siach_rav(r["title"]) or _SGEN; p0 = {"id": "siach:" + nm, "title": nm}
        return (r["rav"] + "|" + p0["id"], [p0])
    _st = organize(_org, {k: v["name"] for k, v in RAVS.items()}, {x["id"]: x["name"] for x in sources}, [{"name": p[0], "book": p[1]} for p in PARASHOT],
                   _grp)
    _np = {r["uid"]: r for r in _org}
    for r in items:
        if r["uid"] in _np:
            r["path"] = _np[r["uid"]]["path"]; r["o"] = _np[r["uid"]].get("o")
            if _np[r["uid"]].get("par_new"): r["_par"] = _np[r["uid"]]["par"]
    print("organize:", dict(_st))
best = {}
for r in items:
    prev = "rav:" + r["rav"]
    for depth, p in enumerate(r["path"]):
        if depth >= best.get(p["id"], (-1,))[0]: best[p["id"]] = (depth, prev, p["title"])
        prev = p["id"]
for cid, (_, par, title) in best.items():
    cats[cid] = {"id": cid, "title": title, "parent": par, "children": [], "count": 0}
for cid, (_, par, _) in best.items(): cats[par]["children"].append(cid)

TDIR = os.path.join(ROOT, "data", "transcripts")
def _tr_at(uid, tr):
    """Best-effort Asia/Jerusalem-friendly ISO time for when the transcript was added."""
    import subprocess as _sp
    st = _st_all.get(uid) or {}
    if st.get("at"): return st["at"]
    if tr.get("at"):  # personal-style ms or ISO
        a = tr["at"]; return (datetime.datetime.utcfromtimestamp(a/1000).isoformat()+"Z") if isinstance(a,(int,float)) else str(a)
    if tr.get("date"):
        # date-only: use git commit time of the transcript file when available
        fp = os.path.join(TDIR, hashlib.sha1(uid.encode()).hexdigest()[:16] + ".json")
        try:
            t = _sp.check_output(["git","log","-1","--format=%cI","--",fp], cwd=ROOT, text=True).strip()
            if t: return t
        except Exception: pass
        return tr["date"] + "T12:00:00+00:00"
    return None
_st_all = json.load(open(os.path.join(TDIR, "status.json"), encoding="utf-8")) if os.path.exists(os.path.join(TDIR, "status.json")) else {}
for _p in sorted(glob.glob(os.path.join(ROOT, "data", "status", "*.json"))):
    try:
        for _u, _v in json.load(open(_p, encoding="utf-8")).items():
            if _u not in _st_all or (_v.get("at") or "") >= (_st_all[_u].get("at") or ""): _st_all[_u] = _v
    except Exception: pass
TRANSCRIPTS = {os.path.basename(p)[:-5]: json.load(open(p, encoding="utf-8")) for p in glob.glob(os.path.join(TDIR, "*.json")) if not p.endswith("status.json")}
from tr_clean import clean_segments as _clean_segs   # same cleanup the worker applies (stutters / fillers / repetition)
for _t in TRANSCRIPTS.values():
    if _t.get("segments"): _t["segments"] = _clean_segs(_t["segments"])
try: SRCLINKS = json.load(open(os.path.join(ROOT, "data", "srclinks.json"), encoding="utf-8")).get("items", {})   # precomputed by importers/srclinks.js
except Exception: SRCLINKS = {}
SRCFOUND = {}   # on-demand source search results (importers/srcreq.js): content id -> entries found on the shiur's origin
for _p in glob.glob(os.path.join(ROOT, "data", "srcfound", "*.json")):
    try: SRCFOUND[os.path.basename(_p)[:-5]] = json.load(open(_p, encoding="utf-8")).get("found", [])
    except Exception: pass
shiurim = []
for r in items:
    parent = r["path"][-1]["id"] if r["path"] else "rav:" + r["rav"]
    node = parent
    while node: cats[node]["count"] += 1; node = cats[node]["parent"]
    f = fname(r["uid"])
    tr = TRANSCRIPTS.get(f)
    with open(os.path.join(PUB, "content", f + ".json"), "w", encoding="utf-8") as fh:
        json.dump({"html": r.get("contentHtml"), "excerpt": r.get("excerpt", ""), **({"transcript": tr["segments"], "trModel": tr.get("model"), "trMode": tr.get("mode"), "trRaw": bool(tr.get("needsFormat")), "trSource": tr.get("source") or ("Whisper" if "whisper" in (tr.get("model") or "") else "Gemini"), "trDate": tr.get("date"), "trAt": _tr_at(r["uid"], tr), "trSources": tr.get("sources", []), "trStories": tr.get("stories", [])} if tr else {}), **({"srcRes": SRCLINKS[f]} if f in SRCLINKS else {}), **({"srcFound": SRCFOUND[f]} if f in SRCFOUND else {})}, fh, ensure_ascii=False)
    s = {k: r[k] for k in ("uid", "source", "rav", "title", "tags", "date", "audio", "pageUrl")} | {"cat": parent, "c": f}
    if r["source"].startswith("spotify") and r.get("excerpt"): s["sub"] = r["excerpt"][:80]
    cat_titles = []; node = parent
    while node: cat_titles.append(cats[node]["title"]); node = cats[node]["parent"]
    par = r["_par"]
    if par: s["par"] = par
    tp = r["_tp"]
    if r.get("o") is not None: s["o"] = r["o"]
    if tp: s["tp"] = tp
    if f in TRANSCRIPTS: s["tr"] = 1
    if r.get("text"): s["txt"] = 1                  # a written shiur (no audio/video)
    if r.get("doc"): s["doc"] = r["doc"]
    for k in ("youtube", "ytNoEmbed", "ytAlt", "spotify", "spotifyVideo", "soundcloud", "alsoAt", "duration"):
        if r.get(k): s[k] = r[k]
    shiurim.append(s)
shiurim.sort(key=lambda s: s["date"] or "", reverse=True)
for c in cats.values(): c["children"].sort(key=lambda i: (cats[i]["title"] == "שונות", -cats[i]["count"]))
ravs = [{"id": k, "name": v["name"], "count": cats["rav:" + k]["count"], **({"kind": v["kind"]} if v.get("kind") else {})} for k, v in RAVS.items()]
# transcription request status (for "בתמלול..." in the app) + full-text search index of transcripts
_st = json.load(open(os.path.join(TDIR, "status.json"), encoding="utf-8")) if os.path.exists(os.path.join(TDIR, "status.json")) else {}
for _p in sorted(glob.glob(os.path.join(ROOT, "data", "status", "*.json"))):
    try:
        for _u, _v in json.load(open(_p, encoding="utf-8")).items():
            if _u not in _st or (_v.get("at") or "") >= (_st[_u].get("at") or ""): _st[_u] = _v
    except Exception: pass
json.dump({u: {k: v[k] for k in ("status", "reason") if k in v} for u, v in _st.items()}, open(os.path.join(PUB, "transcripts-status.json"), "w", encoding="utf-8"), ensure_ascii=False)
json.dump({k: " ".join(sg["t"] for sg in v["segments"]) for k, v in TRANSCRIPTS.items()}, open(os.path.join(PUB, "transcripts-search.json"), "w", encoding="utf-8"), ensure_ascii=False)
def schedule():
    """Shabbat parasha readings in Israel (Hebcal), cached in data/parasha_schedule.json; refreshed when stale."""
    path = os.path.join(ROOT, "data", "parasha_schedule.json")
    sch = json.load(open(path)) if os.path.exists(path) else []
    today = datetime.date.today()
    if not sch or sch[-1]["date"] < (today + datetime.timedelta(days=200)).isoformat():
        try:
            out = []
            for y in (today.year - 1, today.year, today.year + 1):
                u = f"https://www.hebcal.com/hebcal?v=1&cfg=json&s=on&i=on&lg=he&year={y}&maj=off&min=off&mod=off&nx=off&mf=off&ss=off&c=off"
                for it in json.load(urllib.request.urlopen(u, timeout=30))["items"]:
                    if it.get("category") != "parashat": continue
                    name = it["hebrew"].replace("פרשת ", "")
                    parts = [name.replace("־", " ")] if name.replace("־", " ") in [p[0] for p in PARASHOT] else re.split(r"[־-]", name)
                    idx = [i for part in parts for i, p in enumerate(PARASHOT) if part.replace("־", " ").strip() == p[0] or part.replace("־", " ").strip() in p[2]][:2]
                    out.append({"date": it["date"], "name": it["hebrew"], "par": idx})
            if out: sch = sorted({o["date"]: o for o in out}.values(), key=lambda o: o["date"]); json.dump(sch, open(path, "w"), ensure_ascii=False)
        except Exception as e:
            print("hebcal fetch failed:", e)
    return sch
SCH = schedule()
TAX = taxonomy()
for t in TAX: t["count"] = sum(1 for s in shiurim if t["id"] in s.get("tp", ()))
TAX = [t for t in TAX if t["count"]]
print("topics: classified", sum(1 for s in shiurim if s.get("tp")), "/", len(shiurim))
json.dump({"topics": TAX, "parashot": [{"name": p[0], "book": p[1]} for p in PARASHOT], "schedule": SCH, "ravs": ravs, "sources": sources, "categories": cats, "shiurim": shiurim},
          open(os.path.join(PUB, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"parasha: {sum(1 for x in shiurim if x.get('par'))} shiurim classified, {len({i for x in shiurim for i in x.get('par', [])})}/54 parashot, schedule {len(SCH)} weeks")
print(f"built: {len(sources)} sources, {len(cats)} categories, {len(shiurim)} shiurim, {merged} duplicates merged")
for r in ravs: print(" ", r["name"], r["count"])
# personal (in-browser) transcription: the user's prompt + model cascade, same as the worker
try:
    import transcribe_worker as _tw
    open(os.path.join(PUB, "prompt_he.txt"), "w", encoding="utf-8").write(_tw.build_prompt("{referenceText}"))
    json.dump([[m, s] for m, s in _tw.GEM_CASCADE], open(os.path.join(PUB, "gemini_models.json"), "w"))
except Exception as e: print("prompt export failed:", e)
