# OpenAdOps Roadmap

The roadmap is organized around one outcome: turn paid-media inputs into decisions an operator can defend.

## v0.1 — Public foundation

- [x] Multi-project local workspace.
- [x] Google Ads, Meta Ads, and TikTok Ads planning surfaces.
- [x] CSV parsing, field mapping, and AppsFlyer-aware KPI calculation.
- [x] Browser-local Mock mode and optional Codex CLI bridge.
- [x] JSON Schema validated findings, tests, and HTML/PDF-ready reporting.
- [x] Static GitHub Pages demo.

## v0.2 — Offer Intake and Strategy v0

- [x] Paste client offers, strategy fragments, and operator notes.
- [x] Distinguish confirmed, inferred, and missing Brief fields.
- [x] Generate clarification questions and a schema-validated Strategy v0.
- [x] Support finance, gaming, utility, Google Ads, Meta Ads, and TikTok Ads context.
- [x] Save local versions, export Markdown, and adopt the draft into planning.

## v0.3 — Launch Pack

- [x] Turn Offer Intake and Strategy v0 into an execution-ready pre-flight deliverable.
- [x] Generate platform roles, normalized budgets, Campaign blueprints, and creative production briefs.
- [x] Separate media feedback, MMP attribution, and business source-of-truth rules.
- [x] Track owner-based launch gates, blockers, evidence, and first-seven-day actions.
- [x] Export Markdown and standalone HTML; save local Launch Pack snapshots.
- [x] Add fixed product evals, version validation, and tag-driven GitHub Releases.

## v0.4 — Experiment Ledger

- [x] Turn Launch Pack creative briefs into a prioritized cross-platform experiment backlog.
- [x] Enforce one primary variable, predefined success rules, guardrails, owners, and evidence.
- [x] Calculate rate-test sample size, duration, and relative change with deterministic code.
- [x] Keep missing baseline and traffic inputs empty instead of fabricating precision.
- [x] Record running state, outcome, learning, next action, and local versions.
- [x] Export Markdown and standalone HTML; feed experiment status into the management report.

### v0.4.1 — Task-aware AI runtime

- [x] Route routine intake, diagnosis, and experiment tasks to Terra low/medium.
- [x] Keep deep Strategy review and Launch Pack generation on GPT-5.6 Sol high.
- [x] Show model, reasoning effort, elapsed time, expected duration, and cancel state.
- [x] Retry schema-invalid Terra output once with GPT-5.6 Sol medium.
- [x] Keep errors visible and store runtime metadata with generated artifacts.

### v0.4.5 — Optional performance targets

- [x] Add or remove Media CPI, AF-CPI, CPA, and ROAS per project.
- [x] Separate observation-only metrics, test thresholds, and formal targets.
- [x] Keep zero and missing thresholds out of AI stop-loss and scaling rules.
- [x] Preserve CPA event identity, ROAS window, and legacy-project migration.

### v0.4.6 — Focused optimization reasoning

- [x] Route optimization diagnosis to GPT-5.6 Sol high without changing strategy or creative analysis.
- [x] Keep model and reasoning labels aligned with the actual server route.
- [x] Remove nonessential interface explanations while preserving metric and safety boundaries.

### v0.4.7 — Creative production plan

- [x] Turn creative angles into editable production tasks with delivery fields and workflow status.
- [x] Preserve manual tasks and operational edits when AI-generated directions are refreshed.
- [x] Migrate legacy creative plans and Launch Pack briefs without losing the experiment input contract.
- [x] Export production tasks as CSV and Markdown.

## v0.5 — Workflow portability

- [ ] XLSX import.
- [x] Project JSON export/import and backup. *(shipped in v0.4.3)*
- [x] Saved mapping profiles for common platform exports.
- [x] Date-range comparison and change annotations.
- [ ] English UI and runtime locale switch.
- [ ] Provider adapter contract for additional coding-agent runtimes.

