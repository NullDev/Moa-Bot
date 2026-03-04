import path from "node:path";
import { QuickDB } from "quick.db";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import executeCode from "../service/codeExecution.js";
import executeSage from "../service/sageExecution.js";
import { postIntegral } from "../util/postIntegral.js";
import integralDb from "../util/integralDb.js";
import { config } from "../../config/config.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const statDb = new QuickDB({
    filePath: path.resolve("./data/cmd_stats.sqlite"),
});

/**
 * Build the proposal message content
 *
 * @param {string} proposerMention
 * @param {string} difficulty
 * @param {string} status
 * @param {string} [actorMention]
 * @param {string} [actorLabel]
 * @returns {string}
 */
const buildProposalContent = (proposerMention, difficulty, status, actorMention, actorLabel = "Approved by") => {
    let content = `**Integral Proposal**\nProposer: ${proposerMention}\nProposed Difficulty: ${difficulty}\nStatus: ${status}`;
    if (actorMention) content += `\n${actorLabel}: ${actorMention}`;
    return content;
};

const DIFFICULTY_CHOICES = [
    { name: "Easy", value: "Easy" },
    { name: "Mild", value: "Mild" },
    { name: "Low Intermediate", value: "Low Intermediate" },
    { name: "Intermediate", value: "Intermediate" },
    { name: "High Intermediate", value: "High Intermediate" },
    { name: "Advanced Elementary", value: "Advanced Elementary" },
    { name: "Non-Elementary", value: "Non-Elementary" },
];

/**
 * Build disabled action row for a posted proposal
 *
 * @returns {ActionRowBuilder}
 */
const buildDisabledRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId("post_proposal")
        .setLabel("Post Integral")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
    new ButtonBuilder()
        .setCustomId("change_difficulty")
        .setLabel("Change Difficulty")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    new ButtonBuilder()
        .setCustomId("reject_proposal")
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
);

/**
 * Handle "Post Integral" button
 *
 * @param {import("discord.js").ButtonInteraction} interaction
 */
