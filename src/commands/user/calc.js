import { SlashCommandBuilder, InteractionContextType } from "discord.js";
import mathEval from "../../util/mathEval.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Evaluate a math expression.")
        .setContexts([InteractionContextType.Guild])
        .addStringOption((option) =>
            option.setName("expression")
                .setDescription("The expression to evaluate")
                .setRequired(true)),
    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        await interaction.deferReply();

        const expr = interaction.options.get("expression")?.value;
        if (!expr) return await interaction.editReply({ content: "Invalid argument!" });

        const { result, error } = await mathEval(String(expr));

        return await interaction.editReply({

            content: result !== null
                ? "`" + expr + "`:\n" + String(result)
                : "Invalid argument!\n" + (!!error ? error : ""),
        });
    },
};
