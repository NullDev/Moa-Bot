import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import { postIntegral } from "../../util/postIntegral.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("(ADMIN) EVIL APRIL FOOLS INTEGRAL")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addAttachmentOption(option =>
            option.setName("image")
                .setDescription("The integral challenge image")
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

            const image = interaction.options.getAttachment("image", true);
            const difficulty = "Non-Elementary";
            const proposedBy = await interaction.client.users.fetch("371724846205239326");

            if (!image.contentType?.startsWith("image/")){
                return await interaction.editReply({
                    content: "The attachment must be an image!",
                });
            }

            // april 1st
            const postDate = new Date();
            postDate.setMonth(3);
            postDate.setDate(1);

            const { integralMessage } = await postIntegral(
                interaction.client,
                interaction.guildId ?? "",
                image,
                difficulty,
                proposedBy,
                postDate,
                true, // evil flag
            );

            Log.info(`Posted daily integral: ${integralMessage.id} by ${interaction.user.tag}`);

            return await interaction.editReply({
                content: `Successfully posted the daily integral challenge! [Jump to message](${integralMessage.url})`,
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error posting daily integral: ", err);

            const errorMessage = "Failed to post the daily integral challenge. Please check the logs.";
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
