import { ActivityType } from "discord.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Set bot status
 *
 * @param {import("discord.js").Client} client
 */
const setStatus = async function(client){
    client.user?.setActivity({ name: "Solving Integrals... Like a nerd.", type: ActivityType.Playing });
    client.user?.setStatus("online");
};

export default setStatus;
