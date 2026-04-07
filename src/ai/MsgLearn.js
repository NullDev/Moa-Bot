import Database from "better-sqlite3";

/**
 * Learn user sentences from chat
 * - Conversational memory with reply chains and sequential adjacency
 *
 * @export
 * @class MessageLearner
 */
export class MessageLearner {
    /**
     * Creates an instance of MessageLearner.
     * @param {Object} [opts]
     * @param {number} [opts.lookbackWindow]
     * @memberof MessageLearner
     */
    constructor(opts = {}){
        this.lookbackWindow = opts.lookbackWindow ?? 5;
        this.db = new Database("./data/brain.sqlite");
        this.lastMsgByChannel = new Map();
    }

    async init(){
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("synchronous = NORMAL");

        this.db.exec(`CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            channelId TEXT,
            content TEXT,
            authorId TEXT,
            replyToId TEXT,
            ts INTEGER
        )`);

        this.db.exec(`CREATE TABLE IF NOT EXISTS pairs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parentKey TEXT,
            reply TEXT,
            ts INTEGER
        )`);
    }

    /**
     * Return true if the content looks like LaTeX and should not be learned
     *
     * @param {string} s
     * @return {boolean}
     * @memberof MessageLearner
     */
    isLatex(s){
        if (!s) return false;
        return (
            s.startsWith(",tex")
            || s.startsWith(",texsp")
            || s.startsWith(",tikz")
            || s.includes("tikzpicture")
            || /\$(?:\\.|[^$\\])+\$/.test(s)
            || /\\\[(?:\\.|[^\\])+\\\]/.test(s)
        );
    }

