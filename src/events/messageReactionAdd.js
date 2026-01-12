import { PermissionFlagsBits } from "discord.js";
import integralDb from "../util/integralDb.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Handle messageReactionAdd event
 *
 * @param {import("discord.js").MessageReaction} reaction
 * @param {import("discord.js").User} user
 * @return {Promise<void>}
 */
const messageReactionAdd = async function(reaction, user){
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

    const {channel} = reaction.message;
    if (!channel.isThread()) return;

    try {
        const member = await reaction.message.guild?.members.fetch(user.id);
        if (!member?.permissions.has(PermissionFlagsBits.ModerateMembers)){
            return;
        }

        const parentChannel = channel.parent;
        if (!parentChannel?.isTextBased()) return;

        const parentMessage = await parentChannel.messages.fetch(channel.id);
        if (!parentMessage) return;

        const integralKey = `guild-${reaction.message.guildId}.integral-${parentMessage.id}`;

        const integralData = await integralDb.get(integralKey);
        if (!integralData) return;

        const solver = reaction.message.author;
        if (!solver || solver.bot) return;

        const solvers = await integralDb.get(`${integralKey}.solvers`) || [];

        if (solvers.includes(solver.id)){
            Log.info(`Solver ${solver.tag} already in list for integral ${parentMessage.id}`);
            return;
        }

        solvers.push(solver.id);
        await integralDb.set(`${integralKey}.solvers`, solvers);

        const userKey = `guild-${reaction.message.guildId}.user-${solver.id}`;
        const userSolutions = await integralDb.get(`${userKey}.solutions`) || [];

        userSolutions.push({
            date: integralData.date,
            messageId: parentMessage.id,
            difficulty: integralData.difficulty,
        });

        await integralDb.set(`${userKey}.solutions`, userSolutions);

        const solverMentions = await Promise.all(
            solvers.map(async (solverId) => {
                try {
                    const solverUser = await reaction.message.client.users.fetch(solverId);
                    return solverUser ? `${solverUser}` : `<@${solverId}>`;
                }
                // eslint-disable-next-line no-unused-vars
                catch (e){
                    return `<@${solverId}>`;
                }
            }),
        );

        const currentContent = parentMessage.content ?? "";

        const contentWithoutSolvers = currentContent.replace(
            /\n?\*\*Solvers:\*{1,2}[\s\S]*$/i,
            ""
        ).trimEnd();

        const newContent = contentWithoutSolvers + `\n\n**Solvers:**\n${solverMentions.join("\n")}`;

        await parentMessage.edit({ content: newContent });
        
        Log.info(`Added solver ${solver.tag} to integral ${parentMessage.id}`);
    }
    catch (error){
        const err = error instanceof Error ? error : new Error(String(error));
        Log.error("Error handling reaction: ", err);
    }
};

export default messageReactionAdd;
