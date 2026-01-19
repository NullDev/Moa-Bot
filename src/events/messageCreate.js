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

    const memeChannelId = config.ids.meme_channel;
    if (memeChannelId && message.channelId === memeChannelId){
        const hasImage = message.attachments.some(attachment => attachment.contentType?.startsWith("image/"));
        if (hasImage){
            const randomNum = Math.random();
            if (randomNum < 0.1){
                await message.reply("moa");
            }
            else if (randomNum < 0.2){
                await message.reply("kiwi");
            }
        }
    }

    if (message.content.toLowerCase().includes("moa")){
        try {
            await message.react("1459951228145500374");
        }
        // eslint-disable-next-line no-unused-vars
        catch (error){
            // ignore
        }
    }

    if (message.content.toLowerCase().includes("peak")){
        try {
            await message.react("1444063284407046335");
        }
        // eslint-disable-next-line no-unused-vars
        catch (error){
            // ignore
        }
    }
};

export default messageCreate;
