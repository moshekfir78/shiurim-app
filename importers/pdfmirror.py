#!/usr/bin/env python3
"""Copies of the PDF files of written shiurim, so the app can show them INSIDE the app (pdf.js) - the publishers' servers
send no CORS headers, so a browser page cannot load their PDFs directly. The copies live in the repo's separate `pdf`
branch (never part of the site / main checkout) as p/<content-id>.pdf and are read by the app from
raw.githubusercontent.com (CORS *). Only files that are actually needed are copied:
  --requests  PDFs requested by the app (ntfy topic in data/ntfy_pdf_topic.txt) when a reader opens a shiur whose copy is
              missing - run every few minutes by .github/workflows/pdf-on-demand.yml
  --all       written shiurim's PDFs up to PDF_BULK_MB (1.5MB) that are still missing (nightly, after build.py)
  --peek      print pending=<n> for the workflow
Needs public/data/index.json (python3 build.py)."""
import sys, os, json, subprocess, time, urllib.request
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TOPIC = open(os.path.join(ROOT, "data", "ntfy_pdf_topic.txt")).read().strip()
STATE = os.path.join(ROOT, "data", "pdfreq_state.json")
WT = "/tmp/pdfbranch"; MAXB = 25 << 20; UA = "Mozilla/5.0 (ShiurimAggregator personal study app)"

def sh(*a, **k): return subprocess.run(a, check=k.pop("check", True), capture_output=True, text=True, **k)
def ntfy(since):
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"https://ntfy.sh/{TOPIC}/json?poll=1&since={since}", headers={"User-Agent": UA}), timeout=30).read().decode()
        return [json.loads(l) for l in r.splitlines() if l.strip()]
    except Exception as e: print("ntfy error", e); return []

def worktree():
    if os.path.isdir(WT): return
    if sh("git", "-C", ROOT, "fetch", "-q", "--depth", "1", "origin", "pdf", check=False).returncode == 0:
        sh("git", "-C", ROOT, "worktree", "add", "-q", "-f", WT, "FETCH_HEAD"); sh("git", "-C", WT, "checkout", "-q", "-B", "pdf")
    else:
        sh("git", "-C", ROOT, "worktree", "add", "-q", "--detach", WT); sh("git", "-C", WT, "checkout", "-q", "--orphan", "pdf")
        sh("git", "-C", WT, "rm", "-rqf", "."); os.makedirs(os.path.join(WT, "p"), exist_ok=True)
        open(os.path.join(WT, "README.md"), "w").write("Copies of the PDF files of written shiurim, read by the app (pdf.js) because the publishers send no CORS headers.\n")
    os.makedirs(os.path.join(WT, "p"), exist_ok=True)

def fetch(url, dst, maxb=MAXB):
    r = subprocess.run(["curl", "-sSL", "-m", "120", "-A", UA, "--max-filesize", str(maxb), "-o", dst, url], capture_output=True)
    if os.path.exists(dst) and os.path.getsize(dst) > maxb: os.remove(dst)
    ok = r.returncode == 0 and os.path.exists(dst) and open(dst, "rb").read(4) == b"%PDF"
    if not ok and os.path.exists(dst): os.remove(dst)
    return ok

def run(want, budget, maxb=MAXB):
    worktree(); t0 = time.time(); added = 0
    for c, url in want:
        dst = os.path.join(WT, "p", c + ".pdf")
        if os.path.exists(dst): continue
        if time.time() - t0 > budget: print("time budget reached"); break
        if fetch(url, dst, maxb): added += 1
        else: print("  failed", url[:120])
    if added:
        sh("git", "-C", WT, "add", "-A")
        sh("git", "-C", WT, "-c", "user.name=shiurim-bot", "-c", "user.email=orikfir10@users.noreply.github.com", "commit", "-qm", f"pdf copies (+{added})")
        for _ in range(3):
            if sh("git", "-C", WT, "push", "-q", "origin", "pdf", check=False).returncode == 0: break
            sh("git", "-C", WT, "pull", "-q", "--rebase", "origin", "pdf", check=False)
    print("pdf copies added:", added, "| total:", len(os.listdir(os.path.join(WT, "p"))))

if __name__ == "__main__":
    mode = (sys.argv[1:] or ["--all"])[0]
    st = json.load(open(STATE)) if os.path.exists(STATE) else {"since": "12h"}
    if mode == "--peek":
        msgs = ntfy(st["since"]); print(f"pending={len(msgs)}")
        if os.environ.get("GITHUB_OUTPUT"): open(os.environ["GITHUB_OUTPUT"], "a").write(f"pending={len(msgs)}\n")
        sys.exit(0)
    idx = json.load(open(os.path.join(ROOT, "public", "data", "index.json"), encoding="utf-8"))
    docs = {s["c"]: s["doc"] for s in idx["shiurim"] if s.get("txt") and s.get("doc")}
    byuid = {s["uid"]: s["c"] for s in idx["shiurim"]}
    if mode == "--requests":
        msgs = ntfy(st["since"])
        want = []
        for m in msgs:
            c = byuid.get((m.get("message") or "").strip())
            if c in docs and (c, docs[c]) not in want: want.append((c, docs[c]))
        run(want, 600)
        if msgs: st["since"] = msgs[-1]["id"]
        json.dump(st, open(STATE, "w"))
    else:
        # nightly: only the small files (most are ~100KB) so they open at once; big ones (scanned books, up to 25MB)
        # are copied only when someone actually opens them, keeping the branch small.
        bulk = int(float(os.environ.get("PDF_BULK_MB", "1.5")) * (1 << 20))
        size = json.load(open(os.path.join(ROOT, "data", "text_pdf_cache.json"))) if os.path.exists(os.path.join(ROOT, "data", "text_pdf_cache.json")) else {}
        want = [(c, u) for c, u in sorted(docs.items()) if (size.get(u) or {}).get("b", 0) <= bulk]
        run(want, int(os.environ.get("PDF_MINUTES", "40")) * 60, bulk)
