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
- [x] Keep deep Strategy review and Launch Pack generation on GPT-5.6 high.
- [x] Show model, reasoning effort, elapsed time, expected duration, and cancel state.
- [x] Retry schema-invalid Terra output once with GPT-5.6 medium.
- [x] Keep errors visible and store runtime metadata with generated artifacts.

## v0.5 — Workflow portability

- [ ] XLSX import.
- [x] Project JSON export/import and backup. *(shipped in v0.4.3)*
- [ ] Saved mapping profiles for common platform exports.
- [ ] Date-range comparison and change annotations.
- [ ] English UI and runtime locale switch.
- [ ] Provider adapter contract for additional coding-agent runtimes.

## v0.6 — Evidence and collaboration

- [ ] Reusable strategy and creative-test templates by industry.
- [ ] Versioned analysis runs and decision history.
- [ ] Shareable read-only report bundle.
- [ ] Optional local database persistence.
- [ ] Configurable KPI and validation rules.

## Explicit non-goals for now

- Autonomous budget changes.
- Unapproved ad-account writes.
- Fabricated benchmarks or performance claims.
- Cloud storage of raw customer exports by default.

Have a real export format or workflow that OpenAdOps should support? Open a feature request with sanitized headers and the desired output.
