function parseModelOutput(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(unfenced);
  }
}

/** Grok headless `--output-format json` wraps the payload; prefer structuredOutput. */
export function parseGrokCliOutput(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Grok 未返回内容");
  let envelope;
  try {
    envelope = JSON.parse(trimmed);
  } catch {
    return parseModelOutput(trimmed);
  }
  if (envelope && typeof envelope === "object" && !Array.isArray(envelope)) {
    if (envelope.structuredOutput != null) return envelope.structuredOutput;
    if (typeof envelope.text === "string" && envelope.text.trim()) {
      try {
        return parseModelOutput(envelope.text);
      } catch {
        /* fall through */
      }
    }
  }
  return envelope;
}
