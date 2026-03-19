import fs from "node:fs";
import { Events } from "discord.js";
import registerCommands from "../service/commandRegister.js";
import scheduleCrons from "../service/cronScheduler.js";
import interactionCreateHandler from "./interactionCreate.js";
import setStatus from "../util/setStatus.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Handle client ready event
 *
 * @param {import("../service/client.js").default} client
 * @return {Promise<void>}
 */
const clientReady = async function(client){
    Log.done("Client is ready!");

    const guilds = await client.cluster?.fetchClientValues("guilds.cache.size");
    const guildCount = guilds?.reduce((/** @type {any} */ acc, /** @type {any} */ gc) => Number(acc) + Number(gc), 0);

    Log.info("Logged in as '" + client.user?.tag + "'! Serving in " + guildCount + " servers.");

    await registerCommands(client)
        .then(() => client.on(Events.InteractionCreate, async interaction => interactionCreateHandler(interaction)));

    await scheduleCrons(client);
    await setStatus(client);

    Log.wait("Exporting Server Emojis to JSON file...");
    const emojiData = {};
    client.emojis.cache.forEach(emoji => { // @ts-ignore
        emojiData[":" + emoji.name + ":"] = "<" + (emoji.animated ? "a" : "") + ":" + emoji.name + ":" + emoji.id + ">";
    });
    fs.writeFileSync("data/emojis.json", JSON.stringify(emojiData, null, 4), { encoding: "utf-8" });
    Log.done("Exported " + client.emojis.cache.size + " emojis to data/emojis.txt");
};

export default clientReady;
