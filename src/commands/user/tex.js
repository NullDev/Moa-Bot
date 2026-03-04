import { SlashCommandBuilder, InteractionContextType } from "discord.js";
import texRender from "../../util/texRender.js";
import integralDb from "../../util/integralDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Render a LaTeX expression.")
        .setContexts([InteractionContextType.Guild])
        .addStringOption((option) =>
            option.setName("expression")
                .setDescription("The LaTeX expression to render")
                .setRequired(true))
        .addBooleanOption((option) =>
            option.setName("spoiler")
                .setDescription("Send the image as a spoiler")
                .setRequired(false)),
    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        await interaction.deferReply();

        if (process.platform === "win32"){
            return await interaction.editReply(
                "The bot is currently running on Windows and therefore cannot execute this command.",
            );
        }

        const expr = interaction.options.get("expression")?.value;
        const spoiler = interaction.options.getBoolean("spoiler") ?? false;

        if (!expr) return await interaction.editReply({ content: "Invalid argument!" });

        const stream = texRender(String(expr));
        if (!stream) return await interaction.editReply({ content: "¯\\_(ツ)_/¯" });

        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        const message = await interaction.editReply({
            files: [
                {
                    attachment: buffer,
                    name: spoiler ? "SPOILER_render.png" : "render.png",
                },
            ],
        });

        try {
            await message.react("<:del:1478725030979305482>");
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Error adding reaction: ", err);
        }

        await integralDb.set(`guild-${interaction.guildId}.tex-${message.id}`, interaction.user.id);

        return message;
    },
};
