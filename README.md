# Percy Visual Testing — Plugin for AI Coding Agents

> Visual review loop for agentic UI development. Works in Claude Code, Cursor, Codex, Antigravity, GitHub Copilot, and any AI IDE that reads `AGENTS.md`.

> ⚠️ **Beta** — this plugin is in beta. Capabilities, commands, and behavior may change; feedback welcome via GitHub issues.

When an agent changes UI code, this plugin makes sure a Percy build runs, the diffs are checked against the agent's stated intent, and the change is rejected + iterated on if real bugs are found — all without leaving the editor.

---

## Install

**Claude Code**
```bash
/plugin marketplace add percy/percy-visual-testing-agent
/plugin install percy-visual-testing
```

**Cursor · Codex · Antigravity · Gemini (Code Assist agent mode or CLI)** — any IDE that reads `AGENTS.md` (all major agents do). One command, run in your repo:
```bash
curl -fsSL https://raw.githubusercontent.com/percy/percy-visual-testing-agent/main/install.sh | bash
```

**GitHub Copilot** — same command with `--copilot` (adds the `/percy-*` slash commands to Copilot Chat):
```bash
curl -fsSL https://raw.githubusercontent.com/percy/percy-visual-testing-agent/main/install.sh | bash -s -- --copilot
```

**QA / regression-suite repo** (your automation suite lives in its own repo and you triage scheduled runs) — add `--qa` (combine with `--copilot` if you use Copilot):
```bash
curl -fsSL https://raw.githubusercontent.com/percy/percy-visual-testing-agent/main/install.sh | bash -s -- --copilot --qa
```

The installer only touches your repo: skills → `.percy/skills/`, a short section appended to your `AGENTS.md`, a one-line `GEMINI.md` pointer (created or appended — Gemini reads `GEMINI.md` by default, not `AGENTS.md`), and (with `--copilot`) prompts → `.github/prompts/`. Prefer manual? Copy those files from this repo — that's all it does.

Outside Claude Code/Copilot (Cursor, Codex, Antigravity, Gemini Code Assist agent mode in VS Code, Gemini CLI — any `AGENTS.md` IDE) there are no `/percy-X` slash commands. Ask in plain words ("run the percy setup workflow"), or say: read `.percy/skills/percy-X.md` and follow it.

---

## Setup — one command

```
/percy-setup
```

One command to start — new to Percy, it walks you through account, token, and first baseline (~5 minutes, a few confirmations). Setup detects where your project is and routes you:
- **No Percy yet?** It offers to integrate right there (installs the SDK, wires config, inserts your first `percySnapshot()` calls).
- **No baseline yet?** It walks you through approving your first build.
- **Already running Percy?** It verifies access, hooks the workflow into your repo's agent instructions, and you're done.

You'll need your project's **`PERCY_TOKEN`** in the environment (Percy dashboard → project settings) — setup checks for it and tells you exactly what to do if it's missing. Never paste tokens into the chat. Approving/rejecting builds additionally uses your BrowserStack username + access key; setup covers that too.

> **What the plugin sends.** Every Percy API call carries a `User-Agent` like `percy-visual-testing-agent/0.4.0 (agent=copilot-vscode; channel=install-sh-copilot; role=qa; skill=gate; install=3f9c2a1e) curl/8.7.1` — which coding agent, which workflow, and a random per-repo id. No names, emails, tokens or repo names.

> **MCP is optional.** The plugin talks to Percy's REST API directly — no MCP server required. If you already use the BrowserStack MCP server, the plugin will happily use it where it helps.

---

## Start here

**New to Percy — no visual tests yet.** Install → `/percy-setup` → say yes when it offers to integrate. The agent installs the right Percy SDK for your test framework, inserts the first `percySnapshot()` calls (with your approval), runs the first build, and helps you approve it as the baseline. From then on you're in the loop below. Growing coverage later is one command per file: `/percy-expand-coverage <test file>`.

**Already using Percy.** Install → `/percy-setup` → done. From now on, when you (or your agent) change UI code and open a PR: the intent gets written into the PR, the Percy build is watched automatically, every diff is reviewed against your intent + code, and the merge is gated — approvals become a one-line confirm, real bugs get fixed in a bounded iterate loop, and only the genuinely ambiguous cases ask for your eyes.

> **Got an open PR with a Percy build already?** Run `/percy-gate` directly — it backfills intent from your PR diff and gives you a verdict on the existing build in ~2 minutes. No rebuild needed.

**Coming from Applitools or `toHaveScreenshot()`?** `/percy-migrate` translates your existing checks.

---

## Workflow

