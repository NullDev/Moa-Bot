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
};

export default messageCreate;
