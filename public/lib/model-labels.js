export function modelVariantName(model) {
  if (model === "gpt-5.6-terra") return "Terra";
  if (model === "gpt-5.6-sol") return "Sol";
  if (model === "gpt-5.6") return "Sol";
  if (!model || model === "codex-default" || model === "Codex") return "本机模型";
  return model;
}

export function modelFullName(model) {
  const variant = modelVariantName(model);
  return variant === "Terra" || variant === "Sol" ? `GPT-5.6 ${variant}` : variant;
}

export function modelRouteDetail(model, effort) {
  return `智能路由 · 模型：${modelVariantName(model)} · 推理：${effort}`;
}
