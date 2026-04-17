import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import challengesDb from "../../util/challengesDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

/**
 * Parse a Discord message link to extract IDs
 *
 * @param {string} link
 * @returns {{ guildId: string, channelId: string, messageId: string } | null}
 */
const parseMessageLink = function(link){
    // Format: https://(canary|ptb)discord.com/channels/GUILD_ID/CHANNEL_ID/MESSAGE_ID
    const regex = /(?:canary\.|ptb\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
    const match = link.match(regex);

    if (!match) return null;

    return {
        guildId: match[1],
        channelId: match[2],
        messageId: match[3],
    };
};

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("(ADMIN) Remove a solver from a Math Challenge.")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption((option) =>
            option.setName("message")
                .setDescription("Link to the Math Challenge message to remove the solver from")
                .setRequired(true))
        .addUserOption((option) =>
            option.setName("user")
                .setDescription("The user you want to remove as solver")
                .setRequired(true)),
    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        try {
            if (!interaction.deferred && !interaction.replied){
                await interaction.deferReply({
                    flags: [MessageFlags.Ephemeral],
                });
            }

            const messageLink = interaction.options.getString("message", true);
            const user = interaction.options.getUser("user", true);

            const parsed = parseMessageLink(messageLink);
            if (!parsed){
                return await interaction.editReply({
                    content: "Invalid message link! Please provide a valid Discord message link.",
                });
            }

            const { guildId, channelId, messageId } = parsed;

            if (guildId !== interaction.guildId){
                return await interaction.editReply({
                    content: "The message link must be from this server!",
                });
            }

            const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
            if (!channel?.isTextBased() || !("messages" in channel)){
                return await interaction.editReply({
                    content: "Could not find the channel!",
                });
            }

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message){
                return await interaction.editReply({
                    content: "Could not find the message!",
                });
            }

            const challengeKey = `guild-${guildId}.integral-${messageId}`;
            const challengeData = await challengesDb.get(challengeKey);

            if (!challengeData){
                return await interaction.editReply({
                    content: "This message is not a registered Math Challenge!",
                });
            }

            const solvers = await challengesDb.get(`${challengeKey}.solvers`) || [];

            if (!solvers.includes(user.id)){
                return await interaction.editReply({
                    content: `${user} is not in the solvers list for this Math Challenge!`,
                });
            }

            const updatedSolvers = solvers.filter((/** @type {string} */ id) => id !== user.id);
            await challengesDb.set(`${challengeKey}.solvers`, updatedSolvers);

            const userKey = `guild-${guildId}.user-${user.id}`;
            const userSolutions = await challengesDb.get(`${userKey}.solutions`) || [];

            const updatedSolutions = userSolutions.filter(
                (/** @type {{ messageId: string }} */ sol) => sol.messageId !== messageId,
            );
            await challengesDb.set(`${userKey}.solutions`, updatedSolutions);

            const currentContent = message.content ?? "";

            if (updatedSolvers.length === 0){
                const newContent = currentContent.replace(
                    /\n?\n?\*\*Solvers:\*{1,2}[\s\S]*$/i,
                    "",
                ).trimEnd();

                await message.edit({ content: newContent });
            }
            else {
                const solverMentions = await Promise.all(
                    updatedSolvers.map(async(/** @type {string} */ solverId) => {
                        try {
                            const solverUser = await interaction.client.users.fetch(solverId);
                            return solverUser ? `${solverUser}` : `<@${solverId}>`;
                        }
                        catch {
                            return `<@${solverId}>`;
                        }
                    }),
                );

                const contentWithoutSolvers = currentContent.replace(
                    /\n?\n?\*\*Solvers:\*{1,2}[\s\S]*$/i,
                    "",
                ).trimEnd();

                const newContent = contentWithoutSolvers + `\n\n**Solvers:**\n${solverMentions.join("\n")}`;
                await message.edit({ content: newContent });
            }

            Log.info(`Removed solver ${user.tag} from Math Challenge ${messageId} by ${interaction.user.tag}`);

            return await interaction.editReply({
                content: `Successfully removed ${user} from the solvers list for this Math Challenge.`,
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error removing solver: ", err);

            const errorMessage = "Failed to remove solver. Please check the logs.";
            if (interaction.deferred){
                return await interaction.editReply({ content: errorMessage });
            }
            return await interaction.reply({
                content: errorMessage,
                flags: [MessageFlags.Ephemeral],
            });
        }
    },
};
