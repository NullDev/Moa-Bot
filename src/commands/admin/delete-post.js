import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import integralDb from "../../util/integralDb.js";
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
    // Format: https://(canary.|ptb.)discord.com/channels/GUILD_ID/CHANNEL_ID/MESSAGE_ID
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
        .setDescription("Delete an integral post, its thread, and clean up the database.")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption((option) =>
            option.setName("message")
                .setDescription("Link to the integral message to delete")
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

            const integralKey = `guild-${guildId}.integral-${messageId}`;
            const integralData = await integralDb.get(integralKey);

            if (!integralData){
                return await interaction.editReply({
                    content: "This message is not a registered integral challenge!",
                });
            }

            const solvers = await integralDb.get(`${integralKey}.solvers`) || [];

            for (const odSolverId of solvers){
                const userKey = `guild-${guildId}.user-${odSolverId}`;
                const userSolutions = await integralDb.get(`${userKey}.solutions`) || [];

                const updatedSolutions = userSolutions.filter(
                    (/** @type {{ messageId: string }} */ sol) => sol.messageId !== messageId,
                );

                if (updatedSolutions.length > 0){
                    await integralDb.set(`${userKey}.solutions`, updatedSolutions);
                }
                else {
                    await integralDb.delete(`${userKey}.solutions`);
                }
            }

            const { threadId } = integralData;
            if (threadId){
                try {
                    const thread = await interaction.client.channels.fetch(threadId).catch(() => null);
                    if (thread?.isThread()){
                        await thread.delete("Integral post deleted by admin");
                    }
                }
                catch (err){
                    Log.warn(`Could not delete thread ${threadId}: ${err}`);
                }
            }

            await message.delete();

            await integralDb.delete(integralKey);

            Log.info(`Deleted integral post ${messageId} by ${interaction.user.tag} (${solvers.length} solver entries cleaned)`);

            return await interaction.editReply({
                content: `Successfully deleted the integral post and cleaned up ${solvers.length} solver entries from the database.`,
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error deleting integral post: ", err);

            const errorMessage = "Failed to delete integral post. Please check the logs.";
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
