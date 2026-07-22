// Plain .js config so it loads on any Next.js version (older Next can't read
// next.config.ts). Walks up to the monorepo root to load a shared .env, since
// Next only auto-loads .env from this app's own directory.
const { existsSync } = require("node:fs");
const { dirname, join } = require("node:path");
const dotenv = require("dotenv");

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
