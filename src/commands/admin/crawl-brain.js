import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import { MessageLearner } from "../../ai/MsgLearn.js";
import { config } from "../../../config/config.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

/**
 * Crawl one channel/thread, processing and writing each batch of 100 to the
 * DB as it arrives instead of buffering everything in memory first.
 *
 * @param {import("discord.js").TextBasedChannel} channel
 * @param {string} channelId
 * @param {import("../../ai/MsgLearn.js").MessageLearner} brain
 * @param {{ added: number, pairs: number, skipped: number }} counters
 */
async function crawlChannel(channel, channelId, brain, counters){
    let after    = "0";
    let batches  = 0;

    while (true){
        const fetched = await channel.messages.fetch({ limit: 100, after });
        if (!fetched.size) break;

        // "after" returns ascending order, sort defensively
        const batch = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const msg of batch){
            if (msg.author.bot || msg.system) continue;

            const { inserted, paired } = brain.crawlLearn({
                id: msg.id,
                content: msg.content,
                channelId,
                authorId: msg.author.id,
                replyToId: msg.reference?.messageId ?? null,
                createdTimestamp: msg.createdTimestamp,
            });

            if (inserted){ counters.added++; if (paired) counters.pairs++; }
            else counters.skipped++;
        }

        after = batch[batch.length - 1].id;
        batches++;

        if (batches % 10 === 0){
            Log.info(`Brain crawl: ${channelId} — batch ${batches} done (+${counters.added} total so far).`);
        }

        if (fetched.size < 100) break;
    }
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
            await interaction.editReply({ content: "No AI channels configured." });
            return;
        }

        const brain    = new MessageLearner();
        await brain.init();

        const counters = { added: 0, pairs: 0, skipped: 0 };

        await interaction.editReply({ content: "Brain crawl started. Follow progress in the terminal." });

        try {
            Log.info(`Brain crawl started - ${channels.length} channel(s) to process.`);

            for (let i = 0; i < channels.length; i++){
                const channelId    = channels[i];
                const beforeAdded  = counters.added;
                const beforeSkipped = counters.skipped;

                Log.info(`Brain crawl: starting channel ${i + 1}/${channels.length} (${channelId}).`);

                const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
                if (!channel?.isTextBased()){
                    Log.warn(`Brain crawl: channel ${channelId} not found or not text-based, skipping.`);
                    continue;
                }

                await crawlChannel(channel, channelId, brain, counters);

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
                        await crawlChannel(thread, thread.id, brain, counters);
                    }
                }

                Log.info(
                    `Brain crawl: channel ${channelId} done - ` +
                    `+${counters.added - beforeAdded} imported, ${counters.skipped - beforeSkipped} skipped.`,
                );
            }

            Log.info(`Brain crawl all done - total: +${counters.added} messages, +${counters.pairs} pairs, ${counters.skipped} skipped.`);
        }
        catch (error){
            const err = error instanceof Error ? error : new Error(String(error));
            Log.error("Brain crawl error: ", err);
        }
        finally {
            brain.db.close();
        }
    },
};
