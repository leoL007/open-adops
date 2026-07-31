export function modelVariantName(model) {
  if (model === "gpt-5.6-terra") return "Terra";
  if (model === "gpt-5.6-sol") return "Sol";
  if (model === "gpt-5.6") return "Sol";
  if (model === "grok-4.5" || model === "grok-4.5-build" || model === "grok-4") return "Grok 4.5";
  if (String(model || "").startsWith("grok-4.5")) return "Grok 4.5";
  if (!model || model === "codex-default" || model === "Codex") return "本机模型";
  return model;
}

export function modelFullName(model) {
  const variant = modelVariantName(model);
  if (variant === "Terra" || variant === "Sol") return `GPT-5.6 ${variant}`;
  if (variant === "Grok 4.5") return "Grok 4.5";
  return variant;
}

export function modelRouteDetail(model, effort) {
  const variant = modelVariantName(model);
  if (variant === "Grok 4.5") return `Grok 4.5 · 推理：${effort}`;
  return `智能路由 · 模型：${variant} · 推理：${effort}`;
}
