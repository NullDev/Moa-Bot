import { SlashCommandBuilder, InteractionContextType } from "discord.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Search the OEIS for a sequence")
        .setContexts([InteractionContextType.Guild])
        .addStringOption((option) =>
            option.setName("sequence")
                .setDescription("The sequence to search for")
                .setRequired(true)),
    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        await interaction.deferReply();

        const seq = interaction.options.get("sequence")?.value;
        if (!seq) return await interaction.editReply({ content: "Invalid argument!" });

        const url = `https://oeis.org/search?q=${seq}&fmt=json`;

        const f = await fetch(url, {
            headers: {
                "User-Agent": "Moa-Bot/1.0 (Discord Bot; +https://github.com/NullDev/Moa-Bot)",
                Accept: "application/json",
            },
        });


        const responseText = await f.text();

        let results;
        try {
            results = JSON.parse(responseText);
        }
        catch {
            console.error("[OEIS] Failed to parse JSON. Full response body:", responseText);
            throw new Error(`OEIS API returned non-JSON response. Status: ${f.status}. Check logs for full HTML response.`);
        }

        if (!results || !results.length) return await interaction.editReply({ content: "¯\\_(ツ)_/¯" });

        const first5 = results.slice(0, 5);

        let res = "Sequence: " + seq + "\n\n";
        first5.forEach((/** @type {{ number: any; name: string; formula: string | any[]; }} */ r, /** @type {number} */ i) => {
            const sequenceId = "A" + String(r.number).padStart(6, "0");
            res += `**${i + 1}.** ${r.name.replaceAll("*", "\\*").replaceAll("_", "\\_").replaceAll("`", "\\`")} `;
            if (!!r.formula && !!r.formula.length && !!r.formula[0]) res += `- ${r.formula[0].replaceAll("*", "\\*").replaceAll("_", "\\_").replaceAll("`", "\\`")} - `;
            res += `([${sequenceId}](<https://oeis.org/${sequenceId}>))\n`;
        });

        return await interaction.editReply({
            content: res,
        });
    },
};
