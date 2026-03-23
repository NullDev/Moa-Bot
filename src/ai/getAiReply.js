import os from "node:os";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/** @typedef {import("node:child_process").ChildProcess} ChildProcess */

/*
 * Manages a Python AI inference server process.
 *
 * @export
 * @class PythonAIWorker
 */
export class PythonAIWorker {
    /** @type {ChildProcess | null} */
    #proc = null;
    /** @type {boolean} */
    #ready;
    /** @type {string} */
    #stdoutBuffer = "";
    /** @type {Array<{ resolve: Function, reject: Function, kind: "infer" | "reload", input?: string }>} */
    #pending = [];

    /**
     * Creates an instance of PythonAIWorker.
     *
     * @param {string} [scriptPath="./src/ai/brain.py"]
     * @memberof PythonAIWorker
     */
    constructor(scriptPath = "./src/ai/brain.py"){
        this.scriptPath = scriptPath;
        this.#ready = false;
        this.#start();
    }

    /**
     * Get the correct Python executable path based on the OS.
     *
     * @return {string}
     * @memberof DailyTrainer
     */
    #getPyPath(){
        const candidates = os.platform() === "win32"
            ? [".venv\\Scripts\\python.exe", "python"]
            : ["./.venv/bin/python", "python3", "python"];

        for (const py of candidates){
            if (!py.includes("/") && !py.includes("\\")){
                return py;
            }
            if (fs.existsSync(py)){
                const check = spawnSync(py, ["-c", "import sklearn"], { timeout: 5000 });
                if (check.status === 0) return py;
                Log.warn(`[AIWorker] ${py} missing sklearn, trying next…`);
            }
        }

        return "python3";
    }

    /**
     * Flushes all pending promises with the given error (used when the worker process dies unexpectedly).
     *
     * @param {Error} err
     * @memberof PythonAIWorker
     */
    #flushPending(err){
        while (this.#pending.length){
            const p = this.#pending.shift();
            try {
                p?.reject?.(err);
            }
            catch {
                Log.error("Err in flush: ", err);
            }
        }
    }

    /**
     * Handles incoming stdout data from the Python process, buffering it until complete lines are received
     * then parsing each line as JSON and resolving/rejecting the corresponding pending promise based on the response.
     *
     * @param {Buffer | string} chunk
     * @memberof PythonAIWorker
     */
    #handleStdoutChunk(chunk){
        this.#stdoutBuffer += chunk.toString();

        while (true){
            const idx = this.#stdoutBuffer.indexOf("\n");
            if (idx === -1) break;

            const line = this.#stdoutBuffer.slice(0, idx).trim();
            this.#stdoutBuffer = this.#stdoutBuffer.slice(idx + 1);

            if (!line) continue;

            let msg;
            try {
                msg = JSON.parse(line);
            }
            catch (error){
                const err = /** @type {Error} */ (error);
                Log.error(`[AIWorker] Failed to parse Python response line: ${line}`, err);
                const pending = this.#pending.shift();
                pending?.reject?.(err);
                continue;
            }

            const pending = this.#pending.shift();
            if (!pending){
                Log.warn("[AIWorker] Received unsolicited response from Python: " + msg);
                continue;
            }

            if (msg.ok){
                if (pending.kind === "infer"){
                    Log.debug("[AIWorker] Inference request: '" + (pending.input ?? "") + "'");
                    Log.debug("[AIWorker] Inference response: '" + msg.result + "'");
                    pending.resolve(String(msg.result ?? "").trim());
                }
                else {
                    Log.done("[AIWorker] Brain reloaded from DB.");
                    pending.resolve();
                }
            }
            else {
                pending.reject(new Error(msg.error || "Unknown Python worker error"));
            }
        }
    }

    /**
     * Starts the Python worker process and sets up event handlers for stdout, errors, and exit events.
     *
     * @memberof PythonAIWorker
     */
    #start(){
        this.#proc = spawn(this.#getPyPath(), [this.scriptPath, "--serve"], {
            stdio: ["pipe", "pipe", "inherit"], // stdin, stdout, stderr
        });

        this.#proc.on("spawn", () => {
            Log.done("[AIWorker] Python AI Worker started with PID " + this.#proc?.pid);
        });

        this.#proc.stdout?.setEncoding("utf8");
        this.#proc.stdout?.on("data", (data) => this.#handleStdoutChunk(data));

        this.#proc.on("error", (/** @type {Error} */ err) => {
            this.#ready = false;
            Log.error("[AIWorker] Failed to start Python process:", err);
            this.#flushPending(err);
        });

        this.#proc.on("exit", (/** @type {any} */ code, /** @type {any} */ signal) => {
            this.#ready = false;
            Log.warn(`[AIWorker] Python process exited with code=${code} signal=${signal}`);
            this.#flushPending(new Error(`Python process exited with code=${code} signal=${signal}`));
        });

        this.#ready = true;
    }

    /**
     * Sends an inference request to the Python worker with the given input text and optional context, returning a promise
     * that resolves with the AI's response or rejects if an error occurs.
     *
     * @param {string | { text: string, context?: string[] }} input
     * @return {Promise<string>}
     */
    infer(input){
        if (!this.#ready || !this.#proc?.stdin){
            return Promise.reject(new Error("Python worker not running"));
        }

        const payload = typeof input === "string"
            ? { text: input, context: [] }
            : {
                text: String(input?.text ?? ""),
                context: Array.isArray(input?.context) ? input.context.slice(0, 2).map(String) : [],
            };

        return new Promise((resolve, reject) => {
            this.#pending.push({
                resolve,
                reject,
                kind: "infer",
                input: payload.text,
            });

            try {
                this.#proc?.stdin?.write(JSON.stringify(payload) + "\n");
            }
            catch (err){
                this.#pending.pop();
                reject(err);
            }
        });
    }

    /**
     * Sends a reload command to the Python worker, instructing it to reload its brain from the database. Returns a promise
     *
     * @return {Promise<void>}
     * @memberof PythonAIWorker
     */
    reload(){
        if (!this.#ready || !this.#proc?.stdin){
            return Promise.reject(new Error("Python worker not running"));
        }

        return /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
            this.#pending.push({
                resolve,
                reject,
                kind: "reload",
            });

            try {
                this.#proc?.stdin?.write(JSON.stringify({ reload: true }) + "\n");
            }
            catch (err){
                this.#pending.pop();
                reject(err);
            }
        }));
    }

    /**
     * Stops the Python worker process, attempting to cleanly close stdin before killing the process.
     * Also resets internal state and flushes any pending promises with an error indicating the worker was stopped.
     *
     * @memberof PythonAIWorker
     */
    stop(){
        if (this.#proc){
            try {
                this.#proc.stdin?.end();
            }
            catch {
                Log.warn("[AIWorker] Failed to cleanly close Python worker stdin");
            }
            this.#proc.kill("SIGTERM");
            this.#proc = null;
            this.#ready = false;
            this.#stdoutBuffer = "";
            this.#flushPending(new Error("Python worker stopped"));
        }
    }
}
