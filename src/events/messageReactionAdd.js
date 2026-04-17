import { PermissionFlagsBits } from "discord.js";
import challengesDb from "../util/challengesDb.js";
import { config } from "../../config/config.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/**
 * Fail message
 *
 * @param {import("discord.js").MessageReaction | import("discord.js").PartialMessageReaction} reaction
 * @param {import("discord.js").TextChannel | import("discord.js").NewsChannel | import("discord.js").ThreadChannel} channel
 * @param {import("discord.js").User | import("discord.js").PartialUser} solver
 * @param {import("discord.js").User | import("discord.js").PartialUser} user
 * @return {Promise<void>}
 */
const fail = async function(reaction, channel, solver, user){
    await reaction.users.remove(user.id);
    const who = solver.id === config.ids.moabot ? "I" : "that bot";
    await channel.send({
        content: `<@${user.id}>, errm... ackshually ${who} can't solve Math Challenges :point_up::nerd: \nI removed the reaction.`,
        files: ["./assets/errm.jpg"],
    });
};

/**
 * Handle messageReactionAdd event
 *
 * @param {import("discord.js").MessageReaction | import("discord.js").PartialMessageReaction} reaction
 * @param {import("discord.js").User | import("discord.js").PartialUser} user
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

    if (reaction.emoji.id === "1478725030979305482"){
        const texKey = `guild-${reaction.message.guildId}.tex-${reaction.message.id}`;
        const texOwner = await challengesDb.get(texKey);

        if (!texOwner) return;

        if (user.id !== texOwner){
            await reaction.users.remove(user.id);
            return;
        }

        await challengesDb.delete(texKey);
        await reaction.message.delete();
        return;
    }

    if (reaction.emoji.name !== "✅") return;

    const roleSelectKey = `guild-${reaction.message.guildId}.role-select-${reaction.message.id}`;
    const roleSelectData = await challengesDb.get(roleSelectKey);

    if (roleSelectData){
        try {
            const member = await reaction.message.guild?.members.fetch(user.id);
            if (!member) return;

            const { roleId } = roleSelectData;
            if (!member.roles.cache.has(roleId)){
                await member.roles.add(roleId);
                Log.info(`Added role ${roleId} to user ${user.tag} via role-select`);
            }
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error adding role via role-select: ", err);
        }
        return;
    }

    const {channel} = reaction.message;
    if (!channel.isThread()) return;

    try {
        const parentChannel = channel.parent;
        if (!parentChannel?.isTextBased()) return;

        const parentMessage = await parentChannel.messages.fetch(channel.id);
        if (!parentMessage) return;

        const integralKey = `guild-${reaction.message.guildId}.integral-${parentMessage.id}`;

        const integralData = await challengesDb.get(integralKey);
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
                            content: `<@${user.id}>, errm... ackshually ${who} can't solve Math Challenges :point_up::nerd: \nBut I'm guessing you meant <@${refUser.id}> so I'll use them instead.`,
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

        const solvers = await challengesDb.get(`${integralKey}.solvers`) || [];

        if (solvers.includes(solver.id)){
            Log.info(`Solver ${solver.tag} already in list for Math Challenge ${parentMessage.id}`);
            await channel.send({
                content: `<@${user.id}>, seems like you are blind. <@${solver.id}> has already solved this Math Challenge.\nI removed the reaction...`,
            });
            await reaction.users.remove(user.id);
            return;
        }

        solvers.push(solver.id);
        await challengesDb.set(`${integralKey}.solvers`, solvers);

        const userKey = `guild-${reaction.message.guildId}.user-${solver.id}`;
        const userSolutions = await challengesDb.get(`${userKey}.solutions`) || [];

        userSolutions.push({
            date: integralData.date,
            messageId: parentMessage.id,
            difficulty: integralData.difficulty,
        });

        await challengesDb.set(`${userKey}.solutions`, userSolutions);

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

        Log.info(`Added solver ${solver.tag} to Math Challenge ${parentMessage.id}`);
    }
    catch (error){
        const err = error instanceof Error ? error : new Error(String(error));
        Log.error("Error handling reaction: ", err);
    }
};

export default messageReactionAdd;
