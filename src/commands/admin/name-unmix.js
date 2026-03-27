import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import integralDb from "../../util/integralDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("(ADMIN) Restore original nicknames after a name mix.")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const guildId   = interaction.guildId ?? "";
        const {guild} = interaction;
        const backupKey = `guild-${guildId}.name-mix-backup`;

        /** @type {Record<string, string|null> | null} */
        const backup = await integralDb.get(backupKey);
        if (!backup){
            return await interaction.editReply({
                content: "No active name mix found. Nothing to restore.",
            });
        }

        // Populate member cache via REST (avoids gateway opcode 8 rate limit)
        let afterId = undefined;
        while (true){
            const batch = await guild?.members.fetch({ limit: 1000, ...(afterId ? { after: afterId } : {}) });
            if (!batch?.size || batch.size < 1000) break;
            afterId = /** @type {string} */ ([...batch.keys()].at(-1));
        }

        let restored = 0;
        let failed   = 0;
        let notFound = 0;

        const restoreable = [];
        for (const [userId, originalNickname] of Object.entries(backup)){
            const member = guild?.members.cache.get(userId);
            if (!member){ notFound++; continue; }
            if (!member.manageable){ failed++; continue; }
            restoreable.push({ member, originalNickname });
        }

        const results = await Promise.allSettled(
            // null removes the custom nickname and falls back to their username
            restoreable.map(({ member, originalNickname }) =>
                member.setNickname(originalNickname, "April Fools name mix restore")),
        );
        for (const result of results){
            if (result.status === "fulfilled") restored++;
            else {
                failed++;
                Log.warn(`name-unmix: could not restore a nickname: ${result.reason}`);
            }
        }

        // Clear backup regardless so it doesn't block future mixes
        await integralDb.delete(backupKey);

        Log.info(`name-unmix: ${restored} restored, ${failed} failed, ${notFound} not found — by ${interaction.user.tag}`);

        return await interaction.editReply({
            content: [
                "**Names restored!**",
                `- **${restored}** nicknames restored`,
                ...(failed   ? [`- **${failed}** skipped (insufficient permissions)`] : []),
                ...(notFound ? [`- **${notFound}** members no longer in server`]      : []),
            ].join("\n"),
        });
    },
};
