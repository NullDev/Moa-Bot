import re
import sys
import json
import math
import random
import sqlite3
import os
from collections import defaultdict, deque, Counter
from difflib import get_close_matches
from typing import List, Optional, Dict, Tuple
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.metrics.pairwise import cosine_similarity

# ========================= #
# = Copyright (c) NullDev = #
# ========================= #

_BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../data")
DB_PATH = os.path.join(_BASE, "brain.sqlite")
EMOJI_PATH = os.path.join(_BASE, "emojis.json")

class EmojiResolver:
    def __init__(self, path: str = EMOJI_PATH):
        with open(path, encoding="utf-8") as f:
            self._map = json.load(f) # {":name:": "<a:name:id>"}
        # strip colons for fuzzy lookup
        self._names = [k.strip(":") for k in self._map]

    def resolve(self, text: str) -> str:
        def replace(m):
            token = m.group(0) # e.g. ":cryingcat:"
            name = m.group(1)  # e.g. "cryingcat"
            # exact match
            if token in self._map:
                return self._map[token]
            # fuzzy match (cutoff 0.6 - close enough for short names)
            close = get_close_matches(name, self._names, n=1, cutoff=0.6)
            if close:
                return self._map[f":{close[0]}:"]
            # no match - drop it
            return ""
        return re.sub(r":([A-Za-z0-9_]+):", replace, text).strip()

def normalize(text: str) -> str:
    text = (text or "").lower().strip()      # lowercase and trim
    text = re.sub(r"<@!?\d+>", "", text)     # remove Discord mentions
    text = re.sub(r"<a?:\w+:\d+>", "", text) # remove custom emojis
    text = re.sub(r"https?://\S+", "", text) # remove URLs
    text = re.sub(r"\s+", " ", text).strip() # collapse whitespace
    return text

def tokenize(text: str) -> List[str]:
    return normalize(text).split()

def is_question(text: str) -> bool:
    t = normalize(text)
    words = set(t.split())
    return "?" in (text or "") or any(w in words for w in [
        "why", "how", "who", "where", "when", "what", "which",
        "whom", "whose", "huh", "wut", "wat", "can", "could",
        "would", "should", "do", "does", "did", "is", "are",
    ])

def lexical_overlap(a: str, b: str) -> float:
    aa = set(tokenize(a))
    bb = set(tokenize(b))
    if not aa or not bb:
        return 0.0
    return len(aa & bb) / len(aa | bb)

def looks_generic(text: str) -> bool:
    toks = tokenize(text)
    generic = {
        "ye", "yea", "yeah", "yes", "nah", "no", "lol", "kk",
        "okay", "k", "xd", "lmao", "moa", "hehe", "fr", "real",
        "true", "fair", "crazy", "wild",
    }
    return len(toks) <= 2 and all(tok in generic for tok in toks)

def looks_math(text: str) -> bool:
    t = normalize(text)
    if not t:
        return False
    math_words = {
        "integral", "derivative", "limit", "prove", "proof", "sum", "product",
        "factor", "solve", "equation", "theorem", "lemma", "matrix", "vector",
        "eigen", "series", "sequence", "prime", "mod", "modulo", "graph",
        "function", "domain", "range", "log", "ln", "sin", "cos", "tan",
        "dx", "dy", "sqrt",
    }
    if any(w in t.split() for w in math_words):
        return True
    if re.search(r"[\d=+\-*/^<>()[\]{}]|\\[a-zA-Z]+", text or ""):
        return True
    return False

def looks_uncertain_reply(text: str) -> bool:
    t = normalize(text)
    if not t: return False
    markers = [
        "idk", "i dont know", "i don't know", "maybe", "probably",
        "bro what", "what", "huh", "wtf", "no clue", "unsure",
        "confused", "uh", "hmmm", "i think", "2 maybe",
    ]
    return any(m in t for m in markers)

