#!/usr/bin/env python3
"""On-demand transcription worker.
Requests = open GitHub issues in REPO whose title starts with "[תמלול]" and contains a shiur uid
(the app's "בקש תמלול" button opens such an issue pre-filled). For each request:
  status -> "working" (published so the app shows "בתמלול..."), fetch audio, transcribe with
  ivrit-ai whisper (faster-whisper, CPU), save data/transcripts/<c>.json, status -> "done",
  rebuild + redeploy, comment on the issue and close it.
Usage: python3 transcribe_worker.py [--once] [--uid UID]   (--uid: transcribe directly, no issue)
"""
import json, os, re, subprocess, sys, time, hashlib, tempfile, datetime, shutil
ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = "moshekfir78/shiurim-app"
SITE = "https://moshekfir78.github.io/shiurim-app/"
TDIR = os.path.join(ROOT, "data", "transcripts")
STATUS = os.path.join(TDIR, "status.json")          # legacy (read-only)
SDIR = os.path.join(ROOT, "data", "status")
WORKER_MODE = os.environ.get("WORKER_MODE", "")      # "fast" / "accurate": each workflow handles only its own requests
MODEL = "ivrit-ai/whisper-large-v3-turbo-ct2"
MODES = {"fast": {"model": "ivrit-ai/whisper-large-v3-turbo-ct2", "beam": 1, "rt": 1.5, "label": "מהיר"},
         "accurate": {"model": "ivrit-ai/whisper-large-v3-turbo-ct2", "beam": 5, "rt": 1.0, "label": "מדויק"}}
MAX_SECONDS = 3 * 3600          # refuse audio longer than 3h
POLL = 600                      # seconds between polls in loop mode
fname = lambda uid: hashlib.sha1(uid.encode()).hexdigest()[:16]
log = lambda *a: print(datetime.datetime.now().strftime("%H:%M:%S"), *a, flush=True)

def load(p, d):
    try: return json.load(open(p, encoding="utf-8"))
    except Exception: return d
def save(p, o):
    json.dump(o, open(p + ".tmp", "w", encoding="utf-8"), ensure_ascii=False); os.replace(p + ".tmp", p)
def set_status(uid, st, **kw):
    # one file per shiur so the fast and accurate workflows never conflict on push
    os.makedirs(SDIR, exist_ok=True)
    save(os.path.join(SDIR, fname(uid) + ".json"), {uid: {"status": st, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), **kw}})
CI = bool(os.environ.get("GITHUB_ACTIONS"))
def publish():
    """Box: build + redeploy. GitHub Actions: build + commit/push data/ (the workflow deploys Pages at the end)."""
    subprocess.run([sys.executable, "build.py"], cwd=ROOT, check=True, capture_output=True)
    if not CI:
        subprocess.run(["./redeploy.sh"], cwd=ROOT, check=True, capture_output=True); return
    subprocess.run(["git", "add", "data"], cwd=ROOT, check=True)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0: return
    subprocess.run(["git", "commit", "-qm", "transcripts: update"], cwd=ROOT, check=True)
    for _ in range(5):
        subprocess.run(["git", "pull", "-q", "--rebase", "-X", "theirs"], cwd=ROOT)
        if subprocess.run(["git", "push", "-q"], cwd=ROOT).returncode == 0: break
        time.sleep(10)
    open(os.path.join(ROOT, ".deploy-needed"), "w").close()

def index():
    return {s["uid"]: s for s in load(os.path.join(ROOT, "public", "data", "index.json"), {"shiurim": []})["shiurim"]}

