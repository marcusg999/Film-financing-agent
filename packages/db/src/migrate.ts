import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type pg from "pg";
import { createPool } from "./client.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const { rowCount } = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (rowCount) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

const isMain = process.argv[1] && fileURLToPath(new URL(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const pool = createPool();
  migrate(pool)
    .then((applied) => {
      console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
      return pool.end();
    });
}
