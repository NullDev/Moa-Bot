import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, MessageFlags } from "discord.js";
import integralDb from "../../util/integralDb.js";
import Log from "../../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const commandName = import.meta.url.split("/").pop()?.split(".").shift() ?? "";

/** Guild IDs where a mix is currently in progress (in-process debounce). */
const inProgress = new Set();

/** @type {string[][]} Each inner array is an independent pool - names only shuffle within the same pool. */
const MIX_POOLS = [
    // Prod
    ["1285458677758689353", "1456992404442714162", "1462444702044520623"], // Staff: "Staff", "Bot developer", "chat mod"
    ["1462527609278693683"],                                               // Bots: "Bot"
    ["1426635851110023268", "1426635731463569460"],                        // Members: "Underqualified Student", "Unqualified Student"
    ["1456987376827109519", "1433774186240806982", "1275100223248666754"], // Special: "Daily Integral", "Embed", "Founding members"
/*
    // Dev
    ["1110484391467163648", "717468147044581386", "1107607137175224371"],
    ["1107607247191814244"],
*/
];

const ActiveUsers = [
    // Prod
    "797872032469352528", "862412452750950454", "1404724396987519088", "1409903360978714774", "1201977871959339108", "1179463161527672973", "891331870975995914",
    // Dev
    // "545621952849510400", "1439758448131833876", "368521195940741122",
];

