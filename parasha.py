"""Parashat-hashavua classifier. classify(text_fields, cat_titles) -> sorted list of parasha indices (0..53)."""
import re
# (canonical name, chumash, spelling variants, safe_bare) — safe_bare: distinctive enough to match without "פרשת" context
P = [
 ("בראשית","בראשית",["בראשית"],False),("נח","בראשית",["נח","נוח"],False),("לך לך","בראשית",["לך לך","לך-לך","לך־לך"],True),
 ("וירא","בראשית",["וירא"],False),("חיי שרה","בראשית",["חיי שרה"],False),("תולדות","בראשית",["תולדות"],False),
 ("ויצא","בראשית",["ויצא"],False),("וישלח","בראשית",["וישלח"],True),("וישב","בראשית",["וישב"],True),
 ("מקץ","בראשית",["מקץ"],True),("ויגש","בראשית",["ויגש"],True),("ויחי","בראשית",["ויחי"],True),
 ("שמות","שמות",["שמות"],False),("וארא","שמות",["וארא"],True),("בא","שמות",["בא"],False),("בשלח","שמות",["בשלח"],True),
 ("יתרו","שמות",["יתרו"],False),("משפטים","שמות",["משפטים"],False),("תרומה","שמות",["תרומה"],False),
 ("תצוה","שמות",["תצוה","תצווה"],True),("כי תשא","שמות",["כי תשא","כי-תשא","כי תישא"],True),("ויקהל","שמות",["ויקהל"],True),
 ("פקודי","שמות",["פקודי"],True),
 ("ויקרא","ויקרא",["ויקרא"],False),("צו","ויקרא",["צו"],False),("שמיני","ויקרא",["שמיני"],False),("תזריע","ויקרא",["תזריע"],True),
 ("מצורע","ויקרא",["מצורע","מצרע"],False),("אחרי מות","ויקרא",["אחרי מות","אחרי-מות","אחרי־מות"],True),("קדושים","ויקרא",["קדושים","קדשים"],False),
 ("אמור","ויקרא",["אמור"],False),("בהר","ויקרא",["בהר"],False),("בחוקותי","ויקרא",["בחוקותי","בחקתי","בחוקתי"],True),
 ("במדבר","במדבר",["במדבר"],False),("נשא","במדבר",["נשא","נשוא"],False),("בהעלותך","במדבר",["בהעלותך","בהעלתך"],True),
 ("שלח","במדבר",["שלח לך","שלח"],False),("קרח","במדבר",["קרח","קורח"],False),("חקת","במדבר",["חקת","חוקת"],False),
 ("בלק","במדבר",["בלק"],False),("פינחס","במדבר",["פינחס","פנחס"],False),("מטות","במדבר",["מטות"],True),("מסעי","במדבר",["מסעי"],True),
 ("דברים","דברים",["דברים"],False),("ואתחנן","דברים",["ואתחנן"],True),("עקב","דברים",["עקב"],False),("ראה","דברים",["ראה"],False),
 ("שופטים","דברים",["שופטים"],False),("כי תצא","דברים",["כי תצא","כי תצאו"],False),("כי תבוא","דברים",["כי תבוא","כי תבא"],True),
 ("נצבים","דברים",["נצבים","ניצבים"],True),("וילך","דברים",["וילך"],False),("האזינו","דברים",["האזינו"],True),
 ("וזאת הברכה","דברים",["וזאת הברכה"],True),
]
NAMES = [p[0] for p in P]
CTX = r"(?:פרשת|לפרשת|בפרשת|פרשיות|לפרשיות|פרשה|פר'|פ')"
def _alt(vs): return "(?:" + "|".join(re.escape(v).replace(r"\ ", r"[\s\-־]+") for v in sorted(vs, key=len, reverse=True)) + ")"
NB = r"(?<![א-ת])"; NA = r"(?![א-ת])"
# a list of parasha names joined by "-" / "ו" right after the context word (e.g. "פרשיות תזריע מצורע", "לפרשת בהר-בחוקותי")
COMBINED = [("ויקהל","פקודי"),("תזריע","מצורע"),("אחרי מות","קדושים"),("בהר","בחוקותי"),("חקת","בלק"),("מטות","מסעי"),("נצבים","וילך")]
IDX = {p[0]: i for i, p in enumerate(P)}
# second parasha of a combined pair, directly after the first (e.g. "פרשיות תזריע מצורע", "לפרשת בהר-בחוקותי")
PAIR_RE = {IDX[b]: re.compile(CTX + r"[\s\-:\"']*ו?" + _alt(P[IDX[a]][2]) + r"[\s\-־]{1,3}ו?" + _alt(P[IDX[b]][2]) + NA) for a, b in COMBINED}
CTX1_RE = [re.compile(CTX + r"[\s\-:\"']*ו?" + _alt(p[2]) + NA) for p in P]
START_RE = [re.compile(r"^\s*" + _alt(p[2]) + r"(?:\s|$|[-–,:])") for p in P]
BARE_RE = [re.compile(NB + "ו?" + _alt(p[2]) + NA) if p[3] else None for p in P]

def classify(texts, cat_titles=()):
    t = " ".join(x for x in texts if x)
    in_parasha_cat = any(c == "פרשת השבוע" for c in cat_titles)
    hits = set()
    for i, p in enumerate(P):
        if any(c == p[0] or c in p[2] for c in cat_titles) and p[0] not in ("בראשית","שמות","ויקרא","במדבר","דברים"):
            hits.add(i)          # a category literally named after the parasha
        elif CTX1_RE[i].search(t) or (i in PAIR_RE and PAIR_RE[i].search(t)):
            hits.add(i)
        elif in_parasha_cat and texts and START_RE[i].match(texts[0] or ""):
            hits.add(i)          # inside the "פרשת השבוע" tree, a title starting with the parasha name
        elif BARE_RE[i] and BARE_RE[i].search(t):
            hits.add(i)
    return sorted(hits)
