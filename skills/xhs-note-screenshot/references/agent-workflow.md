# 智能体工作流

本 skill 为智能体原生的小红书笔记截图产出而设计：智能体负责编辑输入文本、解析头像与作者，并产出一到多张 `3:4` 的 PNG。

## 推荐工作流

1. 读取 `assets/catalog.json` 和 `references/style-understanding.md`。
2. 确认头像和作者数据：
   - 如果用户在本次请求中直接传入了链接或值，使用它们。
   - 否则，加载 `assets/user-profile.json`；若不存在，回落到用户全局档案。
   - 都不存在则使用中性占位渲染。
3. 把输入文本按段落拆分（空行 = 段落分隔）。
4. 估算正文高度。单张图放不下时，拆分成多张图。
5. 用 `assets/templates/xhs-note-with-author/zh.html` 生成第一张图的 HTML。
6. 用 `assets/templates/xhs-note-body/zh.html` 生成每张正文图的 HTML。
7. 运行 `capture-xhs-carousel.mjs`（如果只有一张图，使用 `capture-xhs-card.mjs`）。
8. 检查 PNG，确认头像 / 作者块只出现在第一张图上。

## 构建命令

```bash
node scripts/build-note.mjs \
  --input <text.txt> \
  --out-dir <folder> \
  [--avatar-url <url> | --avatar-path <path>] \
  [--author-name <name>] \
  [--date <YYYY-MM-DD | MM/DD>] \
  [--profile <path-to-json>] \
  [--max-chars-per-image 600]
```

## 输出结构

```
<out-dir>/
  note.html              ← 拼接好的轮播 HTML（供 capture-xhs-carousel.mjs 使用）
  note-01.html           ← 第一张图的 HTML（含作者）
  note-01.png            ← 第一张图的 PNG
  note-02.html           ← 正文图的 HTML（不含作者）
  note-02.png            ← 正文图的 PNG
  ...
  manifest.json          ← 解析结果 + 每张图的元数据
```

`manifest.json` 记录以下信息：

- 解析后的 `author.name`、`author.avatar_src`、`author.date`。
- 每个字段的来源：`cli` / `profile` / `placeholder`。
- 每张图的字符数以及使用的模板。
- PNG 的尺寸和文件路径。

## 元数据

向每张生成的 HTML 加上以下 meta 标签，便于溯源：

```html
<meta name="generator" content="XHS Note Screenshot">
<meta name="template-origin" content="XHS Note Screenshot template">
```

刻意不添加可见的署名（例如页脚的作者名）。作者信息仅在第一张图的头部出现一次，与参考样式一致。

## 需要避免的做法

- 不要把作者名或头像以隐藏属性、页脚等方式塞进正文图。省略必须是结构上的，不是“藏起来”。
- 不要复用上一次运行产出的 HTML 作为新一轮的基线。始终从模板重新生成。
- 不要为了把正文硬塞进一张图，就把正文字号压到 18px（CSS）以下 —— 应该拆成下一张图。
