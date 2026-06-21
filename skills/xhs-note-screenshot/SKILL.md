---
name: xhs-note-screenshot
description: 根据输入文本生成小红书风格的笔记截图（原生帖子观感）。当用户希望得到一张牛皮纸底色、纯正文、模拟真实小红书笔记的卡片时使用：头像 + 作者 + 日期仅出现在第一张图上，后续图片只有正文。头像和作者数据优先取自用户本次提供的链接，其次取自已配置的用户档案。
---

# 小红书笔记截图

本 skill 用于生成看起来像真实小红书笔记帖子的图片卡片 —— 柔和的牛皮纸底色（`#f3e8d2`），没有装饰模板，只有头像 / 作者信息和正文。本 skill 产出的是原生帖子的观感。

## 本 skill 的作用

- 将一段输入文本转换成一到多张 `3:4` 的笔记截图。
- 仅在**第一张**图上展示头像 + 作者 + 日期。
- 后续图片只保留纯正文（不显示头像、作者、日期）。
- 头像和作者名按以下优先级解析：
  1. 用户在本次请求中直接传入的链接（头像 URL、作者名、日期）。
  2. 已配置的用户档案（`assets/user-profile.json` 或 `--profile` 参数）。
  3. 中性占位头像和“匿名”作者名（不会凭空捏造真实作者）。

## 核心规则

- 输出一眼就是真实小红书笔记：柔和的牛皮纸底色、没有边框、没有阴影、没有模板装饰。
- 头像和作者名放在**第一张**图的左上角，对齐参考布局：
  - 左侧是圆形头像。
  - 作者显示名在头像右侧，一行。
  - 日期字号更小，直接排在作者名下方。
- 后续图片顶部直接是正文 —— 没有头像块、没有作者块、没有日期。
- 正文默认中文优先，混排 CJK + 拉丁字符均可。
- 不要凭空捏造头像 URL 或作者名。如果既没有直接链接也没有配置档案，就渲染中性占位头像，并把作者标注为 `匿名`。
- 第一张图和正文图不要切换模板体系，二者共用同一画布、内边距、字体、行高和段落节奏。
- 不要复用 `lieflat-xhs-longform` 或 `lieflat-xhs-cover` 的布局块、类名或 CSS 变量。这是独立的、更加简洁的视觉族。

## 画布与导出

- CSS 画布：`600px × 800px`，`3:4`。
- 默认导出：`1200px × 1600px` PNG，`deviceScaleFactor: 2`。
- 头像直径：`64px`（CSS）→ `128px`（PNG）。
- 作者名：`24px`（CSS）→ `48px`（PNG），字重 600。
- 日期：`14px`（CSS）→ `28px`（PNG），颜色 `#7a6a52`。
- 正文：`22px`（CSS）→ `44px`（PNG），行高 `1.8`，颜色 `#1a1a1a`。
- 内边距：第一张图 `40px`，正文图 `40px`。

## 头像与作者解析

按从上到下的顺序解析：

1. **本次请求中用户提供的链接 / 参数。** 适用于 `build-note.mjs` 的以下 CLI 参数：
   - `--avatar-url <https://...>` 直接传入的头像 URL。
   - `--avatar-path <本地路径>` 本地头像文件路径（在没传 URL 时使用）。
   - `--author-name <name>` 临时覆盖已配置的作者名。
   - `--date <YYYY-MM-DD | MM/DD | 相对日期>` 临时覆盖帖子日期。
2. **已配置的用户档案。** 按以下顺序加载：
   - `--profile <path-to-json>`（在档案文件中优先级最高）。
   - skill 目录下的 `assets/user-profile.json`。
   - `~/.config/xhs-note-screenshot/user-profile.json`（用户全局兜底）。
3. **中性占位。** 圆形灰色占位头像 + `匿名` / `Anonymous` 作者名。

完整的字段说明见 `references/user-profile.md`，入门样例见 `assets/user-profile.example.json`。

## 工作流

1. 读取 `assets/catalog.json` 和 `references/style-understanding.md`。
2. 按上述优先级解析头像和作者。软失败：永远不要捏造。
3. 把输入文本按段落拆分（空行 = 段落分隔）。当单张图放不下正文时，按字符预算拆分到多张图；拆分点是字符预算，而不是用户段落。
4. 用 `assets/templates/xhs-note-with-author/zh.html` 生成第一张图的 HTML。
5. 用 `assets/templates/xhs-note-body/zh.html` 生成每张正文图的 HTML。
6. 运行轮播导出脚本，得到每张图对应的 PNG。

## 快速开始

直接从文本文件生成单张图：

```bash
node scripts/build-note.mjs \
  --input tests/fixtures/sample-text.txt \
  --out-dir output/sample \
  --avatar-url https://example.com/avatar.jpg \
  --author-name "小明" \
  --date "06/20"
```

只使用配置好的档案生成：

```bash
cp assets/user-profile.example.json assets/user-profile.json
# 编辑 assets/user-profile.json，填入你的头像和作者信息
node scripts/build-note.mjs --input tests/fixtures/sample-text.txt --out-dir output/sample
```

把已生成的 HTML 导出成单张 PNG：

```bash
node scripts/capture-xhs-card.mjs --html output/sample/note-01.html --out output/sample/note-01.png
```

导出完整的多图轮播：

```bash
node scripts/capture-xhs-carousel.mjs --html output/sample/note.html --out-dir output/sample
```

## 常用脚本

```bash
node scripts/list-templates.mjs
node scripts/build-note.mjs --input <text.txt> --out-dir <dir> [--avatar-url <url> | --avatar-path <path>] [--author-name <name>] [--date <date>] [--profile <path>]
node scripts/capture-xhs-card.mjs --html <file.html> --out <card.png>
node scripts/capture-xhs-carousel.mjs --html <file.html> --out-dir <folder>
```

## 测试

`tests/avatar-display.test.mjs` 用于验证头像 / 作者 / 日期块仅出现在第一张生成的图上，正文图上不会出现。运行方式：

```bash
node tests/avatar-display.test.mjs
```

测试用例与 fixture 说明见 `tests/README.md`。
