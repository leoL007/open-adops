# Changelog

All notable changes to OpenAdOps are documented here.

## [0.4.5] - 2026-07-20

### Added

- Project inputs can add or remove Media CPI, AF-CPI, CPA, and ROAS independently, with one explicit primary metric.
- Each metric can be marked as observation-only, a test threshold, or a formal target; CPA keeps its conversion event and ROAS keeps its measurement window.
- Optional baseline review conditions let learning-phase projects define when to revisit targets without inventing a KPI.

### Changed

- Empty or zero legacy KPI fields migrate to an explicit missing-target state instead of being interpreted as real targets.
- Mock and Codex inputs now keep Media CPI, AF-CPI, CPA, and ROAS identities separate and expose missing thresholds explicitly.
- First-week execution rules use a CPA multiple only when an actual CPA threshold exists; otherwise they stay in learning mode.

## [0.4.4] - 2026-07-20

### Changed

- AI labels now separate routing mode, model variant, and reasoning effort: Terra for routine work and Sol for deep work.
- Every main-operation bar now uses the same `智能路由 · 模型 · 推理` label structure; the legacy `gpt-5.6` deep ID is displayed as Sol.
- Deep strategy review and execution-plan generation now explicitly route to `gpt-5.6-sol`; Terra structure fallback also uses Sol medium.
- Generation status, saved results, reports, exports, and completion messages show the actual Terra / Sol model name consistently.

### Fixed

- Workspace mutations are persisted transactionally, so a localStorage failure no longer produces a false success state.
- Backup import is disabled while an AI task is active, preventing completed model output from being detached from its project.
- Backup imports reject unsupported schema versions, malformed projects, and duplicate project IDs.

## [0.4.3] - 2026-07-17

### Added

- Workspace backup: export all projects or the active project as JSON, and import with merge or full replace.
- Deterministic backup helpers and tests for workspace/project formats.

## [0.4.2] - 2026-07-17

### Fixed

- CSV field mapping no longer binds AppsFlyer-only install columns to media installs, so media CPI and AF-CPI stay distinct when only AF installs are present.
- Launch gate evidence no longer appends “优化师已人工确认” on every ready toggle.
- Local project save now surfaces a clear error when browser storage quota is exceeded instead of failing silently.

## [0.4.1] - 2026-07-16

### Changed

- 界面主流程改为中文优先：按钮、状态、生成提示与导出文案统一。
- 「投前作战包 / Launch Pack」界面名称统一为「投放执行方案」；导航简称「执行方案」。
- Strategy v0 显示为「策略初稿」，Experiment Ledger 显示为「实验账本」。

### Added

- Task-aware Codex routing: Terra low/medium for routine intake, analysis, and experiments; GPT-5.6 high for deep Strategy review and Launch Pack generation.
- One-click deep Strategy v0 review alongside the faster default Strategy generation.
- Live generation status with active model, reasoning effort, elapsed time, expected duration, and cancel control.
- Persistent AI failure messages that remain visible until dismissed.
- Automatic GPT-5.6 medium retry when a Terra result fails structural validation.
- Generation metadata stored with each result, including model, effort, duration, route, and fallback state.

### Changed

- OpenAdOps no longer inherits the global Codex model and reasoning effort by default.
- Per-task timeouts now match task complexity instead of using one four-minute limit for every request.
- Local health status now exposes routing configuration and the active AI job without exposing customer input.

## [0.4.0] - 2026-07-16

### Added

- Experiment Ledger workspace that turns Launch Pack creative briefs into a Now / Next / Later test backlog.
- Deterministic rate-test sample sizing, duration estimation, feasibility states, and relative-change calculation.
- Google App asset experiment, Meta A/B test, and TikTok Split Testing execution guidance.
- Editable experiment status, result evidence, learning, next action, local snapshots, and Markdown / standalone HTML exports.
- Experiment summaries in the project command center and management report.
- Fixed experiment acceptance cases for multi-platform, missing-data, and insufficient-volume scenarios.

### Changed

- Browser storage migrates existing projects into the v4 shape without discarding Intake or Launch Pack history.
- Imported CSV metrics now normalize timestamped rows into active calendar dates for experiment traffic estimation.
- CSV mapping can preserve the declared conversion-event name, and equivalent platform aliases are combined before sizing.
- Experiment baselines only use a matching platform, a single primary metric, and an explicitly matched deep-event identity; account-wide averages and generic conversions are never substituted.
- Composite metrics remain `not_calculable`, and generated ledgers are deterministically capped at four experiments.
- Invalid sizing inputs are rejected, and concluded experiments automatically reopen if required evidence or learning is removed.
- Async AI results are written back to their originating project, while project and mode switching remain locked during generation.
- Workflow portability moves to v0.5 so v0.4 can close the strategy-to-learning loop.

## [0.3.0] - 2026-07-16

### Added

- Launch Pack workspace that turns Offer Intake and Strategy v0 into an execution-ready pre-flight deliverable.
- Platform roles, normalized budget allocation, Campaign blueprints, creative production briefs, layered measurement rules, launch gates, and first-seven-day actions.
- Markdown and standalone HTML export plus local Launch Pack snapshots.
- Schema-validated browser Mock and local Codex CLI Launch Pack generation.
- Fixed finance, gaming, and utility acceptance cases under `evals/`.
- Product definition, benchmark notes, decision records, release discipline, version validation, and tag-driven GitHub Release workflow.

### Changed

- Full CI now runs version validation, tests, and environment checks through `npm run check`.
- Browser storage migrates previous projects into the v3 project shape without discarding Intake history.

## [0.2.0] - 2026-07-16

### Added

- Offer Intake workspace for client offers, strategy fragments, and operator notes.
- Schema-validated Brief fields with confirmed, inferred, and missing states.
- Client clarification questions and industry-aware Strategy v0 generation.
- Editable Brief adoption into the planning stage, Markdown export, and local version snapshots.
- Browser-local Mock intake and optional Codex CLI intake bridge.

## [0.1.0] - 2026-07-15

### Added

- Local-first paid-media project workspace.
- Strategy, creative planning, launch, optimization, and reporting stages.
- Google Ads, Meta Ads, TikTok Ads, and AppsFlyer-oriented data model.
- CSV field mapping and deterministic KPI aggregation.
- Browser-local Mock mode and optional Codex CLI bridge.
- JSON Schema validation, tests, and client-ready report export.
- English and Simplified Chinese documentation.
