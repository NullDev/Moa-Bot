import OpenAI from "openai";
import Log from "../util/log.js";
import { config } from "../../config/config.js";

const openai = new OpenAI({
    apiKey: config.openai_token,
});

/**
 * @param {import("discord.js").Message} message
 */
const getBotName = message => {
    if (message.guild){
        const member = message.guild.members.cache.get(message.client.user.id);
        return member?.nickname || message.client.user.displayName;
    }
    return message.client.user.displayName;
};

/**
 * @param {import("discord.js").Message} message
 */
const cleanMsg = message => message.cleanContent.replace(/<a?(:[a-zA-Z0-9_]+:)[0-9]+>/g, "$1")
    .replace(`<@${message.client.user.id}>`, "")
    .replace(`@${getBotName(message)} `, "")
    .trim();

/**
 * @param {String} author
 * @param {String} channel
 * @param {String} context
 * @returns {Promise<String|null>}
 */
const preparePrompt = async function(author, channel, context){
    const prompt = config.openai_prompt;

    const prepared = prompt
        .replace("{{channel}}", channel)
        .replace("{{user}}", author)
        .replace("{{recent_messages}}", context || "N/A");

    return prepared;
};

/**
 * @param {String} message
 * @param {String} author
 * @param {String} channel
 * @param {String} context
 * @param {{ message?: String, author?: String, isMe?: Boolean }} [reply={}]
 * @returns {Promise<String>}
 */
const askGpt = async function(message, author, channel, context, reply = {}){
    const prompt = await preparePrompt(author, channel, context);
    const msg = [];

    msg.push({
        content: prompt,
        role: "system",
    });

    if (reply.message && reply.author){
        msg.push({
            content: (reply.isMe ? "" : reply.author + ":") + " " + reply.message,
            role: reply.isMe ? "system" : "user",
        });
    }

    msg.push({
        content: message,
        role: "user",
    });

    const res = await openai.chat.completions.create({
        model: "gpt-4o",
        n: 1, // @ts-ignore
        messages: msg,
        max_completion_tokens: 500,
    }).catch((e) => {
        Log.error("[AIWorker] Error while asking GPT:", e);
        return "Leave me alone.";
    });

    const response = typeof res === "string" ? res : res.choices[0].message.content?.trim();
    if (!response) return "...";

    return response;
};

/**
 * @param {import("discord.js").Message} message
 * @returns {Promise<void>}
 */
const evilMoa = async function(message){
    const query = cleanMsg(message);

    let context;

    try {
        const prevMessages = await message.channel.messages.fetch({ limit: 4, before: message.id });
        if (prevMessages.size > 0){
            const contexts = [];
            // Get up to 3 non-bot messages
            for (const [, msg] of prevMessages){
                if (contexts.length < 3){
                    const content = cleanMsg(msg);
                    if (content && content.length > 0){
                        contexts.push({ user: msg.author.displayName || msg.author.username, content });
                    }
                }
            }

            if (contexts.length > 0){
                // Reverse to get chronological order, join with new lines
                context = contexts.reverse().map(c => `${c.user}: ${c.content}`).join("\n");
            }
        }
    }
    catch (e){
        // @ts-ignore
        Log.error("[AIWorker] Could not fetch previous message for context: ", e);
    }

    try {
        const reply = { message: "", author: "", isMe: false };
        if (message.reference){
            const refMsg = await message.channel.messages.fetch(message.reference.messageId || "");

            reply.message = refMsg.cleanContent;
            reply.author = refMsg.author.displayName || refMsg.author.username;
            reply.isMe = refMsg.author.id === message.client.user?.id;
        }

        const res = await askGpt(
            query,
            message.author.displayName || message.author.username,
            /** @type {import("discord.js").TextChannel} */(message.channel).name,
            context || "N/A",
            reply,
        );

        if (typeof res === "string"){
            await message.reply(res);
        }
    }
    catch (err){
        // @ts-ignore
        Log.error("[AIWorker] Inference error:", err);
        await message.reply("Leave me alone.");
    }
};

export default evilMoa;
