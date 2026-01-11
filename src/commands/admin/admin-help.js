import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Show an overview of admin commands.")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        if (!interaction.deferred && !interaction.replied){
            await interaction.deferReply({
                flags: [MessageFlags.Ephemeral],
            });
        }

        const userCommands = /** @type {import("../../service/client.js").default} */ (interaction.client)
            .commands.filter(cmd => !!cmd.data.default_member_permissions);

        const str = await Promise.all(userCommands.map(async(cmd) => `**/${cmd.data.name}** - ${cmd.data.description}`));

        const preamble = "List of all admin commands:";
        const responseContent = preamble + "\n\n" + str.join("\n");

        if (interaction.deferred){
            return await interaction.editReply({
                content: responseContent,
            });
        }
        return await interaction.reply({
            content: responseContent,
            flags: [MessageFlags.Ephemeral],
        });
    },
};
