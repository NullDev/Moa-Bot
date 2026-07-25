import fs from "node:fs/promises";
import OpenAI from "openai";
import { config } from "../../config/config.js";
import challengesDb from "../util/challengesDb.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/* eslint-disable no-nested-ternary */

const openai = new OpenAI({
    apiKey: config.openai.token,
});

const MAX_LAST_MESSAGES = 4;

/**
 * Build the DB key holding the last welcome messages of a guild
 *
 * @param {String} guildId
 * @returns {String}
 */
const lastMessagesKey = (guildId) => `guild-${guildId}.lastWelcomeMessages`;

/**
 * Fetch the last welcome messages we wrote in a guild
 *
 * @param {String} guildId
 * @returns {Promise<Array<String>>}
 */
const getLastMessages = async function(guildId){
    const stored = await challengesDb.get(lastMessagesKey(guildId)).catch((error) => {
        Log.error("Error fetching last welcome messages:", error);
        return null;
    });

    return Array.isArray(stored) ? stored : [];
};

/**
 * Store a new welcome message, rotating the oldest one out
 *
 * @param {String} guildId
 * @param {String} message
 * @returns {Promise<void>}
 */
const pushLastMessage = async function(guildId, message){
    const messages = await getLastMessages(guildId);
    messages.push(message);

    await challengesDb.set(lastMessagesKey(guildId), messages.slice(-MAX_LAST_MESSAGES)).catch((error) => {
        Log.error("Error storing last welcome message:", error);
    });
};

/**
 * Prepare the prompt for usage
 *
 * @param {String} username
 * @param {Array<String>} lastMessages
 * @returns {Promise<String>}
 */
const preparePrompt = async function(username, lastMessages){
    const prompt = await fs.readFile("./data/welcome_prompt.txt", "utf-8");

    const prepared = prompt
        .replace("{{last_messages}}", lastMessages.length
            ? lastMessages.map(msg => `- ${msg}`).join("\n")
            : "(none yet)",
        )
        .replace("{{date}}", new Date().toLocaleString("en-US", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }))
        .replace("{{day}}", new Date().toLocaleDateString("en-US", {
            weekday: "long",
        }))
        .replace("{{username}}", username)
        .replace("{{time}}", new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
        }))
        .replace("{{timeofday}}", new Date().getHours() < 12
            ? "Morning"
            : new Date().getHours() < 18
                ? "Afternoon"
                : "Evening",
        );

    return prepared;
};

/**
 * Welcome new members
 *
 * @param {import("discord.js").GuildMember} member
 * @param {boolean} [bye=false] Whether the member left or joined
 */
const welcomeHandler = async function(member, bye = false){
    const username = member.displayName ?? member.user.username;
    const mainChat = config.ids.general_channel;
    const channel = /** @type {import("discord.js").TextChannel} */ (await member.guild.channels.fetch(mainChat));
    if (!channel) return;

    if (bye){
        await channel.send(`${username} just left us... <:pain:1434135082742059148>`);
        return;
    }

    const lastMessages = await getLastMessages(member.guild.id);
    const prompt = await preparePrompt(username, lastMessages);
    const res = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [{
            role: "system",
            content: prompt,
        }, {
            role: "user",
            content: `username: ${username}\n\nwrite exactly one welcome message. return only the message.`,
        }],
        n: 1,
    }).catch((error) => {
        Log.error("Error in welcomeHandler:", error);
        return null;
    });

    if (!res) return;

    const response = res.choices[0].message.content?.trim();
    if (!response) return;

    await pushLastMessage(member.guild.id, response);

    const userPing = `<@${member.id}> `;
    await channel.send(userPing + response);
};

export default welcomeHandler;
