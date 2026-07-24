# Changelog

All notable changes to OpenAdOps are documented here.

## [0.5.10] - 2026-07-24

### Fixed

- 已映射数值列中的 `N/A`、`--` 等非空异常值不再静默归零；导入会按字段显示异常数量并阻止错误指标进入项目。
- 会计负数格式（如 `(25.5)`）按负数解析；空白单元格与非法内容分开识别。

### Changed

- 空白数值仍按 0 计入，但导入后明确提示数量；项目与 AI 输入只保存数值质量汇总，不保存原始单元格内容。

## [0.5.9] - 2026-07-24

### Fixed

- 演示优化在缺少 AF-CPI 阈值时不再编造“高于目标 1.3 倍暂停”规则，改为记录学习期基线并明确要求人工复核。
- 只有项目已配置 AF-CPI 测试阈值或正式目标时，演示动作才引用对应币种、数值与 1.3 倍规则；仅观察指标不作为暂停依据。

### Changed

- Mock 与 Codex 路径统一遵守“已确认 / 仅观察 / 缺失”KPI 边界。

## [0.5.8] - 2026-07-24

### Fixed

- CPI、AF-CPI、CPA、CTR、CVR 与 D1 留存遇到零分母时统一保存为不可计算，不再伪装成表现为 0 的有效指标。
- 界面、优化历史与周期对比把不可计算指标显示为 `—` /「不可计算」；真实的 0 安装、0 收入或 0 ROAS 仍保留为 0。
- 演示分析不会把缺少 AF 安装的媒体描述成 AF-CPI 为 0 的高 / 低成本证据。

### Changed

- 不可计算状态以 `null` 进入 AI 聚合输入，模型必须按缺失证据处理，不能据此生成成本结论。

## [0.5.7] - 2026-07-24

### Fixed

- CSV 重复表头不再静默覆盖前一列；忽略大小写、空格和常见分隔符后仍重复的表头会被明确拒绝。
- CSV 未闭合引号不再吞掉后续行并伪装成成功导入，读取阶段直接提示文件结构错误。

### Changed

- 新增 CSV 结构损坏回归测试，阻止错误列值进入指标、AI 判断和报告。

## [0.5.6] - 2026-07-24

### Fixed

- 日期标准化会校验真实日历，`2026-02-30`、`2026-13-01` 等无效日期不再进入周期、日期对比或实验日均量计算；合法闰日继续支持。
- 日期字段已映射时，导入会记录有效 / 无效日期行数；无效日期行仍计入整体指标，但明确提示其未进入日期区间与对比。

### Changed

- 日期质量汇总随聚合数据传给诊断模型，不保存或暴露原始 CSV 行。

## [0.5.5] - 2026-07-24

### Fixed

- 本地 HTTP 路由不再使用不可信的 `Host` 请求头构造 URL；畸形 Host 不会导致 OpenAdOps 服务整体退出。
- 无法解析的请求地址返回 400，正常健康检查和工作台访问继续可用。

### Changed

- 新增请求地址解析的确定性回归测试，并通过真实畸形 Host 请求验证服务存活。

## [0.5.4] - 2026-07-24

### Fixed

- 本机服务启动时若 4173 端口已被旧进程占用，显示明确的停止旧进程与重启指引，不再输出整段 Node.js 错误堆栈。
- 健康检查返回服务版本；页面发现本机 Bridge 版本缺失或与前端不一致时主动提示重启，避免新版页面继续调用旧服务。

### Changed

- 启动日志同时显示 OpenAdOps 版本与本地地址；新增启动错误和运行时版本判断的确定性测试。

## [0.5.3] - 2026-07-24

### Fixed

- 工作区迁移写回失败时保留已成功读取的项目，不再静默回退到演示项目；存储写满、损坏与旧版本恢复均给出明确提示。
- AI 请求统一处理服务未启动、非 JSON 响应、任务冲突与取消状态；主动取消不再显示为红色生成失败。
- 静态服务对无效 URL 编码返回 400，继续阻止目录穿越，并让 HEAD 请求只返回响应头。

### Changed

- 新增工作区存储、API 客户端和静态请求边界的确定性测试；测试不调用真实模型。

## [0.5.2] - 2026-07-20

### Fixed

- Codex 子进程被信号终止时显示真实信号，不再误报为「退出码 null」。
- 用户侧错误信息只保留简短运行诊断，不再把 Ads Skill 文档和无关密钥说明当作报错展示。

### Changed

- AI 提示词按任务限制 Skill 读取范围，避免一次加载完整 Ads 技能树及无关图片、拍摄、报告技能。

## [0.5.1] - 2026-07-20

### Added

- 优化决策记录：每次投放优化诊断自动保存模型、生成时间、数据文件、日期区间、聚合指标快照与结构化建议。
- 人工复核状态支持待复核、已采纳、执行中、已验证和不采纳，并可记录采纳原因、执行结果与后续验证。
- 报告中心与导出网页展示最近 5 次优化决策，形成可用于复盘的证据链。

### Changed

- 新诊断不再只覆盖上一份投放优化结果；旧项目中已有的最新诊断会迁移为首条历史记录。
- 人工状态与结论通过一次明确保存写入，避免输入框隐式保存造成结论丢失。
- 决策历史仅保存聚合指标上下文，不保存原始 CSV 行。

## [0.5.0] - 2026-07-20

### Added

- 工作区级 CSV 映射模板：保存、应用、更新和删除常用媒体 / AppsFlyer 报表映射；相同表头可自动套用。
- 映射模板显示当前文件的字段匹配数，并随“导出全部”工作区备份迁移；单项目备份不夹带工作区配置。
- 日期区间对比：默认取最近两段等量有效日期，也可手动设置不重叠的对比期与本期。
- 确定性计算花费、媒体安装、AF 安装、媒体 CPI、AF-CPI、目标转化、CPA 与 ROAS 的相对变化。

### Changed

- 数据导入只把聚合指标、区间结果和字段可用性写入项目，原始 CSV 行仍只在当前页面处理。
- 媒体表现、总览和报告不再用媒体安装回退冒充 AF 安装；未导入的指标显示为不可用。
- 花费与量级变化保持中性；只对 CPI、AF-CPI、CPA、ROAS 等效率指标按明确方向标记变化。

## [0.4.7] - 2026-07-20

### Added

- 素材生产任务清单：媒体、市场、语言、素材类型、规格、版本数、负责人、截止日期和状态统一管理。
- 每条任务保留素材角度、Hook、测试假设、单一变量、成功指标、素材链接、制作备注与合规要求。
- 素材生产计划支持新建、编辑、删除、状态统计，以及 CSV / Markdown 导出。
- 新增确定性素材任务迁移和导出测试；旧 `creativePlan` 与 Launch Pack 素材简报可自动转换。

### Changed

- 「素材计划」升级为「素材生产」，AI 素材方向与投放执行方案会写入同一套生产任务结构。
- AI 重新生成时保留人工任务；匹配的生成任务保留负责人、截止日期、版本数、状态和素材链接。
- 实验账本继续读取兼容的单变量素材计划，不破坏既有项目和实验链路。

## [0.4.6] - 2026-07-20

### Changed

- 投放优化诊断使用独立的 `gpt-5.6-sol + high` 路由，面向跨媒体数据、归因口径和下一步动作做深度判断。
- 策略与素材页的结构化判断继续使用 `gpt-5.6-terra + medium`，避免无差别放大耗时。
- 界面删除重复、宣传性说明，保留指标口径、操作边界和风险提示。

### Removed

- 移除素材页与项目无关的通用媒体说明卡，以及总览中的述职宣传卡片。

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
