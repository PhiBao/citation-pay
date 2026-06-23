/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0];
  if (!token || !ref) {
    console.error("Missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: tsx scripts/apply-migration.ts <sql-file>");
    process.exit(1);
  }
  const sql = await readFile(file, "utf8");
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query: sql })
  });
  const text = await response.text();
  console.log("Status:", response.status);
  console.log(text);
  if (!response.ok) process.exit(1);
  console.log(`Migration ${file} applied.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
