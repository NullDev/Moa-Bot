import { config } from "../../config/config.js";
import integralDb from "./integralDb.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Get ordinal suffix for a day number
 *
 * @param {number} day
 * @returns {string}
 */
const getOrdinalSuffix = function(day){
    if (day > 3 && day < 21) return "th";
    switch (day % 10){
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
};

/**
 * Format date as "Thursday 8th January 2026"
 *
 * @param {Date} date
 * @returns {string}
 */
const formatDate = function(date){
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const dayName = days[date.getDay()];
    const day = date.getDate();
    const monthName = months[date.getMonth()];
    const year = date.getFullYear();

    return `${dayName} ${day}${getOrdinalSuffix(day)} ${monthName} ${year}`;
};

/**
 * Post an integral challenge to the daily channel
 *
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 * @param {import("discord.js").Attachment} image
 * @param {string} difficulty
 * @param {import("discord.js").User} proposedBy
 * @param {Date} [postDate]
 * @returns {Promise<{ integralMessage: import("discord.js").Message, thread: import("discord.js").AnyThreadChannel }>}
 */
const postIntegral = async function(client, guildId, image, difficulty, proposedBy, postDate = new Date()){
    const channelId = config.ids.daily_int_channel;
    const roleId = config.ids.daily_int_role;

    if (!channelId || !roleId) throw new Error("Math-Challenges channel or role is not configured!");

    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("send" in channel)) throw new Error("Could not find the Math-Challenges channel!");

    const dateStr = formatDate(postDate);
    const messageContent = `# ${dateStr} Math Challenge (${difficulty})\nProposed by: ${proposedBy}`;

    const integralMessage = await channel.send({
        content: messageContent,
        files: [image],
    });

    const thread = await integralMessage.startThread({
        name: `${dateStr} - ${difficulty}`,
        autoArchiveDuration: 1440,
    });

    await thread.send({ content: `<@&${roleId}>` });

    const integralKey = `guild-${guildId}.integral-${integralMessage.id}`;
    await integralDb.set(`${integralKey}.date`, postDate.toISOString());
    await integralDb.set(`${integralKey}.difficulty`, difficulty);
    await integralDb.set(`${integralKey}.threadId`, thread.id);
    await integralDb.set(`${integralKey}.imageUrl`, image.url);
    await integralDb.set(`${integralKey}.solvers`, []);
    await integralDb.set(`${integralKey}.proposedBy`, proposedBy.id);

    return { integralMessage, thread };
};

export { formatDate, getOrdinalSuffix, postIntegral };
