#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

const inputPath = arg("input");
const outDirArg = arg("out-dir");
const profileArg = arg("profile");
const avatarUrl = arg("avatar-url");
const avatarPath = arg("avatar-path");
const authorName = arg("author-name");
const dateArg = arg("date");
const maxChars = Number.parseInt(arg("max-chars-per-image", "500"), 10);
const title = arg("title");
const placeholderAvatarDataUri = arg("placeholder-avatar", null);

if (!inputPath || !outDirArg) {
  console.error("Usage: node scripts/build-note.mjs --input <text.txt> --out-dir <dir> [options]");
  console.error("  --avatar-url <url>         direct avatar URL (highest priority)");
  console.error("  --avatar-path <path>       local avatar file (used when --avatar-url is absent)");
  console.error("  --author-name <name>       override author display name");
  console.error("  --date <string>            override date string (e.g. 06/20 or 2026-06-20)");
  console.error("  --profile <path>           profile JSON path (overrides the default lookup chain)");
  console.error("  --max-chars-per-image <n>  body character budget per image (default 500)");
  console.error("  --title <string>           optional document title");
  process.exit(1);
}

const outDir = resolve(process.cwd(), outDirArg);
await mkdir(outDir, { recursive: true });

// 1. Load the configured profile (CLI > skill folder > user-global).
async function loadProfile() {
  const candidates = [];
  if (profileArg) candidates.push(resolve(process.cwd(), profileArg));
  candidates.push(resolve(root, "assets/user-profile.json"));
  candidates.push(resolve(homedir(), ".config/xhs-note-screenshot/user-profile.json"));
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      return { path: candidate, data: JSON.parse(raw) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { path: null, data: null };
}

const profile = await loadProfile();

// 2. Resolve the avatar and author with priority: CLI > profile > placeholder.
function todayString() {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function placeholderAvatarSvg() {
  // Inline SVG data URI for a round gray block, 128×128.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="64" fill="#d9d9d9"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const resolution = {
  author: { name: { value: null, source: null }, date: { value: null, source: null } },
  avatar: { src: { value: null, source: null } }
};

const profileAuthor = profile.data?.author ?? {};
const profileDefaultDate = profile.data?.default_date ?? null;

// Author name: CLI > profile > placeholder.
if (authorName) {
  resolution.author.name.value = authorName;
  resolution.author.name.source = "cli";
} else if (profileAuthor.name) {
  resolution.author.name.value = profileAuthor.name;
  resolution.author.name.source = "profile";
} else {
  resolution.author.name.value = "匿名";
  resolution.author.name.source = "placeholder";
}

// Date: CLI > profile default > placeholder.
if (dateArg) {
  resolution.author.date.value = dateArg;
  resolution.author.date.source = "cli";
} else if (profileDefaultDate) {
  resolution.author.date.value = profileDefaultDate;
  resolution.author.date.source = "profile";
} else {
  resolution.author.date.value = todayString();
  resolution.author.date.source = "placeholder";
}

// Avatar: CLI URL > CLI path > profile URL > profile path > placeholder SVG.
if (avatarUrl) {
  resolution.avatar.src.value = avatarUrl;
  resolution.avatar.src.source = "cli";
} else if (avatarPath) {
  resolution.avatar.src.value = `file://${resolve(process.cwd(), avatarPath)}`;
  resolution.avatar.src.source = "cli";
} else if (profileAuthor.avatar_url) {
  resolution.avatar.src.value = profileAuthor.avatar_url;
  resolution.avatar.src.source = "profile";
} else if (profileAuthor.avatar_path) {
  resolution.avatar.src.value = `file://${resolve(process.cwd(), profileAuthor.avatar_path)}`;
  resolution.avatar.src.source = "profile";
} else {
  resolution.avatar.src.value = placeholderAvatarDataUri || placeholderAvatarSvg();
  resolution.avatar.src.source = "placeholder";
}

// 3. Read the input text and split into paragraphs.
const inputAbsolute = resolve(process.cwd(), inputPath);
await access(inputAbsolute);
const rawText = await readFile(inputAbsolute, "utf8");
const paragraphs = rawText
  .replace(/\r\n/g, "\n")
  .split(/\n\s*\n+/)
  .map((p) => p.trim())
  .filter((p) => p.length > 0);

if (paragraphs.length === 0) {
  console.error(`Input file ${inputPath} is empty.`);
  process.exit(1);
}

// 4. Pack paragraphs into images using a character budget. First image has the
//    author header, so it gets a smaller effective body budget.
function packParagraphs(paragraphs, budget) {
  const groups = [];
  let current = [];
  let used = 0;
  for (const p of paragraphs) {
    const length = p.length;
    if (current.length === 0) {
      current.push(p);
      used = length;
      continue;
    }
    if (used + length + 1 <= budget) {
      current.push(p);
      used += length + 1;
    } else {
      groups.push(current);
      current = [p];
      used = length;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// The first image has a smaller body area (author header takes ~120px CSS).
// We approximate the budget difference by reducing the first image by ~25%.
const firstImageBudget = Math.max(120, Math.floor(maxChars * 0.75));
const remainingBudget = maxChars;
const firstGroup = paragraphs.slice(0, 0); // placeholder, real assignment below

// Build groups with first image capped at firstImageBudget, others at remainingBudget.
const groups = [];
let consumed = 0;
{
  // First image
  const first = [];
  let used = 0;
  while (consumed < paragraphs.length) {
    const p = paragraphs[consumed];
    const length = p.length;
    if (first.length === 0) {
      first.push(p);
      used = length;
      consumed++;
      continue;
    }
    if (used + length + 1 <= firstImageBudget) {
      first.push(p);
      used += length + 1;
      consumed++;
    } else {
      break;
    }
  }
  groups.push(first);
}
// Body images
while (consumed < paragraphs.length) {
  const group = [];
  let used = 0;
  while (consumed < paragraphs.length) {
    const p = paragraphs[consumed];
    const length = p.length;
    if (group.length === 0) {
      group.push(p);
      used = length;
      consumed++;
      continue;
    }
    if (used + length + 1 <= remainingBudget) {
      group.push(p);
      used += length + 1;
      consumed++;
    } else {
      break;
    }
  }
  groups.push(group);
}

// 5. Read the templates and substitute placeholders.
const withAuthorTemplate = await readFile(resolve(root, "assets/templates/xhs-note-with-author/zh.html"), "utf8");
const bodyTemplate = await readFile(resolve(root, "assets/templates/xhs-note-body/zh.html"), "utf8");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphsToHtml(paragraphs) {
  return paragraphs.map((p) => `      <p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n");
}

function fillWithAuthorTemplate(paragraphs) {
  return withAuthorTemplate
    .replaceAll("{{AUTHOR_NAME}}", escapeHtml(resolution.author.name.value))
    .replaceAll("{{AUTHOR_DATE}}", escapeHtml(resolution.author.date.value))
    .replaceAll("{{AVATAR_SRC}}", escapeHtml(resolution.avatar.src.value))
    .replaceAll("{{BODY_PARAGRAPHS}}", paragraphsToHtml(paragraphs));
}

function fillBodyTemplate(paragraphs) {
  return bodyTemplate
    .replaceAll("{{BODY_PARAGRAPHS}}", paragraphsToHtml(paragraphs));
}

// 6. Write per-image HTML files and a stitched carousel HTML.
const imageRecords = [];
// Always pad to at least 2 digits so file names are consistent across runs
// (note-01.html, note-02.html, ...) regardless of image count.
const digits = Math.max(2, String(groups.length).length);
for (let i = 0; i < groups.length; i++) {
  const index = i + 1;
  const isFirst = i === 0;
  const template = isFirst ? "xhs-note-with-author" : "xhs-note-body";
  const html = isFirst ? fillWithAuthorTemplate(groups[i]) : fillBodyTemplate(groups[i]);
  const filename = `note-${String(index).padStart(digits, "0")}.html`;
  const filePath = resolve(outDir, filename);
  await writeFile(filePath, html, "utf8");
  imageRecords.push({
    index,
    file: filename,
    template,
    slot: isFirst ? "first" : "body",
    paragraph_count: groups[i].length,
    char_count: groups[i].reduce((sum, p) => sum + p.length, 0)
  });
}

// 7. Stitch the images into a single carousel HTML for capture-xhs-carousel.mjs.
//    The carousel script scrolls the .article inside .scene; for this skill
//    there is one .scene per "page", so we stack them in a vertical container.
const carouselParts = imageRecords.map((record, i) => {
  // Reuse the per-image HTML body (everything inside <body>).
  // To keep the carousel self-contained, we inline the relevant CSS variables
  // and re-render the body block per image.
  const paragraphs = groups[i];
  const isFirst = i === 0;
  const paragraphHtml = paragraphsToHtml(paragraphs);
  if (isFirst) {
    return `  <main class="scene" aria-label="小红书笔记 — ${escapeHtml(resolution.author.name.value)}">
    <header class="author">
      <img class="author-avatar" src="${escapeHtml(resolution.avatar.src.value)}" alt="${escapeHtml(resolution.author.name.value)} 的头像" />
      <div class="author-meta">
        <div class="author-name">${escapeHtml(resolution.author.name.value)}</div>
        <div class="author-date">${escapeHtml(resolution.author.date.value)}</div>
      </div>
    </header>
    <section class="body">
${paragraphHtml}
    </section>
  </main>`;
  }
  return `  <main class="scene" aria-label="小红书笔记 — 正文 ${i + 1}">
    <section class="body">
${paragraphHtml}
    </section>
  </main>`;
});

const carouselHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="generator" content="XHS Note Screenshot" />
<meta name="template-origin" content="XHS Note Screenshot — carousel">
<title>${escapeHtml(title || `${resolution.author.name.value} 的小红书笔记`)}</title>
<style>
  :root{
    --bg:#ffffff;
    --ink:#1a1a1a;
    --ink-faint:#999999;
    --sans:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",-apple-system,BlinkMacSystemFont,Arial,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#e9e9e9;min-height:100%;}
  body{
    font-family:var(--sans);
    color:var(--ink);
    -webkit-font-smoothing:antialiased;
    padding:24px;
  }
  .stack{display:flex;flex-direction:column;gap:24px;align-items:center;}
  .scene{
    position:relative;
    width:600px;
    max-width:calc(100vw - 24px);
    height:800px;
    background:var(--bg);
    overflow:hidden;
  }
  .author{
    display:flex;
    align-items:center;
    gap:14px;
    padding:40px 40px 28px 40px;
  }
  .author-avatar{
    width:64px;height:64px;border-radius:50%;object-fit:cover;background:#d9d9d9;flex-shrink:0;display:block;
  }
  .author-meta{display:flex;flex-direction:column;gap:4px;min-width:0;}
  .author-name{font-size:24px;line-height:1.2;font-weight:600;color:var(--ink);letter-spacing:0.01em;}
  .author-date{font-size:14px;line-height:1.2;color:var(--ink-faint);letter-spacing:0.02em;}
  .body{padding:0 40px 40px 40px;font-size:22px;line-height:1.8;color:var(--ink);letter-spacing:0.01em;}
  .body.is-first{padding-top:0;}
  .body p{margin-bottom:18px;}
  .body p:last-child{margin-bottom:0;}
</style>
</head>
<body>
  <div class="stack">
${carouselParts.join("\n")}
  </div>
</body>
</html>
`;

await writeFile(resolve(outDir, "note.html"), carouselHtml, "utf8");

// 8. Write the manifest.
const manifest = {
  generated_at: new Date().toISOString(),
  input: inputPath,
  profile: profile.path,
  resolution,
  image_count: imageRecords.length,
  images: imageRecords
};
await writeFile(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

console.log(JSON.stringify({
  out_dir: outDir,
  image_count: imageRecords.length,
  resolution,
  images: imageRecords.map((r) => ({ index: r.index, file: r.file, template: r.template, slot: r.slot, char_count: r.char_count }))
}, null, 2));
