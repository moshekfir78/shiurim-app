#!/usr/bin/env python3
"""אתר פרופ' הרב שלום רוזנברג (shalomrosenberg.com) — the "שיעורי אודיו" page: recorded lectures (mp3 on the site).
In the "ראיונות ותוכניות רדיו" section only radio lectures are kept; anything marked ראיון (interview) is skipped, as are Talmud lectures (no Gemara) and
non-Hebrew titles. Titles verbatim. Writes data/sources/shalomrosenberg-rosenberg.json"""
import sys, os, re, json, html, subprocess, time, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from common import load_json, save_json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PAGE = "https://www.shalomrosenberg.com/%d7%a9%d7%99%d7%a2%d7%95%d7%a8%d7%99-%d7%90%d7%95%d7%93%d7%99%d7%95/"
UA = "Mozilla/5.0 (ShiurimAggregator personal study app)"
RADIO_SECTION = re.compile(r"ראיונ|רדיו")
INTERVIEW = re.compile(r"ראיון|ראיונ")
GEMARA = re.compile(r"תלמוד|גמרא|מסכת|סוגי|בבלי|ירושלמי|הלכות ")
SRC = {"id": "shalomrosenberg-rosenberg", "name": "אתר הרב שלום רוזנברג", "site": "https://www.shalomrosenberg.com", "rav": "rosenberg"}

def get(url):
    for a in range(4):
        r = subprocess.run(["curl", "-sS", "-L", "-m", "60", "-A", UA, url], capture_output=True)
        if r.returncode == 0 and r.stdout: return r.stdout.decode("utf-8", "replace")
        time.sleep(5 * (a + 1))
    return ""

def run():
    path = os.path.join(ROOT, "data", "sources", "shalomrosenberg-rosenberg.json")
    old = load_json(path, {"shiurim": {}})["shiurim"]
    page = get(PAGE)
    if not page: print("shalomrosenberg: page unavailable, keeping", len(old)); return
    S, sec = {}, ""
    for m in re.finditer(r'<h2[^>]*>(.*?)</h2>|<a href="(https://[^"]+?\.mp3)"[^>]*>(.*?)</a>', page, re.S):
        if m.group(1): sec = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip(); continue
        title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", m.group(3)))).strip()   # verbatim
        fname = urllib.parse.unquote(m.group(2)).rsplit("/", 1)[1]
        radio = bool(RADIO_SECTION.search(sec))
        if (radio and (INTERVIEW.search(title) or INTERVIEW.search(fname))) or not re.search(r"[\u0590-\u05FF]", title) or GEMARA.search(title): continue
        url = urllib.parse.quote(urllib.parse.unquote(m.group(2)), safe=":/")
        up = re.search(r"/uploads/(\d{4})/(\d{2})/", url)
        uid = "shalomrosenberg:" + re.sub(r"\.mp3$", "", urllib.parse.unquote(url.rsplit("/", 1)[1]))[:80]
        S[uid] = old.get(uid) or {"uid": uid, "source": SRC["id"], "sourceId": uid.split(":", 1)[1], "rav": "rosenberg", "title": title,
            "tags": ["מחשבת ישראל"], "path": [{"id": "shalomrosenberg", "title": "אתר הרב שלום רוזנברג"}, ({"id": "shalomrosenberg:רדיו", "title": "הרצאות ברדיו"} if radio else {"id": "shalomrosenberg:הרצאות", "title": "הרצאות מוקלטות"})],
            "date": f"{up.group(1)}-{up.group(2)}-01T00:00:00+00:00" if up else None, "audio": [url], "pageUrl": urllib.parse.unquote(PAGE)}
    save_json(path, {"source": SRC, "shiurim": S})
    print("shalomrosenberg:", len(S), "lectures")

if __name__ == "__main__": run()
