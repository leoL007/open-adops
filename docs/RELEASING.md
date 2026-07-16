# 版本与发布规范

## 版本号

OpenAdOps 使用 `MAJOR.MINOR.PATCH`：

- `0.x.0`：增加一个完整且可演示的工作流能力。
- `0.x.y`：修复问题或改善兼容性，不增加新的核心阶段。
- `1.0.0`：Offer、策略、投前、上线、优化与复盘形成稳定闭环。

## 发布流程

1. 从最新 `main` 创建 `codex/vX.Y-description` 分支。
2. 在 `package.json` 和 `public/version.js` 同步版本号。
3. 更新 `CHANGELOG.md`、README、Roadmap 和验收案例。
4. 运行 `npm run check`。
5. 推送分支并创建 Draft PR。
6. GitHub Actions 通过后合并到 `main`。
7. 在合并提交创建并推送 `vX.Y.Z` Tag。
8. Release workflow 再次验证版本与测试，并创建 GitHub Release。
9. 验证 GitHub Pages 对应的部署提交。

## 回溯

- 查看版本：GitHub 仓库右侧的 Releases / Tags。
- 查看源码：打开指定 Release，下载自动生成的 ZIP 或 TAR。
- 本地查看：`git switch --detach vX.Y.Z`。
- 恢复旧版时创建新分支，不重写已有 Tag。

## 发布门槛

- 工作树中没有无关文件。
- `npm run check` 全部通过。
- Schema 和确定性 Mock 使用同一结构。
- 固定案例通过，未知信息未被伪造。
- PR 描述包含变更、原因、用户影响和验证结果。
