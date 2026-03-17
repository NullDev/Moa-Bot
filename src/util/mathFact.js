// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const API = "https://nulldev.org/mathfacts/api/facts/random";
const last5 = /** @type {number[]} */ ([]);

/**
 * Get a random math fact
 *
 * @param {boolean|number} [recordId=false] Whether to record the fact ID in the last5 array (to avoid duplicates)
 * @return {Promise<string>} The math fact, or "¯\\_(ツ)_/¯" if an error occurred
 */
const getRandomMathFact = async function(recordId = false){
    const response = await fetch(`${API}?exclude=${last5.join(",")}`);
    if (!response.ok) return "¯\\_(ツ)_/¯";

    const data = await response.json();
    if (!data || typeof data.content !== "string" || typeof data.id !== "number"){
        return "¯\\_(ツ)_/¯";
    }

    if (recordId){
        last5.push(data.id);
        if (last5.length > 5) last5.shift();
    }

    return data.content;
};

export default getRandomMathFact;
