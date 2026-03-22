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
     * Start the Python inference server process.
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

        this.#proc.on("error", (/** @type {Error} */ err) => {
            Log.error("[AIWorker] Failed to start Python process:", err);
        });

        this.#proc.on("exit", (/** @type {any} */ code, /** @type {any} */ signal) => {
            Log.warn(`[AIWorker] Python process exited with code=${code} signal=${signal}`);
            this.#ready = false;
            // setTimeout(() => this.#start(), 2000);
        });

        this.#ready = true;
    }

    /**
     * Send text to the Python process for inference and get the response.
     *
     * @param {string} text
     * @return {Promise<string>}
     * @memberof PythonAIWorker
     */
    infer(text){
        if (!this.#ready) return Promise.reject(new Error("Python worker not running"));

        return new Promise((resolve, reject) => {
            const req = JSON.stringify({ text }) + "\n";
            this.#proc?.stdin?.write(req);

            const onData = (/** @type {string} */ data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.ok){
                        Log.debug("[AIWorker] Inference request: '" + text + "'");
                        Log.debug("[AIWorker] Inference response: '" + msg.result + "'");
                        resolve(msg.result.trim());
                    }
                    else reject(new Error(msg.error));
                }
                catch (e){
                    reject(e);
                }
                finally {
                    this.#proc?.stdout?.off("data", onData);
                }
            };

            this.#proc?.stdout?.on("data", onData);
        });
    }

    reload(){
        if (!this.#ready) return Promise.reject(new Error("Python worker not running"));

        return /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
            this.#proc?.stdin?.write(JSON.stringify({ reload: true }) + "\n");

            const onData = (/** @type {string} */ data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.ok){
                        Log.done("[AIWorker] Brain reloaded from DB.");
                        resolve();
                    }
                    else reject(new Error(msg.error));
                }
                catch (e){ reject(e); }
                finally { this.#proc?.stdout?.off("data", onData); }
            };

            this.#proc?.stdout?.on("data", onData);
        }));
    }

    stop(){
        if (this.#proc){
            this.#proc?.stdin?.end();
            this.#proc.kill("SIGTERM");
            this.#proc = null;
            this.#ready = false;
        }
    }
}
