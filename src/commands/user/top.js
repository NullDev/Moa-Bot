import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import generateImage from "../../service/topImageGenerator.js";
import integralDb from "../../util/integralDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("View the top integral solvers leaderboard.")
        .setContexts([InteractionContextType.Guild]),
    /**
     * @param {import("discord.js").CommandInteraction} interaction
     */
    async execute(interaction){
        try {
            await interaction.deferReply();

            const guildData = await integralDb.get(`guild-${interaction.guildId}`);
            const userStats = new Map();

            if (!guildData || typeof guildData !== "object"){
                return await interaction.editReply({
                    content: "No integral statistics available yet!",
                });
            }

            for (const [key, value] of Object.entries(guildData)){
                const match = key.match(/^user-(\d+)$/);
                if (match && value && typeof value === "object"){
                    const userId = match[1];
                    const {solutions} = value;

                    if (Array.isArray(solutions) && solutions.length > 0){
                        userStats.set(userId, {
                            total: solutions.length,
                        });
                    }
                }
            }

            if (userStats.size === 0){
                return await interaction.editReply({
                    content: "No integral statistics available yet!",
                });
            }

            const sortedUsers = Array.from(userStats.entries())
                .sort((a, b) => b[1].total - a[1].total);

            const USERS_PER_PAGE = 10;
            const totalPages = Math.ceil(sortedUsers.length / USERS_PER_PAGE);
            let currentPage = 0;

            /**
             * Generate page data for a specific page
             *
             * @param {number} page
             */
            const generatePageData = async function(page){
                const start = page * USERS_PER_PAGE;
                const end = start + USERS_PER_PAGE;
                const pageUsers = sortedUsers.slice(start, end);

                const usersForPage = pageUsers.map((entry, index) => {
                    const globalPosition = start + index;
                    let rank = 1;

                    const currentScore = entry[1].total;
                    const scoresAbove = new Set();

                    for (let i = 0; i < globalPosition; i++){
                        if (sortedUsers[i][1].total > currentScore){
                            scoresAbove.add(sortedUsers[i][1].total);
                        }
                    }

                    rank = scoresAbove.size + 1;

                    return [
                        rank,
                        entry[0],
                        entry[1].total,
                    ];
                });

                const usersWithNames = await Promise.all(usersForPage.map(async(user) => {
                    const [rank, userid, total] = user;

                    const member = await interaction.guild?.members.fetch(userid).catch(() => null);
                    if (!member){
                        return [rank, { tag: "Anonymous", pic: null }, total];
                    }

                    return [
                        rank,
                        {
                            tag: member.nickname || member.displayName || member.user.username,
                            pic: member.displayAvatarURL({ extension: "png" }),
                        },
                        total,
                    ];
                }));

                return usersWithNames;
            };

            /**
             * Create buttons for pagination
             *
             * @param {number} page
             */
            const createButtons = function(page){
                const row = new ActionRowBuilder();

                const prevButton = new ButtonBuilder()
                    .setCustomId("prev")
                    .setLabel("◀️ Previous")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0);

                const nextButton = new ButtonBuilder()
                    .setCustomId("next")
                    .setLabel("Next ▶️")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1);

                row.addComponents(prevButton, nextButton);
                return row;
            };

            /**
             * Send or update message with page data
             *
             * @param {number} page
             * @param {boolean} isUpdate
             */
            const sendPage = async function(page, isUpdate = false){
                const pageData = await generatePageData(page);
                const buffer = await generateImage(pageData);

                const topImage = new AttachmentBuilder(buffer)
                    .setName("top.png");

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("🏆┃Top Integral Solvers")
                    .setDescription(`Leaderboard showing top integral solvers by total solutions.\nPage ${page + 1} of ${totalPages}`)
                    .setImage("attachment://top.png");

                const messageOptions = {
                    files: [topImage],
                    embeds: [embed],
                    components: totalPages > 1 ? [createButtons(page)] : [],
                };

                if (isUpdate){
                    // @ts-ignore
                    return await interaction.editReply(messageOptions);
                } // @ts-ignore
                return await interaction.editReply(messageOptions);
            };

            await sendPage(currentPage);

            if (totalPages > 1){
                const message = await interaction.fetchReply();
                const collector = message.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 300000, // 5 minutes
                });

                collector.on("collect", async(buttonInteraction) => {
                    if (buttonInteraction.user.id !== interaction.user.id){
                        await buttonInteraction.reply({
                            content: "Sorry, this list was made for <@" + interaction.user.id + ">, not you. You can't interact with it.",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (buttonInteraction.customId === "prev"){
                        currentPage = Math.max(0, currentPage - 1);
                    }
                    else if (buttonInteraction.customId === "next"){
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    }

                    await buttonInteraction.deferUpdate();
                    await sendPage(currentPage, true);
                });

                collector.on("end", async() => {
                    try {
                        await interaction.editReply({ components: [] });
                    }
                    catch (err){
                        const errObj = err instanceof Error ? err : new Error(String(err));
                        Log.error("Error removing buttons: ", errObj);
                    }
                });
            }

            // eslint-disable-next-line consistent-return
            return;
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error generating top list: ", err);

            return await interaction.editReply({
                content: "Failed to generate the leaderboard. Please try again later.",
            });
        }
    },
};
