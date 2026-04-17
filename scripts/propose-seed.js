import path from "node:path";
import { QuickDB } from "quick.db";
import { config } from "../config/config.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const challengesDb = new QuickDB({
    filePath: path.resolve("./data/guild_data.sqlite"),
});

const GUILD_ID = config.ids.guild_id;

// @ts-ignore
const proposers = [
    /*
    {
        date: "YYYY-MM-DD",
        proposer: "USER-ID",
    },
    */
];

/**
 * Seed the database with historical proposer data
 */
const seedProposers = async function(){
    console.log("Starting proposer seeding...");

    try {
        const guildData = await challengesDb.get(`guild-${GUILD_ID}`) || {};
        let updated = 0;
        let created = 0;

        // @ts-ignore
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
                const challengeKey = `guild-${GUILD_ID}.${foundKey}`;
                await challengesDb.set(`${challengeKey}.proposedBy`, proposer);
                console.log(`  - Updated existing Math Challenge: ${foundKey}`);
                updated++;
            }
            else {
                const challengeKey = `guild-${GUILD_ID}.integral-${seedKey}`;
                await challengesDb.set(`${challengeKey}.date`, isoDate);
                await challengesDb.set(`${challengeKey}.proposedBy`, proposer);
                console.log(`  - Created new Math Challenge entry: integral-${seedKey}`);
                created++;
            }
        }

        console.log("\n✅ Proposer seeding completed successfully!");
        console.log("\nSummary:");
        console.log(`  - Updated existing entries: ${updated}`);
        console.log(`  - Created new entries: ${created}`);

        const updatedGuildData = await challengesDb.get(`guild-${GUILD_ID}`);
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
            console.log(`  - ${odUserId}: ${count} Math Challenges proposed`);
        }
    }
    catch (error){
        console.error("❌ Error seeding proposers:", error);
        process.exit(1);
    }
};

seedProposers();
