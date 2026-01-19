import cron from "node-cron";
import Log from "../util/log.js";
import LogHandler from "../crons/removeOldLogs.js";
import getRandomMathFact from "../util/mathFact.js";
import { config } from "../../config/config.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Schedule all crons
 *
 * @param {import("../service/client.js").default} client
 */
const scheduleCrons = async function(client){
    // daily cron
    cron.schedule("0 0 * * *", async() => {
        await LogHandler.removeOldLogs();
    });

    // daily at 13:37 cron
    cron.schedule("37 13 * * *", async() => {
        const mainChatId = config.ids.general_channel;
        const guild = await client.guilds.fetch(config.ids.guild_id);
        const mainChannel = await guild.channels.fetch(mainChatId);

        if (!mainChannel || !mainChannel.isTextBased()){
            Log.error(`General channel with ID ${mainChatId} not found or is not text-based.`);
            return;
        }

        const mathFact = getRandomMathFact();
        const formattedFact = mathFact.charAt(0).toLowerCase() + mathFact.slice(1);
        const finalFact = formattedFact.endsWith(".") ? formattedFact.slice(0, -1) : formattedFact;

        await mainChannel.send("Did you know that " + finalFact + "? :point_up::nerd:").catch();
    });

    const cronCount = cron.getTasks().size;
    Log.done("Scheduled " + cronCount + " Crons.");

    // start jobs on init
    await LogHandler.removeOldLogs();
};

export default scheduleCrons;
