import welcomeHandler from "../service/welcomeHandler.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Handle guildMemberAdd event
 *
 * @param {import("discord.js").GuildMember} member
 * @return {Promise<void>}
 */
const guildMemberAddHandler = async function(member){
    await welcomeHandler(member);
};

export default guildMemberAddHandler;
