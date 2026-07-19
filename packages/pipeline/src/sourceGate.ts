import type { Pool } from "@filmfund/db";

/**
 * Application-level ToS gate. The database trigger on raw_documents is the
 * last line of defense; this runs first so a prohibited source fails fast,
 * before any network fetch is attempted.
 */

export class SourceGateError extends Error {
  constructor(
    public readonly sourceName: string,
    public readonly reason: "unregistered" | "prohibited" | "unlicensed"
  ) {
    super(
      reason === "unregistered"
        ? `source "${sourceName}" is not in source_registry — register it with a ToS verdict before ingesting`
        : reason === "prohibited"
          ? `source "${sourceName}" is prohibited by its terms of service — ingestion is designed out`
          : `source "${sourceName}" requires a license that is not held`
    );
    this.name = "SourceGateError";
  }
}

export interface SourceRegistryRow {
  source_name: string;
  tos_verdict: "permitted" | "needs_license" | "prohibited";
  license_held: boolean;
  notes: string | null;
  terms_url: string | null;
  checked_at: string;
}

export async function assertSourcePermitted(pool: Pool, sourceName: string): Promise<SourceRegistryRow> {
  const { rows } = await pool.query<SourceRegistryRow>(
    "SELECT * FROM source_registry WHERE source_name = $1",
    [sourceName]
  );
  const row = rows[0];
  if (!row) throw new SourceGateError(sourceName, "unregistered");
  if (row.tos_verdict === "prohibited") throw new SourceGateError(sourceName, "prohibited");
  if (row.tos_verdict === "needs_license" && !row.license_held) {
    throw new SourceGateError(sourceName, "unlicensed");
  }
  return row;
}
