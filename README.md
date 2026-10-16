# בית השיעורים — Torah shiurim aggregator (PWA)
- `./serve.sh` → http://localhost:8080 (PORT env to change)
- `./update.sh` → incremental import (latest lessons) + full-text fetch + rebuild
- `python3 importers/haravhendler.py full --content` → full recrawl
- `python3 build.py` → merge data/sources/*.json → public/data
Add a source: write importers/<name>.py that outputs data/sources/<name>.json
({"source":{id,name,site},"shiurim":{uid:{uid,source,sourceId,title,excerpt,contentHtml?,tags,path[{id,title}],date,audio[urls in fallback order],pageUrl}}}).
Titles are never trimmed or normalized.

## Sources (v2)
- data/ravs.json – ravs + YouTube config (own channels, scanned channels, searches, title/channel exclusions)
- importers/youtube.py (yt-dlp; no Shorts, min 15 min, title must name the rav for 3rd-party channels; `--prune` re-applies filters)
- importers/podcast.py + data/podcasts.json (RSS; Spotify shows are imported via their public RSS)
- importers/kby.py (ישיבת כרם ביבנה archive)
- build.py: tree = rav → source categories; cross-source duplicates (same normalized title) merged.
- `SKIP_YOUTUBE=1 ./update.sh` to skip the slow YouTube step.
- importers/ostlv.py (ישיבת אורות שאול, ostlv.co.il WP REST `lesson`/`rabbi`; slow, site rate-limits) → ostlv-granot/eldar; skips lessons whose YouTube id is already in youtube-<rav>.json

## Rule: playable media only
Only shiurim with playable media are included (audio file, YouTube video, Spotify/podcast player).
Text-only items (articles, written shiurim, records without audio) are never included.
Enforced globally in `build.py` (`has_media`, applied after cross-source dedupe), so every importer is covered.

## Topics, grouping, filters
- `topics.py`: conservative multi-label keyword rules over the title, source category path, and tags. Titles are read only and never changed. `build.py` stores the topic ids in `s.tp` and the taxonomy and counts in `index.topics`.
- The **נושאים** tab (`#/topics`, `#/topics/<id>`) browses topics across all ravs.
- Folders with more than 40 items are grouped by parasha, masechet, book, or holiday. When that would make more than 20 groups, they are grouped by top topic instead, then by the series name from the title, then "שונות".
- Filters are saved in the URL query (`?r=&t=&m=a|v&len=0..3&from=&to=&src=&sort=old`) and open in a mobile bottom sheet.

## Rule: Hebrew shiurim only
Non-Hebrew shiurim are never included. `build.py` (`is_non_hebrew`, applied after dedupe) drops titles that are mainly Latin script, with Latin letters more than 3× the Hebrew letters. It also drops items in English categories or sources (Hendler "English", Torah in Motion, Herzog/VBM English) unless the title is clearly Hebrew. Hebrew titles with a few Latin characters, and bilingual Hebrew/English titles, are kept.

## Dedupe (build.py `_dedupe`, same rav only)
Shiurim are merged when they share a YouTube id, Spotify id or normalized audio URL, or have the same normalized title.
- **Guards:**
  - Same-source merges need an identical title (for a shared media link) or a near-identical length (for a shared title).
  - Cross-source title merges need lengths within 3% or 90 s. If a length is missing, the title must be specific and unique in each source.
  - Groups never chain two items from the same source unless their titles match.
- **Kept copy:** prefer site, then podcast, then Spotify, then YouTube. It keeps the verbatim title and categories, gains missing YouTube/Spotify/audio/duration from the other copy, and lists it under `alsoAt`.

## Study area (public/study.js)
All data stays on the device (IndexedDB `shiurim-study` + localStorage); there is no server:
- own summary (editor, autosave, last 10 versions)
- import of txt/docx/pdf/srt/vtt
- a local corrected transcript (the original is kept)
- timestamped notes and the "my notes" page at `#/notes`
- Sefaria links for detected pesukim and dapim
- export to docx/PDF and sharing
- JSON backup/restore

Search includes your own notes and summaries.

## Google Drive sync (public/sync.js, public/config.js)
- Off until `public/config.js` has `googleClientId` (OAuth Web client, JS origin `https://orikfir10.github.io`). Then a "התחבר עם Google לסנכרון" box appears on #/notes.
- Scope `drive.appdata` only; one file `shiurim-sync.json` in the user's hidden appDataFolder. No server.
- Items: favs, pos, trReq, speed, rav (localStorage) + IndexedDB `study` records. Per-item last-write-wins by timestamp; removals are tombstones.
- Sync on open, ~4 s after changes, every 3 min while visible, and when the app is hidden. Tokens last ~1 h (no refresh token without a server); after that the box asks to reconnect with one tap.
