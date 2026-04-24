// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * @typedef {object} Entry
 * @property {number} count
 * @property {number} windowStart
 * @property {boolean} redirectSent
 */

/** @type {Map<string, Entry>} */
const state = new Map();

/**
 * Register an AI-reply attempt for a user and decide what to do.
 *
 * @param {string} userId
 * @returns {"allow" | "redirect" | "ignore"}
 */
export const consumeAiReply = function(userId){
    const now = Date.now();
    const entry = state.get(userId);

    if (!entry || now - entry.windowStart >= WINDOW_MS){
        state.set(userId, { count: 1, windowStart: now, redirectSent: false });
        return "allow";
    }

    if (entry.count < LIMIT){
        entry.count++;
        return "allow";
    }

    if (!entry.redirectSent){
        entry.redirectSent = true;
        return "redirect";
    }

    return "ignore";
};

/**
 * Remove entries whose one-hour window has elapsed. Called by a cron.
 *
 * @returns {void}
 */
export const cleanupExpired = function(){
    const now = Date.now();
    for (const [userId, entry] of state){
        if (now - entry.windowStart >= WINDOW_MS){
            state.delete(userId);
        }
    }
};
