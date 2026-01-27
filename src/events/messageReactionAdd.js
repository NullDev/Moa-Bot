import { PermissionFlagsBits } from "discord.js";
import integralDb from "../util/integralDb.js";
import { config } from "../../config/config.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Fail message
 *
 * @param {import("discord.js").MessageReaction} reaction
 * @param {import("discord.js").TextChannel | import("discord.js").NewsChannel | import("discord.js").ThreadChannel} channel
 * @param {import("discord.js").User} solver
 * @param {import("discord.js").User} user
 * @return {Promise<void>}
 */
const fail = async function(reaction, channel, solver, user){
    await reaction.users.remove(user.id);
    const who = solver.id === config.ids.moabot ? "I" : "that bot";
    await channel.send({
        content: `<@${user.id}>, errm... ackshually ${who} can't solve integrals :point_up::nerd: \nI removed the reaction.`,
        files: ["./assets/errm.jpg"],
    });
};

/**
 * Handle messageReactionAdd event
 *
 * @param {import("discord.js").MessageReaction} reaction
 * @param {import("discord.js").User} user
 * @return {Promise<void>}
 */
const messageReactionAdd = async function(reaction, user){
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
        const parentChannel = channel.parent;
        if (!parentChannel?.isTextBased()) return;

        const parentMessage = await parentChannel.messages.fetch(channel.id);
        if (!parentMessage) return;

        const integralKey = `guild-${reaction.message.guildId}.integral-${parentMessage.id}`;

        const integralData = await integralDb.get(integralKey);
        if (!integralData) return;

        const member = await reaction.message.guild?.members.fetch(user.id);
        const isModerator = member?.permissions.has(PermissionFlagsBits.ModerateMembers);
        const isProposer = integralData.proposedBy && integralData.proposedBy === user.id;

        if (!isModerator && !isProposer){
            return;
        }

        let solver = reaction.message.author;
        if (!solver) return;
        if (solver.bot){
            if (reaction.message.reference?.messageId || reaction.message.interactionMetadata?.user){
                try {
                    const referencedMessage = reaction.message.reference // @ts-ignore
                        ? await reaction.message.channel.messages.fetch(reaction.message.reference.messageId)
                        : null;
                    if ((referencedMessage && !referencedMessage.author.bot) || (reaction.message.interactionMetadata?.user && !reaction.message.interactionMetadata.user.bot)){
                        const refUser = referencedMessage?.author || reaction.message.interactionMetadata?.user;
                        if (!refUser){
                            await fail(reaction, channel, solver, user);
                            return;
                        }
                        const who = solver.id === config.ids.moabot ? "I" : "that bot";
                        await channel.send({
                            content: `<@${user.id}>, errm... ackshually ${who} can't solve integrals :point_up::nerd: \nBut I'm guessing you meant <@${refUser.id}> so I'll use them instead.`,
                            files: ["./assets/errm.jpg"],
                        });
                        solver = refUser;
                    }
                }
                catch (error){
                    const err = error instanceof Error ? error : new Error(String(error));
                    Log.error("Error fetching referenced message: ", err);
                }
            }
            else {
                try {
                    await fail(reaction, channel, solver, user);
                }
                catch (error){
                    const err = error instanceof Error ? error : new Error(String(error));
                    Log.error("Error removing reaction: ", err);
                }
                return;
            }
        }

        const solvers = await integralDb.get(`${integralKey}.solvers`) || [];

        if (solvers.includes(solver.id)){
            Log.info(`Solver ${solver.tag} already in list for integral ${parentMessage.id}`);
            await channel.send({
                content: `<@${user.id}>, seems like you are blind. <@${solver.id}> has already solved this integral.\nI removed the reaction...`,
            });
            await reaction.users.remove(user.id);
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
            solvers.map(async(/** @type {import("discord.js").UserResolvable} */ solverId) => {
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
            "",
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
