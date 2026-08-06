<div align="center">

# OpenAdOps

### A local-first paid-media operations workspace

Turn client offers, media requirements, and performance data into **creative requirements, launch checks, optimization actions, and client-ready reports**.

[![Live demo](https://img.shields.io/badge/Live_demo-Open_workspace-E77436?style=for-the-badge)](https://leol007.github.io/open-adops/)
[![Local edition](https://img.shields.io/badge/Local_edition-Install_guide-1B2430?style=for-the-badge)](./docs/INSTALL.md)
[![Latest release](https://img.shields.io/badge/Latest_release-View_Releases-3D69A8?style=for-the-badge)](https://github.com/leoL007/open-adops/releases/latest)

[![Tests](https://github.com/leoL007/open-adops/actions/workflows/test.yml/badge.svg)](https://github.com/leoL007/open-adops/actions/workflows/test.yml)
[![GitHub Release](https://img.shields.io/github/v/release/leoL007/open-adops?display_name=tag)](https://github.com/leoL007/open-adops/releases)
[![License](https://img.shields.io/github/license/leoL007/open-adops)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-17845C)](https://nodejs.org/)

[简体中文](./README.md) · [English](./README.en.md) · [Product](./PRODUCT.md) · [Roadmap](./ROADMAP.md) · [Contributing](./CONTRIBUTING.md)

</div>

![OpenAdOps overview](./assets/screenshots/overview.png)

> GitHub Pages is a deterministic mock demo. The full workspace runs locally with the operator's own Codex or Grok sign-in.

## Why OpenAdOps

Paid-media work is usually scattered across ad platforms, spreadsheets, screenshots, chat, and temporary documents. Generic AI can write recommendations, but it rarely preserves project context, protects metric identity, and turns advice into reviewable actions.

| Real problem | OpenAdOps response |
| --- | --- |
| Fragmented input invites invented assumptions | Confirmed, inferred, and missing facts stay explicit |
| Creative, launch, and optimization work live in separate documents | One local project carries the full operating chain |
| CPI, AF-CPI, CPA, and ROAS are easy to mix | Deterministic code calculates; AI only judges |
| AI recommendations disappear after the chat | Every action can be reviewed, executed, validated, or rejected |

## One practical operating flow

```text
Intake → Build strategy (optional) → Creative requirements → Launch execution → Optimization → Report
```

| Stage | Deliverable |
| --- | --- |
| **Intake** | Structured brief and operator-owned preflight checklist |
| **Build strategy (optional)** | Campaign / Ad group / Ad settings and Excel export |
| **Creative requirements** | References, copy, modification notes, and quantity for design |
| **Launch execution** | Launch status, measurement layers, checks, and Day 0–7 actions |
| **Optimization** | Consistent KPIs, period comparison, diagnosis, and action review |
| **Report** | Management/client HTML, print, and PDF output |

## See the workspace

| AI creative guidance | Launch execution |
| --- | --- |
| ![AI creative guidance](./assets/screenshots/creative-requirements.png) | ![Launch execution](./assets/screenshots/launch-execution.png) |

### Optimization

![Optimization](./assets/screenshots/optimization.png)

## More than a generic AI chat

- **Code calculates** spend, installs, AF installs, CPI, AF-CPI, CPA, ROAS, and period movement.
- **AI judges** strategy, creative boundaries, launch risk, and optimization actions through JSON Schema contracts.
- **Operators decide** what enters the confirmed workspace; AI never silently overwrites approved content.
- **Evidence stays attached** to ranges, aggregates, models, decisions, statuses, and validation notes.
- **Unknowns stay unknown**; learning periods do not require invented thresholds.
- **Failures stay visible**; exits, timeouts, invalid structures, and offline services never become fake success.

## Local-first and account-safe

```text
Browser workspace  →  Local OpenAdOps Bridge  →  Operator-owned Codex / Grok CLI
  project data             schema checks                  AI judgment
```

- Projects live in the current browser and can be exported as workspace backups.
- Raw CSV rows are processed on the current page; only aggregates enter the project.
- OpenAdOps does not bundle, upload, or share Codex credentials or API keys.
- It does not connect to or modify live ad accounts; humans execute every action.

## Start in 60 seconds

### Browser demo

Open the [GitHub Pages demo](https://leol007.github.io/open-adops/). No account or model usage; local model calls are unavailable.

### Local full edition

1. Open [Releases](https://github.com/leoL007/open-adops/releases) and download the complete project.
2. Confirm Node.js 20+ and Codex CLI are installed.
3. Run `codex login` once with your own ChatGPT / Codex account.
4. On macOS, double-click `打开 OpenAdOps.command`; on Windows, double-click `OpenAdOps.cmd`.
5. The launcher checks the environment and opens `http://127.0.0.1:4173`.

See the [local installation guide](./docs/INSTALL.md) for complete setup and troubleshooting.

<details>
<summary><strong>Developers: start from a terminal</strong></summary>

```bash
git clone https://github.com/leoL007/open-adops.git
cd open-adops
npm start
```

OpenAdOps uses Node.js built-ins only; no `npm install` is required.

</details>

## AI modes

| UI label | Requirement | Behavior |
| --- | --- | --- |
| **Local demo** | None | Deterministic mock with no model usage |
| **Grok 4.5** | Signed-in Grok CLI | Local Bridge calls Grok 4.5 high reasoning |
| **GPT 5.6** | Signed-in Codex CLI | Task-aware Terra / Sol routing |

<details>
<summary><strong>Show GPT 5.6 task routing</strong></summary>

| Task | Default model | Effort |
| --- | --- | --- |
| Preflight checklist | `gpt-5.6-terra` | low |
| Fast strategy and creative guidance | `gpt-5.6-terra` | medium |
| Deep strategy review | `gpt-5.6-sol` | high |
| Optimization diagnosis | `gpt-5.6-sol` | high |
| Launch execution | `gpt-5.6-sol` | high |

If Terra fails structural validation, OpenAdOps retries once with Sol medium. The UI exposes the actual model, effort, timing, and failure reason.

</details>

## Data input and metric boundaries

CSV input requires **Spend** plus at least one of **Media Installs** or **AF Installs**.

- Common English/Chinese aliases are detected and editable mapping profiles are reusable.
- Media installs and AF installs remain separate, preventing false CPI/AF-CPI equivalence.
- Invalid numbers, broken row widths, illegal dates, and malformed backups fail before entering a project.
- Efficiency metrics with zero denominators stay unavailable instead of becoming fake zero.
- Two non-overlapping periods can be compared on consistent spend, install, CPI, CPA, and ROAS identities.

Demo data: [openadops-demo.csv](./public/data/openadops-demo.csv)

## Current boundaries

- CSV input; export XLSX to CSV first.
- Paste-text intake; no general OCR/document parsing yet.
- Browser-local projects; no real-time multi-user sync.
- Creative references remain operator-owned; AI does not search for videos or competitor assets.
- Focused on Google Ads, Meta Ads, TikTok Ads, and AppsFlyer App UA workflows.
- Attribution windows, event definitions, and profit logic still require operator judgment.

## Quality and validation

```bash
npm run check
```

**158 deterministic tests** cover cross-platform launchers, model routing, schemas, creative requirements, launch execution, CSV quality, metric calculation, period comparison, optimization actions, backup, and migration. Tests never call a live model.

## Project status

OpenAdOps is an early public release. You can:

- review the [Roadmap](./ROADMAP.md)
- open a [feature request](https://github.com/leoL007/open-adops/issues/new?template=feature_request.yml)
- read the [Product definition](./PRODUCT.md) and [Decision log](./docs/DECISIONS.md)
- contribute platform adapters, field mappings, or real workflow feedback

If OpenAdOps is useful to your paid-media work, consider giving the repository a **Star**.

## License

[MIT](./LICENSE). OpenAdOps is independent and not affiliated with Google, Meta, TikTok, AppsFlyer, or OpenAI.
