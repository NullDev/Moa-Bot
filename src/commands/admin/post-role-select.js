import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import { config } from "../../../config/config.js";
import challengesDb from "../../util/challengesDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("(ADMIN) Post a role-select message for the Daily Integral role.")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
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

            const roleId = config.ids.daily_int_role;

            if (!roleId){
                return await interaction.editReply({
                    content: "Daily Math Challenge role is not configured!",
                });
            }

            if (!interaction.channel || !("send" in interaction.channel)){
                return await interaction.editReply({
                    content: "Cannot send messages in this channel!",
                });
            }

            const messageContent = `React with ✅ below to get the <@&${roleId}> role and be notified of daily Math Challenges!\nRemove your reaction to remove the role.`;

            const roleSelectMessage = await interaction.channel.send({
                content: messageContent,
                // don't ping
                allowedMentions: {
                    parse: [],
                    roles: [],
                },
            });

            await roleSelectMessage.react("✅");

            const roleSelectKey = `guild-${interaction.guildId}.role-select-${roleSelectMessage.id}`;
            await challengesDb.set(roleSelectKey, {
                roleId,
                channelId: interaction.channelId,
                createdAt: new Date().toISOString(),
                createdBy: interaction.user.id,
            });

            Log.info(`Posted role-select message: ${roleSelectMessage.id} by ${interaction.user.tag}`);

            return await interaction.editReply({
                content: `Successfully posted the role-select message! [Jump to message](${roleSelectMessage.url})`,
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error posting role-select message: ", err);

            const errorMessage = "Failed to post the role-select message. Please check the logs.";
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
