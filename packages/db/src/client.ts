import pg from "pg";

export function createPool(databaseUrl = process.env.DATABASE_URL): pg.Pool {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  return new pg.Pool({ connectionString: databaseUrl });
}

export type { Pool, PoolClient } from "pg";
