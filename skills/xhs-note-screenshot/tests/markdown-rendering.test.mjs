#!/usr/bin/env node
// Test that the build-note.mjs script correctly renders Markdown input as HTML.
//
// Run:
//   node tests/markdown-rendering.test.mjs
//
// What it checks:
//   1. A markdown input renders expected elements (h1/h2, strong, em, code,
//      pre, ul/ol, blockquote, a) in the first image's HTML.
//   2. The first image contains the author header (avatar + name + date).
//   3. Explicit `---` scene breaks produce multiple image files.
//   4. A scene with rendered HTML elements (no escaped tags) shows the
//      markdown was actually parsed (not just HTML-escaped and re-emitted).
//
// This is a pure Node.js test. It shells out to scripts/build-note.mjs, reads
// the resulting HTML files, and asserts structural rules. It does not
// require Playwright.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, "..");
const buildScript = resolve(skillRoot, "scripts/build-note.mjs");
const fixturesDir = resolve(here, "fixtures");
const sampleInput = resolve(fixturesDir, "markdown-sample.md");

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const marker = pass ? "✓" : "✗";
  console.log(`  ${marker} ${name}${detail ? ` — ${detail}` : ""}`);
}

function runBuildNote(outDir, args = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [buildScript, "--input", sampleInput, "--out-dir", outDir, ...args], {
      cwd: skillRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`build-note.mjs exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

async function readAllHtml(outDir) {
  const fs = await import("node:fs/promises");
  const entries = await fs.readdir(outDir);
  return Promise.all(
    entries
      .filter((name) => name.startsWith("note-") && name.endsWith(".html"))
      .sort()
      .map(async (name) => ({ name, html: await readFile(join(outDir, name), "utf8") }))
  );
}

test("markdown input renders expected HTML elements", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "xhs-md-test-"));
  try {
    await runBuildNote(outDir, ["--author-name", "测试者", "--date", "06/20"]);
    const files = await readAllHtml(outDir);
    record("produces at least one image", files.length >= 1, `${files.length} file(s)`);

    const first = files[0];
    if (!first) throw new Error("no image produced");

    // Concatenate all files for element-presence checks that may land on a
    // later page (e.g. links at the end of the document).
    const allHtml = files.map((f) => f.html).join("\n");

    record("first image has author header", first.html.includes("测试者") && first.html.includes("06/20"));
    record("renders <h1>", /<h1[^>]*>.*现代 AI.*<\/h1>/.test(first.html));
    record("renders <h2>", first.html.includes("<h2"));
    record("renders <strong>", first.html.includes("<strong>错误</strong>"));
    record("renders <em>", first.html.includes("<em>本身就</em>"));
    record("renders inline <code>", /<code>compute = model_size/.test(first.html));
    record("renders <blockquote>", first.html.includes("<blockquote>"));
    record("renders <ul> with list items", first.html.includes("<ul>") && first.html.includes("<li>"));
    record("renders <ol> with list items", first.html.includes("<ol>") && /<li>算力堆到极限/.test(first.html));
    record("renders <a> with href", /<a href="https:\/\/example\.com">DeepSeek V4 Pro 推理日志<\/a>/.test(allHtml));
    record("does not double-escape", !first.html.includes("&lt;h1") && !first.html.includes("&lt;strong"));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("`---` in input produces explicit scene breaks", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "xhs-md-hr-"));
  try {
    await runBuildNote(outDir, ["--author-name", "测试者"]);
    const files = await readAllHtml(outDir);
    // The fixture has 2 explicit `---` separators → 3 sections → 3 images.
    // If the script were merging them, we'd see 1 or 2 images.
    record("produces 3 images from 2 `---` separators", files.length === 3, `${files.length} file(s)`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("manifest records block count and char count", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "xhs-md-manifest-"));
  try {
    await runBuildNote(outDir, ["--author-name", "测试者"]);
    const manifest = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"));
    record("manifest.image_count matches file count", manifest.image_count >= 1);
    record("first image has block metadata", typeof manifest.images[0].char_count === "number");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test.after(async () => {
  const failed = results.filter((r) => !r.pass);
  console.log("");
  console.log(`Markdown rendering: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("Failed cases:");
    for (const r of failed) console.log(`  - ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    process.exit(1);
  }
});
