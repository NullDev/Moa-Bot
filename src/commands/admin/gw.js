import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    InteractionContextType,
} from "discord.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("Ghostwriter")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option.setName("text")
                .setDescription("Text that you want to write as Moa Bot")
                .setRequired(true))
        .addUserOption((option) =>
            option.setName("user")
                .setDescription("The user you want to impersonate")
                .setRequired(false))
        .addStringOption((option) =>
            option.setName("replyid")
                .setDescription("The message ID to reply to")
                .setRequired(false)),

    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const text = interaction.options.getString("text", true);
        const user = interaction.options.getUser("user");
        const replyId = interaction.options.getString("replyid");

        try {
            // eslint-disable-next-line prefer-destructuring
            const channel = /** @type {import("discord.js").TextChannel} */ (interaction.channel);
            if (!channel || !channel.isTextBased()){
                await interaction.editReply("❌ Could not access that channel.");
                return;
            }

            if (user){
                const member = await channel.guild.members.fetch(user.id).catch(() => null);
                if (!member){
                    await interaction.editReply("❌ Could not find that user in this guild.");
                    return;
                }

                const name = member.nickname || member.displayName || user.username;
                const avatar = (user.displayAvatarURL() || "https://cdn.discordapp.com/embed/avatars/0.png").replace(".gif", ".png");

                const webhook = await channel.createWebhook({
                    name,
                    avatar,
                });

                await webhook.send({
                    content: text,
                    username: name,
                    avatarURL: avatar,
                }).catch(() => null);

                await webhook.delete().catch(() => null);
                await interaction.editReply("✅ Message sent as impersonation.");
            }
            else {
                if (replyId){
                    const msg = await channel.messages.fetch(replyId).catch(() => null);
                    if (msg){
                        await msg.reply(text).catch(() => null);
                    }
                    else {
                        await channel.send(text).catch(() => null);
                    }
                }
                else {
                    await channel.send(text).catch(() => null);
                }
                await interaction.editReply("✅ Message sent.");
            }
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("gw failed: ", err);
            await interaction.editReply("❌ An error occurred while trying to send the message.");
        }
    },
};
