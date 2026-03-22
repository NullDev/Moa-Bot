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
        this.lastMsgByChannel = new Map(); // track last non-bot message for sequential pairing
    }

    async init(){
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
            || s.includes("tikzpicture")
            || /\$(?:\\.|[^$\\])+\$/.test(s)
            || /\\\[(?:\\.|[^\\])+\\\]/.test(s)
        );
    }

    /**
     * Learn from a message
     *
     * @param {import("discord.js").Message} msg
     * @return {Promise<void>}
     * @memberof MessageLearner
     */
    async learn(msg){
        if (!msg || !msg.id) return;
        if (this.isLatex(msg.content)) return;
        const ts = msg.createdTimestamp ?? Date.now();
        const clean = this.cleanText(msg.content);
        if (!clean) return;

        // Merge consecutive messages from same author within lookbackWindow
        if (msg.channelId){
            const last = this.lastMsgByChannel.get(msg.channelId);
            if (
                last && // @ts-ignore
                last.authorId === msg.authorId && !msg.replyToId &&
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

        // Insert into messages table
        this.db.prepare(
            `INSERT OR REPLACE INTO messages (id, channelId, content, authorId, replyToId, ts)
            VALUES (?, ?, ?, ?, ?, ?)`, // @ts-ignore
        ).run(msg.id, msg.channelId, clean, msg.authorId, msg.replyToId ?? null, ts);

        // Derive training pair
        let parentContent = null; // @ts-ignore
        if (msg.replyToId){
            const row = this.db
                .prepare("SELECT content FROM messages WHERE id = ?") // @ts-ignore
                .get(msg.replyToId); // @ts-ignore
            if (row && row.content) parentContent = row.content;
        }
        else if (msg.channelId){
            const row = this.db
                .prepare(
                    `SELECT content
                    FROM messages
                    WHERE channelId = ? AND authorId != ?
                    ORDER BY ts DESC LIMIT 1`,
                ) // @ts-ignore
                .get(msg.channelId, msg.authorId); // @ts-ignore
            if (row && row.content) parentContent = row.content;
        }

        if (parentContent){
            this.addPair(parentContent, clean, ts);
        }

        // Update last message tracker
        this.lastMsgByChannel.set(msg.channelId, {
            id: msg.id,
            content: clean, // @ts-ignore
            authorId: msg.authorId,
            ts,
        });
    }

    /**
     * Clean text for processing
     *
     * @param {string} s
     * @return {string}
     * @memberof MessageLearner
     */
    cleanText(s){
        if (!s) return "";
        let t = s;
        t = t.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");                  // code blocks
        t = t.replace(/https?:\/\/[\w.-]+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=.]+)?/gi, " "); // URLs
        t = t.replace(/<@&?\d+>/g, " ").replace(/<#!?\d+>/g, " ");                       // mentions
        t = t.replace(/<a?:\w+:\d+>/g, " ");                                             // custom emoji
        t = t.replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ").trim();                   // whitespace
        return t.toLowerCase();
    }

    /**
     * Add a parentKey -> reply pair to the database
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
     * Check whether a message id is already stored
     *
     * @param {string} id
     * @return {boolean}
     * @memberof MessageLearner
     */
    has(id){
        return !!this.db.prepare("SELECT 1 FROM messages WHERE id = ?").get(id);
    }

    /**
     * Learn from a message during a bulk crawl.
     * Identical pair logic to learn(), but:
     *  - No merge window (historical messages keep their own IDs)
     *  - INSERT OR IGNORE instead of INSERT OR REPLACE (never overwrites)
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

        const ts        = msg.createdTimestamp ?? Date.now();
        const replyToId = msg.replyToId ?? null;

        this.db.prepare(
            `INSERT OR IGNORE INTO messages (id, channelId, content, authorId, replyToId, ts)
            VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(msg.id, msg.channelId, clean, msg.authorId, replyToId, ts);

        // Derive training pair
        let parentContent = null;
        if (replyToId){
            const row = /** @type {any} */ (
                this.db.prepare("SELECT content FROM messages WHERE id = ?").get(replyToId)
            );
            if (row?.content) parentContent = row.content;
        }
        else if (msg.channelId){
            const row = /** @type {any} */ (
                this.db.prepare(
                    `SELECT content FROM messages
                    WHERE channelId = ? AND authorId != ?
                    ORDER BY ts DESC LIMIT 1`,
                ).get(msg.channelId, msg.authorId)
            );
            if (row?.content) parentContent = row.content;
        }

        if (parentContent) this.addPair(parentContent, clean, ts);

        return { inserted: true, paired: !!parentContent };
    }
}
