# Prompt Workbench

A local-first workbench for authoring, versioning, comparing, and testing prompts
that follow Anthropic's canonical prompt structure. Single-user, runs on your
machine, no auth.

Prompts are stored as **structured sections**, never as a blob of text. Rendering
to final text is a pure function of those sections.

## Setup

```bash
npm install
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run db:migrate             # creates data/workbench.db
npm run dev
```

The API key is read only inside server-side route handlers. It never reaches the
browser, and `.env.local` is gitignored.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm test` | Unit tests (renderer, cost accounting) |
| `npm run build` | Production build + typecheck |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply committed migrations |

## Layout

```
lib/sections.ts   the ten canonical sections + teaching hints
lib/render.ts     sections -> {system, user, prefill}   (pure)
lib/config.ts     model roster, pricing, cost estimation
lib/db/schema.ts  SQLite schema (immutable versions)
drizzle/          committed migrations
```

See `PLAN.md` for the build plan and phase breakdown.
