<div align="center">

# OpenAdOps

### From fragmented client input to a defensible paid-media strategy.

OpenAdOps is a local-first AI workspace that turns client offers, fragmented strategy notes, and Google Ads, Meta Ads, TikTok Ads, and AppsFlyer data into structured briefs, launch packs, experiment ledgers, optimization actions, and client-ready reports.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_in_Browser-E77436?style=for-the-badge)](https://leol007.github.io/open-adops/)
[![License: MIT](https://img.shields.io/badge/License-MIT-1B2430?style=for-the-badge)](./LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-17845C?style=for-the-badge)](https://nodejs.org/)
[![Release](https://img.shields.io/badge/Release-v0.4.2-3D69A8?style=for-the-badge)](https://github.com/leoL007/open-adops/releases)

[简体中文](./README.md) · [English](./README.en.md) · [Roadmap](./ROADMAP.md) · [Contributing](./CONTRIBUTING.md)

</div>

![OpenAdOps overview](./assets/openadops-overview.jpg)

## Why OpenAdOps

Paid-media work is fragmented across dashboards, spreadsheets, screenshots, and chat threads. A generic chat can draft an answer, but it does not preserve the operating context or guarantee the metric math.

OpenAdOps keeps the workflow in one project:

1. **Intake** — paste client offers and notes, then separate confirmed, inferred, and missing information.
2. **Plan** — generate clarification questions, Strategy v0, platform roles, budget scenarios, and test hypotheses.
3. **Create** — platform-aware creative angles, hooks, variables, and success metrics.
4. **Launch Pack** — campaign blueprints, media budgets, production briefs, measurement rules, launch gates, and a first-seven-day plan.
5. **Experiment Ledger** — a Now / Next / Later test backlog with sample thresholds, stop rules, evidence, and learnings.
6. **Optimize** — deterministic KPI calculation plus evidence-backed AI recommendations.
7. **Report** — management-ready HTML and print/PDF output.

## What makes it different

- **Code does the math.** CSV metrics, experiment sample size, estimated duration, and relative change are deterministic.
- **AI does the judgment.** Strategy, diagnosis, creative tests, and next actions are returned as schema-validated JSON.
- **Evidence stays attached.** Every finding separates evidence, diagnosis, action, confidence, and validation.
- **Unknowns stay visible.** The brief distinguishes client-confirmed information, AI inference, and missing input.
- **Pre-flight output is operational.** Campaign naming, events, bidding prerequisites, creative variables, owners, and evidence stay in one deliverable.
- **Inconclusive is a valid result.** Tests that miss their sample threshold are not rewritten as winners.
- **Local-first by design.** Projects live in browser storage; raw CSV rows are not sent to the AI bridge, and pasted intake text is submitted to local Codex only on explicit request.
- **Safe failure behavior.** A failed AI request produces an explicit error instead of a fabricated recommendation.
- **Useful without an account.** The browser-local Mock demo works on GitHub Pages and does not require Codex or an API key.

## 60-second start

### Try the browser demo

Open the [live Mock demo](https://leol007.github.io/open-adops/). It runs entirely in the browser with clearly labeled demo data.

### Run locally

```bash
git clone https://github.com/leoL007/open-adops.git
cd open-adops
npm start
```

After startup, open the local workspace at `http://127.0.0.1:4173`. No `npm install` is required; the project uses Node.js built-in modules only.

Run the complete quality gate:

```bash
npm run check
```

## AI modes

| Mode | Requirements | What happens |
| --- | --- | --- |
| Browser-local Mock | None | Generates deterministic, clearly labeled demo recommendations without a server AI call. |
| Codex CLI | Signed-in Codex CLI | Sends pasted intake text, project context, and aggregated metrics through the local Node bridge to `codex exec`. |

OpenAdOps uses task-aware routing and does not inherit a global Codex `xhigh` reasoning setting:

| Task | Default model | Effort |
| --- | --- | --- |
| Client questions | `gpt-5.6-terra` | low |
| Fast Strategy v0 | `gpt-5.6-terra` | medium |
| Deep Strategy v0 review | `gpt-5.6` | high |
| Data and creative diagnosis | `gpt-5.6-terra` | medium |
| Launch Pack | `gpt-5.6` | high |
| Experiment Ledger | `gpt-5.6-terra` | medium |

If a Terra response fails structural validation, OpenAdOps retries once with `gpt-5.6 + medium`. The UI shows the active model, reasoning level, elapsed time, expected range, cancel control, and persistent failures.

Override the workspace models without changing global Codex configuration:

```bash
OPENADOPS_TERRA_MODEL=gpt-5.6-terra OPENADOPS_DEEP_MODEL=gpt-5.6 npm start
```

Legacy all-task overrides remain supported: `OPENADOPS_MODEL`, `OPENADOPS_REASONING_EFFORT`, and `OPENADOPS_TIMEOUT_MS`.

For deeper paid-media reasoning, install a compatible Ads skill such as [Claude Ads](https://github.com/AgriciDaniel/claude-ads) for your agent runtime. OpenAdOps remains usable in Mock mode without it.

## Launch Pack

The Launch Pack turns Offer Intake and Strategy v0 into platform roles, budget allocation, campaign-ready naming and setup logic, production-ready creative briefs, layered measurement rules, owner-based launch gates, and Day 0–7 decision rules. It can be exported as Markdown or a standalone HTML document and saved as local snapshots.

Missing budgets remain blank. Regulated financial projects surface licensing, local policy, disclaimer, and platform-category approval as pre-launch blockers.

## Experiment Ledger

The Experiment Ledger converts Launch Pack creative briefs into an operating test queue:

- One primary variable per experiment, with Control, Variant, primary metric, and guardrails frozen before launch.
- Platform-aware guidance for Google App asset experiments, Meta A/B tests, and TikTok Split Testing.
- Deterministic sample-size and duration estimates for rate metrics; missing traffic inputs remain blank.
- Evidence, Winner / Loser / Inconclusive, learning, and next-action records.
- Markdown, standalone HTML, local snapshots, and management-report rollup.

See [the experiment method and boundaries](./docs/EXPERIMENTS.md).

## CSV input

CSV import requires `Spend` plus at least one of `Media Installs` or `AF Installs`. Recommended fields:

| Dimension fields | Metric fields |
| --- | --- |
| Date, Platform, Country, Campaign, Ad group / Ad set, Creative, Conversion Event | Spend, Impressions, Clicks, Media Installs, AF Installs, Conversions, Revenue, D1 Retained |

OpenAdOps auto-detects common English and Chinese field aliases and lets the user correct each mapping before calculation. See [the demo CSV](./public/data/openadops-demo.csv).

## Validation

```bash
npm run check
```

Thirty-three tests cover intake, Launch Pack, Experiment Ledger, finance blockers, small-budget focus, experiment sizing, conversion-event identity, platform-alias aggregation, missing-data protection, quoted CSV parsing, active date ranges, media CPI versus AppsFlyer CPI, aggregation, and schema validation. The test suite never calls a real model.

## Current scope

- Direct CSV import; XLSX can be exported to CSV first.
- Intake accepts pasted text; OCR and document parsing are not included yet.
- Local browser persistence; no multi-user sync yet.
- Strategy, experiment planning, and recommendation generation only; no live ad-account mutations.
- Google Ads, Meta Ads, TikTok Ads, and AppsFlyer-oriented App UA workflow.
- Attribution windows, event definitions, and profit assumptions still require operator confirmation.

## Project status

OpenAdOps is an early public release built in the open. See the [roadmap](./ROADMAP.md), open a [feature request](https://github.com/leoL007/open-adops/issues/new?template=feature_request.yml), or contribute a platform/data adapter.

## License

[MIT](./LICENSE). OpenAdOps is an independent open-source project and is not affiliated with Google, Meta, TikTok, AppsFlyer, or OpenAI.
