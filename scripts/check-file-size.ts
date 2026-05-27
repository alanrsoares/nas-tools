#!/usr/bin/env bun
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const MAX_LINES = 400;
const root = join(import.meta.dirname, "..");

const IGNORE = ["node_modules", "dist", "bash", "dotfiles", ".git"];
const EXTENSIONS = new Set([".ts", ".tsx"]);

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) yield path;
  }
}

const violations: { file: string; lines: number }[] = [];

for await (const file of walk(root)) {
  const content = await readFile(file, "utf8");
  const lines = content.split("\n").length;
  if (lines > MAX_LINES) violations.push({ file: relative(root, file), lines });
}

if (violations.length === 0) {
  console.log(`✓ All files within ${MAX_LINES} line limit`);
  process.exit(0);
}

violations.sort((a, b) => b.lines - a.lines);
console.error(`\n✗ ${violations.length} file(s) exceed ${MAX_LINES} lines:\n`);
for (const { file, lines } of violations) {
  console.error(`  ${lines.toString().padStart(4)}  ${file}`);
}
console.error();
process.exit(1);
