import getRandomMathFact from "../util/mathFact.js";
import { config } from "../../config/config.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 *
 *
 * @param {import("../service/client.js")} client
 * @return {*}
 */
const sendRandomFact = async function(client){
    const mainChatId = config.ids.general_channel;
    const guild = await client.guilds.fetch(config.ids.guild_id);
    const mainChannel = await guild.channels.fetch(mainChatId);

    if (!mainChannel || !mainChannel.isTextBased()){
        Log.error(`General channel with ID ${mainChatId} not found or is not text-based.`);
        return;
    }

    const { fact, proof } = await getRandomMathFact(true);
    const formattedFact = fact.charAt(0).toLowerCase() + fact.slice(1);
    const finalFact = formattedFact.endsWith(".") ? formattedFact.slice(0, -1) : formattedFact;

    await mainChannel.send("Did you know that " + finalFact + "? :point_up::nerd:" + (
        proof ? `\n-# ((proof)[<${proof}>])` : ""
    )).catch();
};

export default sendRandomFact;
