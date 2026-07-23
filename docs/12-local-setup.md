# 12 — Local Setup

Run the whole thing on your own machine. Because your laptop has internet
(unlike the build container), the backfill pulls **real** data — this is the
fastest way to a discovery test. No API keys needed: the Claude classifier
(Phase 2) is the only thing that needs `ANTHROPIC_API_KEY`, and it isn't built
yet.

## 0. Prerequisites

- **Node.js ≥ 20** — check with `node --version`. If missing, install from
  nodejs.org or via `nvm install 20`.
- **Git**.
- **PostgreSQL 16 with the pgvector extension** — easiest via Docker (below),
  which bakes pgvector in. Native install also works.

## 1. Get the code

```bash
git clone https://github.com/marcusg999/Film-financing-agent.git
cd Film-financing-agent
git checkout claude/indie-film-funding-agent-81t0y7
npm install
```

## 2. Start Postgres

### Option A — Docker (recommended, one command, pgvector included)

```bash
docker run -d --name filmfund-db \
  -e POSTGRES_PASSWORD=filmfund -e POSTGRES_DB=filmfund_dev \
  -p 5432:5432 pgvector/pgvector:pg16
```

Then create a **`.env` file in the repo root** (the folder with `package.json`):

```
DATABASE_URL=postgres://postgres:filmfund@localhost:5432/filmfund_dev
ADMIN_DATABASE_URL=postgres://postgres:filmfund@localhost:5432/postgres
```

That's it — the CLIs and the dashboard **auto-load this `.env`** (it's gitignored,
so it's never committed). No `export` needed in each terminal. An explicit
`export` still wins if you ever want to override it.

(Stop/restart the DB later with `docker stop filmfund-db` / `docker start filmfund-db`.)

### Option B — native Postgres

- **macOS (Homebrew):** `brew install postgresql@16 pgvector && brew services start postgresql@16`
- **Ubuntu/Debian:** `sudo apt install postgresql-16 postgresql-16-pgvector`
- **Windows:** install PostgreSQL 16 from EDB, then install pgvector (or just use
  Docker — simpler on Windows).

Create the database, then set the URL (native installs usually authenticate as
your OS user over a local socket):

```bash
createdb filmfund_dev
export DATABASE_URL='postgres://localhost:5432/filmfund_dev'
export ADMIN_DATABASE_URL='postgres://localhost:5432/postgres'
```

> The `vector` extension is enabled automatically by the first migration — you
> don't need to `CREATE EXTENSION` by hand.

## 3. Create the schema

```bash
npm run migrate
# → applied: 0001_init.sql, 0002_source_registry.sql, ... 0005_sec_keys.sql
```

## 4. (Optional) Confirm everything works

```bash
npm test        # 20 tests; creates and drops its own throwaway databases
```

## 5. Pull real data (the payoff)

```bash
# horror + sci-fi films + production companies, US/UK/EU/Canada, 2016+
npm run ingest:wikidata -w @filmfund/pipeline -- --limit 2000

# Form C crowdfunding raises → issuer + funding-portal entities
npm run ingest:sec -w @filmfund/pipeline -- --from 2016-01-01 --to 2026-07-20 --max 200
```

Each prints a stats JSON. **Skim it** — the SEC/Wikidata response shapes were
verified against fixtures, not live responses, so the first real run is where
any drift shows up (gotcha #25). If you see a high `fetchErrors`, zero
`rowsFetched`, or zero `issuersUpserted`, paste the JSON back to me and I'll fix
the parser. A clean run looks like non-zero `filmsUpserted` / `issuersUpserted`.

## 5a. Seed institutional funders (Phase 3 — offline, no keys)

```bash
npm run ingest:bodies -w @filmfund/pipeline
```

Adds ~36 curated public funding bodies (national film funds, soft money, grants,
tax-credit offices, and known genre financiers across US/UK/EU/Canada), each
evidence-linked to its official site. Runs fully offline. Browse them at
**http://localhost:3000/bodies** (filter by genre and region).

## 5a2. Seed individual-backed vehicles (offline, no keys)

```bash
npm run ingest:individuals -w @filmfund/pipeline
```

Adds ~13 real individual-backed film vehicles (athlete/founder/artist production
companies and financier funds — e.g. SpringHill, Unanimous, Annapurna, Atomic
Monster) with their principals' names. Filter the home page with the
**Individual-backed** checkbox. Contact is via each vehicle's professional
channel (its website); no personal phone/email is collected.

## 5b. Qualify + rank (Phase 2)

After a backfill, turn the raw corpus into a qualified, ranked list:

```bash
npm run qualify -w @filmfund/pipeline
# → resolve (dedupe) → classify (money vs craft) → qualify (cluster rule) → score (rank)
```

This runs with **no API key** (deterministic rule classifier). Set
`ANTHROPIC_API_KEY` first to activate the LLM money-vs-craft classifier
instead — same command, better classification. Re-run it any time after new
data lands; it's idempotent.

## 6. Open the dashboard

```bash
npm run dev -w @filmfund/dashboard
# open http://localhost:3000
```

Click the genre chips (horror / sci-fi). You should see real production
companies and funders, each backed by evidence in the database. In local dev
the auth gate is off; it only locks in production.

> Reminder on honesty: this is the **discovery** view — a raw, evidenced corpus.
> It is not yet *qualified* (money-vs-craft), *deduplicated*, or *ranked* — that's
> Phase 2, which needs `ANTHROPIC_API_KEY`. So expect some noise (e.g. the same
> company under name variants); cleaning that up is exactly the next build step.

## 7. (Optional) Run the queue worker

Only needed once Phase 2+ stages exist; for a discovery test you can skip it.

```bash
npm run worker
```

## Troubleshooting

- **`DATABASE_URL is not set`** — you opened a new terminal; re-run the `export`
  lines (or put them in a `.env` and `source` it).
- **`extension "vector" is not available`** — you're on a native Postgres without
  pgvector; install the `pgvector`/`postgresql-16-pgvector` package, or switch to
  the Docker option.
- **`npm test` can't connect** — set `ADMIN_DATABASE_URL` (step 2); tests need to
  create/drop scratch databases, which requires the `postgres` admin database.
- **Port 5432 in use** — another Postgres is running; either use it, or map the
  Docker container to a different port (`-p 5433:5432`) and change the URLs.
- **Dashboard shows "No qualifying financiers"** — the backfill hasn't run yet, or
  returned nothing for that genre/window; re-run step 5 and check the stats.
