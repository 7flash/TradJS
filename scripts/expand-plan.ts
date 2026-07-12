#!/usr/bin/env bun
/**
 * Expand plan file with resolved file contents
 *
 * Usage: bun scripts/expand-plan.ts <plan-file-path>
 *
 * Reads a plan file, extracts file paths marked as "File X:", reads each file's content,
 * and creates a new expanded plan with full file contents included.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PLAN_FILE = process.argv[2];
if (!PLAN_FILE) {
  console.error("Usage: bun scripts/expand-plan.ts <plan-file-path>");
  process.exit(1);
}

const planContent = readFileSync(PLAN_FILE, "utf-8");

// Extract file paths marked as "File X:" or "File 1:", "File 2:", etc.
const filePattern = /###\s*File\s+\d+:\s*`([^\n]+)`/g;
const matches = [...planContent.matchAll(filePattern)];

if (matches.length === 0) {
  console.log("No files found to expand in the plan.");
  process.exit(0);
}

console.log(`Found ${matches.length} files to expand:`);
matches.forEach(([, path]) => console.log(`  - ${path}`));

// Read each file's content
const fileContents: Record<string, string> = {};
for (const [, filePath] of matches) {
  try {
    fileContents[filePath] = readFileSync(filePath, "utf-8");
  } catch (e: any) {
    console.warn(`Warning: Could not read file ${filePath}: ${e.message}`);
    fileContents[filePath] = `// Could not read file: ${e.message}`;
  }
}

// Generate expanded plan
let expanded = planContent;

// Add file contents after each file section
for (const [filePath, content] of Object.entries(fileContents)) {
  const fileSectionMarker = `### File.*?${filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*?\\n`;
  const replacement = `$&\n\n\`\`\`\`\n${content}\n\`\`\`\n\n`;
  expanded = expanded.replace(new RegExp(fileSectionMarker, "s"), replacement);
}

// Write expanded plan
const outputPath = PLAN_FILE.replace(".md", "-expanded.md");
writeFileSync(outputPath, expanded, "utf-8");

console.log(`\nExpanded plan written to: ${outputPath}`);
