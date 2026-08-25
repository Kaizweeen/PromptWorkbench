# Prompt Workbench — Build Plan

A local-first workbench for authoring, versioning, comparing, and testing prompts
built on Anthropic's canonical prompt structure. Single-user, runs on localhost,
no auth, no multi-tenancy.

---

## 1. Stack decision

**I'm taking your recommendation as-is.** Next.js (App Router) + TypeScript +
Tailwind + shadcn/ui, SQLite via Drizzle ORM at `data/workbench.db`, official
`@anthropic-ai/sdk`.

Your reasoning holds: a server is required for the API key anyway, and
prompts → versions → runs → results is a genuinely relational shape with
unbounded growth on the results side. localStorage would collapse.

Two sub-decisions I made without asking:

| Decision | Choice | Why |
|---|---|---|
| SQLite driver | `better-sqlite3` | Synchronous, zero-config, no daemon. Ideal for single-user local. Drizzle's first-class driver. |
| Migrations | `drizzle-kit generate` → committed SQL | Committed migrations mean the db is reproducible; auto-push would drift. |
| Test runner | Vitest | Fast, ESM-native, no Babel config. |
| Diffing | `diff` (jsdiff) | Battle-tested word/line diff. Section-level diffing is my own layer on top. |

No overrides requested. If you'd rather I swap any of the above, say so before
Phase 1 lands.

---

## 2. Model IDs and pricing — verified, not recalled

You asked me not to guess these. I fetched
`platform.claude.com/docs/en/about-claude/models/overview` and
`/about-claude/pricing` today rather than pulling from memory.

| Model | ID | Context | Max out | In $/MTok | Out $/MTok | Cache read $/MTok |
|---|---|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | 1M | 128K | $5.00 | $25.00 | $0.50 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 128K | $2.00 | $10.00 | $0.20 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 64K | $1.00 | $5.00 | $0.10 |
| Claude Fable 5 | `claude-fable-5` | 1M | 128K | $10.00 | $50.00 | $1.00 |

These live in `lib/config.ts` as a single `MODELS` record — the one place a
model ID or price appears. Cost estimation reads `usage` off each response
(`input_tokens`, `output_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens`) and prices each bucket separately; cache reads
are 0.1x base input and cache writes 1.25x (5m) / 2x (1h), so a flat
in/out calculation would misreport any cached run.

Note for later: models from the 4.7 generation on use a newer tokenizer that
produces ~30% more tokens for the same text. Cross-model token counts in A/B
compare are therefore not apples-to-apples, and I'll label them as such rather
than implying the prompt got longer.

---

## 3. The section model

Ten sections, canonical order, stored structured — never as a blob:

| # | Section | Key | Renders as |
|---|---|---|---|
| 1 | Task context | `task_context` | bare text |
| 2 | Tone / style | `tone` | bare text |
| 3 | Background data / documents | `background` | `<documents><document>…` |
| 4 | Detailed task rules | `rules` | `<instructions>` |
| 5 | Examples | `examples` | `<examples><example>…` |
| 6 | Conversation history | `history` | `<conversation_history>` |
| 7 | Immediate task | `immediate_task` | bare text |
| 8 | Thinking instructions | `thinking` | `<thinking_instructions>` |
| 9 | Output format | `output_format` | `<output_format>` |
| 10 | Prefill | `prefill` | assistant turn — **see §6** |

Renderer contract (pure function, `sections → {system, user, prefill?}`):

- Multi-line sections get semantic XML tags; single-line ones stay bare.
- Empty / whitespace-only sections are omitted entirely — no dangling headers,
  no empty tags.
- Long documents at top, immediate task at bottom. Order is fixed by the table,
  not by insertion.
- Output is byte-for-byte what gets sent to the API. No post-processing.

Every section carries an inline hint in the editor explaining *why* it exists.
The app should teach the structure, not just fill it in.

**Tech stack metadata** renders as a `<tech_stack>` block appended inside the
task-context region — it's context about the *target* project, not about this app.

---

## 4. Phases

Each phase ends with: app runs, tests pass, I summarize, **I stop and wait for you.**

