#!/usr/bin/env python3
"""One-off: Rav Michael Avraham's own Spotify shows (collected via browser into /workspace/avraham_spotify_episodes.json)
-> data/sources/spotify-avraham.json, only episodes not already in his RSS/YouTube sources."""
import json, re, glob, os
from datetime import datetime
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..")
SHOWS={"1GSYVD0fa12m7cDLrwI9mB","2OYA8nQcMcq6vJJnQmTe4Q","2D1DiXuWJVPeksBIKhm45x"}
EXCL=json.load(open(f"{ROOT}/data/podcasts.json"))
EXCL=next(p for p in EXCL if p["id"]=="avraham-podhome")["titleExclude"]+["שיר","קליפ","הקדמה לפודקאסט","מחלוקת עם"]
def norm(t):
    t=re.sub(r"[-–—|:,.\"'״׳()\[\]!?]"," ",t); t=re.sub(r"הרב מיכאל אברהם|הרב מיכי|מיכי אברהם"," ",t)
    return " ".join(t.split())
def dur(s):
    h=re.search(r"(\d+) hr",s or ""); m=re.search(r"(\d+) min",s or ""); c=re.search(r"(\d+) sec",s or "")
    return (int(h.group(1))*3600 if h else 0)+(int(m.group(1))*60 if m else 0)+(int(c.group(1)) if c else 0)
def date(s):
    for f in ("%b %d, %Y","%b %Y"):
        try: return datetime.strptime(s,f).strftime("%Y-%m-%dT00:00:00Z")
        except: pass
have=set()
for f in glob.glob(f"{ROOT}/data/sources/*.json"):
    if f.endswith("spotify-avraham.json"): continue
    s=json.load(open(f))
    for v in s.get("shiurim",{}).values():
        if v.get("rav")=="avraham": have.add(norm(v["title"]))
src={"id":"spotify-avraham","name":"Spotify · שיעורי הרב מיכאל אברהם","site":"https://open.spotify.com/show/2OYA8nQcMcq6vJJnQmTe4Q","rav":"avraham"}
out={};stats={}
for e in json.load(open("/workspace/avraham_spotify_episodes.json")):
    if e["showId"] not in SHOWS: continue
    t=e["title"]; n=norm(t); d=dur(e.get("duration"))
    k=("dup" if n in have else "excl" if any(x in t for x in EXCL) else "short" if d<900
       else "nohe" if not re.search(r"[א-ת]",t) else "ok")
    stats[k]=stats.get(k,0)+1
    if k!="ok": continue
    have.add(n); uid=f"spotify:{e['id']}"
    out[uid]={"uid":uid,"source":src["id"],"sourceId":e["id"],"rav":"avraham","title":t,"excerpt":"","tags":[],"duration":d,
      "path":[{"id":"pod:spotify-avraham","title":"פודקאסט · שיעורי הרב מיכאל אברהם (Spotify)"}],
      "date":date(e.get("date","")),"audio":[],"spotify":e["id"],"spotifyVideo":False,"pageUrl":e["url"]}
json.dump({"source":src,"shiurim":out},open(f"{ROOT}/data/sources/spotify-avraham.json","w"),ensure_ascii=False,indent=1)
print(stats,len(out))
