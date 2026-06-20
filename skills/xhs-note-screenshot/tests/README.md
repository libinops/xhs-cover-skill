# 头像显示测试

本目录是 `xhs-note-screenshot` skill 中头像 / 作者显示规则的测试代码。

## 校验内容

- 第一张生成的图包含头像、作者名和日期。
- 每一张正文图（第 2 张、第 3 张 ……）**不**包含头像、作者名或日期。
- 头像 / 作者解析优先级被端到端遵循：
  1. CLI 参数优先级高于档案。
  2. 已配置的档案优先级高于占位。
  3. 占位仅在所有其他来源都不可用时使用，本 skill 永远不会凭空捏造头像 URL 或作者名。
- 一段较短的、能放进单张图的输入，只会生成一张“首图”HTML 和零张正文 HTML。

## 运行

```bash
node tests/avatar-display.test.mjs
```

测试使用 Node 内置的 `node:test` 运行器，仅依赖 Node.js 18+。它们会调用 `scripts/build-note.mjs`，并对生成的 HTML 文件做结构断言。无需 Playwright。

## 目录

- `avatar-display.test.mjs` —— 测试文件本体。
- `fixtures/sample-text.txt` —— 多个测试中使用的短文本。
- `fixtures/long-text.txt` —— 会拆分成多张图的较长文本。
- `fixtures/profile-with-avatar.json` —— 同时提供姓名、头像 URL 和日期的档案。
- `fixtures/profile-avatar-fallback.json` —— 提供姓名和日期、但不提供头像的档案。

## 新增一个测试

1. 把新文本或档案放进 `fixtures/`。
2. 在 `avatar-display.test.mjs` 里追加一个 `test("...", async () => { ... })` 块。
3. 用相应的 CLI 参数调用 `runBuildNote([...])`。
4. 检查生成的 `note-XX.html` 文件和 `manifest.json`。
5. 对你关心的结构规则做断言。

测试文件是单文件 Node.js 脚本 —— 无需转译、无需构建步骤、无外部依赖。
