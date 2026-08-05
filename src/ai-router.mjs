const VALID_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);

const DEFAULT_ROUTES = {
  intakeQuestions: {
    key: "intakeQuestions",
    label: "生成投放前策略清单",
    modelTier: "terra",
    model: "gpt-5.6-terra",
    effort: "low",
    timeoutMs: 120000,
    expectedSeconds: [30, 90],
    structureFallback: true
  },
  intakeStrategy: {
    key: "intakeStrategy",
    label: "快速生成策略初稿",
    modelTier: "terra",
    model: "gpt-5.6-terra",
    effort: "medium",
    timeoutMs: 180000,
    expectedSeconds: [60, 180],
    structureFallback: true
  },
  intakeDeep: {
    key: "intakeDeep",
    label: "深度复核策略初稿",
    modelTier: "deep",
    model: "gpt-5.6-sol",
    effort: "high",
    timeoutMs: 300000,
    expectedSeconds: [120, 300],
    structureFallback: false
  },
  analysis: {
    key: "analysis",
    label: "投放数据诊断",
    modelTier: "terra",
    model: "gpt-5.6-terra",
    effort: "medium",
    timeoutMs: 180000,
    expectedSeconds: [60, 180],
    structureFallback: true
  },
  creativeRequirements: {
    key: "creativeRequirements",
    label: "生成素材需求建议",
    modelTier: "terra",
    model: "gpt-5.6-terra",
    effort: "medium",
    timeoutMs: 180000,
    expectedSeconds: [60, 180],
    structureFallback: true
  },
  optimizeAnalysis: {
    key: "optimizeAnalysis",
    label: "投放优化诊断",
    modelTier: "deep",
    model: "gpt-5.6-sol",
    effort: "high",
    timeoutMs: 300000,
    expectedSeconds: [120, 300],
    structureFallback: false
  },
  launchPack: {
    key: "launchPack",
    label: "生成上线执行清单",
    modelTier: "deep",
    model: "gpt-5.6-sol",
    effort: "high",
    timeoutMs: 300000,
    expectedSeconds: [120, 300],
    structureFallback: false
  },
  experiments: {
    key: "experiments",
    label: "生成实验账本",
    modelTier: "terra",
    model: "gpt-5.6-terra",
    effort: "medium",
    timeoutMs: 180000,
    expectedSeconds: [60, 180],
    structureFallback: true
  }
};

function validEffort(value) {
  const normalized = String(value || "").toLowerCase();
  return VALID_EFFORTS.has(normalized) ? normalized : "";
}

function validTimeout(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout >= 30000 ? timeout : 0;
}

export function resolveAiRoute(routeKey, env = process.env) {
  const base = DEFAULT_ROUTES[routeKey];
  if (!base) throw new Error(`未知 AI 路由：${routeKey}`);

  const legacyModel = env.OPENADOPS_MODEL || env.ADPILOT_MODEL || "";
  const legacyEffort = validEffort(env.OPENADOPS_REASONING_EFFORT);
  const legacyTimeout = validTimeout(env.OPENADOPS_TIMEOUT_MS);
  const terraModel = env.OPENADOPS_TERRA_MODEL || "gpt-5.6-terra";
  const deepModel = env.OPENADOPS_DEEP_MODEL || "gpt-5.6-sol";
  const model = legacyModel || (base.modelTier === "terra" ? terraModel : deepModel);
  const effort = legacyEffort || base.effort;
  const timeoutMs = legacyTimeout || base.timeoutMs;

  return {
    ...base,
    model,
    effort,
    timeoutMs,
    provider: "codex",
    fallback: base.structureFallback
      ? {
          model: deepModel,
          effort: "medium",
          timeoutMs: 180000,
          label: "结构校验后自动复核"
        }
      : null
  };
}

/** Live AI mode for the UI: Grok 4.5 high on every task. Codex Terra/Sol stays available as a hidden provider. */
export function resolveGrokRoute(routeKey, env = process.env) {
  const base = DEFAULT_ROUTES[routeKey];
  if (!base) throw new Error(`未知 AI 路由：${routeKey}`);

  const model = env.OPENADOPS_GROK_MODEL || "grok-4.5";
  const effort = validEffort(env.OPENADOPS_GROK_REASONING_EFFORT) || "high";
  const timeoutMs = validTimeout(env.OPENADOPS_GROK_TIMEOUT_MS) || validTimeout(env.OPENADOPS_TIMEOUT_MS) || base.timeoutMs;

  return {
    ...base,
    model,
    effort,
    timeoutMs,
    provider: "grok",
    fallback: null
  };
}

function publicRouteEntry(route) {
  return {
    key: route.key,
    label: route.label,
    model: route.model,
    effort: route.effort,
    timeoutMs: route.timeoutMs,
    expectedSeconds: route.expectedSeconds,
    fallbackModel: route.fallback?.model || null,
    provider: route.provider || "codex"
  };
}

export function publicAiRoutes(env = process.env) {
  return Object.fromEntries(
    Object.keys(DEFAULT_ROUTES).map((key) => [key, publicRouteEntry(resolveAiRoute(key, env))])
  );
}

export function publicGrokRoutes(env = process.env) {
  return Object.fromEntries(
    Object.keys(DEFAULT_ROUTES).map((key) => [key, publicRouteEntry(resolveGrokRoute(key, env))])
  );
}

export function resolveRouteForProvider(provider, routeKey, env = process.env) {
  if (provider === "grok") return resolveGrokRoute(routeKey, env);
  return resolveAiRoute(routeKey, env);
}
