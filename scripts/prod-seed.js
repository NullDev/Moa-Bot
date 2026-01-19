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

// @ts-ignore
const winners = [
    /*
    {
        date: "", // YYYY-MM-DD
        difficulty: "", // Easy, Mild, Low Intermediate, Intermediate, High Intermediate, Advanced Elementary, Non-Elementary
        solvers: [""], // IDs
    },
    */
];

/**
 * Seed the database with historical integral data
 */
const seedDatabase = async function(){
    console.log("Starting database seeding...");

    try { // @ts-ignore
        for (const entry of winners){
            const { date, difficulty, solvers } = entry;
            const isoDate = new Date(date).toISOString();
            const fakeMessageId = `seed-${date}`;

            console.log(`Processing ${date} (${difficulty}) with ${solvers.length} solvers...`);

            for (const userId of solvers){
                const userKey = `guild-${GUILD_ID}.user-${userId}`;
                const existingSolutions = await integralDb.get(`${userKey}.solutions`) || [];

                const alreadyExists = existingSolutions.some(
                    (/** @type {{ date: string; difficulty: string; }} */ sol) => sol.date === isoDate && sol.difficulty === difficulty,
                );

                if (alreadyExists){
                    console.log(`  - User ${userId} already has solution for ${date}, skipping...`);
                    continue;
                }

                existingSolutions.push({
                    date: isoDate,
                    messageId: fakeMessageId,
                    difficulty,
                });

                await integralDb.set(`${userKey}.solutions`, existingSolutions);
                console.log(`  - Added solution for user ${userId}`);
            }
        }

        console.log("\n✅ Database seeding completed successfully!");

        const guildData = await integralDb.get(`guild-${GUILD_ID}`);
        if (guildData && typeof guildData === "object"){
            let totalSolutions = 0;
            let userCount = 0;

            for (const [key, value] of Object.entries(guildData)){
                if (key.match(/^user-\d+$/) && value && typeof value === "object"){
                    const { solutions } = value;
                    if (Array.isArray(solutions)){
                        userCount++;
                        totalSolutions += solutions.length;
                    }
                }
            }

            console.log("\nSummary:");
            console.log(`  - Total users: ${userCount}`);
            console.log(`  - Total solutions: ${totalSolutions}`);
        }
    }
    catch (error){
        console.error("❌ Error seeding database:", error);
        process.exit(1);
    }
};

seedDatabase();
