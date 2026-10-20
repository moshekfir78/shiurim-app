#!/usr/bin/env python3
"""Deterministic, conservative cleanup of Hebrew transcripts (the same rules are mirrored in public/personal.js -> trClean).
Removes: stutters ("ה-ה-הוא" -> "הוא"), pure filler sounds (אה, אממ, הממ...), and needless immediate repetition of a
word ("זה זה זה" -> "זה") or of an identical 2-4 word phrase ("זה הטיפוס, זה הטיפוס של" -> "זה הטיפוס של").
Never touches: quote lines ('>'), text inside "..." (quoted sources / reported speech), **bold** tokens,
whitelisted intentional repetitions (biblical / idiomatic), a single word repeated just twice across a comma
("הוא, הוא עושה", "כן, כן?"), or polysyndeton ("ירד וירד"). Idempotent."""
import re

KEEP = {  # intentional repetitions that must stay (core words, space separated)
    "לך לך", "קדוש קדוש", "קדוש קדוש קדוש", "צדק צדק", "אברהם אברהם", "משה משה", "יעקב יעקב", "שמואל שמואל",
    "נחמו נחמו", "עורי עורי", "אלי אלי", "ה' ה'", "ה׳ ה׳", "אבי אבי", "בני בני", "ארץ ארץ", "ארץ ארץ ארץ", "שלום שלום",
    "איש איש", "שנים שנים", "שניים שניים", "שבעה שבעה", "מעט מעט", "לאט לאט", "אט אט", "מאד מאד", "מאוד מאוד",
    "סוף סוף", "בין בין", "צעד צעד", "אחד אחד", "יום יום", "שנה שנה", "דור דור", "טיפה טיפה", "קמעא קמעא",
    "עמוק עמוק", "עמק עמק", "רע רע", "הוי הוי", "אמן אמן", "שבוע שבוע", "חודש חודש", "פעם פעם", "למעלה למעלה",
    "מטה מטה", "יחד יחד", "זוג זוג", "איי איי איי", "אוי אוי אוי", "נורא נורא", "המון המון", "ממש ממש", "הרבה הרבה",
    "אותו אותו", "אותה אותה", "אותם אותם", "אותן אותן",
}
FILLER = re.compile(r"^(?:א+ה+|א+מ+|ה+מ+|מ{2,}|אה+מ+|אֶה)$")
PUNCT = ".,;:!?()[]{}…–—\"״«»-*"
QCH = "\"״«»“”"
NIQQUD = re.compile(r"[\u0591-\u05C7]")
STUTTER = re.compile(r"(?<![\w\-־])(([א-ת])-(?:\2-)*)(?=\2[א-ת])|(?<![\w\-־])(([א-ת]{2,4})-(?:\4-)+)(?=\4[א-ת])")

def core(tok): return NIQQUD.sub("", tok.strip(PUNCT + "“”"))
def _tail(tok):
    c = core(tok); return tok[tok.rfind(c) + len(c):] if c else tok

def _quoted(toks):
    """mask of tokens that sit inside "..." spans"""
    m = []; inq = False
    for t in toks:
        start = t[:1] in QCH or t[:2] in ("(\"", "(״")
        end = re.search(r"[\"״»”][.,;:!?)\]…]*$", t) is not None and len(core(t)) > 0 and not re.search(r"[א-ת][\"״][א-ת]$", t.rstrip(".,;:!?)…"))
        if start: inq = True
        m.append(inq)
        if end and inq and not (start and len(t) < 2): inq = False
    return m

def clean_text(t):
    for _ in range(4):
        c = _clean1(t)
        if c == t: return t
        t = c
    return t

def _clean1(t):
    if not t or not t.strip(): return t
    if t.lstrip().startswith(">"): return t          # read-out source text: never touched
    t2 = STUTTER.sub("", t)
    toks = [x for x in t2.split(" ") if x != ""]
    q = _quoted(toks); out = []
    for i, tok in enumerate(toks):
        c = core(tok); nxt = core(toks[i + 1]) if i + 1 < len(toks) else ""
        if c and FILLER.match(c) and not q[i] and "*" not in tok and tok.rstrip()[-1:] not in "!?" \
                and not (c == "אהה" and (nxt.startswith("ה") or nxt.startswith("אד") or nxt.startswith("אל"))):
            if tok.rstrip()[-1:] in ".:" and out and out[-1][-1:] not in ".?!:,": out[-1] += tok.rstrip()[-1]
            continue
        out.append(tok)
    toks = out; changed = True
    while changed:
        changed = False
        for n in (1, 2, 3, 4):
            q = _quoted(toks); i = 0; res = []; rq = []
            while i < len(toks):
                ph = [core(x) for x in toks[i:i + n]]
                if len(ph) == n and all(ph) and not any(q[i:i + 2 * n]) and not any("*" in x for x in toks[i:i + 2 * n]):
                    inner = lambda k: all(_tail(x) == "" and x[:1] not in QCH + "([" for x in toks[k:k + n - 1])   # phrase must be contiguous
                    j = i + n; reps = 1; seps = []
                    while inner(i) and [core(x) for x in toks[j:j + n]] == ph and inner(j) and not any(q[j:j + n]) and not any("*" in x for x in toks[j:j + n]) \
                            and re.fullmatch(r"[,…\-–—]*|\.\.\.", _tail(toks[j - 1])) and toks[j][:1] not in QCH + "([":
                        seps.append(_tail(toks[j - 1])); j += n; reps += 1
                    ok = reps > 1 and " ".join(ph * reps) not in KEEP and " ".join(ph * 2) not in KEEP and not (n == 1 and ph[0].isdigit())
                    if ok and n == 1 and reps == 2 and any(seps): ok = False                      # "הוא, הוא עושה" / "כן, כן?"
                    if ok and n > 1 and len(set(ph)) == 1: ok = False                                  # a single-word run: handled by n == 1
                    if ok and ph[0].startswith("ו") and i >= n and [core(x) for x in toks[i - n:i]] in ([ph[0][1:]] + ph[1:], ph): ok = False   # ירד וירד וירד
                    if ok and n == 1 and len(ph[0]) == 1: ok = False
                    if ok and n > 1 and any(x.startswith("ו") and x[1:] in [core(y) for y in toks[max(0, i - n):i + n]] for x in ph): ok = False  # ונותנים לו ונותנים
                    if reps > 1 and not ok:
                        res.extend(toks[i:j]); i = j; continue                                  # keep an intentional run whole
                    if ok:
                        first = toks[i]; last = toks[j - n:j]; lead = first[:len(first) - len(first.lstrip(PUNCT))]
                        res.extend([lead + last[0].lstrip(PUNCT)] + last[1:]); i = j; changed = True; continue
                res.append(toks[i]); i += 1
            toks = res
    while toks and not core(toks[0]) and re.fullmatch(r"[.,;:…]+", toks[0]): toks.pop(0)          # orphan punctuation left by a removed filler
    toks = [x for k, x in enumerate(toks) if not (k and re.fullmatch(r"[.,;:]+", x) and re.search(r"[.,;:?!…]$", toks[k - 1]))]
    s = " ".join(toks)
    if s == " ".join(t.split(" ")).strip() and t2 == t: return t
    return re.sub(r" {2,}", " ", s).strip()

def clean_segments(segs):
    out = [dict(g, t=clean_text(g.get("t", ""))) for g in segs or []]
    return [g for g in out if (g.get("t") or "").strip()] or out

if __name__ == "__main__":
    import sys
    for line in sys.stdin: print(clean_text(line.rstrip("\n")))
