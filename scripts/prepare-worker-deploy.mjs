import { readFile, writeFile } from "node:fs/promises";

const configPath = "dist/server/wrangler.json";
const config = JSON.parse(await readFile(configPath, "utf8"));

config.name = "payment-international";
config.workers_dev = true;

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
