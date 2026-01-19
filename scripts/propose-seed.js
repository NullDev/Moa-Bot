import path from "node:path";
import { QuickDB } from "quick.db";
import { config } from "../config/config.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const integralDb = new QuickDB({
    filePath: path.resolve("./data/guild_data.sqlite"),
});

const GUILD_ID = config.ids.guild_id;

const proposers = [
    {
        date: "2025-12-30",
        proposer: "1031857874449739806",
    },
    {
        date: "2025-12-31",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-01",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-02",
        proposer: "1353684107087052920",
    },
    {
        date: "2026-01-03",
        proposer: "1353684107087052920",
    },
    {
        date: "2026-01-04",
        proposer: "371724846205239326",
    },
    {
        date: "2026-01-05",
        proposer: "1050427548904980581",
    },
    {
        date: "2026-01-06",
        proposer: "1353684107087052920",
    },
    {
        date: "2026-01-07",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-08",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-09",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-10",
        proposer: "371724846205239326",
    },
    {
        date: "2026-01-11",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-13",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-15",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-16",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-17",
        proposer: "1031857874449739806",
    },
    {
        date: "2026-01-19",
        proposer: "1031857874449739806",
    },
];

/**
 * Seed the database with historical proposer data
 */
const seedProposers = async function(){
    console.log("Starting proposer seeding...");

    try {
        const guildData = await integralDb.get(`guild-${GUILD_ID}`) || {};
        let updated = 0;
        let created = 0;

        for (const entry of proposers){
            const { date, proposer } = entry;
            const isoDate = new Date(date).toISOString();
            const seedKey = `seed-${date}`;

            console.log(`Processing ${date} - proposer: ${proposer}`);

            let foundKey = null;

            for (const [key, value] of Object.entries(guildData)){
                if (key.startsWith("integral-") && value && typeof value === "object"){
                    if (value.date && value.date.startsWith(date)){
                        foundKey = key;
                        break;
                    }
                }
            }

            if (foundKey){
                const integralKey = `guild-${GUILD_ID}.${foundKey}`;
                await integralDb.set(`${integralKey}.proposedBy`, proposer);
                console.log(`  - Updated existing integral: ${foundKey}`);
                updated++;
            }
            else {
                const integralKey = `guild-${GUILD_ID}.integral-${seedKey}`;
                await integralDb.set(`${integralKey}.date`, isoDate);
                await integralDb.set(`${integralKey}.proposedBy`, proposer);
                console.log(`  - Created new integral entry: integral-${seedKey}`);
                created++;
            }
        }

        console.log("\n✅ Proposer seeding completed successfully!");
        console.log("\nSummary:");
        console.log(`  - Updated existing entries: ${updated}`);
        console.log(`  - Created new entries: ${created}`);

        const updatedGuildData = await integralDb.get(`guild-${GUILD_ID}`);
        const proposerCounts = new Map();

        if (updatedGuildData && typeof updatedGuildData === "object"){
            for (const [key, value] of Object.entries(updatedGuildData)){
                if (key.startsWith("integral-") && value && typeof value === "object"){
                    if (value.proposedBy){
                        const count = proposerCounts.get(value.proposedBy) || 0;
                        proposerCounts.set(value.proposedBy, count + 1);
                    }
                }
            }
        }

        console.log("\nProposer counts:");
        for (const [odUserId, count] of proposerCounts.entries()){
            console.log(`  - ${odUserId}: ${count} integrals proposed`);
        }
    }
    catch (error){
        console.error("❌ Error seeding proposers:", error);
        process.exit(1);
    }
};

seedProposers();
