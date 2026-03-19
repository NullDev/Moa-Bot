import devCmd from "../service/devCmd.js";
import { MessageLearner } from "../ai/MsgLearn.js";
import { config } from "../../config/config.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const brain = new MessageLearner();
await brain.init();

/**
 * Handle messageCreate event
 *
 * @param {import("discord.js").Message} message
 * @return {Promise<void>}
 */
const messageCreate = async function(message){
    if (message.author.bot || message.system) return;

    if (!message.guild){
        await devCmd(message);
        return;
    }

    if (message.partial) return;

    if (config.ai_included_channels.includes(message.channelId)
        || (
            message.channel.isThread()
            && message.channel.parentId
            && config.ai_included_channels.includes(message.channel.parentId)
        )
    ){
        if (
            message.content.startsWith(",tex")
            || message.content.startsWith(",texsp")
            || message.content.includes("tikzpicture")
            || /\$(?:\\.|[^$\\])+\$/.test(message.content)
            || /\\\[(?:\\.|[^\\])+\\\]/.test(message.content)
        ) return;

        brain.learn({
            id: message.id,
            content: message.content,
            channelId: message.channelId, // @ts-ignore
            authorId: message.author.id,
            replyToId: message.reference?.messageId ?? null,
            createdTimestamp: message.createdTimestamp,
        });
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
