#!/usr/bin/env node
// Test the avatar/author display rules for the xhs-note-screenshot skill.
//
// Run:
//   node tests/avatar-display.test.mjs
//
// What it checks:
//   1. The first generated image contains the author header (avatar + name + date).
//   2. Every body image (2nd, 3rd, ...) contains NO author header.
//   3. The avatar/author resolution priority is honored:
//      a. CLI flags win over the profile.
//      b. The profile wins over the placeholder.
//      c. The placeholder is used when neither is provided, and is never fabricated.
//   4. A short input that fits in one image produces a single first-image file
//      and no body image files.
//
// This is a pure Node.js test. It shells out to scripts/build-note.mjs, reads
// the resulting HTML files, and asserts the structural rules. It does not
// require Playwright. The PNG export is verified separately by
// scripts/capture-xhs-card.mjs.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, "..");
const buildScript = resolve(skillRoot, "scripts/build-note.mjs");
const fixturesDir = resolve(here, "fixtures");

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
}

function runBuildNote(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [buildScript, ...args], {
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
        rejectPromise(new Error(`build-note.mjs exited ${code}\nstderr: ${stderr}`));
        return;
      }
      try {
        resolvePromise({ stdout, stderr, json: JSON.parse(stdout) });
      } catch (error) {
        rejectPromise(new Error(`Failed to parse build-note.mjs output as JSON: ${error.message}\nstdout: ${stdout}`));
      }
    });
  });
}

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "xhs-note-test-"));
  return dir;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// --- Test cases -------------------------------------------------------------

