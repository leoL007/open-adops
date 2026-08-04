function text(value) {
  return String(value || "").trim();
}

function sourceText(project = {}, workspace = {}) {
  return [
    project.industry,
    project.name,
    project.notes,
    project.intake?.rawOffer,
    project.intake?.clientStrategy,
    project.intake?.operatorNotes,
    workspace.notes,
    workspace.commonRequirements
  ].map(text).join(" ").toLowerCase();
}

function guidanceFor(project, workspace) {
  const source = sourceText(project, workspace);
  const social = /社交|交友|dating|single|约会|chat|擦边/.test(source);
  const finance = /金融|finance|loan|credit|invest|入金|kyc|交易|借贷/.test(source);
  const common = [
    { id: "rights", category: "production", status: "required", item: "人物、音乐、字体和参考素材必须具备可投放使用权", reason: "避免素材下架、侵权投诉和账户风险。" },
    { id: "truth", category: "copy", status: "required", item: "文案与画面只展示已确认的真实功能和流程", reason: "不得把未经确认的产品能力写成广告承诺。" },
    { id: "local", category: "scene", status: "recommended", item: "人物、语言和生活场景与目标市场保持一致", reason: "降低翻译感，并提高用户对场景的理解。" }
  ];
  if (social) return [
    ...common,
    { id: "adult", category: "casting", status: "required", item: "使用明确成年的演员或授权 AI 形象，不做未成年人暗示", reason: "社交类素材的人物年龄与肖像授权属于高风险项。" },
    { id: "claims", category: "copy", status: "required", item: "不得承诺必然匹配、必然见面或确定结果", reason: "保留产品价值表达，同时避免不可证实承诺。" },
    { id: "sensitive", category: "culture_policy", status: "confirm", item: "上线前人工确认暧昧尺度、露肤程度和各市场平台政策", reason: "该判断依赖具体成片、目标市场和账户政策，AI 不能代替人工审核。" }
  ];
  if (finance) return [
    ...common,
    { id: "finance-claim", category: "copy", status: "required", item: "不得承诺收益、通过率、到账速度或无风险结果", reason: "金融广告的结果性承诺需要严格证据与合规依据。" },
    { id: "finance-screen", category: "scene", status: "required", item: "金额、收益、余额和支付画面不得伪造或造成误导", reason: "画面中的数字也属于广告主张。" },
    { id: "finance-review", category: "culture_policy", status: "confirm", item: "人工确认牌照、费用披露、免责声明和目标市场准入", reason: "最终适用规则取决于业务资质、国家和投放平台。" }
  ];
  return [...common, { id: "platform", category: "platform", status: "confirm", item: "上线前按目标媒体检查尺寸、安全区与禁投内容", reason: "不同媒体和版位的审核要求不同。" }];
}

export function buildMockCreativeRequirements(project = {}, workspace = {}) {
  const source = sourceText(project, workspace);
  const social = /社交|交友|dating|single|约会|chat|擦边/.test(source);
  const finance = /金融|finance|loan|credit|invest|入金|kyc|交易|借贷/.test(source);
  const base = social
    ? [
        ["", "", "用目标市场成年演员正对镜头表达真实使用场景；结尾统一加产品尾板。", "9:16 · 约 15 秒", 3, "补充一条可直接制作的真人口播需求，素材参考由优化师填写。"],
        ["", "", "使用目标市场本地生活场景，搭配地道本地语言字幕与品牌尾板。", "9:16 · 30–60 秒", 3, "补充本地生活场景方向，素材参考由优化师填写。"],
        ["", "", "人物外观、口型和声音需人工复核；禁止暗示必然匹配或线下见面。", "9:16 · 15–30 秒", null, "无现成参考时仅提供制作建议，数量待优化师确认。"]
      ]
    : finance
      ? [
          ["", "", "展示已确认的真实步骤，不出现虚构余额、收益或通过结果。", "9:16 · 15–30 秒", 3, "补充真实流程演示需求，素材参考由优化师填写。"],
          ["", "", "只解释已批准的功能和适用场景；所有费用、时效和资格表达交由人工确认。", "9:16 · 约 20 秒", 3, "补充功能解释需求，素材参考由优化师填写。"],
          ["", "", "将牌照、免责声明和费用信息留出清晰可读区域。", "1:1 / 4:5", 3, "补充合规信息卡需求，素材参考由优化师填写。"]
        ]
      : [
          ["", "", "首屏展示已确认的核心操作，再补充品牌尾板。", "9:16 · 15–30 秒", 3, "补充真实功能演示需求，素材参考由优化师填写。"],
          ["", "", "用目标市场地道表达描述问题和解决步骤，不夸大结果。", "9:16 · 约 20 秒", 3, "补充痛点场景口播需求，素材参考由优化师填写。"],
          ["", "", "一张图只表达一个已确认的功能重点，尺寸按目标媒体适配。", "1:1 / 4:5", 3, "补充静态信息卡需求，素材参考由优化师填写。"]
        ];

  return {
    schema_version: "2.0",
    executive_summary: "【演示】已检查素材需求缺项和风险；建议仅在优化师采纳后进入正式表。",
    guidance: guidanceFor(project, workspace),
    suggestions: base.map(([assetReference, copy, notes, format, quantity, rationale], index) => ({
      id: `suggestion-${index + 1}`,
      asset_reference: assetReference,
      copy,
      modification_notes: notes,
      format,
      quantity,
      rationale
    }))
  };
}
