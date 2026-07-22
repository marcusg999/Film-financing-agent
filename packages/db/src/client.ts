import pg from "pg";
import { loadEnv } from "./env.js";

export function createPool(databaseUrl?: string): pg.Pool {
  loadEnv(); // pick up a repo-root .env before reading the environment
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to a .env file at the repo root, or export it in your shell."
    );
  }
  return new pg.Pool({ connectionString: url });
}

export type { Pool, PoolClient } from "pg";
