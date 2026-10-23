---
agent: agent
description: "Read the latest Percy build state for the current branch. No polling, no classification — just a quick status check. Use when you want to know 'is there a build, and is it done yet?'"
---
<!-- AUTO-GENERATED from plugins/percy-visual-testing/skills/percy-status/SKILL.md by scripts/gen-copilot.mjs — DO NOT EDIT BY HAND. Edit the SKILL and re-run the generator. -->

# /percy-status — Percy Visual Testing (GitHub Copilot)

> Copilot port of the Percy `/percy-status` skill. The shared workflow, verdict definitions, and Percy REST/MCP backend rules live in **AGENTS.md** at the repo root — Copilot reads it automatically as primary instructions, so this prompt only carries the skill-specific steps below.
> **Argument:** [optional: branch name; defaults to current branch]

# Percy Status

Lightweight status check. Returns the most recent Percy build for the given branch (or current branch) without polling or doing any classification work.

## User-Agent (every Percy API call)

Send one identifying User-Agent on **every** Percy REST call (it is how Percy tells plugin traffic apart — no personal data). Build it once per run:

```
PERCY_PLUGIN_UA="percy-visual-testing-agent/0.4.6 (agent=<agent>; channel=<channel>; role=<role>; skill=status; install=<install_id>) curl/8.7.1"
```

- `agent` — `claude-code` if `CLAUDECODE=1` is set; `gemini-cli` if `GEMINI_CLI=1` is set; otherwise name the coding agent you are running in: `copilot-vscode`, `copilot-jetbrains`, `copilot-vs`, `copilot-cli`, `cursor`, `codex`, `gemini-code-assist`, `antigravity` — or `unknown` if unsure.
- `channel` / `install` — `install_channel` / `install_id` from `.percy/config.yml` (`unknown` / `none` if absent). `role` — `repo_role` from the same file (`app` if absent).
- Never put names, emails, tokens, or repo names in it. Keep the trailing `curl/8.7.1` — Percy's edge has blocked unrecognised agents before.

## Steps

### 1. Resolve branch

If `$ARGUMENTS` is blank, use `git rev-parse --abbrev-ref HEAD`. Otherwise use the provided branch name.

### 2. Find the latest build

```
GET /api/v1/builds?filter[branch]=<branch>&page[limit]=1
```

Headers: `Authorization: Token token="$PERCY_TOKEN"`, `User-Agent: $PERCY_PLUGIN_UA` (see above).

### 3. Report

Read these fields from `data[0].attributes`:
- `build-number` → build number
- `web-url` → clickable URL
- `state` → `pending | processing | finished | finished_processing | failed`
- `review-state`, `review-state-reason`
- `total-snapshots`, `total-snapshots-unreviewed`
- `total-comparisons`, `total-comparisons-diff`
- `ai-details.total-potential-bugs`, `ai-details.all-ai-jobs-completed`, `ai-details.summary-status`

Output:

```
Branch: <branch>
Build: #<build-number> · [open in Percy ↗](<web-url>)
State: <state> · review: <review-state> (<review-state-reason>)
Snapshots: <total-snapshots> total · <total-snapshots-unreviewed> unreviewed
Comparisons: <total-comparisons> total · <total-comparisons-diff> with diffs
AI: <total-potential-bugs> potential bugs · summary=<summary-status> · jobs-done=<all-ai-jobs-completed>
Created: <relative time from created-at>
```

If no build exists for this branch, say so and suggest `/percy-run-build`.

If the build is still in progress, suggest the user wait or run `/percy-review` to start polling.

## Important

- Don't poll in this skill. One read, one report, done.
- Don't classify or recommend reject/iterate here. That's `/percy-review` and `/percy-gate`.
