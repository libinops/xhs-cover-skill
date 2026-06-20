#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

const html = arg("html");
const url = arg("url");
const outDir = resolve(process.cwd(), arg("out-dir", "xhs-carousel"));
const prefix = arg("prefix", "note");
const selector = arg("selector", ".scene");
const scale = Number(arg("scale", "2"));
const chrome = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const moduleName = arg("playwright", process.env.PLAYWRIGHT_MODULE || "playwright");

if ((!html && !url) || !Number.isFinite(scale) || scale < 1) {
  console.error("Usage: node scripts/capture-xhs-carousel.mjs --html <file.html> --out-dir <folder> [--prefix note] [--scale 2]");
  console.error("       node scripts/capture-xhs-carousel.mjs --url <local-url> --out-dir <folder>");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import(moduleName));
} catch (error) {
  console.error(`Unable to import Playwright from "${moduleName}".`);
  console.error("Install Playwright or pass --playwright /absolute/path/to/playwright/index.mjs.");
  console.error(error.message);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

const target = url || pathToFileURL(resolve(process.cwd(), html)).href;
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const page = await browser.newPage({
  viewport: { width: 900, height: 1200 },
  deviceScaleFactor: scale,
});

await page.goto(target, { waitUntil: "load" });
await page.evaluate(() => document.fonts?.ready);
await page.waitForTimeout(500);

const scenes = await page.$$(selector);
if (scenes.length === 0) {
  await browser.close();
  throw new Error(`No ${selector} element found`);
}

const outputs = [];
// Always pad to at least 2 digits so file names match the build-note output
// (note-01.png, note-02.png, ...) regardless of count.
const digits = Math.max(2, String(scenes.length).length);
for (let i = 0; i < scenes.length; i++) {
  const file = resolve(outDir, `${prefix}-${String(i + 1).padStart(digits, "0")}.png`);
  await scenes[i].screenshot({ path: file });
  const rect = await scenes[i].boundingBox();
  outputs.push({
    file,
    index: i + 1,
    pixels: {
      width: Math.round((rect?.width || 0) * scale),
      height: Math.round((rect?.height || 0) * scale)
    }
  });
}

const source = basename(html || url);
await writeFile(resolve(outDir, `${prefix}-manifest.json`), JSON.stringify({
  source,
  selector,
  scale,
  count: outputs.length,
  outputs
}, null, 2));

console.log(JSON.stringify({ outDir, count: outputs.length, outputs }, null, 2));
await browser.close();
