const ROUTE_BASE = {
  intakeQuestions: { label: "生成投放前策略清单", effort: "low", expectedSeconds: [20, 90], timeoutMs: 120000, tier: "routine" },
  intakeStrategy: { label: "快速生成策略初稿", effort: "medium", expectedSeconds: [30, 150], timeoutMs: 180000, tier: "routine" },
  intakeDeep: { label: "深度复核策略初稿", effort: "high", expectedSeconds: [60, 240], timeoutMs: 300000, tier: "deep" },
  analysis: { label: "投放数据诊断", effort: "medium", expectedSeconds: [30, 150], timeoutMs: 180000, tier: "routine" },
  creativeRequirements: { label: "生成素材需求建议", effort: "medium", expectedSeconds: [30, 150], timeoutMs: 180000, tier: "routine" },
  optimizeAnalysis: { label: "投放优化诊断", effort: "high", expectedSeconds: [60, 240], timeoutMs: 300000, tier: "deep" },
  launchPack: { label: "生成上线执行清单", effort: "high", expectedSeconds: [60, 240], timeoutMs: 300000, tier: "deep" }
};

export const API_PROTOCOLS = Object.freeze({
  openai: {
    key: "openai",
    label: "OpenAI 兼容",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "auto"
  },
  anthropic: {
    key: "anthropic",
    label: "Anthropic 兼容",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: ""
  }
});

export function normalizeApiProtocol(value) {
  if (value === "xai") return "openai";
  return Object.hasOwn(API_PROTOCOLS, value) ? value : "openai";
}

export function defaultApiPreferences(protocolValue = "openai") {
  const protocol = normalizeApiProtocol(protocolValue);
  const definition = API_PROTOCOLS[protocol];
  return {
    protocol,
    baseUrl: definition.defaultBaseUrl,
    model: definition.defaultModel
  };
}

export function normalizeApiPreferences(value = {}) {
  if (value?.provider === "xai") {
    return {
      protocol: "openai",
      baseUrl: "https://api.x.ai/v1",
      model: "grok-4.5"
    };
  }
  const protocol = normalizeApiProtocol(value?.protocol || value?.provider);
  const defaults = defaultApiPreferences(protocol);
  return {
    protocol,
    baseUrl: String(value?.baseUrl || defaults.baseUrl).trim(),
    model: String(value?.model ?? defaults.model).trim()
  };
}

export function usesOfficialOpenAiRouting(value = {}) {
  const preferences = normalizeApiPreferences(value);
  return preferences.protocol === "openai"
    && preferences.baseUrl.replace(/\/+$/, "") === API_PROTOCOLS.openai.defaultBaseUrl
    && (!preferences.model || preferences.model.toLowerCase() === "auto");
}

export function resolveApiRoute(preferencesValue, routeKey) {
  const base = ROUTE_BASE[routeKey];
  if (!base) throw new Error(`未知 API 路由：${routeKey}`);
  const preferences = normalizeApiPreferences(
    typeof preferencesValue === "string" ? { protocol: preferencesValue } : preferencesValue
  );
  const automatic = usesOfficialOpenAiRouting(preferences);
  const model = automatic
    ? base.tier === "deep" ? "gpt-5.6-sol" : "gpt-5.6-terra"
    : preferences.model;
  return {
    key: routeKey,
    label: base.label,
    model,
    effort: base.effort,
    expectedSeconds: base.expectedSeconds,
    timeoutMs: base.timeoutMs,
    protocol: preferences.protocol,
    protocolLabel: API_PROTOCOLS[preferences.protocol].label,
    automaticModelRouting: automatic
  };
}

export function publicApiRoutes(preferencesValue = defaultApiPreferences()) {
  return Object.fromEntries(
    Object.keys(ROUTE_BASE).map((routeKey) => [routeKey, resolveApiRoute(preferencesValue, routeKey)])
  );
}

export function apiProtocolLabel(protocolValue) {
  return API_PROTOCOLS[normalizeApiProtocol(protocolValue)].label;
}

// Compatibility aliases for records created by v0.7.0.
export const normalizeApiProvider = normalizeApiProtocol;
export const apiProviderLabel = apiProtocolLabel;
