# Claude Code Instructions

This file exists for Claude-Code compatibility. The canonical instructions live in [AGENTS.md](AGENTS.md) — please read that.

When working in this repo:
- Plugin manifest: `.claude-plugin/marketplace.json` (top-level marketplace) and `plugins/percy-visual-testing/.claude-plugin/plugin.json` (plugin manifest).
- Skills: `plugins/percy-visual-testing/skills/<skill-name>/SKILL.md`.
- Skills are invoked as `/percy:setup`, `/percy:integrate`, `/percy:expand-coverage`, `/percy:visual-intent`, `/percy:review`, `/percy:gate`, `/percy:run-build`, `/percy:status`, `/percy:troubleshoot`.
