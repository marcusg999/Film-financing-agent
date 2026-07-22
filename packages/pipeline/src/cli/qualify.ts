import { createPool } from "@filmfund/db";
import { runResolve } from "../resolve/resolve.js";
import { runReclassify } from "../classify/reclassify.js";
import { runQualify } from "../qualify/qualify.js";
import { runScore } from "../score/score.js";

/**
 * Phase 2 orchestration: resolve → classify → qualify → score.
 * Order matters — dedupe before classifying, classify before bucketing,
 * bucket before ranking (docs/07 Phase 2 sequencing).
 *
 * npm run qualify -w @filmfund/pipeline
 * Set ANTHROPIC_API_KEY to activate the LLM classifier; otherwise the
 * deterministic rule classifier runs.
 */
async function main(): Promise<void> {
  const pool = createPool();
  try {
    console.log("→ resolve (entity dedupe)");
    console.log(JSON.stringify(await runResolve(pool)));

    console.log("→ classify (money vs craft)");
    console.log(JSON.stringify(await runReclassify(pool)));

    console.log("→ qualify (cluster rule)");
    console.log(JSON.stringify(await runQualify(pool)));

    console.log("→ score (ranking)");
    console.log(JSON.stringify(await runScore(pool)));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
