#!/usr/bin/env bash
# Percy Visual Testing Agent — one-command install for AGENTS.md-based IDEs
# (Cursor, Codex, Antigravity, Gemini — Code Assist agent mode or Gemini CLI —
# and GitHub Copilot with --copilot).
#
#   curl -fsSL https://raw.githubusercontent.com/percy/percy-visual-testing-agent/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/percy/percy-visual-testing-agent/main/install.sh | bash -s -- --copilot
#   ... | bash -s -- --qa              # QA / regression-suite repo (morning-triage instructions)
#   ... | bash -s -- --copilot --qa    # both
#
# What it does (all inside YOUR repo, nothing global):
#   1. Downloads the Percy skills to .percy/skills/
#   2. Appends a short "Visual review (Percy)" section to your AGENTS.md (creates it if missing)
#   3. Creates/updates GEMINI.md with a one-line pointer to AGENTS.md (Gemini Code Assist
#      and Gemini CLI read GEMINI.md by default, not AGENTS.md)
#   4. With --copilot: also installs .github/prompts/percy-*.prompt.md so /percy-* slash
#      commands work in Copilot Chat
#   5. Records the install channel in .percy/.install-channel (read by the setup workflow
#      for the plugin's User-Agent — no personal data)
#
# Claude Code users: don't use this — install natively instead:
#   /plugin marketplace add percy/percy-visual-testing-agent && /plugin install percy-visual-testing

set -euo pipefail

RAW="https://raw.githubusercontent.com/percy/percy-visual-testing-agent/main"
SKILLS=(percy-setup percy-integrate percy-expand-coverage percy-migrate percy-visual-intent percy-run-build percy-status percy-watch percy-review percy-gate percy-troubleshoot)
COPILOT=false
QA=false
for arg in "$@"; do
  case "$arg" in
    --copilot) COPILOT=true ;;
    --qa) QA=true ;;
    *) echo "Unknown option: $arg (supported: --copilot, --qa)" >&2; exit 1 ;;
  esac
done

echo "Percy Visual Testing Agent — installing into $(pwd)"

# 1. Skills
mkdir -p .percy/skills
for s in "${SKILLS[@]}"; do
  curl -fsSL "$RAW/plugins/percy-visual-testing/skills/$s/SKILL.md" -o ".percy/skills/$s.md"
done
echo "  ✔ skills → .percy/skills/ (${#SKILLS[@]} workflows)"

# 2. AGENTS.md section (append-only; skip if already present)
#    Keep these blocks byte-identical to percy-setup Step 6's hooks (percy-hook v3), plus the
#    one invocation-note line for AGENTS.md-based IDEs. Setup replaces the section in place
#    when the role turns out different (e.g. an app hook in a QA suite) or the marker is older.
if ! grep -q "Visual review (Percy)" AGENTS.md 2>/dev/null; then
  if $QA; then
    cat >> AGENTS.md <<'EOF'

## Visual review (Percy)
<!-- percy-hook v3 role=qa -->

This repo is a Percy regression/QA suite. Morning triage: run `/percy-gate` — it resolves the latest build on the configured regression branch (run `/percy-setup` once to set it), classifies every diff (explained by what shipped / dynamic noise / looks deliberate / anomaly), and one confirm approves an all-explained run.

Outside Claude Code, "/percy-X" means: read `.percy/skills/percy-X.md` and follow it.
EOF
  else
    cat >> AGENTS.md <<'EOF'

## Visual review (Percy)
<!-- percy-hook v3 role=app -->

This repo uses the Percy Visual Testing plugin. When you change UI code:
1. Before/while opening the PR, run `/percy-visual-intent` (it injects the intent section and auto-starts `/percy-watch`).
2. The watcher runs `/percy-gate` automatically when the Percy build finishes — don't merge UI changes before the gate passes.
3. If you skipped intent and a build already exists, run `/percy-gate` directly.
4. If this repo's CI doesn't run Percy, run `/percy-run-build` after pushing — the watcher can't watch a build that never starts.

Outside Claude Code, "/percy-X" means: read `.percy/skills/percy-X.md` and follow it.
EOF
  fi
  echo "  ✔ AGENTS.md — Percy section appended ($($QA && echo "QA suite" || echo "app repo"))"
else
  echo "  ✔ AGENTS.md — Percy section already present, skipped (/percy-setup upgrades it if needed)"
fi

# 3. GEMINI.md pointer (append-only; skip if already present). Gemini Code Assist /
#    Gemini CLI read GEMINI.md by default — a pointer line is enough, and it avoids
#    touching the user's .gemini/settings.json.
if ! grep -q "Percy visual review" GEMINI.md 2>/dev/null; then
  [ -s GEMINI.md ] && echo "" >> GEMINI.md
  echo "Read AGENTS.md and follow it — it includes the Percy visual review instructions." >> GEMINI.md
  echo "  ✔ GEMINI.md — Percy pointer added (Gemini Code Assist / Gemini CLI)"
else
  echo "  ✔ GEMINI.md — Percy pointer already present, skipped"
fi

# 4. Copilot slash commands (optional)
if $COPILOT; then
  mkdir -p .github/prompts
  for s in "${SKILLS[@]}"; do
    curl -fsSL "$RAW/plugins/percy-visual-testing/copilot/prompts/$s.prompt.md" -o ".github/prompts/$s.prompt.md"
  done
  echo "  ✔ Copilot prompts → .github/prompts/ (/percy-setup, /percy-gate, …)"
fi

# 5. Install channel (for the plugin User-Agent; no personal data)
if $COPILOT; then echo "install-sh-copilot" > .percy/.install-channel; else echo "install-sh" > .percy/.install-channel; fi

echo
echo "Done. Next: ask your agent to run the percy-setup workflow (Copilot: /percy-setup)."
echo "You'll need your project's PERCY_TOKEN in the environment — the setup workflow walks you through it."
