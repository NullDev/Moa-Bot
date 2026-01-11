import setStatus from "../util/setStatus.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Handle shard ready event
 *
 * @param {import("../service/client.js").default} client
 * @param {number} shard
 * @return {Promise<void>}
 */
const shardReady = async function(client, shard){
    Log.info(`Shard ${shard} is ready!`);
    await setStatus(client);
};

export default shardReady;
