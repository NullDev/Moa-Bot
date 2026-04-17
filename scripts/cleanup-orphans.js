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

/**
 * List all Math Challenge entries in the database
 */
const listChallenges = async function(){
    console.log("Listing all Math Challenge entries in the database...\n");

    try {
        const guildData = await challengesDb.get(`guild-${GUILD_ID}`);

        if (!guildData || typeof guildData !== "object"){
            console.log("No guild data found.");
            return;
        }

        const challenges = [];

        for (const [key, value] of Object.entries(guildData)){
            if (key.startsWith("integral-") && value && typeof value === "object"){
                challenges.push({
                    key,
                    messageId: key.replace("integral-", ""),
                    date: value.date || "unknown",
                    difficulty: value.difficulty || "unknown",
                    solvers: value.solvers?.length || 0,
                    proposedBy: value.proposedBy || "unknown",
                });
            }
        }

        if (challenges.length === 0){
            console.log("No Math Challenge entries found.");
            return;
        }

        console.log(`Found ${challenges.length} Math Challenge entries:\n`);

        for (const challenge of challenges){
            const date = challenge.date !== "unknown"
                ? new Date(challenge.date).toLocaleDateString()
                : "unknown";
            console.log(`  Key: ${challenge.key}`);
            console.log(`  Message ID: ${challenge.messageId}`);
            console.log(`  Date: ${date}`);
            console.log(`  Difficulty: ${challenge.difficulty}`);
            console.log(`  Solvers: ${challenge.solvers}`);
            console.log(`  Proposed by: ${challenge.proposedBy}`);
            console.log("");
        }

        console.log("To delete an orphaned entry, run:");
        console.log("  node scripts/cleanup-orphans.js delete <messageId>");
    }
    catch (error){
        console.error("Error listing Math Challenges:", error);
    }
};

/**
 * Delete a specific Math Challenge entry
 *
 * @param {string} messageId
 */
const deleteChallenge = async function(messageId){
    console.log(`Deleting Math Challenge entry for message ID: ${messageId}\n`);

    try {
        const challengeKey = `guild-${GUILD_ID}.integral-${messageId}`;
        const challengeData = await challengesDb.get(challengeKey);

        if (!challengeData){
            console.log("No Math Challenge entry found with that message ID.");
            return;
        }

        const solvers = challengeData.solvers || [];
        let cleanedSolvers = 0;

        for (const odSolverId of solvers){
            const userKey = `guild-${GUILD_ID}.user-${odSolverId}`;
            const userSolutions = await challengesDb.get(`${userKey}.solutions`) || [];

            const updatedSolutions = userSolutions.filter(
                (/** @type {{ messageId: string; }} */ sol) => sol.messageId !== messageId,
            );

            if (updatedSolutions.length > 0){
                await challengesDb.set(`${userKey}.solutions`, updatedSolutions);
            }
            else {
                await challengesDb.delete(`${userKey}.solutions`);
            }
            cleanedSolvers++;
        }

        await challengesDb.delete(challengeKey);

        console.log("✅ Successfully deleted Math Challenge entry!");
        console.log(`  - Cleaned up ${cleanedSolvers} solver entries`);
    }
    catch (error){
        console.error("Error deleting Math Challenge:", error);
    }
};

const args = process.argv.slice(2);

if (args[0] === "delete" && args[1]) deleteChallenge(args[1]);
else listChallenges();
