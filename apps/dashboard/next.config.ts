import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

// Next only auto-loads .env from this app's directory. Walk up to the
// monorepo root so a single root-level .env also configures the dashboard.
let dir = process.cwd();
for (let i = 0; i < 8; i++) {
  const candidate = join(dir, ".env");
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
};

export default nextConfig;
