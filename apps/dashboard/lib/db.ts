import pg from "pg";

// The dashboard only reads; it uses pg directly rather than @filmfund/db
// because Next's bundler doesn't resolve that package's NodeNext-style
// .js-extension imports.
let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString: databaseUrl });
  }
  return pool;
}