| # | Phase | Delivers | Tests |
|---|---|---|---|
| 1 | Foundation | Scaffold, Drizzle schema + migrations, section model, `renderPrompt()` | ✅ render unit tests |
| 2 | Editor + library | Section editor w/ hints, variable detection, live preview, save, versioning, version diff | ✅ variable detection, diff |
| 3 | Templates + stack | 6 archetypes as data in `lib/templates/`, stack checkbox grid, presets, Stage A deterministic fill | ✅ template fill |
| 4 | API layer | Server routes, streaming, model picker, token/cost accounting, retry + backoff | ✅ cost calc, retry |
| 5 | Brainstorm | Chat, one-question-at-a-time interview, requirement chips, generate-from-conversation | — |
| 6 | AI refine | Meta-prompt, section-level diff, per-change accept/reject | ✅ diff apply |
| 7 | Test runner | Cases, 6 assertion types, concurrent runs w/ cap, pass/fail matrix across versions | ✅ assertion eval |
| 8 | A/B compare | Side-by-side diff, dual run, winner toggle | — |

Files stay under ~300 lines. The API key never reaches the browser — every
Anthropic call goes through a route handler reading `ANTHROPIC_API_KEY` from
`.env.local` (gitignored; `.env.example` committed).

---

## 5. Schema sketch

```
prompts        id, name, archetype, tags, lineage_id, forked_from, created_at
versions       id, prompt_id, number, message, sections(json), stack(json), created_at
variables      derived at render time, not stored
test_cases     id, prompt_id, name, inputs(json), expected, assertion(json)
runs           id, version_id, test_case_id?, model, rendered(json), response,
               usage(json), duration_ms, cost_usd, created_at
results        id, run_id, test_case_id, passed, detail
comparisons    id, left_version_id, right_version_id, input(json), winner, created_at
stack_presets  id, name, stack(json)
```

Versions are immutable — every save inserts. Restore inserts a new version
carrying the old sections forward. Nothing is ever destructive.

---

## 6. Questions before I build

### Q1 — Prefill (section 10) conflicts with every current model

This is the one real problem in the spec. **Assistant-turn prefill returns a 400
on Opus 5, Sonnet 5, Fable 5, and the whole 4.6/4.7/4.8 family.** It was removed
across the current lineup; the replacement is `output_config.format` (structured
outputs) or a system-prompt instruction. Of the models worth putting in the
picker, only Haiku 4.5 still accepts a prefill.

So a prefill section that renders faithfully would fail on your default model.

My recommendation: **keep prefill as an authorable section** — it's part of the
canonical structure and worth teaching — but make the run layer model-aware:
render it, show it in the preview, and when the selected model rejects prefill,
surface an inline warning offering to convert it to an `output_format` constraint
instead of sending it. Never silently drop it, never silently 400.

### Q2 — Which sections go to `system` vs `user`?

The spec says split into system/user but doesn't fix the mapping, and it's the
core of the render function. My proposed default:

- **system:** task context, tone, background/documents, rules, examples,
  thinking instructions, output format, tech stack
- **user:** conversation history, immediate task

Rationale: everything stable and reusable goes in system (cacheable prefix);
everything that varies per-invocation goes in user. That also makes prompt
caching work correctly later. I'd make it overridable per-prompt with a toggle,
defaulting as above.

### Q3 — Model roster and defaults

Proposed: `claude-opus-5` as the strong/default, `claude-sonnet-5` as the
iteration model, `claude-haiku-4-5` for cheap bulk test-suite runs, and
`claude-fable-5` available but not default (2x Opus pricing). Per-run override
in the UI, default constant in `lib/config.ts`.

Also: current models use adaptive thinking with an `effort` knob
(`low`→`max`, default `high`) rather than the old `budget_tokens`. I'd expose
effort as a per-run control since it materially changes both output quality and
cost. Say if you'd rather keep the run surface simpler.

---

## 7. Design direction

Dense, keyboard-first, dark by default. Monospace for prompt content, sans for
chrome. Three-pane where it earns it: library | editor | preview. Rendered
preview always visible while editing, one keystroke to copy. No hero sections,
no gradients, no emoji.
