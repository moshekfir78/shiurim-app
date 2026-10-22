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

# The site's "וידאו" page (WP category 9) embeds YouTube lectures. Hand-checked: lectures only (launch evening, panels, films,
# conversations, Shabbat Salam, album launch, interviews, the 4-minute Pesach clip and the Talmud series "הסוגיא האהובה" are left out).
# Stored statically (id, verbatim YouTube title, duration, upload date, channel) because YouTube blocks yt-dlp on GitHub runners.
VIDEOS = [
    ("s1PtovhJPwE", "פרופסור שלום רוזנברג - עיון משותף במשנת הרב הנזיר", 3749, "2018-08-12", "מכון נזר דוד"),
    ("ofzNYOy4G_4", "פותחים שבוע - פרשת יתרו", 2725, "2020-02-27", "מכון ון ליר בירושלים"),
    ("KlBCz2wGg8Y", "פותחים שבוע - פרשת שמות - על הסבל האנושי הילד מול הפילוסוף", 4116, "2020-02-27", "מכון ון ליר בירושלים"),
    ("Ag8y7mJPGqU", "פרופ' שלום רוזנברג - האוניברסיטה העברית I על תורה העונשים I כנס תורת הרמב\"ם I מכללת אורות ישראל", 2967, "2017-06-04", "ערוץ חוק ומשפט - המשפט העברי"),
    ("0I-u0eaDwWc", "שלום רוזנברג: ליבוביץ וכשר - גבולותיה של האמונה", 1771, "2012-02-01", "leibowitzy"),
    ("2FjV3ZWTF1k", "כנס נחלים למחשבת ישראל ה 3- פרופסור שלום רוזנברג", 2388, "2018-07-13", "כנס נחלים"),
    ("4V4J457iVl0", "כנס נחלים הראשון למחשבת ישראל קיץ ה'תשע\"ו- הרצאת פרופ' שלום רוזנברג- עולם הבא", 2731, "2016-11-07", "כנס נחלים למחשבת ישראל"),
]

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
    for vid, t, dur, d, ch in VIDEOS:
        uid = "youtube:" + vid
        S[uid] = {"uid": uid, "source": SRC["id"], "sourceId": vid, "rav": "rosenberg", "title": t, "excerpt": ch, "tags": ["מחשבת ישראל"], "duration": dur,
                  "path": [{"id": "shalomrosenberg", "title": "אתר הרב שלום רוזנברג"}, {"id": "shalomrosenberg:וידאו", "title": "הרצאות וידאו"}],
                  "date": d + "T00:00:00+00:00", "audio": [], "youtube": vid, "pageUrl": "https://www.youtube.com/watch?v=" + vid}
    save_json(path, {"source": SRC, "shiurim": S})
    print("shalomrosenberg:", len(S), "lectures")

if __name__ == "__main__": run()
