const ROUTE_BASE = {
  intakeQuestions: { label: "生成投放前策略清单", effort: "low", expectedSeconds: [20, 90], timeoutMs: 120000, tier: "routine" },
  intakeStrategy: { label: "快速生成策略初稿", effort: "medium", expectedSeconds: [30, 150], timeoutMs: 180000, tier: "routine" },
  intakeDeep: { label: "深度复核策略初稿", effort: "high", expectedSeconds: [60, 240], timeoutMs: 300000, tier: "deep" },
  analysis: { label: "投放数据诊断", effort: "medium", expectedSeconds: [30, 150], timeoutMs: 180000, tier: "routine" },
  creativeRequirements: { label: "生成素材需求建议", effort: "medium", expectedSeconds: [30, 150], timeoutMs: 180000, tier: "routine" },
  optimizeAnalysis: { label: "投放优化诊断", effort: "high", expectedSeconds: [60, 240], timeoutMs: 300000, tier: "deep" },
  launchPack: { label: "生成上线执行清单", effort: "high", expectedSeconds: [60, 240], timeoutMs: 300000, tier: "deep" }
};

export const API_PROVIDERS = Object.freeze({
  openai: {
    key: "openai",
    label: "OpenAI API",
    routineModel: "gpt-5.6-terra",
    deepModel: "gpt-5.6-sol"
  },
  xai: {
    key: "xai",
    label: "xAI API",
    routineModel: "grok-4.5",
    deepModel: "grok-4.5"
  }
});

export function normalizeApiProvider(value) {
  return Object.hasOwn(API_PROVIDERS, value) ? value : "openai";
}

export function resolveApiRoute(providerValue, routeKey) {
  const base = ROUTE_BASE[routeKey];
  if (!base) throw new Error(`未知 API 路由：${routeKey}`);
  const provider = API_PROVIDERS[normalizeApiProvider(providerValue)];
  return {
    key: routeKey,
    label: base.label,
    model: base.tier === "deep" ? provider.deepModel : provider.routineModel,
    effort: provider.key === "xai" ? "high" : base.effort,
    expectedSeconds: base.expectedSeconds,
    timeoutMs: base.timeoutMs,
    provider: provider.key,
    providerLabel: provider.label
  };
}

export function publicApiRoutes(providerValue = "openai") {
  return Object.fromEntries(
    Object.keys(ROUTE_BASE).map((routeKey) => [routeKey, resolveApiRoute(providerValue, routeKey)])
  );
}

export function apiProviderLabel(providerValue) {
  return API_PROVIDERS[normalizeApiProvider(providerValue)].label;
}
