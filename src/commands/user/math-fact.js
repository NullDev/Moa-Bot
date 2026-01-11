import { SlashCommandBuilder, InteractionContextType } from "discord.js";
import getRandomMathFact from "../../util/mathFact.js";
import defaults from "../../util/defaults.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Get a random math fact.")
        .setContexts([InteractionContextType.Guild]),
    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        const embed = {
            color: defaults.embed_color,
            title: ":abacus:┃Random Math Fact",
            description: ":heavy_minus_sign::heavy_minus_sign::heavy_minus_sign: \n" + getRandomMathFact() + "\n:heavy_minus_sign::heavy_minus_sign::heavy_minus_sign:",
            footer: {
                text: `Requested by ${interaction.user.displayName ?? interaction.user.tag}`,
                icon_url: interaction.user.displayAvatarURL(),
            },
        };

        return await interaction.reply({ embeds: [embed] });
    },
};
