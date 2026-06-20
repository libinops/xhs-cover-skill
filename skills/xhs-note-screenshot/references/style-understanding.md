# 小红书笔记截图样式理解

本 skill 是**原生小红书帖子观感**，不是设计模板。视觉上的克制就是全部要点。

## “原生笔记”意味着什么

- 纯白底，没有渐变、没有面板、没有阴影。
- 一栏正文。不要侧边栏，不要卡片里再嵌卡片，不要标注框。
- 唯一的结构元素就是头像 / 作者 / 日期头部，且**只出现在第一张图**上。
- 字体使用系统默认的 CJK 字体（macOS 上是 `PingFang SC`，Windows 上是 `Microsoft YaHei`，并以 `Noto Sans SC` 兜底）。不引入 webfont，不用定制衬线。
- 正文字号和行高按手机屏截图的可读性来调，不要按印刷品标准。

## 布局参考

参考样式就是一篇真实的小红书帖子：

```
┌─────────────────────────────────┐
│  (头像)   作者名                  │   ← 仅第一张图
│            06/20                │
│                                 │
│  第一段正文横向铺满整宽。           │
│                                 │
│  第二段正文。                     │
│  ……                             │
└─────────────────────────────────┘
```

正文图（第 2、3 …… 张）从顶部内边距处直接开始排版正文。没有头像块、没有头部条带、没有作者行、没有日期。

## 图片元素

| 元素 | 是否必填 | 位置 | 说明 |
|---|---|---|---|
| 头像 | 是（仅首图） | `header.author > img.author-avatar` | 圆形，CSS 64px，`object-fit: cover`，与作者名间距 14px |
| 作者名 | 是（仅首图） | `header.author > .author-meta > .author-name` | CSS 24px，字重 600，墨色 |
| 日期 | 是（仅首图） | `header.author > .author-meta > .author-date` | CSS 14px，淡灰色 |
| 正文段落 | 是（每张图） | `section.body > p` | CSS 22px，行高 1.8，段间距 18px |

## 头像与作者解析

按以下顺序检查三个来源：

1. **本次运行中用户直接输入的值** —— `build-note.mjs` 的 CLI 参数。详见 `references/user-profile.md`。
2. **已配置的用户档案** —— `--profile <path>`，再 `assets/user-profile.json`，再 `~/.config/xhs-note-screenshot/user-profile.json`。
3. **中性占位** —— 圆形灰色 `#d9d9d9` 占位头像 + 作者名 `匿名`（zh）/ `Anonymous`（en）。

本 skill **永远不会**凭空捏造未被提供的头像 URL 或作者名。

## 模板隔离

- 本 skill 中的两个模板（`xhs-note-with-author` 与 `xhs-note-body`）是成对出现的封闭体系。它们的画布、内边距、字体、节奏完全一致，唯一的结构差异是 `header.author` 块。
- 不要复用 `lieflat-xhs-longform`、`lieflat-xhs-cover` 或 `lieflat-html-deck` 的类名、CSS 变量或布局块。它们属于不同的视觉族。
- 拿不准时，少即是多。砍掉装饰，保留正文。

## 不要做

- 不要在截图上加 logo、水印、页码、页脚。
- 不要使用带颜色的背景、渐变或图片底纹。
- 不要把头像 / 作者块放到第一张图以外的任何图上。
- 不要“先在第一张图放头像 / 作者，再悄悄在正文图上去掉” —— 省略必须是显式、有意的。
- 不要拉伸或扭曲头像。使用 `object-fit: cover` 和 `border-radius: 50%`。
