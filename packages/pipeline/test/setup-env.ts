// Preloaded via `node --import` before any test module runs, so a repo-root
// .env configures ADMIN_DATABASE_URL for the test harness too.
import { loadEnv } from "@filmfund/db";
loadEnv();
