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
                await message.reply(`Hello ${name}, I am Moa Bot. :wave:`).catch(() => {});
            }
        }
    }
};

export default messageCreate;
