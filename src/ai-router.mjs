const VALID_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);

const DEFAULT_ROUTES = {
  intakeQuestions: {
    key: "intakeQuestions",
    label: "生成客户追问",
    modelTier: "terra",
    model: "gpt-5.6-terra",
    effort: "low",
    timeoutMs: 120000,
    expectedSeconds: [30, 90],
    structureFallback: true
  },
  intakeStrategy: {
    key: "intakeStrategy",
    label: "快速生成 Strategy v0",
    modelTier: "terra",
    model: "gpt-5.6-terra",
    effort: "medium",
    timeoutMs: 180000,
    expectedSeconds: [60, 180],
    structureFallback: true
  },
  intakeDeep: {
    key: "intakeDeep",
    label: "深度复核 Strategy v0",
    modelTier: "deep",
    model: "gpt-5.6",
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
  launchPack: {
    key: "launchPack",
    label: "生成 Launch Pack",
    modelTier: "deep",
    model: "gpt-5.6",
    effort: "high",
    timeoutMs: 300000,
    expectedSeconds: [120, 300],
    structureFallback: false
  },
  experiments: {
    key: "experiments",
    label: "生成 Experiment Ledger",
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
  const deepModel = env.OPENADOPS_DEEP_MODEL || "gpt-5.6";
  const model = legacyModel || (base.modelTier === "terra" ? terraModel : deepModel);
  const effort = legacyEffort || base.effort;
  const timeoutMs = legacyTimeout || base.timeoutMs;

  return {
    ...base,
    model,
    effort,
    timeoutMs,
    fallback: base.structureFallback
      ? {
          model: deepModel,
          effort: "medium",
          timeoutMs: 180000,
          label: "结构校验自动复核"
        }
      : null
  };
}

export function publicAiRoutes(env = process.env) {
  return Object.fromEntries(
    Object.keys(DEFAULT_ROUTES).map((key) => {
      const route = resolveAiRoute(key, env);
      return [
        key,
        {
          key: route.key,
          label: route.label,
          model: route.model,
          effort: route.effort,
          timeoutMs: route.timeoutMs,
          expectedSeconds: route.expectedSeconds,
          fallbackModel: route.fallback?.model || null
        }
      ];
    })
  );
}

