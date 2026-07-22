import fs from "node:fs/promises";
import OpenAI from "openai";
import { config } from "../../config/config.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/* eslint-disable no-nested-ternary */

const openai = new OpenAI({
    apiKey: config.openai.token,
});

/**
 * Prepare the prompt for usage
 *
 * @param {String} username
 * @returns {Promise<String>}
 */
const preparePrompt = async function(username){
    const prompt = await fs.readFile("./data/welcome_prompt.txt", "utf-8");

    const prepared = prompt
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

    const prompt = await preparePrompt(username);
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
        temperature: 0.9,
        top_p: 0.95,
        max_completion_tokens: 50,
    }).catch((error) => {
        Log.error("Error in welcomeHandler:", error);
        return null;
    });

    if (!res) return;

    const response = res.choices[0].message.content?.trim();
    if (!response) return;

    const userPing = `<@${member.id}> `;
    await channel.send(userPing + response);
};

export default welcomeHandler;
