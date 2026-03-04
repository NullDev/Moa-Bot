import { SlashCommandBuilder, InteractionContextType, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { config } from "../../../config/config.js";
import integralDb from "../../util/integralDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

/**
 * Build the proposal message content
 *
 * @param {string} proposerMention
 * @param {string} difficulty
 * @param {boolean} posted
 * @returns {string}
 */
const buildProposalContent = (proposerMention, difficulty, posted) =>
    `**Integral Proposal**\nProposer: ${proposerMention}\nProposed Difficulty: ${difficulty}\nStatus: ${posted ? "✅ Posted" : "Not Posted"}`;

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Propose a daily integral challenge for mods to review.")
        .setContexts([InteractionContextType.Guild])
        .addAttachmentOption(option =>
            option.setName("image")
                .setDescription("The integral challenge image")
                .setRequired(true))
        .addStringOption(option =>
            option.setName("difficulty")
                .setDescription("Difficulty level of the integral")
                .setRequired(true)
                .addChoices(
                    { name: "Easy", value: "Easy" },
                    { name: "Mild", value: "Mild" },
                    { name: "Low Intermediate", value: "Low Intermediate" },
                    { name: "Intermediate", value: "Intermediate" },
                    { name: "High Intermediate", value: "High Intermediate" },
                    { name: "Advanced Elementary", value: "Advanced Elementary" },
                    { name: "Non-Elementary", value: "Non-Elementary" },
                )),
    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const image = interaction.options.getAttachment("image", true);
            const difficulty = interaction.options.getString("difficulty", true);

            if (!image.contentType?.startsWith("image/")){
                return await interaction.editReply({ content: "The attachment must be an image!" });
            }

            const proposalChannelId = config.ids.int_proposal_channel;
            if (!proposalChannelId){
                return await interaction.editReply({ content: "The proposal channel is not configured!" });
            }

            const proposalChannel = await interaction.client.channels.fetch(proposalChannelId);
            if (!proposalChannel?.isTextBased() || !("send" in proposalChannel)){
                return await interaction.editReply({ content: "Could not find the proposal channel!" });
            }

            const postButton = new ButtonBuilder()
                .setCustomId("post_proposal")
                .setLabel("Post Integral")
                .setStyle(ButtonStyle.Success);

            const changeDifficultyButton = new ButtonBuilder()
                .setCustomId("change_difficulty")
                .setLabel("Change Difficulty")
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(postButton, changeDifficultyButton);

            const proposalMessage = await proposalChannel.send({
                content: buildProposalContent(`${interaction.user}`, difficulty, false),
                files: [image],
                components: [/** @type {any} */ (row)],
            });

            const proposalKey = `guild-${interaction.guildId}.proposal-${proposalMessage.id}`;
            await integralDb.set(`${proposalKey}.proposerId`, interaction.user.id);
            await integralDb.set(`${proposalKey}.difficulty`, difficulty);
            await integralDb.set(`${proposalKey}.posted`, false);

            Log.info(`Integral proposal submitted by ${interaction.user.tag}: message ${proposalMessage.id}`);

            return await interaction.editReply({
                content: "Your integral proposal has been submitted for review! Thank you c:",
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error submitting integral proposal: ", err);

            const errorMessage = "Failed to submit the proposal. Please check the logs.";
            if (interaction.deferred){
                return await interaction.editReply({ content: errorMessage });
            }
            return await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
        }
    },
};