### v0.5.0 — Reusable data intake

- [x] Save mapping profiles at workspace level and carry them in full-workspace backups.
- [x] Apply only source columns present in the current file; preserve media and AppsFlyer metric identities.
- [x] Compare two non-overlapping periods with deterministic relative-change calculations.
- [x] Keep raw CSV rows transient and persist only aggregate evidence.

### v0.5.1 — Optimization decision history

- [x] Keep every optimization diagnosis instead of overwriting the prior run.
- [x] Snapshot model metadata, source file, date ranges, and aggregate metrics without raw CSV rows.
- [x] Record operator review state and a manual conclusion with an explicit save action.
- [x] Feed the latest decision records into the management report and standalone HTML export.

### v0.5.3 — Local runtime resilience

- [x] Preserve readable projects when workspace migration cannot write back to browser storage.
- [x] Normalize offline, invalid-response, busy-task, and cancellation states across AI requests.
- [x] Reject malformed static paths and return HEAD responses without a body.
- [x] Cover the new failure boundaries with deterministic tests that do not call a live model.

### v0.5.4 — Runtime version guard

- [x] Return the running Bridge version from the local health endpoint.
- [x] Warn when a refreshed page is still connected to an older local process.
- [x] Replace raw port-conflict stacks with a concise restart instruction.
- [x] Cover startup and version-compatibility decisions with deterministic tests.

### v0.5.5 — Request routing resilience

- [x] Parse local request targets without trusting the incoming Host header.
- [x] Keep the local service alive after a malformed Host request.
- [x] Return a client error for invalid request targets.
- [x] Cover request parsing with deterministic and live-process regression checks.

### v0.5.6 — Calendar-valid reporting periods

- [x] Reject impossible calendar dates while preserving valid leap days.
- [x] Exclude invalid dates from ranges, comparisons, and experiment traffic periods.
- [x] Keep affected rows in aggregate totals with an explicit import warning.
- [x] Persist only aggregate date-quality counts, never raw CSV rows.

### v0.5.7 — CSV structure integrity

- [x] Reject duplicate normalized headers before row objects are built.
- [x] Reject unterminated quoted fields before they can swallow following rows.
- [x] Surface a specific import error instead of producing partial metrics.
- [x] Cover both corruption cases with deterministic regression tests.

### v0.5.8 — Undefined metric integrity

- [x] Represent zero-denominator efficiency metrics as unavailable instead of zero.
- [x] Keep real zero counts and zero revenue outcomes distinct from undefined ratios.
- [x] Mark period changes unavailable when either side lacks a valid denominator.
- [x] Prevent mock analysis from treating missing efficiency as cost evidence.

### v0.5.9 — Target-aware mock decisions

- [x] Use target-multiple pause rules only for configured AF-CPI thresholds.
- [x] Keep observation-only and missing targets out of automated pause language.
- [x] Preserve the configured currency, value, and target role in demo actions.
- [x] Test both missing-target and configured-target behavior.

### v0.5.10 — Numeric data quality gate

- [x] Validate every mapped numeric cell before calculating metrics.
- [x] Block non-empty invalid values instead of silently converting them to zero.
- [x] Count blank numeric cells separately and warn when they are treated as zero.
- [x] Persist and send only aggregate quality counts, never raw cell contents.

## v0.6 — Evidence and collaboration

- [ ] Reusable strategy and creative-test templates by industry.
- [x] Versioned optimization runs and decision history. *(shipped in v0.5.1)*
- [ ] Shareable read-only report bundle.
- [ ] Optional local database persistence.
- [ ] Configurable KPI and validation rules.

## Explicit non-goals for now

- Autonomous budget changes.
- Unapproved ad-account writes.
- Fabricated benchmarks or performance claims.
- Cloud storage of raw customer exports by default.

Have a real export format or workflow that OpenAdOps should support? Open a feature request with sanitized headers and the desired output.
