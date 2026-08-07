<!-- AUTO-GENERATED from plugins/percy-visual-testing/skills/*/SKILL.md by scripts/gen-copilot.mjs — DO NOT EDIT BY HAND. Edit the SKILL and re-run the generator. -->

# Percy Visual Testing — GitHub Copilot

This repository uses the **Percy Visual Testing** plugin. The canonical agent
instructions are in **`AGENTS.md`** at the repo root — GitHub Copilot reads it
automatically as primary instructions (alongside this file). Do not duplicate
that content here; treat `AGENTS.md` as the source of truth for the workflow,
verdict definitions, and the Percy REST/MCP backend.

## Available Percy prompts

In Copilot Chat (VS Code / Visual Studio / JetBrains), type `/` and pick one:

- `/percy-expand-coverage` — Expand Percy visual coverage in a specific test file. Analyzes the file, finds logical touchpoints that lack a visual checkpoint (after an action, before an assertion, at distinct UI states), proposes percySnapshot() insertions, confirms with you, inserts them, and suggests a build. The 'day-2' companion to /percy-integrate for growing coverage as the app evolves.
- `/percy-gate` — Enforce the visual review loop before a UI change can ship. Runs /percy-review, then auto-iterates on the fix for anything that needs fixing — likely-bugs, unplanned changes the plugin is confident weren't intended, AND any human-rejected build (including after a manual review of a flagged comparison). Surfaces reasoning, rejects on confirmation, prompts the agent to fix, and re-runs — up to 3 iterations with a delta-gate and snapshot budget. The single skill to run before merging UI changes.
- `/percy-integrate` — Integrate Percy into a project that already has a functional test suite but no visual testing yet. Detects the language + test framework, installs the matching BrowserStack Percy SDK + @percy/cli, wires config, inserts the first percySnapshot() calls (with your approval), and suggests a first build. Run this once per project to go from zero to visual coverage.
- `/percy-migrate` — Migrate a project's existing visual testing to Percy. Handles two families: (A) Applitools Eyes — maps eyes.open/check/close, coded regions, and applitools.config.js to percySnapshot(), Percy regions, and .percy.yml; (B) in-house screenshot assertions — Playwright toHaveScreenshot(), cypress-image-snapshot, jest-image-snapshot, WDIO visual service — replacing local golden-file baselines with Percy's server-side baselines. Proposes a full mapping before touching code, and is honest about what has no Percy equivalent.
- `/percy-review` — Poll the latest Percy build for the current branch until it completes, fetch Percy's AI region data + cluster summary + per-comparison bug flags, and reconcile each comparison against the captured Percy Visual Intent plus the developer's code context. Produces a verdict per comparison — expected, ambiguous, likely-bug, or unplanned-change — using agent semantic reasoning over Percy's AI text outputs, not keyword matching.
- `/percy-run-build` — Kick a Percy build for the current change without waiting for CI. Optional — only needed when the project's CI doesn't already run Percy, or for in-loop development before pushing. Prefers percy-cli + the project's existing test command.
- `/percy-setup` — One-time Percy setup for this project. Verifies BrowserStack credentials, registers the project, detects paid-tier access for AI classification, and writes a local config the other Percy skills read from. Run this first.
- `/percy-status` — Read the latest Percy build state for the current branch. No polling, no classification — just a quick status check. Use when you want to know 'is there a build, and is it done yet?'
- `/percy-troubleshoot` — Diagnose why Percy isn't working. Runs local diagnostics first (percy doctor, token validity + role, config sanity, SDK + browser checks), matches the result against the ~10 most common stable failures, and for everything else fetches the relevant BrowserStack docs page live at runtime. Docs-referencing by design — the skill carries symptom-category → docs-URL pointers, never copied docs content.
- `/percy-visual-intent` — Capture the agent's visual intent for the current change and inject it as a section into the PR description (or save it locally if no PR exists yet). The review agent later reads this to classify diffs as expected vs unplanned. Run on commit or before opening a PR.
- `/percy-watch` — Watch for a Percy build to finish processing (via Percy API polling or GitHub PR check status) and auto-invoke /percy-gate when it's ready. Use when the user has just pushed code / opened a PR and wants the gate to fire automatically when the Percy build completes — no manual /percy-gate invocation needed.

Typical order: `/percy-setup` → `/percy-integrate` or `/percy-expand-coverage` →
`/percy-visual-intent` → `/percy-review` → `/percy-gate`.

> Copilot CLI does not support prompt files — CLI users still get the `AGENTS.md`
> behavior, but invoke the workflow by describing it rather than via `/percy-*`.
