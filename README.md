# xhs-note-screenshot-skill

一个独立的 skill 模块，可以根据输入文本生成小红书风格的"原始"笔记截图。第一张图带圆形头像、作者名和日期；从第二张起，每张图都只有正文，不再出现头像或作者信息。


## 这个 Skill 能做什么

这个 skill 的视觉参考是真实的小红书笔记帖：圆形头像、作者名、日期，以及一列纯白底的正文。模块用来生成"长相一样"的小红书风格图，用于原型设计、文案草稿、社交媒体模板制作等场景 —— 不复制任何具体真实帖子。

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
      "name":  { "value": "小明",  "source": "cli" },
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
