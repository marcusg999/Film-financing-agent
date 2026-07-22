import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

let loaded = false;

/**
 * Loads the nearest `.env` by walking up from the current working directory
 * to the monorepo root. This is why the CLIs work from any workspace folder
 * (npm runs them with cwd set to the package dir) with a single `.env` at the
 * repo root. Idempotent; does NOT override variables already set in the
 * environment (an explicit `export` or CI value always wins).
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return; // reached filesystem root
    dir = parent;
  }
}
