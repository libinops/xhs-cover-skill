# xhs-post-skill

一个独立的 skill 模块，可以根据输入文本生成小红书风格的"原始"笔记截图。第一张图带圆形头像、作者名和日期；从第二张起，每张图都只有正文，不再出现头像或作者信息。


## 这个 Skill 能做什么

- 把一段输入文本转成 1 张或多张 `3:4`（PNG 1200×1600）的小红书风格笔记截图。
- **只**在第一张图上展示头像、作者名、日期。
- 从第二张起，每张图都只有正文（不出现头像、不出现作者、不出现日期）。
- 头像和作者数据按严格的优先级解析：
  1. 命令行直接传入（CLI 参数）。
  2. 已配置的用户资料（`--profile` 指定 → skill 目录 → 用户全局）。
  3. 中性的占位符（圆形灰色块 + `匿名` / `Anonymous`）。
- 绝不伪造头像 URL 或作者名。

## 快速上手

```bash
# 1. (可选) 配置默认头像和作者，避免每次都传参
cp skills/xhs-note-screenshot/assets/user-profile.example.json \
   skills/xhs-note-screenshot/assets/user-profile.json
# 编辑这个文件，填上自己的头像 URL、名字、日期

# 2. 用文本文件生成笔记
node skills/xhs-note-screenshot/scripts/build-note.mjs \
  --input path/to/essay.txt \
  --out-dir output/essay

# 3. 导出单张 PNG（或一次性导出整组）
node skills/xhs-note-screenshot/scripts/capture-xhs-card.mjs \
  --html output/essay/note-01.html \
  --out output/essay/note-01.png

node skills/xhs-note-screenshot/scripts/capture-xhs-carousel.mjs \
  --html output/essay/note.html \
  --out-dir output/essay
```

## 头像与作者解析优先级

| 来源 | 优先级 | 怎么提供 |
|---|---|---|
| CLI 参数 `--avatar-url`、`--avatar-path`、`--author-name`、`--date` | 1（最高） | 在 `build-note.mjs` 命令行直接传 |
| `--profile <path>` 指定的 JSON 文件 | 2 | 命令行临时指定另一份资料 |
| skill 目录下的 `assets/user-profile.json` | 3 | 把 JSON 放到 skill 目录里 |
| `~/.config/xhs-note-screenshot/user-profile.json` | 4 | 跨项目共用的用户全局配置 |
| 占位符 | 5（最低） | 内联 SVG data URI + `匿名` / `Anonymous`，绝不伪造 |

完整字段说明见 [references/user-profile.md](file:///Users/yangzhengwang/Desktop/code/other/xhs-cover-skill/xhs-post-skill/skills/xhs-note-screenshot/references/user-profile.md)。

## 输入参数

`scripts/build-note.mjs` 的所有参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `--input <path>` | 路径 | 必填 | 正文文本文件路径（`.txt` 或 `.md`）。 |
| `--out-dir <dir>` | 路径 | 必填 | 输出目录，存放 HTML、PNG、manifest。 |
| `--avatar-url <url>` | 字符串 | 无 | 最高优先级的头像 URL。 |
| `--avatar-path <path>` | 字符串 | 无 | 本地头像文件路径。`--avatar-url` 未传时使用。 |
| `--author-name <name>` | 字符串 | 无 | 覆盖作者显示名。 |
| `--date <string>` | 字符串 | profile 默认值 → 当天 | 作者名下方显示的日期。 |
| `--profile <path>` | 路径 | skill 目录 → 用户全局 | 要使用的 profile JSON。 |
| `--max-chars-per-image <n>` | 数字 | 500 | 每张图正文的字符预算。 |
| `--title <string>` | 字符串 | 自动 | 生成的 HTML 中的文档标题。 |

## 输出格式

```
<out-dir>/
├── manifest.json          # 解析来源 + 每张图的元信息
├── note.html              # 拼好的整组轮播 HTML（供 capture-xhs-carousel 使用）
├── note-01.html           # 第一张图（含作者信息）
├── note-01.png            # 第一张图 PNG
├── note-02.html           # 第二张图（纯正文）
├── note-02.png            # 第二张图 PNG
└── ...
```

`manifest.json` 结构：

```json
{
  "generated_at": "2026-06-20T15:45:53.524Z",
  "input": "path/to/input.txt",
  "profile": "实际使用的 profile.json 路径，或 null",
  "resolution": {
    "author": {
      "name":  { "value": "小盖",  "source": "cli" },
      "date":  { "value": "06/20",  "source": "cli" }
    },
    "avatar": {
      "src":   { "value": "https://...", "source": "cli" }
    }
  },
  "image_count": 3,
  "images": [
    { "index": 1, "file": "note-01.html", "template": "xhs-note-with-author", "slot": "first", "paragraph_count": 2, "char_count": 97 },
    { "index": 2, "file": "note-02.html", "template": "xhs-note-body",       "slot": "body",  "paragraph_count": 2, "char_count": 119 }
  ]
}
```

`source` 字段取值：`cli` / `profile` / `placeholder`。Skill 绝不写入伪造的 `https://...` 链接或编造的作者名。

## 测试

```bash
node skills/xhs-note-screenshot/tests/avatar-display.test.mjs
```

测试用 Node 内置的 `node:test` 运行，零外部依赖。会调用 `build-note.mjs`、检查生成的 HTML，并断言：

1. 第一张图含作者信息块（头像 + 名字 + 日期）；正文图不含。
2. CLI 参数优先级高于已配置的 profile。
3. CLI 未传时，使用 profile 中的值。
4. CLI 和 profile 都没给头像时，使用占位头像。
5. CLI 和 profile 都没给作者名时，使用占位作者名 `匿名`。
6. 短文本只生成 1 张第一张图（note-01.html），不生成正文图。
7. 占位头像必须是内联 SVG data URI，绝不写伪造的 URL。

## 架构说明

- **两个闭环模板。** Skill 只提供两个模板：`xhs-note-with-author`（第一张图）和 `xhs-note-body`（其他所有图）。它们共用画布、内边距、字体和排版节奏，唯一区别就是 `header.author` 块。
- **不复用其他 skill 的类名。** 不要从 `lieflat-xhs-longform`、`lieflat-xhs-cover` 或 `lieflat-html-deck` 引入 class、CSS 变量、布局块。这是另一种视觉族：纯白底、纯正文。
- **无浏览器端逻辑。** Skill 不在浏览器里跑 JS，所有决策都在 `build-note.mjs` 的构建阶段完成。
- **纯 Node 脚本。** 所有脚本都是 ESM 模块，不需任何转译步骤。capture 系列脚本只用 Playwright 做 PNG 导出，build 和 test 脚本零外部依赖。

## 背景与参考

这个 skill 的视觉参考是真实的小红书笔记帖：圆形头像、作者名、日期，以及一列纯白底的正文。模块用来生成"长相一样"的小红书风格图，用于原型设计、文案草稿、社交媒体模板制作等场景 —— 不复制任何具体真实帖子。

模块的目录结构（顶层项目 + `skills/<skill-name>/` 子目录，每个子目录包含 `SKILL.md` + `agents/openai.yaml` + `assets/` + `references/` + `scripts/` + `tests/`）完全对齐 `lieflat-html-design/skills/lieflat-html-design/` 系列。