class MarkovBrain:
    def __init__(self):
        self.trigrams: Dict[Tuple[str, str], List[str]] = defaultdict(list)
        self.bigrams: Dict[str, List[str]] = defaultdict(list)
        self.starters: List[Tuple[str, ...]] = []

    def train(self, messages: List[str]):
        self.trigrams.clear()
        self.bigrams.clear()
        self.starters.clear()
        for msg in messages:
            words = tokenize(msg)
            if not words: continue
            if len(words) >= 2: self.starters.append((words[0], words[1]))
            else: self.starters.append((words[0],))
            for i in range(len(words)):
                if i + 2 < len(words):
                    self.trigrams[(words[i], words[i + 1])].append(words[i + 2])
                if i + 1 < len(words):
                    self.bigrams[words[i]].append(words[i + 1])

    def generate(self, seed: str = "", max_words: int = 20) -> str:
        words = tokenize(seed)
        result: List[str] = []
        if len(words) >= 2 and (words[-2], words[-1]) in self.trigrams:
            result = [words[-2], words[-1]]
        elif len(words) >= 1 and words[-1] in self.bigrams:
            result = [words[-1]]
        elif self.starters:
            result = list(random.choice(self.starters))
        else:
            return ""
        while len(result) < max_words:
            if len(result) >= 2 and (result[-2], result[-1]) in self.trigrams:
                nxt = random.choice(self.trigrams[(result[-2], result[-1])])
            elif result[-1] in self.bigrams:
                nxt = random.choice(self.bigrams[result[-1]])
            else:
                break
            if len(result) >= 3 and nxt == result[-1] == result[-2]:
                break
            result.append(nxt)
            if len(result) >= 5 and random.random() < 0.22:
                break
        return " ".join(result).strip()

    def continue_from(self, prefix: str, extra_words: int = 8) -> str:
        base = tokenize(prefix)
        if not base:
            return ""
        result = base[:]
        while len(result) < len(base) + extra_words:
            if len(result) >= 2 and (result[-2], result[-1]) in self.trigrams:
                nxt = random.choice(self.trigrams[(result[-2], result[-1])])
            elif result[-1] in self.bigrams:
                nxt = random.choice(self.bigrams[result[-1]])
            else:
                break
            if nxt in result[-4:]:
                break
            result.append(nxt)
            if len(result) >= len(base) + 3 and random.random() < 0.35:
                break
        return " ".join(result).strip()

class RetrievalBrain:
    def __init__(self):
        self.keys: List[str] = []
        self.replies: List[str] = []
        self.reply_norms: List[str] = []
        self.reply_freq: Counter = Counter()
        self.vectorizer: Optional[TfidfVectorizer] = None
        self.matrix = None

    def train(self, keys: List[str], replies: List[str]):
        cleaned = []
        for k, r in zip(keys, replies):
            nk = normalize(k)
            nr = normalize(r)
            if nk and nr:
                cleaned.append((nk, r, nr))
        if not cleaned:
            self.keys, self.replies, self.reply_norms = [], [], []
            self.reply_freq = Counter()
            self.vectorizer = None
            self.matrix = None
            return
        self.keys = [k for k, _, _ in cleaned]
        self.replies = [r for _, r, _ in cleaned]
        self.reply_norms = [nr for _, _, nr in cleaned]
        self.reply_freq = Counter(self.reply_norms)
        self.vectorizer = FeatureUnion([
            ("word", TfidfVectorizer(
                analyzer="word",
                ngram_range=(1, 2),
                min_df=2,
                sublinear_tf=True,
            )),
            ("char", TfidfVectorizer(
                analyzer="char_wb",
                ngram_range=(3, 5),
                min_df=1,
                sublinear_tf=True,
            )),
        ])
        self.matrix = self.vectorizer.fit_transform(self.keys)

    def _query_sims(self, text: str) -> np.ndarray:
        if self.vectorizer is None or self.matrix is None or not normalize(text):
            return np.array([])
        vec = self.vectorizer.transform([normalize(text)])
        return cosine_similarity(vec, self.matrix).flatten()

    def top_candidates(self, text: str, context: Optional[List[str]] = None, limit: int = 30) -> List[dict]:
        if self.vectorizer is None or self.matrix is None:
            return []
        context = context or []
        q0 = normalize(text)
        if not q0:
            return []
        sims = self._query_sims(q0)
        if sims.size == 0:
            return []
        # weighted multi-query instead of one mushy concatenated blob
        if context:
            prev1 = normalize(context[0]) if len(context) >= 1 else ""
            prev2 = normalize(context[1]) if len(context) >= 2 else ""
            if prev1:
                q1 = f"{prev1} {q0}".strip()
                s1 = self._query_sims(q1)
                if s1.size == sims.size:
                    sims = (sims * 0.80) + (s1 * 0.20)
            if prev2 and prev1:
                q2 = f"{prev2} {prev1} {q0}".strip()
                s2 = self._query_sims(q2)
                if s2.size == sims.size:
                    sims = (sims * 0.95) + (s2 * 0.05)
        order = np.argsort(sims)[::-1][:limit]
        out = []
        for i in order:
            if sims[i] <= 0:
                continue
            out.append({
                "parent": self.keys[i],
                "reply": self.replies[i],
                "reply_norm": self.reply_norms[i],
                "sim": float(sims[i]),
                "freq": self.reply_freq[self.reply_norms[i]],
            })
        return out

