#!/usr/bin/env python3
"""אתר התנ"ך של מכללת הרצוג (hatanakh.com) — author pages ("מחברים/<name>") list every lesson / clip with its length;
each page embeds either YouTube or a SoundCloud track (account "hakhel"). Titles verbatim from the site.
Only recordings of at least MIN_DUR (8 min: real shiurim, not short clips); never articles (text).
  python3 importers/hatanakh.py [medan|samet|grossman|fargeon|spiegelman]
YouTube ids already stored for the rav (youtube-<rav>.json) are skipped; SoundCloud items get "soundcloud": "<user>/<track>"
(played with the SoundCloud widget, which needs nothing from the box). Writes data/sources/hatanakh-<rav>.json"""
import sys, os, re, json, time, html, subprocess, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
AUTHORS = {"medan": "הרב-יעקב-מדן", "samet": "הרב-אלחנן-סמט", "grossman": "פרופ-יונתן-גרוסמן", "fargeon": "דר-יושי-פרגון", "spiegelman": "הרב-מאיר-שפיגלמן"}
MIN_DUR = 480
SITE = "https://www.hatanakh.com"
UA = {"User-Agent": "Mozilla/5.0 (ShiurimAggregator personal study app)"}
YTDLP = os.environ.get("YTDLP") or (os.path.expanduser("~/.local/bin/yt-dlp") if os.path.exists(os.path.expanduser("~/.local/bin/yt-dlp")) else "yt-dlp")
GEMARA = re.compile(r"גמרא|מסכת|סוגיי?ת|דף היומי|^הלכות |שולחן ערוך")
EXCL = {k: v.get("excludeTitle", []) for k, v in load_json(os.path.join(ROOT, "data", "ravs.json"), {}).items()}

def get(url):
    # curl with a hard total deadline (urllib's timeout is per read and a trickling server can hang it)
    for a in range(4):
        r = subprocess.run(["curl", "-sS", "-L", "-m", "60", "-A", UA["User-Agent"], url], capture_output=True)
        if r.returncode == 0 and r.stdout: return r.stdout.decode("utf-8", "replace")
        print("  err", url[:90], r.returncode, r.stderr[:120], flush=True); time.sleep(5 * (a + 1))
    return ""

def yt_duration(vid):
    try:
        out = subprocess.run([YTDLP, "-j", "--skip-download", "--no-warnings", f"https://www.youtube.com/watch?v={vid}"], capture_output=True, text=True, timeout=120).stdout
        return json.loads(out).get("duration") if out.strip() else None
    except Exception: return None

def run(slug):
    path = os.path.join(ROOT, "data", "sources", f"hatanakh-{slug}.json")
    old = load_json(path, {"shiurim": {}}); OLD, checked = old["shiurim"], set(old.get("checked", []))
    yt = {v.get("youtube") for v in load_json(os.path.join(ROOT, "data", "sources", f"youtube-{slug}.json"), {"shiurim": {}})["shiurim"].values()}
    page = get(SITE + "/" + urllib.parse.quote("מחברים/" + AUTHORS[slug]))
    S = {}
    rows = re.findall(r'<li class="search-result ([a-z_ -]+)"><h3 class="title"><a href="([^"]+)">(.*?)</a></h3>(.*?)</li>', page, re.S)
    print(slug, len(rows), "items listed", flush=True)
    for n, (typ, href, title, rest) in enumerate(rows, 1):
        if typ.strip() not in ("lessons", "blog"): continue                 # articles are text only
        title = html.unescape(re.sub(r"<[^>]+>", "", title)).strip()      # verbatim
        uid = f"hatanakh:{urllib.parse.unquote(href).rsplit('/', 1)[-1]}"
        if not re.search(r"[\u0590-\u05FF]", title) or GEMARA.search(title) or any(k in title for k in EXCL.get(slug, [])): continue
        if uid in OLD: S[uid] = OLD[uid]; continue
        if uid in checked: continue
        mins = re.search(r'<em class="placeholder">(\d+)</em> דקות', rest)
        if mins and int(mins.group(1)) * 60 < MIN_DUR: checked.add(uid); continue
        p = get(SITE + href); time.sleep(0.7)
        if not p: continue
        vids = list(dict.fromkeys(re.findall(r'youtube(?:-nocookie)?\.com/embed/([\w-]{11})', p)))
        sc = [x for x in dict.fromkeys(re.findall(r'soundcloud\.com/([\w-]+/[\w-]+)', p)) if not x.startswith("player")]
        rec = {}
        if vids:
            if vids[0] in yt: checked.add(uid); continue
            d = yt_duration(vids[0])
            if d is None: continue                                          # retried next run
            rec = {"youtube": vids[0], "duration": d}
        elif sc:
            t = get("https://soundcloud.com/" + sc[0]); time.sleep(0.5)
            m = re.search(r'"full_duration":(\d+)', t) or re.search(r'"duration":(\d+)', t)
            if not t or not m: continue
            if '"streamable":false' in t: checked.add(uid); continue
            rec = {"soundcloud": sc[0], "duration": int(m.group(1)) // 1000}
        else:
            checked.add(uid); continue                                      # media only (user rule)
        if (rec["duration"] or 0) < MIN_DUR: checked.add(uid); continue
        desc = re.search(r'<meta name="description" content="([^"]*)"', p) or re.search(r'property="og:description" content="([^"]*)"', p)
        date = re.search(r'property="article:published_time" content="([^"]+)"', p)
        ser = re.search(r'(ימי (?:ה)?עיון בתנ"?ך\s*-\s*[^\s<]+)', html.unescape(re.sub(r"<[^>]+>", " ", p)))
        ser = re.sub(r"\s+", " ", ser.group(1)) if ser else "שיעורים"
        S[uid] = {"uid": uid, "source": f"hatanakh-{slug}", "sourceId": href, "rav": slug, "title": title,
                  "excerpt": html.unescape(desc.group(1)).strip()[:1500] if desc else "", "tags": [],
                  "path": [{"id": f"hatanakh:{slug}", "title": "אתר התנ\"ך - מכללת הרצוג"}, {"id": f"hatanakh:{slug}:{ser}", "title": ser}],
                  "date": date.group(1) if date else None, "audio": [], "pageUrl": SITE + urllib.parse.unquote(href), **rec}
        if n % 25 == 0:
            print(slug, n, len(S), flush=True)
            save_json(path, {"source": {"id": f"hatanakh-{slug}", "name": "אתר התנ\"ך - מכללת הרצוג", "site": SITE, "rav": slug}, "shiurim": {**OLD, **S}, "checked": sorted(checked)})
    if not rows: S = OLD                                                     # listing failed: keep what we had
    save_json(path, {"source": {"id": f"hatanakh-{slug}", "name": "אתר התנ\"ך - מכללת הרצוג", "site": SITE, "rav": slug}, "shiurim": S, "checked": sorted(checked)})
    print(slug, len(S), "shiurim")

if __name__ == "__main__":
    for s in sys.argv[1:] or AUTHORS: run(s)
