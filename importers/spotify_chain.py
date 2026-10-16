#!/usr/bin/env python3
"""Discover more episodes of a Spotify show by chaining public episode pages. Usage: spotify_chain.py SHOWID EP...; writes /tmp/chain-SHOWID.json (add ids to data/spotify.json extraEpisodes)."""
import re,json,time,urllib.request,sys
UA={'User-Agent':'Mozilla/5.0'};SHOW=sys.argv[1]
get=lambda u:urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read().decode()
seeds=sys.argv[2:]; seen={}; q=list(seeds); notshow=set()
while q:
    ep=q.pop(0)
    if ep in seen or ep in notshow: continue
    try:
        s=get(f'https://open.spotify.com/embed/episode/{ep}')
        e=json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',s,re.S).group(1))['props']['pageProps']['state']['data']['entity']
    except Exception as x: print('err',ep,x); continue
    if e.get('relatedEntityUri')!=f'spotify:show:{SHOW}': notshow.add(ep); continue
    seen[ep]=(e['title'],e['releaseDate']['isoString'])
    time.sleep(0.5)
    page=get(f'https://open.spotify.com/episode/{ep}')
    q+= [x for x in dict.fromkeys(re.findall(r'/episode/([A-Za-z0-9]{22})',page)) if x not in seen]
    time.sleep(0.5)
print(len(seen)); json.dump(seen,open(f'/tmp/chain-{SHOW}.json','w'),ensure_ascii=False)
for k,v in sorted(seen.items(),key=lambda x:x[1][1]): print(k,v[1][:10],repr(v[0]))