class MoaBot:
    def __init__(self, db_path: str = DB_PATH):
        self.retrieval = RetrievalBrain()
        self.markov = MarkovBrain()
        self.emojis = EmojiResolver()
        self._recent_raw: deque = deque(maxlen=8)
        self._recent_norm: deque = deque(maxlen=8)
        self._fallback_replies: List[str] = []
        self._load(db_path)

    def _load(self, db_path: str):
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT parentKey, reply FROM pairs WHERE parentKey != '' AND reply != ''")
        rows = c.fetchall()
        keys, replies = zip(*rows) if rows else ([], [])
        print(f"[brain] loading {len(keys)} pairs for retrieval…", file=sys.stderr)
        self.retrieval.train(list(keys), list(replies))
        c.execute("SELECT content FROM messages WHERE content != ''")
        messages = [r[0] for r in c.fetchall()]
        print(f"[brain] training markov on {len(messages)} messages…", file=sys.stderr)
        self.markov.train(messages)
        # learned fallback bucket from your own corpus
        c.execute("SELECT reply FROM pairs WHERE reply != ''")
        raw_replies = [r[0] for r in c.fetchall()]
        self._fallback_replies = [
            r for r in raw_replies
            if self._quality_ok(r) and (looks_uncertain_reply(r) or looks_generic(r) or len(tokenize(r)) <= 5)
        ]
        conn.close()
        print("[brain] ready.\n", file=sys.stderr)

    def _score_candidate(self, inp: str, cand: dict) -> float:
        score = cand["sim"] * 3.1
        # common replies are less interesting
        score -= math.log1p(cand["freq"]) * 0.52
        # heavily penalize repeats
        if cand["reply_norm"] in self._recent_norm:
            score -= 2.0
        # parent should match the current input, not just vaguely
        parent_overlap = lexical_overlap(inp, cand["parent"])
        score += parent_overlap * 1.10
        # small bonus for reply lexical relation, but avoid parroting
        reply_overlap = lexical_overlap(inp, cand["reply"])
        score += reply_overlap * 0.18
        if reply_overlap > 0.75:
            score -= 0.9
        if looks_generic(cand["reply"]):
            score -= 0.85
        in_len = len(tokenize(inp))
        out_len = len(tokenize(cand["reply"]))
        inp_is_q = is_question(inp)
        inp_is_math = looks_math(inp)
        parent_is_q = is_question(cand["parent"])
        parent_is_math = looks_math(cand["parent"])
        if inp_is_q and parent_is_q:
            score += 0.25
        if inp_is_q and out_len <= 1:
            score -= 0.30
        if inp_is_math != parent_is_math:
            score -= 0.75
        elif inp_is_math and parent_is_math:
            score += 0.30
        # short user input should not get essay replies
        if in_len <= 3 and out_len > 10:
            score -= 0.55
        # long user input should not get ultra-short throwaways
        if in_len >= 8 and out_len <= 1:
            score -= 0.45
        # giant lore dumps are rarely good
        if out_len >= 28:
            score -= 0.35
        return score

    def _pick_retrieval(self, text: str, context: Optional[List[str]] = None) -> Tuple[Optional[str], float]:
        cands = self.retrieval.top_candidates(text, context=context, limit=40)
        if not cands:
            return None, -999.0
        scored = [(self._score_candidate(text, c), c) for c in cands]
        scored.sort(key=lambda x: x[0], reverse=True)
        # dedupe by normalized reply first
        unique = []
        seen = set()
        for s, c in scored:
            nr = c["reply_norm"]
            if nr in seen:
                continue
            seen.add(nr)
            unique.append((s, c))
        if not unique:
            return None, -999.0
        best_score, best_cand = unique[0]
        second_score = unique[1][0] if len(unique) > 1 else -999.0
        margin = best_score - second_score
        # strong hit
        if best_score >= 0.95 and margin >= 0.12:
            return best_cand["reply"], best_score
        # medium hit: return top directly only if still clearly ahead
        if best_score >= 0.70 and margin >= 0.08:
            return best_cand["reply"], best_score
        return None, best_score

    def _mutate_reply(self, base_reply: str, user_text: str) -> str:
        user_len = len(tokenize(user_text))
        user_is_question = is_question(user_text)
        if random.random() < 0.72:
            return base_reply
        max_extra = 2 if user_len <= 3 else 5
        if random.random() < 0.60:
            continued = self.markov.continue_from(
                base_reply,
                extra_words=random.randint(1, max_extra),
            )
            if continued and normalize(continued) != normalize(base_reply):
                if lexical_overlap(base_reply, continued) >= 0.45:
                    if not user_is_question or lexical_overlap(user_text, continued) > 0:
                        return continued
        gen = self.markov.generate(
            seed=base_reply,
            max_words=max(5, len(tokenize(base_reply)) + max_extra),
        )
        if gen and lexical_overlap(base_reply, gen) >= 0.40:
            if not user_is_question or lexical_overlap(user_text, gen) > 0:
                return gen
        return base_reply

    def _quality_ok(self, text: str) -> bool:
        nt = normalize(text)
        toks = tokenize(nt)
        if not nt:
            return False
        if nt in self._recent_norm:
            return False
        if len(toks) < 1 or len(toks) > 18:
            return False
        counts = Counter(toks)
        if max(counts.values(), default=0) >= 3:
            return False
        if len(toks) >= 4 and len(set(toks)) / max(1, len(toks)) < 0.40:
            return False
        one_char = sum(1 for t in toks if len(t) == 1)
        if one_char >= max(3, len(toks) // 2):
            return False
        for i in range(len(toks) - 2):
            if toks[i] == toks[i + 1] == toks[i + 2]:
                return False
        return True

    def _fallback_reply(self, text: str) -> str:
        inp_is_math = looks_math(text)
        inp_is_q = is_question(text)
        pool = [r for r in self._fallback_replies if normalize(r) not in self._recent_norm]
        if inp_is_math:
            mathish = [r for r in pool if looks_math(r) or looks_uncertain_reply(r)]
            if mathish:
                pool = mathish
        elif inp_is_q:
            qish = [r for r in pool if len(tokenize(r)) <= 6]
            if qish:
                pool = qish
        if pool:
            return random.choice(pool)
        # very last resort only
        for _ in range(4):
            gen = self.markov.generate(seed=text, max_words=10)
            if self._quality_ok(gen):
                return gen
        return "idk man"

    def reply(self, text: str, context: Optional[List[str]] = None) -> str:
        context = context or []
        hit, score = self._pick_retrieval(text, context=context)
        if hit is not None:
            candidate = hit
            if score < 1.15 and self._quality_ok(candidate):
                candidate = self._mutate_reply(candidate, text)
        else:
            candidate = self._fallback_reply(text)
        raw = self.emojis.resolve(candidate)
        self._recent_raw.append(raw)
        self._recent_norm.append(normalize(raw))
        return raw

    def serve(self):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                if req.get("reload"):
                    self._load(DB_PATH)
                    print(json.dumps({"ok": True, "result": "reloaded"}), flush=True)
                    continue
                text = req.get("text", "") or ""
                context = req.get("context", []) or []
                if not isinstance(context, list):
                    context = []
                result = self.reply(text, context=context)
                print(json.dumps({"ok": True, "result": result}), flush=True)
            except Exception as e:
                print(json.dumps({"ok": False, "error": str(e)}), flush=True)

    def chat(self):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        print("moa-ai - type something (ctrl+c to quit)\n")
        try:
            while True:
                user = input("you:     ").strip()
                if not user:
                    continue
                print(f"moa: {self.reply(user)}\n")
        except (KeyboardInterrupt, EOFError):
            print("\nbye!")

if __name__ == "__main__":
    bot = MoaBot()
    if len(sys.argv) > 1 and sys.argv[1] == "--serve":
        bot.serve()
    else:
        bot.chat()