def get_audio(s, out):
    """Download audio for a shiur to `out`. Returns None or raises with a Hebrew reason."""
    for u in s.get("audio") or []:
        r = subprocess.run(["curl", "-sfL", "--max-time", "1800", "-o", out, u])
        if r.returncode == 0 and os.path.getsize(out) > 10000: return
    if s.get("youtube"):
        import shutil
        ytdlp = shutil.which("yt-dlp") or os.path.expanduser("~/.local/bin/yt-dlp")
        r = subprocess.run([ytdlp, "-f", "bestaudio", "-o", out, "--force-overwrites", "--no-part", f"https://www.youtube.com/watch?v={s['youtube']}"], capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(out): return
        raise RuntimeError("לא ניתן להוריד את השמע מיוטיוב כרגע (" + (r.stderr.strip().splitlines() or ["?"])[-1][:120] + ")")
    if s.get("spotify"):
        raise RuntimeError("שיעור שזמין רק בספוטיפיי – אין גישה ציבורית לקובץ השמע, לכן אי אפשר לתמלל")
    raise RuntimeError("לא נמצא קובץ שמע לשיעור")

LAT = re.compile(r"[A-Za-z]+|[\U00010000-\U0010FFFF\u2600-\u27BF�]")
def clean(t):
    he = len(re.findall(r"[א-ת]", t)); la = len(re.findall(r"[A-Za-z]", t))
    if he >= la: t = LAT.sub("", t)          # Hebrew segment: drop stray Latin tokens / emoji (whisper hallucinations)
    return re.sub(r"\s{2,}", " ", t).strip()


# ---- Gemini (primary). Key is read ONLY from ~/.secrets/gemini.env, never stored in the repo/public. ----
GEM_ENV = os.path.expanduser("~/.secrets/gemini.env")
GEM_API = "https://generativelanguage.googleapis.com"
GEM_PREF = ["gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini-3-pro", "gemini-3-pro-preview", "gemini-2.5-pro", "gemini-3-flash", "gemini-2.5-flash"]
CHUNK = 40 * 60                 # split audio into 40-minute chunks
PROMPT_FILE = os.path.join(ROOT, "prompts", "transcribe_he.txt")   # the user's AI Studio prompt, verbatim
def build_prompt(ref, speakers=False):
    t = open(PROMPT_FILE, encoding="utf-8").read()
    i = t.index("7. זיהוי דוברים:"); j = t.index("להלן טקסט הסימוכין")
    sec = [l for l in t[i:j].splitlines() if ("אם נדרש" in l) == speakers and "תגיות" in l][0]
    t = t[:i] + "7. זיהוי דוברים:\n" + sec.split(":", 1)[1].strip().strip('"') + "\n\n" + t[j:]
    return t.replace("{language}", "עברית").replace("{referenceText}", ref)
def gem_key():
    if os.environ.get("GEMINI_API_KEY"): return os.environ["GEMINI_API_KEY"]
    try:
        m = re.search(r"GEMINI_API_KEY\s*=\s*['\"]?([^'\"\s]+)", open(GEM_ENV).read()); return m and m.group(1)
    except Exception: return None
def gem_req(method, url, key, **kw):
    import requests
    r = requests.request(method, url, headers={"x-goog-api-key": key, **kw.pop("headers", {})}, timeout=kw.pop("timeout", 900), **kw)
    if r.status_code >= 400: raise RuntimeError(f"Gemini {r.status_code}: {r.text[:200]}")
    return r
_gem_model = None
def gem_model(key):
    global _gem_model
    if not _gem_model:
        names = {m["name"].split("/")[-1] for m in gem_req("GET", GEM_API + "/v1beta/models?pageSize=200", key).json().get("models", [])}
        _gem_model = next((m for m in GEM_PREF if m in names), None) or sorted(n for n in names if n.startswith("gemini") and "pro" in n)[-1]
    return _gem_model
GEM_CASCADE = [("gemini-3.5-transcribe", False), ("gemini-3.1-pro-preview", True), ("gemini-3.1-pro-preview", False),
               ("gemini-3.8-flash", False), ("gemini-3-flash-preview", False), ("gemini-3.7-flash", False), ("gemini-3.6-flash", False), ("gemini-3.5-flash", False), ("gemini-flash-latest", False), ("gemini-flash-lite-latest", False), ("gemini-2.5-flash", False)]
def gem_generate(key, part, ctx="", pre=""):
    """User's prompt; transcribe model, then Pro (+Google Search), then Flash. Busy if all fail on quota/overload."""
    global _gem_model
    txt = pre + build_prompt(ctx[:8000])
    errs = []
    for m, search in GEM_CASCADE:
        body = {"contents": [{"parts": [part, {"text": txt}]}], "generationConfig": {"temperature": 0, "maxOutputTokens": 65536}}
        if search: body["tools"] = [{"google_search": {}}]
        try:
            j = gem_req("POST", f"{GEM_API}/v1beta/models/{m}:generateContent", key, json=body).json()
            out = "".join(p.get("text", "") for p in j["candidates"][0]["content"]["parts"] if not p.get("thought"))
            if out.strip():
                _gem_model = m + (" +search" if search else "")
                if errs: log("gemini fallbacks:", ", ".join(errs))
                return out
        except Exception as e:
            errs.append(f"{m}{'+s' if search else ''}:{str(e)[7:10]}")
    if all(e[-3:] in ("429", "503", "500", "404") for e in errs) and any(e[-3:] != "404" for e in errs): raise Busy("Gemini: " + ", ".join(errs))
    raise RuntimeError("Gemini: " + ", ".join(errs))
class Busy(RuntimeError): pass   # quota/overload: retry on a later run instead of failing
def gem_upload(key, path):
    size = os.path.getsize(path)
    r = gem_req("POST", GEM_API + "/upload/v1beta/files", key, json={"file": {"display_name": "shiur"}}, headers={
        "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(size), "X-Goog-Upload-Header-Content-Type": "audio/mpeg"})
    f = gem_req("POST", r.headers["X-Goog-Upload-URL"], key, data=open(path, "rb"), headers={
        "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"}).json()["file"]
    while f.get("state") == "PROCESSING":
        time.sleep(5); f = gem_req("GET", GEM_API + "/v1beta/" + f["name"], key).json()
    return f
def split3(text):
    sec = {"tr": [], "src": [], "st": []}; cur = "tr"
    for ln in text.splitlines():
        h = ln.strip().lstrip("#").strip()
        if ln.strip().startswith("#"):
            cur = "st" if "סיפור" in h else "src" if "מקורות" in h else "tr" if h.startswith("תמלול") else cur; continue
        sec[cur].append(ln)
    cl = lambda l: re.sub(r"^\s*(?:[-•]|\*(?!\*))\s*", "", l).replace("**", "").strip()
    clean_l = lambda L: [cl(l) for l in L if cl(l) and cl(l) != "אין"]
    return "\n".join(sec["tr"]), clean_l(sec["src"]), clean_l(sec["st"])
EXTRA = {}
def parse_all(text, offset=0, span=0):
    tr, src, st = split3(text)
    EXTRA.setdefault("sources", []).extend(src); EXTRA.setdefault("stories", []).extend(st)
    return parse(tr, offset, span)
TS = re.compile(r"^\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*")
def parse(text, offset=0, span=0):
    out = []; total = max(1, len(text)); pos = 0; anyts = bool(TS.search(text.lstrip()[:20])) if text.strip() else False
    for para in re.split(r"\n\s*\n|\n", text):
        para = para.strip()
        if not para: continue
        m = TS.match(para); s = offset + (span * pos / total if span and not anyts else 0); pos += len(para) + 1
        if m:
            a, b, c = m.groups(); s = offset + (int(a)*3600+int(b)*60+int(c) if c else int(a)*60+int(b)); para = para[m.end():].strip()
        elif out and anyts: s = out[-1]["s"]
        if para: out.append({"s": round(s, 1), "t": para})
    return out
def dur_of(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)
def gem_audio(key, path, td, ctx=""):
    dur = dur_of(path)
    if dur > MAX_SECONDS: raise RuntimeError(f"השיעור ארוך מדי לתמלול ({int(dur // 60)} דקות)")
    out = []
    for i, off in enumerate(range(0, int(dur) + 1, CHUNK)):
        cp = os.path.join(td, f"c{i}.mp3")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(off), "-t", str(CHUNK), "-i", path, "-ac", "1", "-b:a", "48k", cp], check=True)
        f = gem_upload(key, cp)
        try: out += parse_all(gem_generate(key, {"file_data": {"mime_type": f["mimeType"], "file_uri": f["uri"]}}, ctx), off, min(CHUNK, dur - off))
        finally:
            try: gem_req("DELETE", GEM_API + "/v1beta/" + f["name"], key)
            except Exception: pass
    return out, dur
def gem_youtube(key, vid, ctx="", dur=0):
    segs = parse_all(gem_generate(key, {"file_data": {"file_uri": f"https://www.youtube.com/watch?v={vid}"}}, ctx), 0, dur or 0)
    return segs, (segs[-1]["s"] if segs else 0)

# ---- YouTube captions (Hebrew; manual preferred, else auto) -> Gemini text-only formatting ----
CAP_SRC = "כתוביות יוטיוב"
CAP_PRE = """הערה חשובה לפני ההוראות: אין כאן הקלטה. הקלט הוא טקסט כתוביות של יוטיוב (ייתכן שאוטומטיות, בלי פיסוק), וכל שורה בו מתחילה בחותמת זמן בסוגריים מרובעים.
התפקיד שלך הוא רק לערוך ולעצב את הטקסט הזה לפי ההוראות שלהלן: חלוקה לפסקאות, פיסוק, הסרת מילות מילוי, גמגומים וחזרות, וסימון ציטוטים ב-'>'. אל תקצר, אל תסכם ואל תשמיט שום תוכן. אל תוסיף תוכן שלא נאמר. מותר לתקן רק שגיאות זיהוי ברורות לפי ההקשר.
כל פסקה חייבת להתחיל בחותמת הזמן של השורה הראשונה שלה, באותו פורמט בדיוק, למשל [12:34] או [1:02:03].
אחרי התמלול הערוך, הפק את "### נספח סיפורים ואנקדוטות" ואת "### דף מקורות" כרגיל.

"""
def _ts(x):
    x = int(x); h, m, s = x // 3600, x % 3600 // 60, x % 60
    return f"[{h}:{m:02d}:{s:02d}]" if h else f"[{m}:{s:02d}]"
def yt_captions(vid):
    """[(start, text)] Hebrew captions or None. youtube-transcript-api first, then yt-dlp."""
    errs = []
    cp = os.path.join(ROOT, "data", "captions", vid + ".json")   # pre-fetched (e.g. from the box) when YouTube blocks the runner
    if os.path.exists(cp):
        c = load(cp, {});
        if c.get("caps"): return [tuple(x) for x in c["caps"]], c.get("kind", "")
    try:
        from youtube_transcript_api import YouTubeTranscriptApi as Y
        tl = Y().list(vid); tr = None; kind = ""
        for f, k in ((tl.find_manually_created_transcript, "ידניות"), (tl.find_generated_transcript, "אוטומטיות")):
            try: tr = f(["iw", "he"]); kind = k; break
            except Exception: pass
        if tr:
            out = [(c.start, c.text.replace("\n", " ").strip()) for c in tr.fetch()]
            out = [(a, b) for a, b in out if b]
            if out: return out, kind
        else: return None, "no-hebrew"
    except Exception as e:
        n = type(e).__name__
        if n in ("TranscriptsDisabled", "NoTranscriptFound"): return None, "no-hebrew"
        errs.append("api:" + n)
    try:
        with tempfile.TemporaryDirectory() as td:
            ytdlp = shutil.which("yt-dlp") or os.path.expanduser("~/.local/bin/yt-dlp")
            for flag, kind in (("--write-subs", "ידניות"), ("--write-auto-subs", "אוטומטיות")):
                subprocess.run([ytdlp, "--skip-download", flag, "--sub-langs", "iw,he", "--sub-format", "json3", "-o", os.path.join(td, "s"),
                                f"https://www.youtube.com/watch?v={vid}"], capture_output=True, text=True, timeout=120)
                fs = [f for f in os.listdir(td) if f.endswith(".json3")]
                if fs:
                    ev = json.load(open(os.path.join(td, fs[0]))).get("events", [])
                    out = [(e["tStartMs"] / 1000, "".join(x.get("utf8", "") for x in e.get("segs", [])).replace("\n", " ").strip()) for e in ev if e.get("segs")]
                    out = [(a, b) for a, b in out if b]
                    if out: return out, kind
            errs.append("yt-dlp:none")
    except Exception as e: errs.append("yt-dlp:" + type(e).__name__)
    log("captions unavailable:", ", ".join(errs)); return None, ",".join(errs)
WHISPER_PRE = CAP_PRE.replace("טקסט כתוביות של יוטיוב (ייתכן שאוטומטיות, בלי פיסוק)", "טקסט שתומלל אוטומטית מההקלטה במודל ivrit.ai (Whisper), בלי חלוקה לפסקאות ועם פיסוק חלקי")
def gem_captions(key, caps, ctx="", pre=None):
    dur = caps[-1][0] + 5; out = []
    for off in range(0, int(dur) + 1, CHUNK):
        lines = [f"{_ts(a)} {b}" for a, b in caps if off <= a < off + CHUNK]
        if lines: out += parse_all(gem_generate(key, {"text": "\n".join(lines)}, ctx, pre or CAP_PRE), 0, 0)
    return out, dur

NO_WHISPER = CI or bool(os.environ.get("NO_WHISPER"))   # whisper on a CPU runner is far too slow (~8x realtime)
_models = {}
def transcribe(path, mode="fast"):
    cfg = MODES.get(mode, MODES["fast"])
    import numpy as np
    from faster_whisper import WhisperModel
    pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
    a = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
    dur = len(a) / 16000
    if dur > MAX_SECONDS: raise RuntimeError(f"השיעור ארוך מדי לתמלול ({int(dur // 60)} דקות)")
    if cfg["model"] not in _models: _models[cfg["model"]] = WhisperModel(cfg["model"], device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    segs, _ = _models[cfg["model"]].transcribe(a, language="he", beam_size=cfg["beam"], vad_filter=True, condition_on_previous_text=False,
                                compression_ratio_threshold=2.0, no_speech_threshold=0.5, log_prob_threshold=-0.8,
                                repetition_penalty=1.1, no_repeat_ngram_size=3)
    out = []
    for sg in segs:
        t = clean(sg.text)
        if t: out.append({"s": round(sg.start, 1), "t": t})
    return out, dur

WSRC = "ivrit.ai"
DEADLINE = float(os.environ.get("JOB_DEADLINE") or 0)      # epoch secs; CI sets it so a job never hits the 6h limit
WHISPER_RT = float(os.environ.get("WHISPER_RT") or 0.6)    # est. runner secs per audio sec (int8, 4 vCPU)
def whisper_caps(segs):
    """merge short whisper segments into ~20s lines for the formatter"""
    out = []
    for g in segs:
        if out and g["s"] - out[-1][0] < 20: out[-1] = (out[-1][0], out[-1][1] + " " + g["t"])
        else: out.append((g["s"], g["t"]))
    return out
def fmt_raw(segs):
    """raw whisper -> ~1-minute paragraphs (published when Gemini formatting is unavailable)"""
    out = []
    for g in segs:
        if out and g["s"] - out[-1]["s"] < 60: out[-1]["t"] += " " + g["t"]
        else: out.append({"s": g["s"], "t": g["t"]})
    return out
def process(uid, issue=None, mode="fast"):
    mode = mode if mode in MODES else "fast"; cfg = MODES[mode]
    s = index().get(uid)
    if not s: raise RuntimeError("מזהה שיעור לא קיים באפליקציה")
    old = load(os.path.join(TDIR, fname(uid) + ".json"), None)
    if old and not (mode == "accurate" and old.get("mode") != "accurate"): return "already"   # accurate may upgrade a fast/other transcript
    set_status(uid, "working", issue=issue); publish()
    t0 = time.time()
    used = MODEL; segs = None; key = gem_key(); EXTRA.clear(); src = "Gemini"; raw = None; dur = 0
    ctx = s["title"]
    try:
        d = load(os.path.join(ROOT, "public", "data", "content", fname(uid) + ".json"), {})
        ctx += "\n" + re.sub(r"<[^>]+>", " ", d.get("html") or d.get("excerpt") or "")
    except Exception: pass
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "a"); have_audio = False; busy = None
        def audio():
            nonlocal have_audio
            if not have_audio:
                try: get_audio(s, p); have_audio = os.path.exists(p) and os.path.getsize(p) > 10000
                except Exception as e: log("audio download failed:", str(e)[:200])
            return have_audio
        def whisper(m):
            nonlocal raw, dur, used, src, segs
            c = MODES[m]; ad = dur_of(p)
            if DEADLINE and time.time() + ad * c["rt"] + 600 > DEADLINE: raise Busy(f"not enough job time for {round(ad/60)} min audio")
            tw = time.time(); raw, dur = transcribe(p, m); log(f"whisper[{m}] {round(dur/60)} min audio in {round((time.time()-tw)/60,1)} min")
            used = c["model"]; src = WSRC + " · " + c["label"]
            if key:
                try: EXTRA.clear(); segs, _ = gem_captions(key, whisper_caps(raw), ctx, WHISPER_PRE); used = c["model"] + " + " + gem_model(key)
                except Exception as e: log("formatting unavailable, publishing raw whisper:", str(e)[:200]); segs = None; EXTRA.clear()
            if not segs: segs = fmt_raw(raw)
        # 1) YouTube captions (saved cache first; live fetch usually blocked on Actions) - both modes
        if s.get("youtube") and not os.environ.get("NO_CAPTIONS"):
            caps, kind = yt_captions(s["youtube"])
            if caps:
                src = CAP_SRC + (f" ({kind})" if kind else ""); log("captions", kind, len(caps))
                try:
                    if not key: raise RuntimeError("no key")
                    segs, dur = gem_captions(key, caps, ctx); used = gem_model(key)
                except Exception as e:
                    log("caption formatting unavailable, publishing raw captions:", str(e)[:200]); EXTRA.clear()
                    raw = [{"s": round(a, 1), "t": t} for a, t in caps]; dur = caps[-1][0]; used = "captions"; segs = fmt_raw(raw)
        if not segs and mode == "fast":
            # 2a) fast: Gemini directly (YouTube link for YouTube-only items, else uploaded audio); all free models in order
            if key:
                try:
                    if s.get("youtube") and not s.get("audio"): segs, dur = gem_youtube(key, s["youtube"], ctx, s.get("dur") or s.get("duration") or 0)
                    elif audio(): segs, dur = gem_audio(key, p, td, ctx)
                    if segs: used = gem_model(key); src = "Gemini · מהיר"
                except Exception as e: busy = e; log("gemini fast failed, falling back to ivrit.ai:", str(e)[:200]); segs = None; EXTRA.clear()
            # 2b) all Gemini busy -> ivrit.ai turbo beam 1, format later
            if not segs and audio() and not os.environ.get("NO_WHISPER"): whisper("fast")
        if not segs and mode == "accurate":
            # 2) accurate: ivrit.ai turbo beam 5, then Gemini text formatting
            if audio() and not os.environ.get("NO_WHISPER"): whisper("accurate")
            elif key and s.get("youtube"):
                segs, dur = gem_youtube(key, s["youtube"], ctx, s.get("dur") or s.get("duration") or 0); used = gem_model(key); src = "Gemini"
        if not segs:
            if isinstance(busy, Busy): raise busy
            raise RuntimeError("לא נמצא שמע זמין לתמלול" if not have_audio else "אין מפתח Gemini")
    rec = {"uid": uid, "model": used, "date": datetime.date.today().isoformat(), "audioSeconds": round(dur), "source": src,
           "segments": segs, "sources": EXTRA.get("sources", []), "stories": EXTRA.get("stories", [])}
    rec["mode"] = mode if raw is not None else ("fast" if mode == "fast" else "other")
    if raw is not None and "+" not in used and not used.startswith("gemini"): rec["needsFormat"] = True; rec["raw"] = raw
    save(os.path.join(TDIR, fname(uid) + ".json"), rec)
    took = round(time.time() - t0)
    set_status(uid, "done", issue=issue, seconds=took, audioSeconds=round(dur), model=used, source=src, mode=rec["mode"]); publish()
    log(f"done {uid}: {round(dur/60)} min audio in {round(took/60,1)} min ({src})")
    return took
def reformat_pending(limit=2):
    """retry Gemini formatting of raw whisper transcripts published earlier"""
    key = gem_key()
    if not key: return
    n = 0
    for f in sorted(os.listdir(TDIR)):
        if n >= limit or f == "status.json" or not f.endswith(".json"): continue
        fp = os.path.join(TDIR, f); r = load(fp, {})
        if not r.get("needsFormat") or not r.get("raw"): continue
        n += 1; s = index().get(r["uid"], {}); EXTRA.clear()
        try: segs, _ = gem_captions(key, whisper_caps(r["raw"]), s.get("title", ""), WHISPER_PRE)
        except Exception as e: log("reformat later", r["uid"], str(e)[:120]); return
        r.update(segments=segs, sources=EXTRA.get("sources", []), stories=EXTRA.get("stories", []), model=r.get("model", MODEL) + " + " + gem_model(key))
        r.pop("needsFormat"); r.pop("raw"); save(fp, r); log("reformatted", r["uid"]); publish()

def gh(*a): return subprocess.run(["gh", *a, "-R", REPO], capture_output=True, text=True)

def poll_once():
    r = gh("issue", "list", "--state", "open", "--limit", "50", "--json", "number,title,body")
    if r.returncode: log("gh error", r.stderr.strip()); return
    idx = None
    for it in sorted(json.loads(r.stdout or "[]"), key=lambda x: x["number"]):
        if not it["title"].startswith("[תמלול]"): continue
        m = re.search(r"([a-z][a-z0-9-]*:[^\s]+)", it["title"] + " " + (it["body"] or ""))
        uid = m.group(1) if m else None
        idx = idx or index()
        if not uid or uid not in idx:
            gh("issue", "close", str(it["number"]), "--comment", "לא נמצא מזהה שיעור תקין בבקשה, ולכן היא נסגרה."); continue
        url = SITE + "#/s/" + uid
        try:
            res = process(uid, it["number"])
        except Busy as e:
            log("gemini busy, issue stays open", e); set_status(uid, "working", issue=it["number"]); publish(); return
        except Exception as e:
            log("failed", uid, e); set_status(uid, "failed", issue=it["number"], reason=str(e)); publish()
            gh("issue", "close", str(it["number"]), "--comment", f"לא ניתן לתמלל את השיעור: {e}"); continue
        if True:
            gh("issue", "close", str(it["number"]), "--comment", ("התמלול כבר קיים" if res == "already" else "התמלול מוכן") + f": {url}")

NTFY_TOPIC = open(os.path.join(ROOT, "data", "ntfy_topic.txt")).read().strip()
NTFY_STATE = os.path.join(ROOT, "data", "ntfy_state_accurate.json" if WORKER_MODE == "accurate" else "ntfy_state.json")
MAX_PER_HOUR = 6
RETRY_FOR = 24 * 3600           # keep retrying Gemini-quota failures for a day
def poll_ntfy():
    import requests
    st = load(NTFY_STATE, {"since": "6h", "jobs": []}); st.setdefault("retry", {})
    msgs = []
    try:
        r = requests.get(f"https://ntfy.sh/{NTFY_TOPIC}/json", params={"poll": "1", "since": st["since"]}, timeout=30)
        msgs = [m for m in (json.loads(l) for l in r.text.splitlines() if l.strip()) if m.get("event") == "message"]
    except Exception as e: log("ntfy error", e)
    if msgs: st["since"] = msgs[-1]["id"]
    for m in msgs:                                    # new requests join the queue
        msg = (m.get("message") or "").strip()[:200]; uid, _, md = msg.partition("|"); md = md if md in MODES else "fast"
        if WORKER_MODE and md != WORKER_MODE: continue            # the other workflow handles it
        st.setdefault("mode", {})[uid] = md
        st["retry"].setdefault(uid, time.time())
    save(NTFY_STATE, st)
    idx = index(); stat = load(STATUS, {})
    for uid, first in sorted(st["retry"].items(), key=lambda kv: kv[1]):
        md = st.get("mode", {}).get(uid, "fast")
        if WORKER_MODE and md != WORKER_MODE: continue             # belongs to the other workflow
        ex = load(os.path.join(TDIR, fname(uid) + ".json"), None)
        if uid not in idx or (ex and not (md == "accurate" and ex.get("mode") != "accurate")):
            st["retry"].pop(uid, None); save(NTFY_STATE, st); continue
        now = time.time(); st["jobs"] = [t for t in st["jobs"] if now - t < 3600]
        if len(st["jobs"]) >= MAX_PER_HOUR: log("rate limit, later:", uid); break
        st["jobs"].append(now); save(NTFY_STATE, st)
        log("request", uid)
        try: process(uid, None, md); st["retry"].pop(uid, None); st.get("mode", {}).pop(uid, None)
        except Busy as e:
            log("gemini busy", uid, e)
            if now - first > RETRY_FOR:
                st["retry"].pop(uid, None); set_status(uid, "failed", reason="מכסת התמלול החינמית של Gemini מלאה, נסה שוב מחר")
            else: set_status(uid, "working", note="ממתין למכסת Gemini")
            save(NTFY_STATE, st); publish(); break     # quota hit: stop this run
        except Exception as e:
            log("failed", uid, e); st["retry"].pop(uid, None); set_status(uid, "failed", reason=str(e))
        save(NTFY_STATE, st); publish()
    save(NTFY_STATE, st); publish()

if __name__ == "__main__":
    if "--fetch-captions" in sys.argv:   # box helper: python3 transcribe_worker.py --fetch-captions VID [VID...]
        os.makedirs(os.path.join(ROOT, "data", "captions"), exist_ok=True)
        for v in sys.argv[sys.argv.index("--fetch-captions") + 1:]:
            c, k = yt_captions(v); print(v, k, len(c or []))
            if c: save(os.path.join(ROOT, "data", "captions", v + ".json"), {"kind": k, "caps": c})
        sys.exit()
    if "--uid" in sys.argv: print(process(sys.argv[sys.argv.index("--uid") + 1])); sys.exit()
    n = 0
    while True:
        if WORKER_MODE != "accurate" and (n % 10 == 0 or CI): poll_once()
        poll_ntfy(); n += 1
        try: WORKER_MODE != "accurate" and reformat_pending()
        except Exception as e: log("reformat error", e)
        if "--once" in sys.argv: break
        time.sleep(60)
