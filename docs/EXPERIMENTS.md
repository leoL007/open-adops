# Experiment Ledger 方法与边界

OpenAdOps 的 Experiment Ledger 是广告实验的规划和学习层，不替代 Google、Meta 或 TikTok 的原生随机分流与显著性报告。

## 统一实验结构

每个实验必须在上线前冻结：

- 一个主要变量。
- Control、Variant 和流量分配。
- 主指标、护栏指标与归因口径。
- 基准率、MDE、最短与最长周期。
- Win、Lose、Inconclusive 和停止条件。
- Owner、证据位置和下一步动作。

## 确定性样本计算

比例指标使用双样本近似：

```text
n = (Zα + Zβ)² × 2 × p × (1-p) / (p × MDE)²
```

- `p`：基准转化率。
- `MDE`：希望检测到的最小相对变化。
- `Zα`：90% 或 95% confidence。
- `Zβ`：80% power。
- 预计周期使用流量较小的实验组计算，并强制应用最短运行天数。

基准率和每日样本量只从同一媒体、同一主指标的数据推导。媒体名称会识别常见 Google、Meta、TikTok 与 AppsFlyer 别名；如果没有匹配的媒体或指标分母，输入保持为空，不使用全账户均值代替。带小时的时间戳会先归一到日历日期，再计算活跃天数。

成本、收入和计数指标不会套用这条比例公式。它们显示 `not_calculable`，由媒体原生实验或预先定义的业务阈值判断。

## 可行性状态

- `ready`：预计在设定的最长周期内达到样本门槛。
- `long_horizon`：可以计算，但周期超过建议窗口。
- `insufficient_volume`：当前流量无法在 90 天内形成可辩护结论。
- `not_calculable`：缺少输入，或主指标不适用比例计算。

实验只有在结论、证据、学习和下一步动作完整时才能标记为 `concluded`；之后删除任一必要字段，状态会自动恢复为 `running`，避免报告保留无证据的“已结束”结论。

## 平台执行边界

- Google Ads 提供统一 Experiment Center；App Campaign 素材使用 App asset experiment。原生实验负责分流、状态、结果和应用赢家。
- Meta Ads Manager 可在 Campaign 创建流程中开启 A/B test。OpenAdOps 不把手工复制 Ad Set 描述成随机实验。
- TikTok Split Testing 使用互斥受众并以 90% confidence 判断原生赢家；该规则不直接套用到其他媒体。

官方参考：

- [Google Ads Experiment Center](https://support.google.com/google-ads/answer/16856494)
- [Google Ads Experiments page](https://support.google.com/google-ads/answer/10682377)
- [Meta Ads Manager campaign creation and A/B test](https://www.facebook.com/help/messenger-app/621956575422138/)
- [TikTok Ads Manager Split Testing](https://ads.tiktok.com/help/article/split-testing)

## 不做什么

- 不读取聚合 CSV 后自行宣布媒体实验达到统计显著。
- 不把不同市场、归因窗口或媒体的结果合并成一个 Winner。
- 不在未达到样本门槛时用短期 CPA、CTR 或 ROAS 波动包装成功案例。
- 不自动在真实广告账户创建、暂停或应用实验。
