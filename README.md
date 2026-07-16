<div align="center">

# OpenAdOps

### 从客户碎片信息到有证据、可执行、可验证的投放策略

OpenAdOps 是一个本地优先的 AI 付费媒体工作台，把客户 Offer、零散策略以及 Google Ads、Meta Ads、TikTok Ads 和 AppsFlyer 数据转化为结构化 Brief、投放策略、素材测试、优化动作与客户报告。

[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_in_Browser-E77436?style=for-the-badge)](https://leol007.github.io/open-adops/)
[![License: MIT](https://img.shields.io/badge/License-MIT-1B2430?style=for-the-badge)](./LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-17845C?style=for-the-badge)](https://nodejs.org/)

[简体中文](./README.md) · [English](./README.en.md) · [路线图](./ROADMAP.md) · [参与贡献](./CONTRIBUTING.md)

</div>

![OpenAdOps 项目总览](./assets/openadops-overview.jpg)

## 为什么需要 OpenAdOps

投放工作通常分散在媒体后台、Excel、截图、群聊和临时文档中。通用聊天工具可以生成文字，却不会持续保存项目上下文，也无法保证指标计算准确。

OpenAdOps 把完整投放链路放进一个项目：

1. **需求接收（Intake）**：粘贴客户 Offer 和零散策略，标记已确认、AI 推断与缺失信息。
2. **策略（Plan）**：生成客户追问、Strategy v0、媒体分工、预算场景和测试假设。
3. **素材（Create）**：生成适配平台的素材角度、Hook、测试变量和成功指标。
4. **搭建（Launch）**：规划 Campaign 结构、命名、预算和上线前检查。
5. **优化（Optimize）**：代码计算 KPI，AI 基于证据给出判断和下一步动作。
6. **报告（Report）**：输出管理层或客户可读的 HTML 与打印/PDF 报告。

## 与普通 AI 对话有什么不同

- **代码负责计算**：CSV 解析、字段映射、聚合、CPI、AF-CPI、CTR、CVR、CPA、ROAS 和留存由确定性代码完成。
- **AI 负责判断**：策略、诊断、素材测试和下一步动作以经过 JSON Schema 校验的结构化结果返回。
- **证据始终跟随结论**：每条判断分别呈现证据、诊断、动作、置信度和验证方式。
- **未知信息不会被偷偷补全**：Brief 明确区分客户已确认、AI 推断和资料缺失。
- **本地优先**：项目保存在浏览器中，原始 CSV 明细不会发送给 AI Bridge；粘贴资料只在用户主动运行时提交给本地 Codex。
- **失败时不编造结果**：AI 请求失败会显示明确错误，而不是生成看似合理的虚假建议。
- **无需账号也能体验**：GitHub Pages 上的 Browser-local Mock Demo 不依赖 Codex 或 API Key。

## 60 秒开始

### 在线体验

打开[在线 Mock Demo](https://leol007.github.io/open-adops/)。它完全在浏览器中运行，并使用有明确标记的演示数据。

### 本地运行

```bash
git clone https://github.com/leoL007/open-adops.git
cd open-adops
npm start
```

启动成功后，在浏览器访问本地工作台：`http://127.0.0.1:4173`。项目只使用 Node.js 原生模块，不需要运行 `npm install`。

快速检查运行环境：

```bash
npm run doctor
```

## AI 模式

| 模式 | 要求 | 工作方式 |
| --- | --- | --- |
| Browser-local Mock | 无 | 生成确定性、明确标记的演示建议，不调用服务端 AI。 |
| Codex CLI | 本机已登录 Codex CLI | 本地 Node Bridge 将粘贴资料、项目上下文和聚合指标发送给 `codex exec`。 |

OpenAdOps 默认使用 Codex 当前配置的模型。如有需要，可以通过环境变量指定：

```bash
OPENADOPS_MODEL=your-model-name npm start
```

如需更深入的付费媒体分析，可以为 Agent Runtime 安装兼容的 Ads Skill，例如 [Claude Ads](https://github.com/AgriciDaniel/claude-ads)。即使不安装，OpenAdOps 仍可使用 Mock 模式。

## CSV 输入

导入 CSV 时必须包含 `Spend`，并至少包含 `Media Installs` 或 `AF Installs` 其中一项。建议字段如下：

| 维度字段 | 指标字段 |
| --- | --- |
| Date, Platform, Country, Campaign, Ad group / Ad set, Creative | Spend, Impressions, Clicks, Media Installs, AF Installs, Conversions, Revenue, D1 Retained |

OpenAdOps 会自动识别常见的中英文字段别名，并允许用户在计算前修正每一项映射。可查看[演示 CSV](./public/data/openadops-demo.csv)。

## 验证

```bash
npm test
```

测试覆盖需求接收 Mock、Brief 完整性、带引号的 CSV 解析、字段识别、媒体 CPI 与 AppsFlyer CPI、指标聚合和分析 Schema 校验。测试过程不会调用真实模型。

## 当前范围

- 直接导入 CSV；XLSX 可先导出为 CSV。
- 需求接收支持粘贴文本；暂不包含 OCR 或文档解析。
- 项目保存在当前浏览器，暂不支持多人同步。
- 只生成策略和建议，不连接或修改真实广告账户。
- 当前聚焦 Google Ads、Meta Ads、TikTok Ads 和 AppsFlyer 相关的 App UA 工作流。
- 归因窗口、事件定义和利润口径仍需优化师人工确认。

## 项目状态

OpenAdOps 仍处于早期公开版本。你可以查看[路线图](./ROADMAP.md)、提交[功能建议](https://github.com/leoL007/open-adops/issues/new?template=feature_request.yml)，或贡献新的媒体与数据适配器。

## License

[MIT](./LICENSE)。OpenAdOps 是独立开源项目，与 Google、Meta、TikTok、AppsFlyer 或 OpenAI 无隶属关系。
