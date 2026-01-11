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

const winners = [
    {
        date: "2025-12-30",
        difficulty: "Mild",
        solvers: ["1353684107087052920", "1050427548904980581", "484745967644704768"],
    },
    {
        date: "2025-12-31",
        difficulty: "Low Intermediate",
        solvers: ["1353684107087052920", "1240616758126182470", "484745967644704768"],
    },
    {
        date: "2026-01-01",
        difficulty: "Intermediate",
        solvers: ["1353684107087052920", "1275090914532130891", "484745967644704768"],
    },
    {
        date: "2026-01-02",
        difficulty: "High Intermediate",
        solvers: ["1031857874449739806", "1353684107087052920", "1343987099434614861", "484745967644704768"],
    },
    {
        date: "2026-01-03",
        difficulty: "Advanced Elementary",
        solvers: ["371724846205239326"],
    },
    {
        date: "2026-01-04",
        difficulty: "Non-Elementary",
        solvers: ["371724846205239326"],
    },
    {
        date: "2026-01-05",
        difficulty: "Easy",
        solvers: ["1275090914532130891", "838002362391068683", "484745967644704768", "1353684107087052920", "1081121552894005258"],
    },
    {
        date: "2026-01-06",
        difficulty: "Mild",
        solvers: ["1050427548904980581", "371724846205239326", "1275090914532130891"],
    },
    {
        date: "2026-01-07",
        difficulty: "Low Intermediate",
        solvers: ["1050427548904980581", "484745967644704768", "1353684107087052920"],
    },
    {
        date: "2026-01-08",
        difficulty: "Intermediate",
        solvers: ["371724846205239326", "1353684107087052920"],
    },
    {
        date: "2026-01-09",
        difficulty: "High Intermediate",
        solvers: ["1275090914532130891", "1353684107087052920"],
    },
    {
        date: "2026-01-10",
        difficulty: "Advanced Elementary",
        solvers: ["1031857874449739806", "371724846205239326", "1353684107087052920"],
    },
    {
        date: "2026-01-11",
        difficulty: "Non-Elementary",
        solvers: ["371724846205239326", "1031857874449739806"],
    },
];

/**
 * Seed the database with historical integral data
 */
const seedDatabase = async function(){
    console.log("Starting database seeding...");

    try {
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
