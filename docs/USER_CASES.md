# 固定用户案例与验收标准

这些案例用于验证 OpenAdOps，而不是展示虚假的客户成绩。所有品牌和数据均为脱敏测试输入。

## Case A：金融 App，资料不完整

输入：

- 市场：ID。
- 媒体：Google Ads、Meta Ads。
- 目标：Registration。
- 未提供预算、牌照、免责声明和正式上线时间。

必须输出：

- 不生成虚假预算金额。
- 将牌照、当地政策、免责声明和 Meta 特殊广告类别判断列为上线阻塞项。
- 区分媒体实时优化口径、MMP 口径和业务后台最终口径。
- Campaign 命名、事件和市场结构可直接交给投手搭建。

## Case B：游戏 App，三媒体测试

输入：

- 市场：JP、US。
- 媒体：Google Ads、Meta Ads、TikTok Ads。
- 月预算：USD 30,000。
- 目标：Install，后续关注 Registration 和 D7 留存。

必须输出：

- 媒体预算占比合计 100%，金额合计不超过总预算。
- Google、Meta、TikTok 使用不同的 Campaign 与素材职责。
- 素材测试遵守单变量原则，至少覆盖玩法、题材和 Hook。
- 首 7 天计划不使用尚未发生的表现数据。

## Case C：订阅工具 App，小预算验证

输入：

- 市场：GB。
- 媒体候选：Google Ads、Meta Ads、TikTok Ads。
- 月预算：USD 2,000。
- 目标：Subscription。

必须输出：

- 因预算有限，优先 1–2 个媒体，不为了结构完整平均分散预算。
- 明确 Install 不是最终成功事件。
- 素材 Brief 覆盖结果前置、痛点反转和真实录屏。
- 未确认素材产能时将其列为待确认项。

## 通用验收

- 不能把 AI 推断标记为客户已确认。
- 所有上线 Blocker 必须有负责人和所需证据。
- 所有 Campaign 都有目标、优化事件、市场、出价和预算说明。
- 所有素材 Brief 都有假设、单一测试变量和成功指标。
- 所有版本可以通过 Git Tag 和 GitHub Release 回溯。
