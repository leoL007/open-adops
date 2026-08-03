function text(value) {
  return String(value ?? "").trim();
}

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function defaultCampaign(project = {}) {
  return {
    name: "",
    storeUrl: "",
    os: "",
    language: "",
    primaryEvent: text(project.goal),
    supportingEvents: "",
    bidStrategy: "",
    placements: "媒体默认版位",
    exclusions: ""
  };
}

function defaultAdRules() {
  return {
    firstLaunchAssets: 0,
    totalAssets: 0,
    splitRule: "",
    iterationMetrics: "",
    reportingMetrics: ""
  };
}

export function createBuildAdGroup(project = {}, overrides = {}, { makeId = () => `adgroup-${Date.now()}` } = {}) {
  return {
    id: text(overrides.id) || makeId(),
    name: text(overrides.name),
    platform: text(overrides.platform) || project.platforms?.[0] || "Google Ads",
    market: text(overrides.market) || text(project.markets),
    language: text(overrides.language),
    optimizationEvent: text(overrides.optimizationEvent) || text(project.goal),
    bidding: text(overrides.bidding),
    placements: text(overrides.placements) || "媒体默认版位",
    exclusions: text(overrides.exclusions),
    creativeDirection: text(overrides.creativeDirection),
    assetCount: finiteCount(overrides.assetCount)
  };
}

function hasLegacyStrategy(strategy) {
  return [strategy.objective, strategy.audience, strategy.budgetLogic, strategy.testLogic]
    .some((value) => text(value));
}

export function normalizeBuildStrategy(project = {}, { makeId } = {}) {
  const source = project.strategy && typeof project.strategy === "object" && !Array.isArray(project.strategy)
    ? project.strategy
    : {};
  const campaign = { ...defaultCampaign(project), ...(source.campaign || {}) };
  const ad = { ...defaultAdRules(), ...(source.ad || {}) };
  const rawGroups = Array.isArray(source.adGroups) ? source.adGroups : [];
  const explicitEnabled = typeof source.enabled === "boolean" ? source.enabled : null;
  const enabled = explicitEnabled ?? (rawGroups.length || hasLegacyStrategy(source) ? true : null);
  const adGroups = rawGroups.map((group, index) => createBuildAdGroup(project, group, {
    makeId: makeId || (() => text(group?.id) || `adgroup-${index + 1}`)
  }));

  return {
    ...source,
    enabled,
    campaign: {
      name: text(campaign.name),
      storeUrl: text(campaign.storeUrl),
      os: text(campaign.os),
      language: text(campaign.language),
      primaryEvent: text(campaign.primaryEvent),
      supportingEvents: text(campaign.supportingEvents),
      bidStrategy: text(campaign.bidStrategy),
      placements: text(campaign.placements),
      exclusions: text(campaign.exclusions)
    },
    adGroups,
    ad: {
      firstLaunchAssets: finiteCount(ad.firstLaunchAssets),
      totalAssets: finiteCount(ad.totalAssets),
      splitRule: text(ad.splitRule),
      iterationMetrics: text(ad.iterationMetrics),
      reportingMetrics: text(ad.reportingMetrics)
    },
    notes: text(source.notes),
    budgetShares: source.budgetShares && typeof source.budgetShares === "object"
      ? { ...source.budgetShares }
      : {}
  };
}

export function ensureBuildStrategy(project, options = {}) {
  const strategy = normalizeBuildStrategy(project, options);
  if (strategy.enabled === true && !strategy.adGroups.length) {
    strategy.adGroups.push(createBuildAdGroup(project, {}, options));
  }
  return strategy;
}

export function buildStrategyDecisionComplete(project) {
  const strategy = normalizeBuildStrategy(project);
  if (strategy.enabled === false) return true;
  if (strategy.enabled !== true) return false;
  return strategy.adGroups.some((group) => group.name || group.creativeDirection || group.optimizationEvent);
}
