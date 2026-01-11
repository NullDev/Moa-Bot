import { SlashCommandBuilder, InteractionContextType, MessageFlags, EmbedBuilder } from "discord.js";
import integralDb from "../../util/integralDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

/**
 * Get all users with solutions in the guild
 *
 * @param {string} guildId
 * @returns {Promise<Array<{userId: string, count: number}>>}
 */
const getLeaderboard = async function(guildId){
    try {
        const guildData = await integralDb.get(`guild-${guildId}`);
        const userCounts = new Map();

        if (!guildData || typeof guildData !== "object"){
            return [];
        }

        for (const [key, value] of Object.entries(guildData)){
            const match = key.match(/^user-(\d+)$/);
            if (match && value && typeof value === "object"){
                const userId = match[1];
                const {solutions} = value;
                if (Array.isArray(solutions) && solutions.length > 0){
                    userCounts.set(userId, solutions.length);
                }
            }
        }

        return Array.from(userCounts.entries())
            .map(([userId, count]) => ({ userId, count }))
            .sort((a, b) => b.count - a.count);
    }
    catch (error){
        const err = error instanceof Error ? error : new Error(String(error));
        Log.error("Error getting leaderboard: ", err);
        return [];
    }
};

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("View integral solving statistics.")
        .setContexts([InteractionContextType.Guild])
        .addUserOption(option =>
            option.setName("user")
                .setDescription("User to view stats for (defaults to yourself)")
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

            const targetUser = interaction.options.getUser("user") || interaction.user;
            const userKey = `guild-${interaction.guildId}.user-${targetUser.id}`;

            const solutions = await integralDb.get(`${userKey}.solutions`) || [];

            if (solutions.length === 0){
                return await interaction.editReply({
                    content: targetUser.id === interaction.user.id
                        ? "You haven't solved any integrals yet!"
                        : `${targetUser} hasn't solved any integrals yet!`,
                });
            }

            const difficultyCount = {
                Easy: 0,
                Mild: 0,
                "Low Intermediate": 0,
                Intermediate: 0,
                "High Intermediate": 0,
                "Advanced Elementary": 0,
                "Non-Elementary": 0,
            };

            for (const solution of solutions){
                const diff = solution.difficulty;
                if (diff in difficultyCount){
                    // @ts-ignore
                    difficultyCount[diff]++;
                }
            }

            const leaderboard = await getLeaderboard(interaction.guildId || "");
            const position = leaderboard.findIndex(entry => entry.userId === targetUser.id) + 1;

            const recentSolutions = solutions.slice(-5).reverse();
            const recentText = await Promise.all(recentSolutions.map(async(/** @type {{ date: string | number | Date; difficulty: any; }} */ sol) => {
                const date = new Date(sol.date);
                const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                return `• ${dateStr} - **${sol.difficulty}**`;
            }));

            const embed = new EmbedBuilder()
                .setTitle(`${targetUser.username}'s Integral Statistics`)
                .setColor(0x5865F2)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: "Total Solutions", value: `${solutions.length}`, inline: true },
                    { name: "Leaderboard Position", value: position > 0 ? `#${position}` : "N/A", inline: true },
                    { name: "\u200B", value: "\u200B", inline: true },
                    { name: "Easy", value: `${difficultyCount.Easy}`, inline: true },
                    { name: "Mild", value: `${difficultyCount.Mild}`, inline: true },
                    { name: "Low Int.", value: `${difficultyCount["Low Intermediate"]}`, inline: true },
                    { name: "Intermediate", value: `${difficultyCount.Intermediate}`, inline: true },
                    { name: "High Int.", value: `${difficultyCount["High Intermediate"]}`, inline: true },
                    { name: "Adv. Elem.", value: `${difficultyCount["Advanced Elementary"]}`, inline: true },
                    { name: "Non-Elem.", value: `${difficultyCount["Non-Elementary"]}`, inline: true },
                    { name: "\u200B", value: "\u200B", inline: true },
                    { name: "\u200B", value: "\u200B", inline: true },
                );

            if (recentText.length > 0){
                embed.addFields({
                    name: "Recent Solutions",
                    value: recentText.join("\n"),
                });
            }

            return await interaction.editReply({
                embeds: [embed],
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error getting integral stats: ", err);

            const errorMessage = "Failed to retrieve integral statistics.";
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