```
(one-time)  /percy-integrate           ← wire Percy into an existing test suite
(as needed) /percy-expand-coverage     ← add percySnapshot() to a test file
   ↓
agent edits UI code
   ↓
/percy-visual-intent          ← adds intent section to PR description
   ↓
Percy build runs (CI / /percy-run-build / manual)
   ↓
/percy-review                 ← polls, classifies diffs against intent + code context
   ↓
/percy-gate                   ← rejects + iterates if real bugs found (≤3 loops)
   ↓
visually clean → merge
```

You only ever run `/percy-gate` — `/percy-review` is its engine; don't run both.

---

## Skills

| Skill | Purpose |
|---|---|
| `/percy-setup` | Verify creds + paid tier, register project, detect baseline (cold-start) state |
| `/percy-integrate` | Wire Percy into a project with tests but no visual coverage — install SDK, config, first `percySnapshot()` calls |
| `/percy-expand-coverage` | Analyze a test file, propose + insert `percySnapshot()` at uncovered touchpoints |
| `/percy-migrate` | Migrate from Applitools or in-house screenshot testing (Playwright/Cypress golden files) to Percy |
| `/percy-visual-intent` | Agent drafts visual intent from session, presents for review/edit, injects into PR description |
| `/percy-run-build` | Kick a Percy build locally |
| `/percy-status` | Read latest build state for current branch |
| `/percy-watch` | Background-watch a Percy build (or its GitHub PR check) and auto-invoke `/percy-gate` on completion |
| `/percy-review` | Poll → fetch AI summary → classify diffs vs intent |
| `/percy-gate` | Enforce reject + iterate loop on real bugs (and symmetric auto-approve on clean) |
| `/percy-troubleshoot` | Diagnose Percy problems — `percy doctor` + local probes, common-failure table, live docs lookup |

Full instructions: [AGENTS.md](AGENTS.md).

---

## In CI & regression runs

Local setup is step one — day-to-day, Percy runs in CI. The token moves with it: **`PERCY_TOKEN` becomes a CI secret** (GitHub → Settings → Secrets → Actions), exposed on the test step (`env: PERCY_TOKEN: ${{ secrets.PERCY_TOKEN }}`). `/percy-setup` offers to wire this into your existing workflow.

Two kinds of builds, two behaviors:
- **PR builds** — the full loop: intent → watch → review vs intent + code → gate → fix-iterate.
- **Regression runs** (default branch / scheduled / no PR) — the intent is **accumulated from the PRs merged since the last approved baseline**: the plugin re-reads the `## Percy Visual Intent` sections it wrote into those PRs, so legitimately-merged changes are expected, not noise. Every diff is then classified as *matches a merged PR's intent* (cited), *dynamic noise* (via snapshot history), or a *genuine anomaly* — and the gate switches to **triage**: one confirm approves an all-explained run; anomalies are surfaced with deep links for investigation (no code-fix loop — the cause is a deploy/data/env, not this working tree).

Two honest caveats: regression verdict quality depends on the app team also using the plugin (intent sections in their PRs) — without it, the plugin falls back to PR titles/bodies as weak intent, with lower confidence. And today the triage runs in an interactive IDE session — a scheduled headless recipe (cron + agent CLI posting the triage to Slack, human clicks stay human) is on the roadmap.

---

## Iteration policy

`/percy-gate` auto-iterates up to 3 times, stopping early if:
- Bug count isn't decreasing (delta gate).
- Session snapshot budget exhausted (default 50, configurable via `PERCY_SNAPSHOT_BUDGET`).

In v1, every reject **and approve** decision is confirmed by the human before Percy is actually called. Both actions go to the same `/reviews` endpoint with the same auth (`PERCY_USERNAME` + `PERCY_ACCESS_KEY`) — only the `action` value differs. Auto-approve is gated to fully-clean builds only (zero `likely-bug`, `unplanned-change`, `needs-human`, `flaky-test`, or `asset-capture-issue` verdicts), and is disabled in NO-AI / NO-INTENT degraded modes.

---

## Status

v0.3 — Percy-AI-native, REST-first. The plugin talks directly to `https://percy.io/api/v1/` using `PERCY_TOKEN`. It will switch to Percy MCP once these beta gaps are fixed in `browserstack/mcp-server`:

- `percy_get_ai_summary` returns *change clusters* but not *per-region `visual_quality` data* — plugin currently walks per-comparison to get region-level signal.
- `percy_approve_build` supports `reject` underneath but the docs don't yet surface the action (tracked upstream).
- No dedicated paid-tier signal — plugin infers from `ai-details.total-comparisons-with-ai > 0`.
- No light-payload poll endpoint — plugin polls `/builds/{id}` directly.

## Verdict model

