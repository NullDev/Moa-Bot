import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import { MessageLearner } from "../../ai/MsgLearn.js";
import { config } from "../../../config/config.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

/**
 * Fetch every message from a channel/thread in chronological order (oldest first).
 * Uses `after` pagination so Discord returns messages in ascending order.
 *
 * @param {import("discord.js").TextBasedChannel} channel
 * @returns {Promise<import("discord.js").Message[]>}
 */
async function fetchAllMessages(channel){
    const all = [];
    let after = "0";

    while (true){
        const fetched = await channel.messages.fetch({ limit: 100, after });
        if (!fetched.size) break;

        // "after" returns ascending order, but sort defensively
        const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        all.push(...sorted);
        after = sorted[sorted.length - 1].id;

        if (fetched.size < 100) break;
    }

    return all;
}

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("(ADMIN) Crawl all AI channels and backfill brain.sqlite (no duplicates, oldest first).")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const channels = config.ai_included_channels.filter(Boolean);
        if (!channels.length){
            return await interaction.editReply({ content: "No AI channels configured." });
        }

        const brain = new MessageLearner();
        await brain.init();

        let added   = 0;
        let pairs   = 0;
        let skipped = 0;

        /**
         * @param {import("discord.js").Message[]} msgs
         * @param {string} channelId
         */
        const processMsgs = (msgs, channelId) => {
            for (const msg of msgs){
                if (msg.author.bot || msg.system) continue;

                const { inserted, paired } = brain.crawlLearn({
                    id: msg.id,
                    content: msg.content,
                    channelId,
                    authorId: msg.author.id,
                    replyToId: msg.reference?.messageId ?? null,
                    createdTimestamp: msg.createdTimestamp,
                });

                if (inserted){ added++; if (paired) pairs++; }
                else skipped++;
            }
        };

        try {
            Log.info(`Brain crawl started - ${channels.length} channel(s) to process.`);

            for (let i = 0; i < channels.length; i++){
                const channelId = channels[i];
                const beforeAdded   = added;
                const beforeSkipped = skipped;

                await interaction.editReply({
                    content: `Crawling channel ${i + 1}/${channels.length} (<#${channelId}>)...`,
                });

                const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
                if (!channel?.isTextBased()){
                    Log.warn(`Brain crawl: channel ${channelId} not found or not text-based, skipping.`);
                    continue;
                }

                const msgs = await fetchAllMessages(channel);
                processMsgs(msgs, channelId);

                if ("threads" in channel){
                    const threadList = [];

                    const active = await channel.threads.fetchActive().catch(() => null);
                    if (active) threadList.push(...active.threads.values());

                    let before  = undefined;
                    let hasMore = true;
                    while (hasMore){
                        const archived = await channel.threads
                            .fetchArchived({ limit: 100, ...(before ? { before } : {}) })
                            .catch(() => null);

                        if (!archived?.threads.size){ hasMore = false; break; }
                        threadList.push(...archived.threads.values());
                        hasMore = archived.hasMore ?? false;
                        if (hasMore) before = /** @type {string|undefined} */ ([...archived.threads.values()].pop()?.id);
                    }

                    for (const thread of threadList){
                        const threadMsgs = await fetchAllMessages(thread);
                        processMsgs(threadMsgs, thread.id);
                    }
                }

                Log.info(
                    `Brain crawl: channel ${channelId} done - ` +
                    `+${added - beforeAdded} imported, ${skipped - beforeSkipped} skipped.`,
                );
            }

            Log.info(`Brain crawl all done - total: +${added} messages, +${pairs} pairs, ${skipped} skipped.`);

            return await interaction.editReply({
                content: [
                    "**Brain crawl complete!**",
                    `- **${added}** new messages added`,
                    `- **${pairs}** new pairs added`,
                    `- **${skipped}** messages already in DB (skipped)`,
                ].join("\n"),
            });
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Brain crawl error: ", err);
            return await interaction.editReply({ content: `Crawl failed: ${err.message}` });
        }
        finally {
            brain.db.close();
        }
    },
};
