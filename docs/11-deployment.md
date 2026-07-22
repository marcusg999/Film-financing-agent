# 11 — Deployment Runbook (Netlify + Supabase)

Architecture — three pieces, cleanly separated:

| Piece | Runs on | Why |
|-------|---------|-----|
| **Dashboard** (Next.js, read-only) | **Netlify** | Serverless/edge fits a read-mostly UI; the Basic-auth middleware runs as an edge function. |
| **Database** | **Supabase** (Postgres + pgvector) | Shared store for everything. |
| **Worker + ingestion / qualify CLIs** | **A process host or your laptop** — *not Netlify* | These are long-running Node processes and scheduled backfills; Netlify functions are short-lived and stateless, so they can't host pg-boss or a multi-minute crawl. |

> The most economical setup for a small team: **dashboard on Netlify**,
> **DB on Supabase**, and run the **backfill + `npm run qualify` from your Mac**
> (or a cheap always-on box) on whatever cadence you want. You only need an
> always-on worker once the queue-driven stages (Phase 3+) are doing continuous
> refresh; until then it's a manual/cron command against Supabase.

## 1. Supabase (database)

1. Create a project at supabase.com (Pro tier recommended before real data —
   free tier pauses after a week idle and has no backups; see docs/06).
2. Dashboard → **Database → Extensions**: enable **vector** (pgcrypto is on
   by default).
3. Grab the **connection string** — use the **Session pooler** URI (IPv4,
   port 5432 works with pg + pg-boss). Keep the password out of chat; it
   goes straight into Railway env vars.

> Run migrations once against Supabase from your machine:
> `DATABASE_URL='<supabase-pooler-uri>' npm run migrate`. Re-run after any new
> migration lands — it's idempotent.

## 2. Netlify (dashboard)

Connect the repo (**Add new site → Import from GitHub**). Netlify reads
`netlify.toml` at the repo root, so the build settings are already committed:

| Setting | Value (from `netlify.toml`) |
|---|---|
| Build command | `npm run build -w @filmfund/dashboard` |
| Publish directory | `apps/dashboard/.next` |
| Runtime | `@netlify/plugin-nextjs` (auto) |

Set **environment variables** (Site configuration → Environment variables):

| Var | Value |
|---|---|
| `DATABASE_URL` | Supabase **Transaction pooler** URI — serverless functions open many short connections, so the transaction pooler is the right one here (not the session pooler). |
| `DASHBOARD_PASSWORD` | A strong password. Login is HTTP Basic, user `team`. |

> The dashboard **fails closed**: in production with no `DASHBOARD_PASSWORD` it
> serves 503 for everything, so contact data never sits on an open URL. Supabase
> Auth replaces this Basic gate in Phase 5.
>
> Deploy trigger: Netlify auto-deploys the branch you pick. Point it at **`main`**
> for continuous deploys, or at a **git tag** if you'd rather ship only tagged
> releases (main-after-merge is a working-but-incomplete product until Phases 3–4).

## 3. Worker + backfill (a process host or your laptop — not Netlify)

The ingestion and qualify commands are ordinary Node processes. Run them from
your Mac (see docs/12) or any always-on box, pointed at the Supabase DB:

```bash
export DATABASE_URL='<supabase-pooler-uri>'   # session pooler is fine for CLIs
npm run ingest:wikidata -w @filmfund/pipeline -- --limit 2000
npm run ingest:sec      -w @filmfund/pipeline -- --from 2016-01-01 --to 2026-07-20 --max 200
npm run qualify         -w @filmfund/pipeline
```

Expected: Wikidata fills films/prodcos (horror + sci-fi, US/UK/EU/CA, 2016+);
SEC fills issuer + portal entities; `qualify` buckets and ranks them. Then open
the Netlify dashboard — the genre chips return real, qualified financiers.

> When continuous refresh is wanted (Phase 3+), host the worker (`npm run worker`)
> on a small always-on process host — Render, Fly.io, a Railway worker, or a VM.
> Netlify Scheduled Functions can trigger short jobs but not the long crawl/worker.

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

1. Confirmation the backfill + `npm run qualify` ran, and the stats JSON they
   printed (or any error).
2. `ANTHROPIC_API_KEY` in the environment where you run `qualify` (activates the
   LLM money-vs-craft classifier — never paste the key into chat). Phase 2 also
   runs without it, using the rule classifier.
3. Nothing else — Firecrawl/email-verification keys wait for Phases 3–4.
