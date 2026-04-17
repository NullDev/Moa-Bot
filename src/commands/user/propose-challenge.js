import { SlashCommandBuilder, InteractionContextType, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { config } from "../../../config/config.js";
import challengesDb from "../../util/challengesDb.js";
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
 * @param {string} status
 * @returns {string}
 */
const buildProposalContent = (proposerMention, difficulty, status) =>
    `**Math Challenge Proposal**\nProposer: ${proposerMention}\nProposed Difficulty: ${difficulty}\nStatus: ${status}`;

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Propose a Math Challenge for mods to review.")
        .setContexts([InteractionContextType.Guild])
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
                .setLabel("Post Math Challenge")
                .setStyle(ButtonStyle.Success);

            const changeDifficultyButton = new ButtonBuilder()
                .setCustomId("change_difficulty")
                .setLabel("Change Difficulty")
                .setStyle(ButtonStyle.Secondary);

            const rejectButton = new ButtonBuilder()
                .setCustomId("reject_proposal")
                .setLabel("Reject")
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(postButton, changeDifficultyButton, rejectButton);

            const proposalMessage = await proposalChannel.send({
                content: buildProposalContent(`${interaction.user}`, difficulty, "Not Posted"),
                files: [image],
                components: [/** @type {any} */ (row)],
            });

            const proposalKey = `guild-${interaction.guildId}.proposal-${proposalMessage.id}`;
            await challengesDb.set(`${proposalKey}.proposerId`, interaction.user.id);
            await challengesDb.set(`${proposalKey}.difficulty`, difficulty);
            await challengesDb.set(`${proposalKey}.posted`, false);

            Log.info(`Math Challenge proposal submitted by ${interaction.user.tag}: message ${proposalMessage.id}`);

            return await interaction.editReply({
                content: "Your Math Challenge proposal has been submitted for review! Thank you c:",
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error submitting Math Challenge proposal: ", err);

            const errorMessage = "Failed to submit the proposal. Please check the logs.";
            if (interaction.deferred){
                return await interaction.editReply({ content: errorMessage });
            }
            return await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
        }
    },
};
