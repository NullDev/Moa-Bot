import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import { postMathChallenge } from "../../util/postMathChallenge.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("(ADMIN) Post the daily Math Challenge.")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addAttachmentOption(option =>
            option.setName("image")
                .setDescription("The Math Challenge image (preferably LaTeX rendered)")
                .setRequired(true))
        .addStringOption(option =>
            option.setName("difficulty")
                .setDescription("Difficulty level of the Math Challenge")
                .setRequired(true)
                .addChoices(
                    { name: "Easy", value: "Easy" },
                    { name: "Mild", value: "Mild" },
                    { name: "Low Intermediate", value: "Low Intermediate" },
                    { name: "Intermediate", value: "Intermediate" },
                    { name: "High Intermediate", value: "High Intermediate" },
                    { name: "Advanced Elementary", value: "Advanced Elementary" },
                    { name: "Non-Elementary", value: "Non-Elementary" },
                ))
        .addUserOption(option =>
            option.setName("proposed_by")
                .setDescription("User who proposed this challenge (optional)")
                .setRequired(false))
        .addStringOption(option =>
            option.setName("date")
                .setDescription("Override date (YYYY-MM-DD format) for posting past Math Challenges (optional)")
                .setRequired(false)),
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
            const difficulty = interaction.options.getString("difficulty", true);
            const proposedBy = interaction.options.getUser("proposed_by") || interaction.user;
            const dateOverride = interaction.options.getString("date");

            if (!image.contentType?.startsWith("image/")){
                return await interaction.editReply({
                    content: "The attachment must be an image!",
                });
            }

            let postDate = new Date();
            if (dateOverride){
                const parsed = new Date(dateOverride);
                if (isNaN(parsed.getTime())){
                    return await interaction.editReply({
                        content: "Invalid date format! Please use YYYY-MM-DD (e.g., 2026-01-15).",
                    });
                }
                postDate = parsed;
            }

            const { challengeMessage } = await postMathChallenge(
                interaction.client,
                interaction.guildId ?? "",
                image,
                difficulty,
                proposedBy,
                postDate,
            );

            Log.info(`Posted daily Math Challenge: ${challengeMessage.id} by ${interaction.user.tag}`);

            return await interaction.editReply({
                content: `Successfully posted the daily Math Challenge! [Jump to message](${challengeMessage.url})`,
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error posting daily Math Challenge: ", err);

            const errorMessage = "Failed to post the daily Math Challenge. Please check the logs.";
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
