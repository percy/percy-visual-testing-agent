#!/usr/bin/env node
// Generate GitHub Copilot artifacts from the canonical Percy skills.
//
// Single source of truth = plugins/percy-visual-testing/skills/<name>/SKILL.md.
// This emits, into plugins/percy-visual-testing/copilot/:
//   - prompts/<name>.prompt.md      → Copilot prompt files (invoked as /<name> in Copilot Chat)
//   - copilot-instructions.md       → thin repo-instructions pointer (AGENTS.md stays canonical)
//
// These are the distributable bundle. /percy:integrate copies them into a user
// repo's .github/ when the user is on Copilot. The skills themselves (SKILL.md +
// AGENTS.md) are untouched, so Claude / Cursor / Codex / Antigravity keep full capability.
//
// Run from the repo root:  node scripts/gen-copilot.mjs   (add --check to verify in CI)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(ROOT, 'plugins', 'percy-visual-testing');
const SKILLS_DIR = path.join(PLUGIN, 'skills');
const OUT_DIR = path.join(PLUGIN, 'copilot');
const PROMPTS_DIR = path.join(OUT_DIR, 'prompts');

const GEN_NOTE = (rel) =>
  `<!-- AUTO-GENERATED from ${rel} by scripts/gen-copilot.mjs — DO NOT EDIT BY HAND. Edit the SKILL and re-run the generator. -->`;

const CHECK = process.argv.includes('--check');

/** Split a SKILL.md into {fm: {name, description, argument-hint}, body}. */
function parseSkill(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('missing frontmatter');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) {
      let v = kv[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      fm[kv[1]] = v;
    }
  }
  return { fm, body: m[2].trim() };
}

/** Rewrite cross-references: Copilot invokes prompts as /percy-review (hyphen), not /percy:review. */
function rewriteRefs(text) {
  return text.replace(/\/percy:([a-z-]+)/g, '/percy-$1');
}

function promptFile({ name, fm, body, relSkill }) {
  const argLine = fm['argument-hint']
    ? `\n> **Argument:** ${fm['argument-hint']}`
    : '';
  return `---
mode: agent
description: "${rewriteRefs(fm.description || '').replace(/"/g, '\\"')}"
---
${GEN_NOTE(relSkill)}

# /${name} — Percy Visual Testing (GitHub Copilot)

> Copilot port of the Percy \`/${name}\` skill. The shared workflow, verdict definitions, and Percy REST/MCP backend rules live in **AGENTS.md** at the repo root — Copilot reads it automatically as primary instructions, so this prompt only carries the skill-specific steps below.${argLine}

${rewriteRefs(body)}
`;
}

function instructionsFile(skills) {
  const rows = skills
    .map((s) => `- \`/${s.name}\` — ${rewriteRefs(s.fm.description || '')}`)
    .join('\n');
  return `${GEN_NOTE('plugins/percy-visual-testing/skills/*/SKILL.md')}

# Percy Visual Testing — GitHub Copilot

This repository uses the **Percy Visual Testing** plugin. The canonical agent
instructions are in **\`AGENTS.md\`** at the repo root — GitHub Copilot reads it
automatically as primary instructions (alongside this file). Do not duplicate
that content here; treat \`AGENTS.md\` as the source of truth for the workflow,
verdict definitions, and the Percy REST/MCP backend.

## Available Percy prompts

In Copilot Chat (VS Code / Visual Studio / JetBrains), type \`/\` and pick one:

${rows}

Typical order: \`/percy-setup\` → \`/percy-integrate\` or \`/percy-expand-coverage\` →
\`/percy-visual-intent\` → \`/percy-review\` → \`/percy-gate\`.

> Copilot CLI does not support prompt files — CLI users still get the \`AGENTS.md\`
> behavior, but invoke the workflow by describing it rather than via \`/percy-*\`.
`;
}

// --- Build the artifact set in memory ---
const skills = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')))
  .map((d) => {
    const skillPath = path.join(SKILLS_DIR, d.name, 'SKILL.md');
    const relSkill = path.relative(ROOT, skillPath);
    const { fm, body } = parseSkill(fs.readFileSync(skillPath, 'utf8'));
    const name = fm.name || d.name;
    return { dir: d.name, name, fm, body, relSkill };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const artifacts = new Map();
for (const s of skills) {
  artifacts.set(path.join(PROMPTS_DIR, `${s.name}.prompt.md`), promptFile(s));
}
artifacts.set(path.join(OUT_DIR, 'copilot-instructions.md'), instructionsFile(skills));

// --- Write or check ---
let drift = false;
fs.mkdirSync(PROMPTS_DIR, { recursive: true });
for (const [file, content] of artifacts) {
  const exists = fs.existsSync(file);
  const current = exists ? fs.readFileSync(file, 'utf8') : null;
  if (current === content) continue;
  if (CHECK) {
    drift = true;
    console.error(`drift: ${path.relative(ROOT, file)} is out of date — run: node scripts/gen-copilot.mjs`);
  } else {
    fs.writeFileSync(file, content);
    console.log(`${exists ? 'updated' : 'wrote'}  ${path.relative(ROOT, file)}`);
  }
}

if (CHECK && drift) process.exit(1);
console.log(CHECK ? 'copilot artifacts up to date ✓' : `done — ${skills.length} prompts + copilot-instructions.md`);
