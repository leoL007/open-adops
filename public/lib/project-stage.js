export const PROJECT_STAGES = ["测试期", "放量期", "稳定期"];

export function normalizeProjectStage(stage) {
  return PROJECT_STAGES.includes(stage) ? stage : "测试期";
}
