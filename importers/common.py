"""Shared helpers for importers: polite rate-limited JSON fetching with retries."""
import json, time, urllib.request, urllib.error, os, re, html

UA = "ShiurimAggregator/1.0 (personal study app)"

class Fetcher:
    def __init__(self, delay=0.7, retries=8):
        self.delay, self.retries, self._last = delay, retries, 0.0
    def get_json(self, url):
        for attempt in range(self.retries):
            wait = self.delay - (time.time() - self._last)
            if wait > 0: time.sleep(wait)
            self._last = time.time()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code in (425, 429, 500, 502, 503, 504):
                    time.sleep(min(60, 3 * (attempt + 1)))
                    continue
                raise
            except (urllib.error.URLError, TimeoutError):
                time.sleep(3 * (attempt + 1))
        raise RuntimeError(f"giving up on {url}")

def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f: return json.load(f)
    return default

def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)

ALLOWED = {"h1","h2","h3","h4","p","br","b","strong","i","em","u","ul","ol","li","blockquote","span","sup","sub","hr"}
def sanitize_html(s):
    """Very small whitelist sanitizer: keep allowed tags without attributes, drop everything else."""
    if not s: return ""
    s = re.sub(r"(?is)<(script|style|iframe|object)[^>]*>.*?</\1>", "", s)
    def tag(m):
        close, name = m.group(1), m.group(2).lower()
        return f"<{close}{name}>" if name in ALLOWED else ""
    return re.sub(r"<(/?)([a-zA-Z0-9]+)[^>]*>", tag, s)