const handlePostProposal = async function(interaction){
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)){
        return await interaction.reply({ content: "You don't have permission to post integrals!", flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    const msgId = interaction.message.id;
    const guildId = interaction.guildId ?? "";
    const proposalKey = `guild-${guildId}.proposal-${msgId}`;

    const proposalData = await integralDb.get(proposalKey);
    if (!proposalData){
        return await interaction.followUp({ content: "Proposal data not found in the database!", flags: [MessageFlags.Ephemeral] });
    }

    if (proposalData.posted){
        return await interaction.followUp({ content: "This integral has already been posted!", flags: [MessageFlags.Ephemeral] });
    }

    const image = interaction.message.attachments.first();
    if (!image){
        return await interaction.followUp({ content: "No image found in the proposal message!", flags: [MessageFlags.Ephemeral] });
    }

    try {
        const proposer = await interaction.client.users.fetch(proposalData.proposerId);
        const { integralMessage } = await postIntegral(
            interaction.client,
            guildId,
            image,
            proposalData.difficulty,
            proposer,
        );

        await integralDb.set(`${proposalKey}.posted`, true);

        await interaction.message.edit({
            content: buildProposalContent(`<@${proposalData.proposerId}>`, proposalData.difficulty, "✅ Posted", `${interaction.user}`),
            components: [/** @type {any} */ (buildDisabledRow())],
        });

        Log.info(`Proposal ${msgId} posted as integral ${integralMessage.id} by ${interaction.user.tag}`);

        return await interaction.followUp({
            content: `✅ Posted! [Jump to integral](${integralMessage.url})`,
            flags: [MessageFlags.Ephemeral],
        });
    }
    catch (error){
        const err = error instanceof Error ? error : new Error(String(error));
        Log.error("Error posting proposal as integral: ", err);
        return await interaction.followUp({ content: "Failed to post the integral. Please check the logs.", flags: [MessageFlags.Ephemeral] });
    }
};

/**
 * Handle "Change Difficulty" button
 *
 * @param {import("discord.js").ButtonInteraction} interaction
 */
const handleChangeDifficulty = async function(interaction){
    const proposalKey = `guild-${interaction.guildId}.proposal-${interaction.message.id}`;
    const proposalData = await integralDb.get(proposalKey);

    if (!proposalData){
        return await interaction.reply({ content: "Proposal data not found in the database!", flags: [MessageFlags.Ephemeral] });
    }

    if (proposalData.posted){
        return await interaction.reply({ content: "This integral has already been posted — difficulty cannot be changed.", flags: [MessageFlags.Ephemeral] });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`select_difficulty:${interaction.message.id}`)
        .setPlaceholder(`Current: ${proposalData.difficulty}`)
        .addOptions(
            DIFFICULTY_CHOICES.map(({ name, value }) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(name)
                    .setValue(value)
                    .setDefault(value === proposalData.difficulty),
            ),
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return await interaction.reply({
        content: "Select the new difficulty:",
        components: [/** @type {any} */ (row)],
        flags: [MessageFlags.Ephemeral],
    });
};

/**
 * Handle difficulty select menu submission
 *
 * @param {import("discord.js").StringSelectMenuInteraction} interaction
 */
const handleSelectDifficulty = async function(interaction){
    const proposalMsgId = interaction.customId.split(":")[1];
    const guildId = interaction.guildId ?? "";
    const proposalKey = `guild-${guildId}.proposal-${proposalMsgId}`;

    const proposalData = await integralDb.get(proposalKey);
    if (!proposalData){
        return await interaction.update({ content: "Proposal data not found!", components: [] });
    }

    const newDifficulty = interaction.values[0];
    await integralDb.set(`${proposalKey}.difficulty`, newDifficulty);

    try {
        const proposalChannelId = config.ids.int_proposal_channel;
        const proposalChannel = await interaction.client.channels.fetch(proposalChannelId);
        if (proposalChannel?.isTextBased() && "messages" in proposalChannel){
            const proposalMessage = await proposalChannel.messages.fetch(proposalMsgId).catch(() => null);
            if (proposalMessage){
                await proposalMessage.edit({
                    content: buildProposalContent(`<@${proposalData.proposerId}>`, newDifficulty, "Not Posted"),
                });
            }
        }
    }
    catch (error){
        const err = error instanceof Error ? error : new Error(String(error));
        Log.error("Error updating proposal message difficulty: ", err);
    }

    return await interaction.update({ content: `✅ Difficulty updated to **${newDifficulty}**.`, components: [] });
};

/**
 * Handle command Interaction events
 *
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @return {Promise<void>}
 */
const handleCommandInteraction = async function(interaction){
    const command = /** @type {import("../service/client.js").default} */ (interaction.client)
        .commands.get(interaction.commandName);

    if (!command){
        Log.warn(`No command matching ${interaction.commandName} was found.`);
        await interaction.reply({ content: `I don't seem to know the command "${interaction.commandName}"`, ephemeral: true });
        return;
    }

    try {
        await statDb.add(interaction.commandName, 1);
        await command.execute(interaction);
    }
    catch (error){
        const err = error instanceof Error ? error : new Error(String(error));
        Log.error("Error during command execution: ", err);
        if (interaction.replied || interaction.deferred){
            await interaction.followUp({ content: "There was an error while executing this command! =(", ephemeral: true });
        }
        else {
            await interaction.reply({ content: "There was an error while executing this command! =(", ephemeral: true });
        }
    }
};

/**
 * Handle modal submit events
 *
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 */
const handleModalSubmit = async function(interaction){
    if (interaction.customId === "run_code"){
        await executeCode(interaction);
    }

    if (interaction.customId === "sage_math"){
        await executeSage(interaction);
    }
};

/**
 * Handle "Reject" button
 *
 * @param {import("discord.js").ButtonInteraction} interaction
 */
const handleRejectProposal = async function(interaction){
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)){
        return await interaction.reply({ content: "You don't have permission to reject proposals!", flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    const msgId = interaction.message.id;
    const guildId = interaction.guildId ?? "";
    const proposalKey = `guild-${guildId}.proposal-${msgId}`;

    const proposalData = await integralDb.get(proposalKey);
    if (!proposalData){
        return await interaction.followUp({ content: "Proposal data not found in the database!", flags: [MessageFlags.Ephemeral] });
    }

    if (proposalData.posted){
        return await interaction.followUp({ content: "This integral has already been posted and cannot be rejected.", flags: [MessageFlags.Ephemeral] });
    }

    await integralDb.set(`${proposalKey}.posted`, true);

    await interaction.message.edit({
        content: buildProposalContent(`<@${proposalData.proposerId}>`, proposalData.difficulty, "❌ Rejected", `${interaction.user}`, "Rejected by"),
        components: [/** @type {any} */ (buildDisabledRow())],
    });

    Log.info(`Proposal ${msgId} rejected by ${interaction.user.tag}`);
};

/**
 * Handle button interactions
 *
 * @param {import("discord.js").ButtonInteraction} interaction
 */
const handleButtonInteraction = async function(interaction){
    if (interaction.customId === "post_proposal") await handlePostProposal(interaction);
    else if (interaction.customId === "change_difficulty") await handleChangeDifficulty(interaction);
    else if (interaction.customId === "reject_proposal") await handleRejectProposal(interaction);
};

/**
 * Handle string select menu interactions
 *
 * @param {import("discord.js").StringSelectMenuInteraction} interaction
 */
const handleSelectMenuInteraction = async function(interaction){
    if (interaction.customId.startsWith("select_difficulty:")) await handleSelectDifficulty(interaction);
};

/**
 * Handle interactionCreate event
 *
 * @param {import("discord.js").Interaction} interaction
 * @return {Promise<void>}
 */
const interactionCreateHandler = async function(interaction){
    if (interaction.isChatInputCommand()) await handleCommandInteraction(interaction);
    if (interaction.isModalSubmit()) await handleModalSubmit(interaction);
    if (interaction.isButton()) await handleButtonInteraction(interaction);
    if (interaction.isStringSelectMenu()) await handleSelectMenuInteraction(interaction);
};

export default interactionCreateHandler;
