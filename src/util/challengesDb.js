import path from "node:path";
import { QuickDB } from "quick.db";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const challengesDb = new QuickDB({
    filePath: path.resolve("./data/guild_data.sqlite"),
});

export default challengesDb;
