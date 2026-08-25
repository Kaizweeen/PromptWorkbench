# Prompt Workbench

A local-first workbench for authoring, versioning, comparing, and testing
prompts that follow Anthropic's canonical prompt structure. Single-user, runs
on your machine, no auth.

Prompts are stored as **structured sections**, never as a blob of text.
Rendering to final text is a pure function of those sections.

## Setup

```bash
npm install
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run db:migrate             # creates data/workbench.db
npm run dev
```

The API key is read only inside server-side route handlers. It never reaches
the browser, and `.env.local` is gitignored.

> Reach the dev server at `http://localhost:3000`. Next 16 blocks cross-origin
> dev resources, so loading it via `127.0.0.1` serves 403s for the client
> chunks and nothing hydrates.

## What it does

| Pane | What it's for |
|---|---|
| **editor** | The ten canonical sections, each with an inline hint explaining why it exists. Hints open on empty sections and collapse once filled. |
| **preview** | The rendered prompt, always visible, split into the exact system / user turns that get sent. `⌘⇧C` copies it. |
| **run** | Pick a model and effort, fill variables, stream the response. Shows tokens, latency, and cost. |
| **tests** | Test cases with six assertion types, run concurrently, with a pass/fail matrix across versions. |
| **brainstorm** | Claude interviews you one question at a time and extracts requirements as editable chips. |
| **generate** | Archetype templates + tech stack → a populated draft, deterministically and with no API call. |
| **refine** | Sends the draft to Claude and proposes changes section by section, which you accept or reject individually. |
| **history** | Every save is an immutable version, with a section-level diff between any two. |
| **/compare** | Two versions side by side, run against the same input, with a recorded winner. |

## Keyboard

| Key | Does |
|---|---|
| `⌘S` | Save a new version |
| `⌘⇧C` | Copy the rendered prompt |
| `⌘⏎` | Send a brainstorm message |

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm test` | Unit tests (208) |
| `npm run build` | Production build + typecheck |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply committed migrations |

## Layout

```
lib/sections.ts     the ten canonical sections + teaching hints
lib/render.ts       sections -> {system, user, prefill}   (pure)
lib/variables.ts    {{variable}} detection and substitution
lib/diff.ts         section-level diffing
lib/generate.ts     Stage A: deterministic template fill
lib/refine.ts       Stage B: parsing and applying AI refinements
lib/assertions.ts   test assertion evaluation
lib/config.ts       model roster, pricing, cost estimation
lib/prompts/        system prompts, as plain editable strings
lib/templates/      one archetype per file, as data
lib/api/            request building, retries, error mapping (server-only)
lib/repo/           persistence (server-only)
```

## Notes

- **Prefill** is authorable and renders in the preview, but returns a 400 on
  every current model except Haiku 4.5. The run layer drops it and says so
  rather than failing.
- **Cost** is computed per bucket, so cache reads and writes are priced at
  their own rates rather than as plain input.
- **Token counts are not comparable across models.** Models from the 4.7
  generation on use a newer tokenizer that produces roughly 30% more tokens
  for the same text.
- **`json_schema` assertions** validate a useful subset of JSON Schema and
  report any keywords they did not understand, rather than silently passing.

See `PLAN.md` for the build plan and the decisions taken along the way.