test("first image has the author header; body images do not", async () => {
  const outDir = await makeTempDir();
  try {
    const input = resolve(fixturesDir, "long-text.txt");
    const { json } = await runBuildNote([
      "--input", input,
      "--out-dir", outDir,
      "--avatar-url", "https://example.com/test-avatar.png",
      "--author-name", "测试作者",
      "--date", "06/20",
      "--max-chars-per-image", "200"
    ]);
    assert(json.image_count >= 2, `expected at least 2 images for the long fixture, got ${json.image_count}`);

    const manifest = await readJson(join(outDir, "manifest.json"));
    assert(manifest.image_count === json.image_count, "manifest image_count mismatch");

    for (const recordEntry of manifest.images) {
      const html = await readFile(join(outDir, recordEntry.file), "utf8");
      const headerCount = (html.match(/<header class="author">/g) || []).length;
      const sectionCount = (html.match(/<section class="body">/g) || []).length;
      if (recordEntry.slot === "first") {
        assert(headerCount === 1, `first image should have exactly 1 author header, got ${headerCount}`);
        assert(sectionCount === 1, `first image should have exactly 1 body section, got ${sectionCount}`);
        assert(html.includes("测试作者"), "first image should embed the CLI author name");
        assert(html.includes("https://example.com/test-avatar.png"), "first image should embed the CLI avatar URL");
        assert(html.includes("06/20"), "first image should embed the CLI date");
        record("first-image-has-author-header", true, "header + body sections present, CLI values embedded");
      } else {
        assert(headerCount === 0, `body image ${recordEntry.index} should have 0 author headers, got ${headerCount}`);
        assert(sectionCount === 1, `body image ${recordEntry.index} should have exactly 1 body section, got ${sectionCount}`);
        assert(!html.includes("测试作者"), `body image ${recordEntry.index} must not embed the author name`);
        assert(!html.includes("https://example.com/test-avatar.png"), `body image ${recordEntry.index} must not embed the avatar URL`);
        record(`body-image-${recordEntry.index}-has-no-author-header`, true, "no author block, body section present");
      }
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("CLI flags win over a configured profile (avatar URL, author name, date)", async () => {
  const outDir = await makeTempDir();
  try {
    const input = resolve(fixturesDir, "sample-text.txt");
    const profile = resolve(fixturesDir, "profile-with-avatar.json"); // name=小盖, avatar_url=https://example.com/test-avatar.png
    const { json } = await runBuildNote([
      "--input", input,
      "--out-dir", outDir,
      "--profile", profile,
      "--avatar-url", "https://example.com/cli-override.png",
      "--author-name", "CLI 覆盖名",
      "--date", "2026-06-20"
    ]);
    const resolution = json.resolution;
    assert(resolution.avatar.src.value === "https://example.com/cli-override.png", "CLI avatar URL must win over profile");
    assert(resolution.avatar.src.source === "cli", "avatar source must be 'cli'");
    assert(resolution.author.name.value === "CLI 覆盖名", "CLI author name must win over profile");
    assert(resolution.author.name.source === "cli", "author name source must be 'cli'");
    assert(resolution.author.date.value === "2026-06-20", "CLI date must win over profile");
    assert(resolution.author.date.source === "cli", "date source must be 'cli'");
    record("cli-overrides-profile", true, "CLI flags took priority over the profile");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("profile is used when CLI flags are absent", async () => {
  const outDir = await makeTempDir();
  try {
    const input = resolve(fixturesDir, "sample-text.txt");
    const profile = resolve(fixturesDir, "profile-with-avatar.json");
    const { json } = await runBuildNote([
      "--input", input,
      "--out-dir", outDir,
      "--profile", profile
    ]);
    const resolution = json.resolution;
    assert(resolution.avatar.src.value === "https://example.com/test-avatar.png", "profile avatar URL must be used");
    assert(resolution.avatar.src.source === "profile", "avatar source must be 'profile'");
    assert(resolution.author.name.value === "小盖", "profile author name must be used");
    assert(resolution.author.name.source === "profile", "author name source must be 'profile'");
    assert(resolution.author.date.value === "06/20", "profile date must be used");
    assert(resolution.author.date.source === "profile", "date source must be 'profile'");
    record("profile-used-when-no-cli", true, "profile values populated the first image");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("placeholder is used when neither CLI nor profile provides a value", async () => {
  const outDir = await makeTempDir();
  try {
    const input = resolve(fixturesDir, "sample-text.txt");
    const profile = resolve(fixturesDir, "profile-avatar-fallback.json"); // name=小盖, no avatar
    const { json } = await runBuildNote([
      "--input", input,
      "--out-dir", outDir,
      "--profile", profile
      // no --avatar-url, no --avatar-path
      // --author-name omitted, profile provides one
      // --date omitted, profile provides 06/20
    ]);
    const resolution = json.resolution;
    assert(resolution.avatar.src.source === "placeholder", `avatar must fall back to placeholder, got source=${resolution.avatar.src.source}`);
    assert(/^data:image\/svg\+xml/.test(resolution.avatar.src.value), "placeholder avatar must be an inline SVG data URI");
    assert(resolution.author.name.source === "profile", "author name should still come from the profile when present");
    assert(resolution.author.date.source === "profile", "date should still come from the profile when present");
    record("placeholder-avatar-only", true, "avatar fell back to placeholder, profile values preserved");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("placeholder is used for the author name when neither CLI nor profile provides one", async () => {
  const outDir = await makeTempDir();
  try {
    const input = resolve(fixturesDir, "sample-text.txt");
    // No --profile and no --author-name. The default lookup chain finds no
    // profile.json in this isolated temp dir, so the placeholder must be used.
    // The default home-global profile may exist on a developer machine, so
    // we also pass an explicit empty profile path that does not exist by
    // using --profile with a path inside the temp dir.
    const emptyProfilePath = join(outDir, "no-such-profile.json");
    const { json } = await runBuildNote([
      "--input", input,
      "--out-dir", outDir,
      "--profile", emptyProfilePath,
      "--avatar-url", "https://example.com/x.png"
    ]);
    const resolution = json.resolution;
    assert(resolution.author.name.value === "匿名", `expected placeholder author '匿名', got '${resolution.author.name.value}'`);
    assert(resolution.author.name.source === "placeholder", "author name source must be 'placeholder'");
    record("placeholder-author-name", true, "author name fell back to '匿名'");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("a short input produces exactly one first-image HTML and zero body HTML files", async () => {
  const outDir = await makeTempDir();
  try {
    // Use a tiny input that fits in one image.
    const tinyPath = join(outDir, "tiny.txt");
    await writeFile(tinyPath, "短测试文本。\n\n只有一段。", "utf8");
    const { json } = await runBuildNote([
      "--input", tinyPath,
      "--out-dir", outDir,
      "--avatar-url", "https://example.com/a.png",
      "--author-name", "作者",
      "--date", "06/20"
    ]);
    assert(json.image_count === 1, `expected 1 image, got ${json.image_count}`);
    const manifest = await readJson(join(outDir, "manifest.json"));
    assert(manifest.images.length === 1, "manifest should have one image");
    assert(manifest.images[0].slot === "first", "the single image should be the first image");
    const firstHtml = await readFile(join(outDir, "note-01.html"), "utf8");
    assert(/<header class="author">/.test(firstHtml), "the single image should still have the author header");
    record("single-image-first-only", true, "one image, with author header");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("placeholder avatar is an inline SVG and never an invented URL", async () => {
  const outDir = await makeTempDir();
  try {
    const tinyPath = join(outDir, "tiny.txt");
    await writeFile(tinyPath, "测试。", "utf8");
    const { json } = await runBuildNote([
      "--input", tinyPath,
      "--out-dir", outDir,
      "--profile", join(outDir, "no-such.json")
      // no avatar override at all
    ]);
    const avatarSrc = json.resolution.avatar.src.value;
    assert(!/^https?:\/\//.test(avatarSrc), "placeholder avatar must not be an http(s) URL");
    assert(/^data:image\/svg\+xml/.test(avatarSrc), "placeholder avatar must be an inline SVG data URI");
    record("placeholder-is-not-fabricated", true, `placeholder avatar is ${avatarSrc.slice(0, 32)}...`);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
