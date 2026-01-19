import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import { config } from "../../../config/config.js";
import integralDb from "../../util/integralDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

/**
 * Get ordinal suffix for a day number
 *
 * @param {number} day
 * @returns {string}
 */
const getOrdinalSuffix = function(day){
    if (day > 3 && day < 21) return "th";
    switch (day % 10){
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
};

/**
 * Format date as "Thursday 8th January 2026"
 *
 * @param {Date} date
 * @returns {string}
 */
const formatDate = function(date){
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const dayName = days[date.getDay()];
    const day = date.getDate();
    const monthName = months[date.getMonth()];
    const year = date.getFullYear();

    return `${dayName} ${day}${getOrdinalSuffix(day)} ${monthName} ${year}`;
};

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Post the daily integral challenge.")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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
                ))
        .addUserOption(option =>
            option.setName("proposed_by")
                .setDescription("User who proposed this challenge (optional)")
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

            if (!image.contentType?.startsWith("image/")){
                return await interaction.editReply({
                    content: "The attachment must be an image!",
                });
            }

            const channelId = config.ids.daily_int_channel;
            const roleId = config.ids.daily_int_role;

            if (!channelId || !roleId){
                return await interaction.editReply({
                    content: "Daily integral channel or role is not configured!",
                });
            }

            const channel = await interaction.client.channels.fetch(channelId);
            if (!channel?.isTextBased() || !("send" in channel)){
                return await interaction.editReply({
                    content: "Could not find the daily integral channel!",
                });
            }

            const now = new Date();
            const dateStr = formatDate(now);
            let messageContent = `# ${dateStr} Integral (${difficulty})`;
            messageContent += `\nProposed by: ${proposedBy}`;

            const integralMessage = await channel.send({
                content: messageContent,
                files: [image],
            });

            const thread = await integralMessage.startThread({
                name: `${dateStr} - ${difficulty}`,
                autoArchiveDuration: 1440,
            });

            await thread.send({
                content: `<@&${roleId}>`,
            });

            const integralKey = `guild-${interaction.guildId}.integral-${integralMessage.id}`;
            await integralDb.set(`${integralKey}.date`, now.toISOString());
            await integralDb.set(`${integralKey}.difficulty`, difficulty);
            await integralDb.set(`${integralKey}.threadId`, thread.id);
            await integralDb.set(`${integralKey}.imageUrl`, image.url);
            await integralDb.set(`${integralKey}.solvers`, []);
            await integralDb.set(`${integralKey}.proposedBy`, proposedBy.id);

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
