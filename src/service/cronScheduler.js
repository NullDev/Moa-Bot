import cron from "node-cron";
import Log from "../util/log.js";
import LogHandler from "../crons/removeOldLogs.js";
import sendRandomFact from "../crons/sendRandomFact.js";
import { cleanupExpired as cleanupAiRateLimit } from "../ai/aiRateLimit.js";

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
        await sendRandomFact(client);
    });

    // hourly cron: prune expired AI rate-limit entries
    cron.schedule("0 * * * *", () => {
        cleanupAiRateLimit();
    });

    const cronCount = cron.getTasks().size;
    Log.done("Scheduled " + cronCount + " Crons.");

    // start jobs on init
    await LogHandler.removeOldLogs();
};

export default scheduleCrons;
