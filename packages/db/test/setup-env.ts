// Preloaded via `node --import` before any test module runs, so a repo-root
// .env configures ADMIN_DATABASE_URL for the test harness too (the tests open
// their own admin connection directly rather than through createPool).
import { loadEnv } from "../src/env.js";
loadEnv();
