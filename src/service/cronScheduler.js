import cron from "node-cron";
import Log from "../util/log.js";
import LogHandler from "../crons/removeOldLogs.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Schedule all crons
 *
 * @param {import("../service/client.js").default} client
 */ // eslint-disable-next-line no-unused-vars
const scheduleCrons = async function(client){
    // daily cron
    cron.schedule("0 0 * * *", async() => {
        await LogHandler.removeOldLogs();
    });

    const cronCount = cron.getTasks().size;
    Log.done("Scheduled " + cronCount + " Crons.");

    // start jobs on init
    await LogHandler.removeOldLogs();
};

export default scheduleCrons;
