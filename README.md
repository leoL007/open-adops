# AdPilot MVP

面向海外 App 投放优化师的本地全链路工作台：投放策略 → 素材计划 → 广告搭建 → 投放优化 → 报告输出。

## 启动

要求：Node.js 20+，本机已登录 Codex CLI。

```bash
cd /Users/leo/Documents/Hypic/adpilot-mvp
npm start
```

浏览器打开：<http://127.0.0.1:4173>

不需要 `npm install`，MVP 仅使用 Node.js 原生模块。

## 使用方式

1. 首次打开会自动建立一个明确标记为“演示数据”的工具类 App 示例项目。
2. 在“投放策略”填写目标、预算、卖点与测试逻辑。
3. 在“投放优化”导入媒体或 AppsFlyer CSV，确认字段映射后计算。
4. 默认使用 Mock 模式验收流程，不消耗模型额度。
5. 切换为 `Codex Ads · gpt-5.6-sol` 后，可主动调用真实分析。
6. 在“报告输出”下载独立 HTML，或通过浏览器打印为 PDF。

CSV 至少需要：花费，以及“媒体安装”或“AF 安装”之一。建议同时提供：媒体、国家、Campaign、展示、点击、收入、D1 留存人数。

示例 CSV：[public/data/adpilot-demo.csv](./public/data/adpilot-demo.csv)

## AI Bridge

浏览器不会保存 API Key。`server.mjs` 通过参数数组调用本机 `codex exec`：

- 默认模型：`gpt-5.6-sol`
- 沙箱：`read-only`
- 会话：`--ephemeral`
- 输出：`--output-schema schemas/analysis.schema.json`
- 同时只允许一个 AI 任务
- 失败时返回明确错误，不生成或写入假结果

如需切换模型：

```bash
ADPILOT_MODEL=gpt-5.6-sol npm start
```

如 `codex` 不在 PATH：

```bash
CODEX_BIN=/absolute/path/to/codex npm start
```

## 测试

```bash
npm test
```

测试覆盖 CSV 解析、字段识别、CPI/AF-CPI 分离计算，以及 AI 结果结构校验。测试只运行 Mock，不调用真实模型。

## V1 边界

- 支持 CSV，不直接读取 XLSX；可先从 Excel 导出 CSV。
- 数据和项目保存在当前浏览器 `localStorage`，不支持多人协作或跨设备同步。
- 仅生成策略与建议，不会连接或修改真实广告账户。
- Codex 分析会发送项目文本与聚合指标，不发送原始 CSV 明细。
- 归因窗口、事件定义与业务利润口径仍需优化师人工确认。
