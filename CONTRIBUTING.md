# Contributing to OpenAdOps

OpenAdOps welcomes focused contributions that make paid-media operations more reliable, portable, and explainable.

## Good contribution areas

- CSV field aliases and export adapters for Google Ads, Meta Ads, TikTok Ads, AppsFlyer, Adjust, or other MMPs.
- Deterministic metric calculations and validation.
- Platform-native creative-test templates.
- Accessibility, localization, and report-output improvements.
- AI-provider adapters that preserve the same structured output contract.

## Development flow

1. Fork the repository and create a focused branch.
2. Run `npm run doctor` and `npm test`.
3. Keep raw customer data, credentials, and account identifiers out of fixtures and screenshots.
4. Add or update tests for behavior changes.
5. Open a pull request that explains the problem, the change, and how it was validated.

## Design principles

- Code calculates; AI interprets.
- Evidence, diagnosis, and action stay separate.
- Read-only and local-first are the default.
- Missing evidence reduces confidence instead of inviting invented conclusions.
- Demo data must always be labeled as demo data.

By contributing, you agree that your contribution will be licensed under the MIT License.