The plugin produces **per-comparison** verdicts (not per-cluster, not per-snapshot — regressions can be in any single comparison):

| Verdict | Meaning | Plugin action |
|---|---|---|
| ✅ expected | Region matches stated intent, OR `change_reason` reads benign/dynamic, OR no code change touches the surface | pass |
| 🛑 likely-bug | Percy flagged `irregularity`, `change_reason` reads unintended, and it doesn't match intent (or violates "unchanged") | recommend reject + iterate |
| ⚠️ unplanned-change | A real code-backed change exists, Percy didn't flag it as a bug, but it isn't in stated intent | flag for human review |
| 🔁 likely-flaky-test | Snapshot history shows recurring incomplete-render captures | don't reject; recommend fixing the test wait condition |
| ⚙️ asset-capture-issue | Percy network-logs flag asset-capture failures for the diff's images | don't reject; surface Percy Snapshot Debug |
| 🙋 needs-human | Genuinely unresolvable from Percy text + code context + intent | surface verbatim reasoning + dashboard link for a ~30-sec human call |

**Percy-AI-native (v0.3).** The verdict logic runs entirely on **Percy's AI text outputs reconciled against the developer's code context**. Two reasons:

1. **Percy already encodes the signal in text.** Each flagged region carries `change_reason` — Percy's own judgment, e.g. *"deliberate CSS color change… not a dynamic variation"* vs *"could be an unintended CSS regression"*. Percy's classifier has already examined the rendered output and written down what it found, so reasoning over that text plus code context works directly from Percy's own conclusions.
2. **Percy-native signal.** Percy's per-region `change_reason` / `change_description` / `visual_quality_reason` come from Percy's own visual classifier — a richer, more specific signal than anything a downstream generic pass could reconstruct. The plugin is built around it.

**The strongest false-positive filter is code context.** If Percy flags a region but no code change in the git diff touches that surface, it's almost certainly dynamic content / fixture variance — not a regression the developer introduced.

**Intent ↔ region matching is the agent's job (semantic reasoning).** The plugin doesn't do Python keyword matching — it gathers Percy's data + code context and asks the host agent to reason.

**Cluster-level bug promotion:** if any comparison in a cluster has `visual_quality: irregularity`, all comparisons in that cluster inherit the bug flag. Percy's AI can flag the same defect in one comparison of a cluster but not another. Promotion corrects for this.

## By-design human fallback

A residual of cases can't be settled from Percy's text + code + intent. These are **routed to human review** (`needs-human`), never silently misclassified:
- `/percy-gate` surfaces Percy's `change_description` + `visual_quality_reason` verbatim + the dashboard deep-link.
- Human confirmation is required before Percy reject (v1 human-in-the-loop); the verdict is a *recommendation*, not a unilateral action.

## Degraded modes

The plugin has four operating modes:

1. **Full mode** — Visual Intent provided + AI coverage on all comparisons. Produces per-comparison verdicts (`expected | likely-bug | unplanned-change | needs-human | likely-flaky-test | asset-capture-issue`). `/percy-gate` can auto-reject + iterate (excluding the flaky/asset/needs-human tiers, which don't trigger reject).
2. **NO-INTENT degraded mode** — AI coverage present but no Visual Intent doc. Produces `candidate-bug | unverified-change` labels only. `/percy-gate` will NOT auto-reject. Strong prompt to run `/percy-visual-intent` first.
3. **Cold-start mode** — no approved baseline yet (first build, or a fresh/upgraded baseline awaiting approval). `/percy-review` detects this and explains it ("this build *is* the baseline — approve it; the next build gets real diffs + AI") instead of returning a confusing NO-AI result.
4. **NO-AI degraded mode** — Percy AI genuinely didn't process the build (free tier, browser pool config, etc.). Surfaces all changed snapshots with dashboard links. `/percy-gate` will NOT auto-reject.

The NO-INTENT gate matters: without a stated intent the plugin cannot reliably distinguish intentional changes from regressions, so it refuses to auto-reject in that mode rather than flag intentional work.

## v0.2 known MCP gaps

These need to be added to `browserstack/mcp-server` for the plugin to switch from REST-direct to MCP-primary:
- `percy_get_smart_debug` — wrap `GET /api/v1/network-logs?comparison_id=<id>` (currently used directly by the plugin for asset-capture detection)
- `percy_get_snapshot_history` — wrap `GET /api/v1/snapshots?project_id=<id>&filter[name]=<n>` (currently used directly for flaky-test detection)
- Existing gaps from v0.1: per-cluster bug verdict in `percy_get_ai_summary`, explicit `reject` action in `percy_approve_build`, dedicated paid-tier signal, light-payload poll endpoint
