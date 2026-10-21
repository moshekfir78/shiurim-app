#!/usr/bin/env python3
"""Commit + push a CI job's data changes without ever overwriting data pushed to main while the job ran.

Usage: python3 ci_commit.py "commit message" PATH [PATH ...]

The job's base is HEAD when this runs (the commit the job checked out, or its own last push). For every file under
PATH that the job changed vs. base:
  - main did not touch it since base  -> the job's version is used;
  - main changed it too, JSON         -> 3-way merge (base / main / job): keys the job added or changed are applied
                                         on top of main's version, recursively; lists are unioned; when both sides
                                         changed the same value, main's (newer, pushed) value wins;
  - main changed it too, not JSON     -> main's version is kept (warning).
A file the job deleted is deleted only if main did not change it. The result is committed on top of the latest
origin/main and pushed with a plain push (never forced); if main moved again, the merge is redone (up to 8 times).
Afterwards the working tree is latest main + the job's changes, so a job that keeps running continues from there.
Generated output (public/data) is not committed; deploy jobs rebuild it from latest main.
"""
import json, os, subprocess, sys, time

def git(*a, check=True, inp=None):
    r = subprocess.run(["git", *a], capture_output=True, input=inp)
    if check and r.returncode: sys.exit(f"git {' '.join(a)} failed: {r.stderr.decode()[:400]}")
    return r

def blob(rev, path):
    r = git("cat-file", "blob", f"{rev}:{path}", check=False)
    return r.stdout if r.returncode == 0 else None

MISSING = object()

def merge(b, t, o):
    """3-way merge of JSON values: b base, t main (theirs), o job (ours); an absent key is MISSING."""
    if o == b or t == o: return t
    if t == b: return o
    if isinstance(t, dict) and isinstance(o, dict):
        bd = b if isinstance(b, dict) else {}
        out = {}
        for k in list(t) + [k for k in o if k not in t] + [k for k in bd if k not in t and k not in o]:
            m = merge(bd.get(k, MISSING), t.get(k, MISSING), o.get(k, MISSING))
            if m is not MISSING: out[k] = m
        return out
    if isinstance(t, list) and isinstance(o, list):                 # union, main's order first
        seen, out = set(), []
        for x in t + o:
            key = json.dumps(x, sort_keys=True, ensure_ascii=False)
            if key not in seen: seen.add(key); out.append(x)
        return out
    return t                                                        # both changed one value: newer pushed data wins

def dump_like(obj, sample):
    s = sample.decode("utf-8", "replace") if sample else ""
    if s.startswith("{\n") or s.startswith("[\n"):
        line2 = s.split("\n", 2)[1]
        ind = len(line2) - len(line2.lstrip(" "))
        txt = json.dumps(obj, ensure_ascii=False, indent=ind or 1)
    elif '":"' in s[:2000] or '","' in s[:2000]:
        txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    else:
        txt = json.dumps(obj, ensure_ascii=False)
    return (txt + ("\n" if s.endswith("\n") else "")).encode()

def main():
    msg, paths = sys.argv[1], sys.argv[2:] or ["data"]
    base = git("rev-parse", "HEAD").stdout.decode().strip()
    git("add", "-A", "--", *paths)
    changed = [p for p in git("diff", "--cached", "--name-only", "-z", base, "--", *paths).stdout.decode().split("\0") if p]
    if not changed: print("ci_commit: nothing to commit"); return
    ours = {p: (open(p, "rb").read() if os.path.exists(p) else None) for p in changed}
    bases = {p: blob(base, p) for p in changed}
    print(f"ci_commit: {len(changed)} changed file(s) vs {base[:7]}")
    for attempt in range(8):
        git("fetch", "-q", "origin", "main")
        head = git("rev-parse", "origin/main").stdout.decode().strip()
        git("reset", "-q", "--hard", head)                          # tree = latest main (untracked/ignored files stay)
        merged = kept = 0
        for p in changed:
            b, t, o = bases[p], blob(head, p), ours[p]
            if t == b: new = o                                       # main didn't touch it
            elif o == b or t == o: new = t
            elif p.endswith(".json") and t is not None and o is not None:
                try:
                    new = dump_like(merge(json.loads(b) if b is not None else MISSING, json.loads(t), json.loads(o)), t); merged += 1
                except ValueError:
                    new = t; kept += 1; print(f"::warning::ci_commit: {p} changed on main and is not valid JSON; kept main's version")
            elif o is None: new = t                                  # job deleted, main changed: keep main's
            else:
                new = t; kept += 1; print(f"::warning::ci_commit: {p} changed on main while the job ran; kept main's version")
            if new is None:
                if os.path.exists(p): os.remove(p)
            else:
                os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
                open(p, "wb").write(new)
        git("add", "-A", "--", *changed)
        if git("diff", "--cached", "--quiet", check=False).returncode == 0:
            print("ci_commit: nothing left after merging with main"); return
        git("commit", "-qm", msg)
        if git("push", "-q", "origin", "HEAD:main", check=False).returncode == 0:
            print(f"ci_commit: pushed on top of {head[:7]} ({merged} file(s) 3-way merged, {kept} kept from main)"); return
        print(f"ci_commit: push rejected (main moved), redoing merge ({attempt + 1})"); time.sleep(5 + 5 * attempt)
    sys.exit("ci_commit: could not push after 8 attempts")

if __name__ == "__main__":
    main()
