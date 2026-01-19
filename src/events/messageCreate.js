import devCmd from "../service/devCmd.js";
import { config } from "../../config/config.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

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

    const msg = message.content.trim();
    const cleanedMsg = msg.toLowerCase().replace(/[^a-z0-9öäüß ]/g, "").trim();

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

    if (cleanedMsg.includes("moa")){
        await message.react("1459951228145500374").catch();
    }

    if (cleanedMsg.includes("peak")){
        await message.react("1444063284407046335").catch();
    }

    else if (cleanedMsg.startsWith("im") || cleanedMsg.startsWith("i am") || cleanedMsg.startsWith("i'm")){
        const shouldSend = Math.random() <= 0.5; // 50% chance to respond
        if (!shouldSend) return;

        const words = cleanedMsg.split(" ").filter(Boolean);
        if (words.length <= 5){
            let name = words.slice(2).join(" ");
            if (name.length > 0){
                const firstLetter = name.charAt(0).toUpperCase();
                const rest = name.slice(1);
                name = firstLetter + rest;
            }
            if (name.length > 0 && name.length <= 32){
                await message.reply(`Hello ${name}, I am Moa Bot. :wave:`).catch(() => {});
            }
        }
    }
};

export default messageCreate;
