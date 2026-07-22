import welcomeHandler from "../service/welcomeHandler.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Handle guildMemberAdd event
 *
 * @param {import("discord.js").GuildMember | import("discord.js").PartialGuildMember} member
 * @return {Promise<void>}
 */
const guildMemberRemove = async function(member){
    if (member.partial) return;
    await welcomeHandler(member, true);
};

export default guildMemberRemove;