    /**
     * Clean the input text by removing code blocks, URLs, mentions, emojis, and extra whitespace. Also converts to lowercase.
     *
     * @param {string} s
     * @return {string}
     * @memberof MessageLearner
     */
    cleanText(s){
        if (!s) return "";
        let t = s;
        t = t.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
        t = t.replace(/https?:\/\/[\w.-]+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=.]+)?/gi, " ");
        t = t.replace(/<@&?\d+>/g, " ").replace(/<#!?\d+>/g, " ");
        t = t.replace(/<a?:\w+:\d+>/g, " ");
        t = t.replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ").trim();
        return t.toLowerCase();
    }

    /**
     * Tokenize text
     *
     * @param {string} s
     * @return {Array<string>}
     * @memberof MessageLearner
     */
    tokenize(s){
        return this.cleanText(s).split(/\s+/).filter(Boolean);
    }

    /**
     * check if message is a question
     *
     * @param {string} s
     * @return {boolean}
     * @memberof MessageLearner
     */
    isQuestion(s){
        const t = this.cleanText(s);
        const parts = new Set(this.tokenize(t));
        return s.includes("?") || [
            "why", "how", "who", "where", "when", "what", "which",
            "whom", "whose", "huh", "wut", "wat", "can", "could",
            "would", "should", "is", "are", "do", "does", "did",
        ].some((w) => parts.has(w));
    }

    /**
     * Check if the message looks mathy by looking for math-related keywords or symbols.
     *
     * @param {string} s
     * @return {boolean}
     * @memberof MessageLearner
     */
    looksMath(s){
        const t = this.cleanText(s);
        if (!t) return false;
        const words = new Set(this.tokenize(t));
        const mathWords = [
            "integral", "derivative", "limit", "prove", "proof", "sum", "product",
            "factor", "solve", "equation", "theorem", "lemma", "matrix", "vector",
            "eigen", "series", "sequence", "prime", "mod", "modulo", "graph",
            "function", "domain", "range", "log", "ln", "sin", "cos", "tan",
            "dx", "dy", "sqrt",
        ];
        if (mathWords.some((w) => words.has(w))) return true;
        return /[\d=+\-*/^<>()[\]{}\\]/.test(s);
    }

    /**
     * Calculate the lexical overlap between two strings as the size of the intersection of their token sets divided by the size of the union of their token sets.
     *
     * @param {string} a
     * @param {string} b
     * @return {number}
     * @memberof MessageLearner
     */
    lexicalOverlap(a, b){
        const aa = new Set(this.tokenize(a));
        const bb = new Set(this.tokenize(b));
        if (!aa.size || !bb.size) return 0;
        let inter = 0;
        for (const x of aa){
            if (bb.has(x)) inter++;
        }
        const union = new Set([...aa, ...bb]).size;
        return union ? inter / union : 0;
    }

    /**
     * Keep adjacency, but filter out obviously bad parent-child pairs.
     *
     * @param {string} parent
     * @param {string} reply
     * @param {number} dtMs
     * @returns {boolean}
     */
    shouldPairAdjacent(parent, reply, dtMs){
        const p = this.cleanText(parent);
        const r = this.cleanText(reply);
        if (!p || !r) return false;
        if (p === r) return false;

        const pt = this.tokenize(p);
        const rt = this.tokenize(r);
        if (!pt.length || !rt.length) return false;

        const overlap = this.lexicalOverlap(p, r);
        const parentQuestion = this.isQuestion(parent);
        const parentMath = this.looksMath(parent);
        const replyMath = this.looksMath(reply);

        // very close in time and both short/chatty
        if (dtMs <= 15000 && pt.length <= 6 && rt.length <= 10){
            return true;
        }

        // explicit semantic relation
        if (overlap >= 0.12){
            return true;
        }

        // question -> answer-ish
        if (dtMs <= 20000 && parentQuestion && rt.length <= 12){
            return true;
        }

        // keep math adjacent pairs only when both look mathy
        if (parentMath || replyMath){
            return dtMs <= 30000 && parentMath && replyMath;
        }

        return false;
    }

    /**
     * Add a parent-reply pair to the database with the given timestamp.
     *
     * @param {string} parent
     * @param {string} reply
     * @param {number} ts
     * @memberof MessageLearner
     */
    addPair(parent, reply, ts){
        this.db.prepare(
            "INSERT INTO pairs (parentKey, reply, ts) VALUES (?, ?, ?)",
        ).run(parent, reply, ts);
    }

    /**
     * Check if a message with the given ID already exists in the database.
     *
     * @param {string} id
     * @return {boolean}
     * @memberof MessageLearner
     */
    has(id){
        return !!this.db.prepare("SELECT 1 FROM messages WHERE id = ?").get(id);
    }

    /**
     * Learner
     *
     * @param {import("discord.js").Message & {
     *   replyToId?: string, authorId: string
     * }} msg
     * @return {Promise<void>}
     * @memberof MessageLearner
     */
    async learn(msg){
        if (!msg || !msg.id) return;
        if (this.isLatex(msg.content)) return;

        const ts = msg.createdTimestamp ?? Date.now();
        const clean = this.cleanText(msg.content);
        if (!clean) return;

        if (msg.channelId){
            const last = this.lastMsgByChannel.get(msg.channelId);
            if (
                last &&
                last.authorId === msg.authorId &&
                !msg.replyToId &&
                ts - last.ts < this.lookbackWindow * 1000
            ){
                const merged = (last.content + " " + clean).trim();
                this.db.prepare("UPDATE messages SET content = ?, ts = ? WHERE id = ?").run(
                    merged,
                    ts,
                    last.id,
                );
                this.lastMsgByChannel.set(msg.channelId, { ...last, content: merged, ts });
                return;
            }
        }

        this.db.prepare(
            `INSERT OR REPLACE INTO messages (id, channelId, content, authorId, replyToId, ts)
            VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(msg.id, msg.channelId, clean, msg.authorId, msg.replyToId ?? null, ts);

        let parentContent = null;
        let parentTs = null;

        if (msg.replyToId){
            const row = this.db
                .prepare("SELECT content, ts FROM messages WHERE id = ?")
                .get(msg.replyToId);

            // @ts-ignore
            if (row && row.content){
                // @ts-ignore
                parentContent = row.content;
                // @ts-ignore
                parentTs = row.ts ?? null;
            }
        }
        else if (msg.channelId){
            const row = this.db
                .prepare(
                    `SELECT content, ts
                     FROM messages
                     WHERE channelId = ? AND authorId != ? AND id != ?
                     ORDER BY ts DESC LIMIT 1`,
                )
                .get(msg.channelId, msg.authorId, msg.id);

            // @ts-ignore
            if (row && row.content){
                // @ts-ignore
                const dt = Math.max(0, ts - (row.ts ?? ts));
                // @ts-ignore
                if (this.shouldPairAdjacent(row.content, clean, dt)){
                    // @ts-ignore
                    parentContent = row.content;
                    // @ts-ignore
                    parentTs = row.ts ?? null;
                }
            }
        }

        if (parentContent){
            this.addPair(parentContent, clean, ts);
            if (parentTs && parentTs > ts){
                // if parent is newer, update its timestamp to keep it in the lookback window longer
                this.db.prepare("UPDATE messages SET ts = ? WHERE content = ?").run(ts, parentContent);
            }
        }

        this.lastMsgByChannel.set(msg.channelId, {
            id: msg.id,
            content: clean,
            authorId: msg.authorId,
            ts,
        });
    }

    /**
     * Learn from a message during a bulk crawl.
     *
     * @param {{ id: string, content: string, channelId: string, authorId: string, replyToId: string|null, createdTimestamp: number }} msg
     * @return {{ inserted: boolean, paired: boolean }}
     * @memberof MessageLearner
     */
    crawlLearn(msg){
        if (!msg?.id) return { inserted: false, paired: false };
        if (this.isLatex(msg.content)) return { inserted: false, paired: false };

        const clean = this.cleanText(msg.content);
        if (!clean) return { inserted: false, paired: false };

        if (this.has(msg.id)) return { inserted: false, paired: false };

        const ts = msg.createdTimestamp ?? Date.now();
        const replyToId = msg.replyToId ?? null;

        this.db.prepare(
            `INSERT OR IGNORE INTO messages (id, channelId, content, authorId, replyToId, ts)
             VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(msg.id, msg.channelId, clean, msg.authorId, replyToId, ts);

        let parentContent = null;

        if (replyToId){
            const row = this.db.prepare(
                "SELECT content FROM messages WHERE id = ?",
            ).get(replyToId);

            // @ts-ignore
            if (row?.content){
                // @ts-ignore
                parentContent = row.content;
            }
        }
        else if (msg.channelId){
            const row = this.db.prepare(
                `SELECT content, ts
                 FROM messages
                 WHERE channelId = ? AND authorId != ? AND id != ?
                 ORDER BY ts DESC LIMIT 1`,
            ).get(msg.channelId, msg.authorId, msg.id);

            // @ts-ignore
            if (row?.content){
                // @ts-ignore
                const dt = Math.max(0, ts - (row.ts ?? ts));
                // @ts-ignore
                if (this.shouldPairAdjacent(row.content, clean, dt)){
                    // @ts-ignore
                    parentContent = row.content;
                }
            }
        }

        if (parentContent){
            this.addPair(parentContent, clean, ts);
        }

        return { inserted: true, paired: !!parentContent };
    }
}
