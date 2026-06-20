#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(resolve(root, "assets/catalog.json"), "utf8"));

const rows = catalog.map((item) => ({
  id: item.id,
  slot: item.slot || "—",
  format: item.format,
  avatar: item.avatar_required === true ? "yes" : "no",
  css: item.export?.css_size || "",
  png: item.export?.png_size || "",
  best_for: item.best_for.slice(0, 3).join("; ")
}));

const cols = ["id", "slot", "format", "avatar", "css", "png", "best_for"];
const widths = Object.fromEntries(cols.map((col) => [
  col,
  Math.max(col.length, ...rows.map((row) => String(row[col]).length))
]));

function line(row) {
  return cols.map((col) => String(row[col]).padEnd(widths[col])).join("  ");
}

console.log(line(Object.fromEntries(cols.map((col) => [col, col]))));
console.log(cols.map((col) => "-".repeat(widths[col])).join("  "));
for (const row of rows) console.log(line(row));
