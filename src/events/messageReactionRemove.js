import integralDb from "../util/integralDb.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Handle messageReactionRemove event
 *
 * @param {import("discord.js").MessageReaction | import("discord.js").PartialMessageReaction} reaction
 * @param {import("discord.js").User | import("discord.js").PartialUser} user
 * @return {Promise<void>}
 */
const messageReactionRemove = async function(reaction, user){
    if (user.bot) return;

    if (reaction.partial){
        try {
            await reaction.fetch();
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error fetching reaction: ", err);
            return;
        }
    }

    if (reaction.emoji.name !== "✅") return;

    const roleSelectKey = `guild-${reaction.message.guildId}.role-select-${reaction.message.id}`;
    const roleSelectData = await integralDb.get(roleSelectKey);

    if (!roleSelectData) return;

    try {
        const member = await reaction.message.guild?.members.fetch(user.id);
        if (!member) return;

        const { roleId } = roleSelectData;
        if (member.roles.cache.has(roleId)){
            await member.roles.remove(roleId);
            Log.info(`Removed role ${roleId} from user ${user.tag} via role-select`);
        }
    }
    catch (error){
        const err = error instanceof Error ? error : new Error(String(error));
        Log.error("Error removing role via role-select: ", err);
    }
};

export default messageReactionRemove;