/**
 * Sattolo cycle - guaranteed derangement (no element stays in its original position).
 * Differs from Fisher-Yates only in that j is drawn from [0, i) instead of [0, i].
 *
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function sattolo(arr){
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * i); // [0, i-1]
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export default {
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription("(ADMIN) Save and shuffle nicknames of members with the target roles.")
        .setContexts([InteractionContextType.Guild])
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption(option =>
            option.setName("dry-run")
                .setDescription("Preview who would be renamed to whom without actually doing it")
                .setRequired(false)),

    /**
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction){
        const guildId   = interaction.guildId ?? "";
        const { guild } = interaction;
        const backupKey = `guild-${guildId}.name-mix-backup`;

        const dryRun = interaction.options.getBoolean("dry-run") ?? false;

        // Debounce: reject before deferring so we can still send a fresh reply (real runs only)
        if (!dryRun && inProgress.has(guildId)){
            return await interaction.reply({
                content: "A name mix is already in progress! Please wait for it to finish.",
                flags: [MessageFlags.Ephemeral],
            });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        if (!dryRun) inProgress.add(guildId);

        try {
            if (!dryRun){
                // Prevent re-running if a previous mix was never unmixed
                const existing = await integralDb.get(backupKey);
                if (existing){
                    return await interaction.editReply({
                        content: "A name mix is already active! Use `/name-unmix` to restore first.",
                    });
                }
            }

            // Populate member cache via REST (avoids gateway opcode 8 rate limit)
            let afterId = undefined;
            while (true){
                const batch = await guild?.members.fetch({ limit: 1000, ...(afterId ? { after: afterId } : {}) });
                if (!batch?.size || batch.size < 1000) break;
                afterId = /** @type {string} */ ([...batch.keys()].at(-1));
            }

            if (!dryRun){
                // Build the full backup first across all pools, then persist it before
                // touching any nicknames - so a mid-run crash never leaves members renamed
                // without a record of their originals.
                /** @type {Record<string, string|null>} */
                const backup = {};
                for (const roleIds of MIX_POOLS){
                    for (const roleId of roleIds){
                        const role = guild?.roles.cache.get(roleId);
                        if (!role) continue;
                        for (const [id, member] of role.members){
                            if (!(id in backup)) backup[id] = member.nickname;
                        }
                    }
                }
                for (const userId of ActiveUsers){
                    if (!(userId in backup)){
                        const member = guild?.members.cache.get(userId);
                        if (member) backup[userId] = member.nickname;
                    }
                }
                await integralDb.set(backupKey, backup);
            }

            let succeeded = 0;
            let failed    = 0;
            let tooSmall  = 0;

            /** @type {string[]} */
            const dryRunLines = [];

            // Members assigned in an earlier pool are locked in and skipped by later pools
            const assigned = new Set();

            for (const roleIds of MIX_POOLS){
                // Collect members in this pool (deduplicated by id, excluding already-assigned)
                /** @type {Map<string, import("discord.js").GuildMember>} */
                const memberMap = new Map();
                for (const roleId of roleIds){
                    const role = guild?.roles.cache.get(roleId);
                    if (!role) continue;
                    for (const [id, member] of role.members){
                        if (!memberMap.has(id) && !assigned.has(id)) memberMap.set(id, member);
                    }
                }

                const members = [...memberMap.values()].filter(m => m.manageable);

                if (members.length < 2){
                    tooSmall++;
                    Log.warn(`name-mix: pool [${roleIds.join(", ")}] has only ${members.length} manageable member(s), skipping.`);
                    continue;
                }

                const names = members.map(m => m.displayName);
                const mixed = sattolo(names);

                // Lock these members in before processing the next pool
                for (const member of members) assigned.add(member.id);

                if (dryRun){
                    dryRunLines.push(`**Pool** (${members.length} members):`);
                    for (let i = 0; i < members.length; i++){
                        dryRunLines.push(`  \`${names[i]}\` → \`${mixed[i]}\``);
                    }
                }
                else {
                    const results = await Promise.allSettled(
                        members.map((member, i) => member.setNickname(mixed[i], "April Fools name mix")),
                    );
                    for (const result of results){
                        if (result.status === "fulfilled") succeeded++;
                        else {
                            failed++;
                            Log.warn(`name-mix: could not rename a member: ${result.reason}`);
                        }
                    }
                }
            }

            // ActiveUsers pool — resolved by user ID, processed last
            const activeMembers = ActiveUsers
                .map(id => guild?.members.cache.get(id))
                .filter(/** @returns {m is import("discord.js").GuildMember} */ m => !!m && m.manageable && !assigned.has(m.id));

            if (activeMembers.length >= 2){
                const names = activeMembers.map(m => m.displayName);
                const mixed = sattolo(names);

                for (const m of activeMembers) assigned.add(m.id);

                if (dryRun){
                    dryRunLines.push(`**Active Users pool** (${activeMembers.length} members):`);
                    for (let i = 0; i < activeMembers.length; i++){
                        dryRunLines.push(`  \`${names[i]}\` → \`${mixed[i]}\``);
                    }
                }
                else {
                    const results = await Promise.allSettled(
                        activeMembers.map((member, i) => member.setNickname(mixed[i] ?? null, "April Fools name mix")),
                    );
                    for (const result of results){
                        if (result.status === "fulfilled") succeeded++;
                        else {
                            failed++;
                            Log.warn(`name-mix: could not rename active user: ${result.reason}`);
                        }
                    }
                }
            }
            else if (activeMembers.length > 0){
                tooSmall++;
                Log.warn(`name-mix: ActiveUsers pool has only ${activeMembers.length} unassigned manageable member(s), skipping.`);
            }

            if (dryRun){
                const preview = dryRunLines.join("\n");
                // Discord messages cap at 2000 chars - truncate gracefully if the server is huge
                const truncated = preview.length > 1800
                    ? preview.slice(0, 1800) + "\n… (truncated)"
                    : preview;
                return await interaction.editReply({
                    content: `**Dry run - no changes made:**\n${truncated}`,
                });
            }

            Log.info(`name-mix: ${succeeded} nicknames shuffled, ${failed} failed, ${tooSmall} pool(s) skipped - by ${interaction.user.tag}`);

            return await interaction.editReply({
                content: [
                    "**Name mix complete!**",
                    `- **${succeeded}** nicknames shuffled across ${MIX_POOLS.length} pool(s)`,
                    ...(failed   ? [`- **${failed}** skipped (insufficient permissions)`]        : []),
                    ...(tooSmall ? [`- **${tooSmall}** pool(s) skipped (fewer than 2 members)`] : []),
                    "",
                    "Use `/name-unmix` to restore originals.",
                ].join("\n"),
            });
        }
        finally {
            if (!dryRun) inProgress.delete(guildId);
        }
    },
};
