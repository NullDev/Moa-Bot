import devCmd from "../service/devCmd.js";
import { MessageLearner } from "../ai/MsgLearn.js";
import { PythonAIWorker } from "../ai/getAiReply.js";
import { config } from "../../config/config.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

export const aiWorker = new PythonAIWorker();

const brain = new MessageLearner();
await brain.init();

/**
 * Get the bot name for mentions, try the nickname of the bot in the guild first, then display name
 *
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
 * Clean message content by removing mentions and trimming whitespace
 *
 * @param {import("discord.js").Message} message
 */
const cleanMsg = message => message.cleanContent.replace(/<a?(:[a-zA-Z0-9_]+:)[0-9]+>/g, "$1")
    .replace(`<@${message.client.user.id}>`, "")
    .replace(`@${getBotName(message)} `, "")
    .trim();

/**
 * Handle messageCreate event
 *
 * @param {import("discord.js").Message} message
 * @return {Promise<void>}
 */
const messageCreate = async function(message){
    if (message.author.bot || message.system || message.partial) return;

    if (!message.guild){
        await devCmd(message);
        return;
    }

    if (
        config.ai_included_channels.includes(message.channelId)
        || (
            message.channel.isThread()
            && message.channel.parentId
            && config.ai_included_channels.includes(message.channel.parentId)
        )
    ){
        await brain.learn({
            id: message.id,
            content: message.content,
            channelId: message.channelId,
            authorId: message.author.id, // @ts-ignore
            replyToId: message.reference?.messageId ?? null,
            createdTimestamp: message.createdTimestamp,
        });
    }

    if (message.mentions.has(message.client.user)){
        if (message.content.trim() === `<@!${message.client.user?.id}>`) return;
        if ("sendTyping" in message.channel) message.channel.sendTyping();
        const text = cleanMsg(message);
        if (!text) return;

        /** @type {string[]} */
        const context = [];

        try {
            const prevMessages = await message.channel.messages.fetch({
                limit: 6,
                before: message.id,
            });

            const usable = [...prevMessages.values()]
                .filter((msg) => !msg.author.bot)
                .map((msg) => cleanMsg(msg))
                .filter((content) => content && content.length > 0)
                .slice(0, 2);

            context.push(...usable);
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("[AIWorker] Could not fetch previous messages for context:", err);
        }

        try {
            const reply = await aiWorker.infer({
                text,
                context,
            });

            await message.reply(reply);
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("[AIWorker] Inference error:", err);
            await message.reply("It seems like Shadow messed up again. Something broke lmao... :skull:");
        }

        return;
    }

    const msg = message.content.trim().toLowerCase();

    const memeChannelId = config.ids.meme_channel;
    if (memeChannelId && message.channelId === memeChannelId){
        const hasImage = message.attachments.some(attachment => attachment.contentType?.startsWith("image/"));
        if (hasImage){
            const randomNum = Math.random();
            if (randomNum < 0.1){
                await message.reply("moa").catch();
            }
            else if (randomNum < 0.2){
                await message.reply("kiwi").catch();
            }
        }
    }

    if (msg.includes("moa")){
        await message.react("1459951228145500374").catch();
    }

    if (msg.includes("peak")){
        await message.react("1444063284407046335").catch();
    }

    else if (/^(im|i'm|i am)(\b|$)/.test(msg)){
        const shouldSend = Math.random() <= 0.5; // 50% chance to respond
        if (!shouldSend) return;

        const words = msg.split(/\s+/).filter(Boolean);
        if (words.length <= 5){
            let startIndex = 1;
            if (words[0] === "i" && words[1] === "am") startIndex = 2;

            let name = words.slice(startIndex).join(" ");
            if (name.length > 0){
                name = name.charAt(0).toUpperCase() + name.slice(1);
            }
            if (name.length > 0 && name.length <= 32){
                (name.toLowerCase() === "moa bot" || name.toLowerCase() === "moabot")
                    ? await message.reply("Nuh uh, that's my name :rage:").catch(() => {})
                    : await message.reply({
                        content: `Hello ${name}, I am Moa Bot. :wave:`,
                        allowedMentions: {
                            parse: [],
                            roles: [],
                        },
                    }).catch(() => {});
            }
        }
    }
};

export default messageCreate;
