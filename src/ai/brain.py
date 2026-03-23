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
    text = text.lower().strip()
    text = re.sub(r"<@!?\d+>", "", text)     # remove Discord mentions
    text = re.sub(r"<a?:\w+:\d+>", "", text) # remove custom emojis
    text = re.sub(r"https?://\S+", "", text) # remove URLs
    text = re.sub(r"\s+", " ", text).strip()
    return text

def tokenize(text: str) -> List[str]:
    return normalize(text).split()

def is_question(text: str) -> bool:
    t = normalize(text)
    return "?" in text or any(w in t.split() for w in [
        "why", "how", "who", "where", "when", "what", "which",
        "whom", "whose", "huh", "wut", "wat",
    ])

def lexical_overlap(a: str, b: str) -> float:
    aa = set(tokenize(a))
    bb = set(tokenize(b))
    if not aa or not bb: return 0.0
    return len(aa & bb) / len(aa | bb)

def looks_generic(text: str) -> bool:
    t = normalize(text)
    toks = tokenize(t)
    generic = {
        "ye", "yea", "yeah", "yes", "nah", "no", "lol", "kk",
        "okay", "k", "okay", "xd", "lmao", "moa", "hehe", "fr", 
    }
    return len(toks) <= 2 and all(tok in generic for tok in toks)

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
                if i + 2 < len(words): self.trigrams[(words[i], words[i + 1])].append(words[i + 2])
                if i + 1 < len(words): self.bigrams[words[i]].append(words[i + 1])

    def generate(self, seed: str = "", max_words: int = 20) -> str:
        words = tokenize(seed)
        result: List[str] = []
        if len(words) >= 2 and (words[-2], words[-1]) in self.trigrams: result = [words[-2], words[-1]]
        elif len(words) >= 1 and words[-1] in self.bigrams: result = [words[-1]]
        elif self.starters: result = list(random.choice(self.starters))
        else: return ""
        while len(result) < max_words:
            if len(result) >= 2 and (result[-2], result[-1]) in self.trigrams:
                nxt = random.choice(self.trigrams[(result[-2], result[-1])])
            elif result[-1] in self.bigrams: nxt = random.choice(self.bigrams[result[-1]])
            else: break
            # avoid ugly loops
            if len(result) >= 3 and nxt == result[-1] == result[-2]: break
            result.append(nxt)
            if len(result) >= 5 and random.random() < 0.22: break
        return " ".join(result).strip()

    def continue_from(self, prefix: str, extra_words: int = 8) -> str:
        base = tokenize(prefix)
        if not base: return ""
        result = base[:]
        while len(result) < len(base) + extra_words:
            if len(result) >= 2 and (result[-2], result[-1]) in self.trigrams:
                nxt = random.choice(self.trigrams[(result[-2], result[-1])])
            elif result[-1] in self.bigrams: nxt = random.choice(self.bigrams[result[-1]])
            else: break
            if nxt in result[-4:]: break
            result.append(nxt)
            if len(result) >= len(base) + 3 and random.random() < 0.35: break
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
            if nk and nr: cleaned.append((nk, r, nr))
        if not cleaned:
            self.keys, self.replies, self.reply_norms = [], [], []
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

    def top_candidates(self, text: str, limit: int = 30) -> List[dict]:
        if self.vectorizer is None or self.matrix is None or not text.strip():
            return []
        q = normalize(text)
        vec = self.vectorizer.transform([q])
        sims = cosine_similarity(vec, self.matrix).flatten()
        if sims.size == 0: return []
        order = np.argsort(sims)[::-1][:limit]
        out = []
        for i in order:
            if sims[i] <= 0: continue
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
        conn.close()
        print("[brain] ready.\n", file=sys.stderr)

    def _score_candidate(self, inp: str, cand: dict) -> float:
        score = cand["sim"] * 2.6
        # penalize globally common replies
        score -= math.log1p(cand["freq"]) * 0.45
        # penalize recent repeats heavily
        if cand["reply_norm"] in self._recent_norm: score -= 2.0
        # generic tiny replies should lose unless similarity is very high
        if looks_generic(cand["reply"]): score -= 0.7
        # prefer some lexical relation, but not parroting
        overlap = lexical_overlap(inp, cand["reply"])
        score += overlap * 0.35
        if overlap > 0.75: score -= 0.9
        # question compatibility
        if is_question(inp):
            if "?" in cand["reply"]: score += 0.15
            elif len(tokenize(cand["reply"])) <= 1: score -= 0.25
        # length shaping
        in_len = len(tokenize(inp))
        out_len = len(tokenize(cand["reply"]))
        if in_len <= 3 and out_len > 10: score -= 0.45
        if in_len >= 8 and out_len <= 1: score -= 0.35
        return score

    def _pick_retrieval(self, text: str) -> Optional[str]:
        cands = self.retrieval.top_candidates(text, limit=35)
        if not cands: return None
        scored = [(self._score_candidate(text, c), c) for c in cands]
        scored.sort(key=lambda x: x[0], reverse=True)
        # keep only reasonably good options
        best = scored[0][0]
        shortlisted = [c for s, c in scored if s >= best - 0.45 and s > 0.15]
        if not shortlisted: return None
        # dedupe near-identical replies
        seen = set()
        unique = []
        for c in shortlisted:
            nr = c["reply_norm"]
            if nr in seen: continue
            seen.add(nr)
            unique.append(c)
        if not unique: return None
        top = unique[:5]
        # weighted random among the top few
        weights = []
        for c in top:
            s = max(0.05, self._score_candidate(text, c))
            weights.append(s)
        return random.choices([c["reply"] for c in top], weights=weights, k=1)[0]

    def _mutate_reply(self, base_reply: str, user_text: str) -> str:
        user_len = len(tokenize(user_text))
        user_is_question = is_question(user_text)
        if random.random() < 0.55: return base_reply
        max_extra = 3 if user_len <= 3 else 7
        if random.random() < 0.55:
            continued = self.markov.continue_from(
                base_reply,
                extra_words=random.randint(2, max_extra)
            )
            if continued and normalize(continued) != normalize(base_reply):
                # don't let mutation drift too far away
                if lexical_overlap(user_text, continued) >= lexical_overlap(user_text, base_reply) * 0.6:
                    return continued
        gen = self.markov.generate(
            seed=base_reply,
            max_words=max(6, len(tokenize(base_reply)) + max_extra)
        )
        if gen:
            if lexical_overlap(base_reply, gen) >= 0.3:
                if not user_is_question or "?" in gen or lexical_overlap(user_text, gen) > 0:
                    return gen
        return base_reply

    def _quality_ok(self, text: str) -> bool:
        nt = normalize(text)
        toks = tokenize(nt)
        if not nt: return False
        if nt in self._recent_norm: return False
        if len(toks) > 20: return False
        # avoid weird loops
        for i in range(len(toks) - 2):
            if toks[i] == toks[i + 1] == toks[i + 2]:
                return False
        return True

    def reply(self, text: str) -> str:
        hit = self._pick_retrieval(text)
        if hit is not None:
            if random.random() < 0.2:
                candidate = self._mutate_reply(hit, text)
            else:
                candidate = hit
            if not self._quality_ok(candidate): candidate = hit
        else:
            candidate = ""
            for _ in range(6):
                gen = self.markov.generate(seed=text, max_words=16)
                if self._quality_ok(gen):
                    candidate = gen
                    break
            if not candidate: candidate = "yea tbh"
        raw = self.emojis.resolve(candidate)
        self._recent_raw.append(raw)
        self._recent_norm.append(normalize(raw))
        return raw

    def serve(self):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        for line in sys.stdin:
            line = line.strip()
            if not line: continue
            try:
                req = json.loads(line)
                if req.get("reload"):
                    self._load(DB_PATH)
                    print(json.dumps({ "ok": True, "result": "reloaded" }), flush=True)
                else:
                    result = self.reply(req.get("text", ""))
                    print(json.dumps({ "ok": True, "result": result }), flush=True)
            except Exception as e:
                print(json.dumps({ "ok": False, "error": str(e) }), flush=True)

    def chat(self):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        print("moa-ai — type something (ctrl+c to quit)\n")
        try:
            while True:
                user = input("you:     ").strip()
                if not user: continue
                print(f"moa: {self.reply(user)}\n")
        except (KeyboardInterrupt, EOFError):
            print("\nbye!")

if __name__ == "__main__":
    bot = MoaBot()
    if len(sys.argv) > 1 and sys.argv[1] == "--serve": bot.serve()
    else: bot.chat()
