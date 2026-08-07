# Percy Visual Testing — GitHub Copilot bundle

This directory is the **GitHub Copilot adapter** for the plugin. Everything here is
**generated** from the canonical skills (`../skills/*/SKILL.md`) by
[`scripts/gen-copilot.mjs`](../../../scripts/gen-copilot.mjs) — do not hand-edit.

## Why this exists

Claude Code, Cursor, Codex, and Antigravity discover the plugin's skills directly
(`SKILL.md`) and read `AGENTS.md`. **GitHub Copilot** uses a different mechanism:

- **`AGENTS.md`** (repo root) — Copilot reads it automatically as primary
  instructions. This is the *same* file the other IDEs use, so the shared
  workflow + Percy REST/MCP backend carry over with no fork.
- **`.github/prompts/*.prompt.md`** — Copilot's analog to the `/percy:*`
  slash-command skills, invoked as `/percy-review`, `/percy-gate`, … in Copilot
  Chat (VS Code / Visual Studio / JetBrains).

So the only Copilot-specific artifacts are the prompt files (one per skill) and a
thin `copilot-instructions.md` that points back at `AGENTS.md`. The skills stay
the single source of truth; nothing about the other IDEs changes.

## Contents

- `prompts/<name>.prompt.md` — one generated prompt per skill.
- `copilot-instructions.md` — thin repo-instructions pointer + prompt index.

## Distribution

These read from the **user's** repo, not a marketplace. `/percy:integrate`
scaffolds this bundle into a user repo's `.github/` when the user is on Copilot
(copying `prompts/` → `.github/prompts/`, `copilot-instructions.md` →
`.github/copilot-instructions.md`, appending rather than clobbering).

## Regenerating

```bash
node scripts/gen-copilot.mjs          # regenerate after editing any SKILL.md
node scripts/gen-copilot.mjs --check  # CI: fail if any artifact is out of date
```
