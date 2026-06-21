# 用户档案与头像解析

头像和作者名最多从三个来源解析，按以下优先级顺序：

1. **本次运行中用户直接传入的值。** 优先级最高。
2. **已配置的用户档案文件。** 优先级次之。
3. **中性占位。** 仅在其他来源都不可用时使用。本 skill 永远不会凭空捏造头像 URL 或作者名。

## 1. CLI 参数（用户直接输入）

| 参数 | 作用 | 示例 |
|---|---|---|
| `--avatar-url <url>` | 使用该远程 URL 作为头像图。 | `--avatar-url https://example.com/me.jpg` |
| `--avatar-path <path>` | 使用该本地文件路径作为头像图。 | `--avatar-path ./assets/my-avatar.jpg` |
| `--author-name <name>` | 覆盖作者显示名。 | `--author-name "小盖"` |
| `--date <string>` | 覆盖作者名下方显示的帖子日期。 | `--date "06/20"` 或 `--date "2026-06-20"` |
| `--profile <path>` | 用该文件作为已配置档案，替代默认查找链。 | `--profile ./my-profile.json` |
| `--input <path>` | 正文文本所在的 `.txt` 或 `.md` 文件路径。 | `--input ./essay.txt` |
| `--out-dir <dir>` | 生成 HTML、PNG 和 manifest 的输出目录。 | `--out-dir ./output/essay` |

用户**没有**传入的字段会回落到档案，再回落到占位。

## 2. 已配置的档案

skill 按以下顺序查找档案：

1. 如果传入了 `--profile <path>`，使用它。
2. 若 `<skill-目录>/assets/user-profile.json` 存在，使用它。
3. 若 `~/.config/xhs-note-screenshot/user-profile.json`（用户全局）存在，使用它。

第一个存在的文件胜出，其余文件被忽略。

### Schema

```json
{
  "author": {
    "name": "小盖",
    "avatar_url": "https://example.com/avatar.jpg",
    "avatar_path": null
  },
  "default_date": "06/20",
  "locale": "zh-CN"
}
```

| 字段 | 类型 | 是否必填 | 说明 |
|---|---|---|---|
| `author.name` | string | 建议填写 | 显示在头像旁的作者名。缺省时使用占位 `匿名`。 |
| `author.avatar_url` | string \| null | 可选 | 远程头像 URL。当未传 `--avatar-url` 时使用。 |
| `author.avatar_path` | string \| null | 可选 | 本地头像文件路径。当未传 `--avatar-url` 且未设置 `author.avatar_url` 时使用。 |
| `default_date` | string | 可选 | 显示在作者名下的日期字符串。缺省时使用当前日期的 `MM/DD` 形式。 |
| `locale` | string | 可选 | 默认 `zh-CN`。当前仅作为信息字段保留。 |

如果同时设置了 `avatar_url` 和 `avatar_path`，`avatar_url` 胜出。

如果两者都没有设置，则渲染占位头像（一个圆形灰色块）。

## 3. 占位

当 CLI 参数和档案都未提供值时：

- 头像：圆形暖灰色块（`#c9bfa6`），CSS 64px，无图片来源。
- 作者名：`zh` 区域使用 `匿名`，`en` 区域使用 `Anonymous`。
- 日期：当前日期的 `MM/DD` 形式（UTC）。

skill **不会**凭空捏造 URL、姓名或日期。如果用户没有提供，占位是唯一安全的选择。

## 快速配置

```bash
# 1. 复制示例档案
cp assets/user-profile.example.json assets/user-profile.json

# 2. 编辑它，填入你的头像 URL 和姓名
#    assets/user-profile.json
#    {
#      "author": {
#        "name": "小盖",
#        "avatar_url": "https://example.com/me.jpg",
#        "avatar_path": null
#      },
#      "default_date": "06/20"
#    }

# 3. 从文本文件构建笔记
node scripts/build-note.mjs --input ./essay.txt --out-dir ./output/essay
```

## 单次运行覆盖

```bash
node scripts/build-note.mjs \
  --input ./essay.txt \
  --out-dir ./output/essay \
  --avatar-url https://example.com/different-avatar.jpg \
  --author-name "Another Name" \
  --date "2026-06-20"
```

覆盖参数的优先级高于档案，档案本身不会被修改。
