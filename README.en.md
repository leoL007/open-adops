<div align="center">

# OpenAdOps

### From fragmented client input to defensible paid-media decisions

OpenAdOps is a **local-first** AI workspace for overseas app growth operators. It turns client briefs, rough media notes, and Google Ads / Meta Ads / TikTok Ads / AppsFlyer data into a structured strategy draft, an execution plan, an experiment ledger, optimization judgments, and client-ready reports.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_in_Browser-E77436?style=for-the-badge)](https://leol007.github.io/open-adops/)
[![License: MIT](https://img.shields.io/badge/License-MIT-1B2430?style=for-the-badge)](./LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-17845C?style=for-the-badge)](https://nodejs.org/)
[![Release](https://img.shields.io/badge/Release-v0.5.10-3D69A8?style=for-the-badge)](https://github.com/leoL007/open-adops/releases)

[简体中文](./README.md) · [English](./README.en.md) · [Product](./PRODUCT.md) · [Roadmap](./ROADMAP.md) · [Contributing](./CONTRIBUTING.md)

</div>

![OpenAdOps overview](./assets/openadops-overview.jpg)

## Current release (v0.5.10)

- **End-to-end loop**: intake → strategy draft → plan → **creative production** → **execution plan** → **experiment ledger** → optimize → report
- **Chinese-first UI** in the product (English docs keep clear English names)  
- **Task-aware model routing**: lighter models for questions/fast draft; stronger models for deep review and execution plans; automatic structure retry  
- **Optional performance targets**: add or remove Media CPI, AF-CPI, CPA, and ROAS independently; keep a metric observation-only during learning instead of inventing a threshold
- **Code does the math**: KPI and experiment sizing are deterministic  
- **Workspace backup**: export current project or full workspace as JSON; import with merge or replace  
- **Consistent model identity**: all generation surfaces show the actual Terra / Sol variant and reasoning effort
- **Sol for optimization diagnosis**: optimization uses Sol high while strategy and creative judgments stay on Terra medium
- **Handoff-ready creative production**: market, format, quantity, owner, deadline, status, test variable, and export live in one task
- **Reusable mapping profiles**: save common media / AppsFlyer mappings at workspace level, auto-apply exact header matches, and carry them in full-workspace backups
- **Traceable period comparison**: compare two non-overlapping ranges with deterministic changes for spend, installs, CPI, CPA, and ROAS
- **Optimization decision history**: preserve every diagnosis with its data range, aggregate evidence, model metadata, operator review state, and report trail
- **Actionable Codex failures**: distinguish exit codes from termination signals, hide unrelated Skill logs, and limit Skill loading by task
- **More reliable local runtime**: preserve readable projects when storage migration cannot write back, and give explicit states for cancellation, offline service, and invalid responses
- **Stale-process guard**: warn when the page and local Bridge versions differ, with a concise action when port 4173 is already occupied
- **Resilient local routing**: malformed Host or request targets no longer take down the workspace service
- **Auditable date periods**: impossible calendar dates stay out of ranges and comparisons while affected rows remain explicit in aggregate totals
- **Corrupt CSV rejection**: duplicate headers and unterminated quoted fields fail at import instead of producing partial metrics
- **Zero is not fake efficiency**: CPI, CPA, and rate metrics with zero denominators stay unavailable while real zero outcomes remain zero
- **Mock does not invent KPIs**: target-multiple pause rules appear only when an AF-CPI threshold is explicitly configured
- **Invalid numbers never silently become zero**: `N/A`, `--`, and other non-empty invalid cells block import by field; blanks are counted separately

## Why OpenAdOps

Paid media work is usually scattered across ad UIs, spreadsheets, screenshots, and chat. A generic LLM can write prose, but it rarely:

- keeps multi-step project context  
- separates confirmed / inferred / missing facts  
- guarantees CPI vs AF-CPI and sample-size math  

OpenAdOps keeps one local project for the full loop:

1. **Intake** — paste client material and media notes; structure a brief and clarification list  
2. **Strategy draft** — fast draft or deep review of a working strategy  
3. **Plan / creative production** — goals, media roles, budgets, then production quantities, specs, owners, deadlines, and delivery status
4. **Execution plan** — campaign blueprints, production briefs, measurement layers, launch checks, first 7 days  
5. **Experiment ledger** — now / next / later queue with thresholds, evidence, and learnings  
6. **Optimize** — CSV metrics by code, evidence-backed diagnosis, and operator adoption / execution / validation notes
7. **Report** — management HTML and print / PDF with recent optimization decisions

## What makes it different

- **Code calculates.** Metrics, sample size, duration, relative change  
- **AI judges.** Schema-validated strategy, diagnosis, and next actions  
- **Evidence stays attached** to every claim  
- **Unknowns stay visible** (confirmed / inferred / missing)  
- **Learning periods do not require fake KPIs**: zero is not a target, and missing thresholds never become stop-loss or scale rules
- **Execution output is handoff-ready** (names, events, bids, single variables, owners)  
- **Launch checks have owners**; blockers block “ready”  
- **Inconclusive is valid** when sample thresholds are not met  
- **Local-first**: browser storage; raw CSV rows are not sent to the model bridge  
- **Safe failure**: errors instead of fabricated success  
- **Usable without an account**: [GitHub Pages mock demo](https://leol007.github.io/open-adops/)  

## 60-second start

### Browser demo (mock only)

Open the [live demo](https://leol007.github.io/open-adops/). Browser-only labeled demo data; **no** local model calls.

### Run locally (full features)

```bash
git clone https://github.com/leoL007/open-adops.git
cd open-adops
npm start
```

Open `http://127.0.0.1:4173`. No `npm install` — Node built-ins only.

```bash
npm run check
```

## Analysis modes

| UI label | Requirements | Behavior |
| --- | --- | --- |
| **Local demo** | None | Deterministic mock output; no model usage |
| **GPT-5.6 · smart routing** (backed by local Codex CLI) | Signed-in Codex CLI | Local Node bridge → `codex exec` with task-aware models |

Default routing (does not inherit a global ultra-high reasoning setting):

| Task | Default model | Effort |
| --- | --- | --- |
| Client questions | `gpt-5.6-terra` | low |
| Fast strategy draft | `gpt-5.6-terra` | medium |
| Deep strategy review | `gpt-5.6-sol` | high |
| Strategy / creative diagnosis | `gpt-5.6-terra` | medium |
| Optimization diagnosis | `gpt-5.6-sol` | high |
| Execution plan | `gpt-5.6-sol` | high |
| Experiment ledger | `gpt-5.6-terra` | medium |

Failed structure validation on Terra triggers one `gpt-5.6-sol + medium` retry. The UI distinguishes GPT-5.6 Terra / Sol, effort, timing, cancel, and sticky errors.

```bash
OPENADOPS_TERRA_MODEL=gpt-5.6-terra OPENADOPS_DEEP_MODEL=gpt-5.6-sol npm start
```

Legacy overrides: `OPENADOPS_MODEL`, `OPENADOPS_REASONING_EFFORT`, `OPENADOPS_TIMEOUT_MS` (apply to all tasks — use carefully).

Optional Ads skills (e.g. [Claude Ads](https://github.com/AgriciDaniel/claude-ads)) can deepen analysis; mock mode works without them.

## Creative production plan

The Creative Production page turns AI directions or execution-plan briefs into handoff-ready tasks:

- Platform, market, language, deliverable type, format, and version count
- Owner, deadline, and backlog / in progress / review / delivered / live status
- Angle, Hook, hypothesis, single variable, and success metric
- Asset link, production notes, and compliance requirements
- Manual tasks survive later AI refreshes; legacy creative plans migrate automatically
- UTF-8 CSV and Markdown export for creative and media teams

## Execution plan

Turns intake + strategy draft into an operator handoff:

- Media roles and budget shares (no invented budgets)  
- Campaign-ready naming, goals, events, geos, bidding, split logic  
- Per-platform creative production briefs with one primary variable  
- Media / MMP / business source-of-truth layers  
- Launch checklist with status, owner, evidence (finance compliance gates included)  
- Day 0–7 actions and decision rules  
- Document / HTML export and local snapshots  

## Experiment ledger

Builds a cross-platform test queue from execution-plan creative briefs:

- One primary variable; control / variant / primary metric / guardrails frozen first  
- Native methods for Google App asset experiments, Meta A/B, TikTok Split Testing  
- Deterministic sizing for rate metrics; blank when baseline or traffic is missing  
- Evidence, win / lose / inconclusive, learning, next action  
- Exports and management-report rollup  

See [experiment methods](./docs/EXPERIMENTS.md).

## CSV input

Requires **Spend** and at least one of **Media Installs** or **AF Installs**.

| Dimensions | Metrics |
| --- | --- |
| Date, Platform, Country, Campaign, Ad group / Ad set, Creative, Conversion Event | Spend, Impressions, Clicks, Media Installs, AF Installs, Conversions, Revenue, D1 Retained |

- Common EN/ZH aliases; user can correct mapping before calc  
- Save the current mapping as a workspace profile; exact header matches auto-apply and partial matches show an explicit match count
- **Media installs and AF installs stay separate** — an AF-only column is not bound to media installs  
- Mapped numeric columns are quality-checked before calculation; invalid non-empty cells block import, while blanks treated as zero are explicitly counted
- A mapped date enables previous-vs-current comparison; raw rows stay transient and only aggregate evidence is persisted
- Demo file: [openadops-demo.csv](./public/data/openadops-demo.csv)  

## Validation

```bash
npm run check
```

**108** automated tests cover intake, creative-production migration and export, execution plans, experiment ledgers, optimization decision history, workspace backup and migration safety, AI request errors, runtime-version checks, startup failures, request-target parsing, calendar-date validation, CSV structure and numeric quality, undefined metrics, Mock KPI boundaries, static-server boundaries, CSV mapping profiles, period comparison, model routing and labels, optional performance targets, finance blockers, small-budget focus, experiment sizing, conversion-event identity, platform aliases, missing-data protection, AF/media install mapping, media CPI vs AF-CPI, aggregation, and schema validation. Tests never call a live model.

## Current scope

- CSV import (export XLSX to CSV first)  
- Paste-text intake; no OCR yet  
- Browser-local projects; no multi-user sync  
- Planning and recommendations only — **no** live ad-account writes  
- Google / Meta / TikTok + AppsFlyer app UA focus  
- Attribution windows and profit definitions still need operator judgment  

More: [PRODUCT.md](./PRODUCT.md) · [benchmarks](./docs/BENCHMARKS.md) · [experiments](./docs/EXPERIMENTS.md) · [user cases](./docs/USER_CASES.md) · [decisions](./docs/DECISIONS.md) · [releasing](./docs/RELEASING.md)

## Project status

Early public release. See the [roadmap](./ROADMAP.md), open a [feature request](https://github.com/leoL007/open-adops/issues/new?template=feature_request.yml), or contribute adapters.

## License

[MIT](./LICENSE). Independent open-source project; not affiliated with Google, Meta, TikTok, AppsFlyer, or OpenAI.
