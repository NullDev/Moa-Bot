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
};

export default clientReady;
