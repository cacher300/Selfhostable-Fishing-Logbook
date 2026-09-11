import { readFile, writeFile } from "node:fs/promises";

const databaseId = String(process.env.CLOUDFLARE_D1_DATABASE_ID || "").trim();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(databaseId)) {
  throw new Error("CLOUDFLARE_D1_DATABASE_ID must be a valid D1 database UUID");
}

const template = await readFile(new URL("../wrangler.template.jsonc", import.meta.url), "utf8");
const rendered = template.replace("__D1_DATABASE_ID__", databaseId);
if (rendered === template || rendered.includes("__D1_DATABASE_ID__")) {
  throw new Error("Could not render the D1 database binding");
}
JSON.parse(rendered);
await writeFile(new URL("../wrangler.generated.json", import.meta.url), rendered, { mode: 0o600 });
