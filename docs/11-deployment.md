# 11 — Deployment Runbook (Supabase + Railway)

Option B path: the live backfill and the product run on Railway against
Supabase; this container only needs git + npm. Everything below is
click-through steps for Marcus plus the exact values each service needs.

## 1. Supabase (database)

1. Create a project at supabase.com (Pro tier recommended before real data —
   free tier pauses after a week idle and has no backups; see docs/06).
2. Dashboard → **Database → Extensions**: enable **vector** (pgcrypto is on
   by default).
3. Grab the **connection string** — use the **Session pooler** URI (IPv4,
   port 5432 works with pg + pg-boss). Keep the password out of chat; it
   goes straight into Railway env vars.

> Migrations run automatically on deploy (worker pre-deploy command below),
> or manually: `DATABASE_URL=… npm run migrate`.

## 2. Railway (two services, one repo)

Create a Railway project → **Deploy from GitHub repo** → pick this repo,
then add **two services** pointing at the same repo:

### Service A — `worker` (pipeline)

| Setting | Value |
|---|---|
| Root directory | `/` (monorepo root) |
| Build command | `npm ci` |
| Pre-deploy command | `npm run migrate` |
| Start command | `npm run worker` |
| Env vars | `DATABASE_URL` (Supabase pooler URI) · later: `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `EMAIL_VERIFY_API_KEY` |

### Service B — `dashboard`

| Setting | Value |
|---|---|
| Root directory | `/` (monorepo root) |
| Build command | `npm ci && npm run build -w @filmfund/dashboard` |
| Start command | `npm run start -w @filmfund/dashboard` |
| Env vars | `DATABASE_URL` (same URI) · `DASHBOARD_PASSWORD` (pick a strong one) · `NPM_CONFIG_PRODUCTION=false` (Next build needs dev deps) |
| Networking | Generate domain (public URL) |

> The dashboard **fails closed**: in production with no `DASHBOARD_PASSWORD`
> it serves 503 for everything. Login is HTTP Basic — user `team`, password
> = the env var. Supabase Auth replaces this in Phase 5.

## 3. First backfill (run on Railway, where egress exists)

From the Railway CLI (`railway link` to the worker service), or a one-off
service run:

```bash
railway run npm run ingest:wikidata -w @filmfund/pipeline -- --limit 2000
railway run npm run ingest:sec      -w @filmfund/pipeline -- --from 2016-01-01 --to 2026-07-19 --max 200
```

Expected: the Wikidata run fills films/prodcos (horror + sci-fi, US/UK/EU/CA,
2016+); the SEC run fills issuer + portal entities. Then open the dashboard —
the genre chips should return real financiers.

**First-run checks (gotcha #25):** the EDGAR full-text-search JSON and Form C
XML shapes were verified against fixtures, not live responses. On the first
SEC run, eyeball the stats output — a high `fetchErrors` count or zero
`issuersUpserted` means the live shape drifted and the parser needs a touch-up.
Same check for the SPARQL run (`rowsFetched` > 0).

## 4. Refresh cadence (later)

Railway cron: schedule a service run weekly per source (docs/01 cadence).
Not needed until after the first backfill looks right.

## 5. What exists after this runbook

- Dashboard on a Railway URL, password-gated, showing real corpus data.
- Worker deployed (stages beyond ingest still land in Phases 2–4).
- CI on GitHub running the 20-test suite + dashboard build per push
  (`.github/workflows/ci.yml`, pgvector service container).

## What Marcus hands back to continue the build

1. Confirmation the backfill ran + the stats JSON it printed (or any error).
2. `ANTHROPIC_API_KEY` set on the worker service (enables Phase 2
   classifier work — never paste the key into chat).
3. Nothing else — Firecrawl/email-verification keys wait for Phases 3–4.
