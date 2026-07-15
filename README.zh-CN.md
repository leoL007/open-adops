<div align="center">

# OpenAdOps

### 把广告报表变成有证据的投放判断

OpenAdOps 是一个本地优先的 AI 付费媒体工作台，把 Google Ads、Meta Ads、TikTok Ads 和 AppsFlyer 导出数据转化为投放策略、素材测试、优化动作与客户报告。

[在线体验](https://leol007.github.io/open-adops/) · [English](./README.md) · [路线图](./ROADMAP.md) · [参与贡献](./CONTRIBUTING.md)

</div>

![OpenAdOps 项目总览](./assets/openadops-overview.jpg)

## 它解决什么问题

投放工作分散在媒体后台、Excel、截图、群聊和临时文档中。通用聊天工具可以生成文字，却不会持续保存项目上下文，也无法保证指标计算准确。

OpenAdOps 把完整链路放进一个项目：

1. **策略**：目标、市场、媒体分工、预算和测试假设。
2. **素材**：平台化角度、Hook、单变量和成功指标。
3. **搭建**：Campaign 结构、命名、预算和上线检查。
4. **优化**：代码计算指标，AI 基于证据给出判断。
5. **报告**：导出管理层可读的 HTML 或打印/PDF 报告。

## 核心原则

- **代码负责计算**：字段映射、聚合、CPI、AF-CPI、CTR、CVR、CPA、ROAS 和留存由确定性代码完成。
- **AI 负责判断**：策略、诊断、素材测试和下一步动作必须通过 JSON Schema 校验。
- **证据与建议分开**：每条结论包含证据、诊断、动作、优先级、置信度和验证方式。
- **本地优先**：项目保存在浏览器，原始 CSV 明细不会发送给 AI Bridge。
- **失败不造结果**：AI 不可用时显示明确错误，不生成虚假结论。
- **无需账号也能体验**：GitHub Pages Mock Demo 完全在浏览器运行。

## 快速开始

直接打开[在线 Mock Demo](https://leol007.github.io/open-adops/)，或本地运行：

```bash
git clone https://github.com/leoL007/open-adops.git
cd open-adops
npm start
```

浏览器打开 <http://127.0.0.1:4173>。项目只使用 Node.js 原生模块，不需要 `npm install`。

环境检查：

```bash
npm run doctor
```

## AI 模式

| 模式 | 要求 | 说明 |
| --- | --- | --- |
| Browser-local Mock | 无 | 使用明确标记的演示数据，不调用模型。 |
| Codex CLI | 本机已登录 Codex CLI | 本地 Node Bridge 将项目上下文和聚合指标发送给 `codex exec`。 |

默认使用 Codex 当前配置的模型。如需指定：

```bash
OPENADOPS_MODEL=your-model-name npm start
```

## CSV 字段

至少需要 `Spend`，以及 `Media Installs` 或 `AF Installs` 之一。建议包含日期、媒体、国家、Campaign、Ad group / Ad set、素材、展示、点击、转化、收入和 D1 留存人数。

示例：[public/data/openadops-demo.csv](./public/data/openadops-demo.csv)

## 当前边界

- V0.1 直接支持 CSV；XLSX 可先导出为 CSV。
- 项目保存在当前浏览器，不支持多人协作。
- 只生成策略和建议，不连接或修改真实广告账户。
- 归因窗口、事件定义和利润口径仍需优化师人工确认。

## 参与项目

查看[路线图](./ROADMAP.md)，提交 [Issue](https://github.com/leoL007/open-adops/issues) 或贡献新的媒体、归因和字段适配器。

## License

[MIT](./LICENSE)。OpenAdOps 是独立开源项目，与 Google、Meta、TikTok、AppsFlyer 或 OpenAI 无隶属关系。
