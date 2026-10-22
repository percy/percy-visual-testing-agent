# Percy Visual Testing — Agent Instructions

This repository is the **Percy Visual Testing plugin** for AI coding agents. It enforces a closed-loop visual-review workflow so that any UI change an agent makes is checked against a Percy build before it ships.

`AGENTS.md` is the canonical instruction file for non-Claude IDEs (Codex, Antigravity, Gemini, Cursor). Claude Code reads `CLAUDE.md`, which points back to this file.

---

## What this plugin enforces

When an AI agent (or a human paired with one) changes UI code, the following must happen before the change is considered done:

1. **Capture visual intent** in the PR description — what is *meant* to change visually, what should stay the same. Done by `/percy-visual-intent`.
2. **A Percy build runs** — usually via the existing CI/test integration; optionally kicked off locally via `/percy-run-build`.
3. **Poll until the build completes** and pull Percy's AI region data, cluster narratives, per-comparison bug flags, and reasoning. Done by `/percy-review`.
4. **Reconcile per comparison against the captured intent + code context.** Each comparison is classified as one of these verdicts (v0.3):
   - **expected** — matches intent, OR `change_reason` reads benign/dynamic, OR no code change touches the surface
   - **likely-bug** — Percy flagged irregularity, `change_reason` reads unintended, and it doesn't match intent (or violates an "unchanged" invariant)
   - **unplanned-change** — a real code-backed change exists, Percy didn't flag it, but it isn't in stated intent → flag for human
   - **needs-human** — genuinely unresolvable from Percy text + code context + intent → surface verbatim + dashboard link
   - **likely-flaky-test** — snapshot history shows the same incomplete-render pattern (blank / spinner / pre-load capture) in past builds → wait-condition issue, not a UI regression
   - **asset-capture-issue** — Percy's network-logs flagged `asset_capture_failure` for image resources in the diff → broken images caused by Percy's capturer, not the UI
5. **Gate the build.** `/percy-gate` auto-iterates on the fix for anything that needs fixing: **likely-bugs**, **unplanned changes the plugin is confident weren't intended** (`actionable_unintended`), and **any human-rejected build** (incl. after a manual review of a flagged/`needs-human` comparison — Case D). It recommends a Percy reject, prompts the agent to fix, and re-runs. Hard cap **3 iterations**, with a delta-gate (stop if the iterate-set count isn't decreasing) and a snapshot budget (default 50/session). Genuinely ambiguous `needs-human` + plausibly-deliberate unplanned changes are handed to a person, not auto-iterated.

**Percy-AI-native.** The plugin reasons over Percy's AI **text** outputs — `change_reason` (Percy's deliberate-vs-unintended judgment), `change_description`, `visual_quality_reason` — reconciled against the developer's **code context** (git diff, PR body, commits, conversation). This keeps the plugin grounded in Percy's own per-region classifier signal. The agent does the intent ↔ region semantic matching — no Python keyword logic. The one mechanical rule is **cluster-level bug promotion**: if any comparison in a cluster shows `irregularity`, every comparison in that cluster inherits the bug flag.

**Code context is the strongest false-positive filter:** a Percy-flagged region with no matching change in the git diff is almost always dynamic content / fixture variance, not a regression.

**Regression / QA suites.** The loop above is the PR loop; dedicated regression/QA-suite repos work differently. `/percy-setup` stamps `repo_role: regression-suite` plus the `regression_branch` (scheduled runs often build a dedicated branch like `pre_prod`, sometimes visible only as a `PERCY_BRANCH` env var in CI) and `app_repos` (where the app code lives) into `.percy/config.yml`. There is no per-run intent doc — intent is **implicit and accumulated**: `/percy-review` harvests the `## Percy Visual Intent` sections of app-repo PRs merged since the last approved regression build (time-windowed across `app_repos`). `/percy-gate` then runs **Case R triage** instead of the fix-iterate loop: diffs matching merged intent or dynamic noise → one-confirm approve; anomalies → surfaced for investigation; mixed runs use **per-snapshot reviews** (approve the explained snapshots so the baseline advances, flag only the anomaly snapshots via `request_changes` — never a snapshot-scoped `reject`, which rejects the whole build). Verdicts are sharpest when the app repos' PRs carry Percy Visual Intent sections; without them the plugin matches each change to a PR by its code change (then its description) and says which it used.

---

## Skills

`/percy-X` is a Claude Code slash command. In IDEs without slash commands (Cursor, Codex, Antigravity, Gemini Code Assist agent mode, Gemini CLI), it is shorthand for: read the corresponding skill file (`.percy/skills/percy-X.md` in an installed repo; `plugins/percy-visual-testing/skills/percy-X/SKILL.md` in this repo) and follow it.

| Skill | When to run | Purpose |
|---|---|---|
| `/percy-integrate` | Day 0, project has tests but no Percy | Detect stack, install the matching Percy SDK + `@percy/cli`, wire config, insert the first `percySnapshot()` calls |
| `/percy-expand-coverage` | Day 2, growing coverage on a file | Analyze a test file, propose + insert `percySnapshot()` at uncovered touchpoints |
| `/percy-migrate` | Day 0, project already has Applitools or in-house screenshot tests | Map existing checks (Eyes calls, `toHaveScreenshot()`, golden files) to `percySnapshot()` + Percy baselines |
| `/percy-setup` | First time, per project | Verify BrowserStack creds, register Percy MCP, detect paid tier |
| `/percy-visual-intent` | On commit / before opening a PR | Inject a `## Percy Visual Intent` section into the PR description |
| `/percy-run-build` | Optional, when no CI runs Percy | Kick a local Percy build via `percy exec` or MCP |
| `/percy-status` | Quick check | Read the latest build state for the current branch |
| `/percy-review` | After a Percy build completes | Poll, fetch AI summary, classify each diff against intent |
| `/percy-gate` | Before merge | Wraps `/percy-review`, enforces reject + iterate on real bugs |
| `/percy-troubleshoot` | Anything Percy misbehaves | Local diagnostics (`percy doctor`, token/config/browser probes) → known-failure table → live docs fetch |

---

## Backend: Percy REST API (v0.1) → MCP (v0.2)

v0.1 of this plugin talks directly to the Percy REST API (`https://percy.io/api/v1`). The BrowserStack MCP server's Percy tools are in beta (`@browserstack/mcp-server@1.2.15-beta.2`) and have gaps we're tracking; once those land we'll switch to MCP-primary.

### Auth

Set `PERCY_TOKEN` for project-scoped reads/writes. Headers used on every call:

```
Authorization: Token token="$PERCY_TOKEN"
User-Agent: percy-visual-testing-agent/<version> (agent=<coding agent>; channel=<install channel>; role=<repo_role>; skill=<skill>; install=<install_id>) curl/8.7.1
```

(The `User-Agent` identifies plugin traffic — which coding agent, which skill — with no personal data; each skill spells out how to build it. Keep the trailing `curl/8.7.1`: Percy's edge has blocked unrecognised agents before.)

### Endpoints we use

| Purpose | Endpoint | Notes |
|---|---|---|
| List builds for a branch | `GET /builds?filter[branch]=<branch>&page[limit]=1` | Most recent first |
| Get a build (with AI summary) | `GET /builds/{id}?include=build-summary&include-metadata=true` | Pull `included[].build-summaries[0].attributes.summary` (JSON string → array of change clusters) |
| Per-comparison detail | `GET /comparisons/{id}?include=head-screenshot.image,base-screenshot.image,diff-image,ai-diff-image,browser.browser-family,comparison-tag` | `applied-regions[].classification` tells you which regions Percy flagged as bugs; `ai-details.total-potential-bugs` is the per-comparison bug count |
| Approve / reject / request changes | `POST /reviews` (JSON:API) | Body: `{ data: { type: "reviews", attributes: { action: "reject" \| "approve" \| "unapprove" \| "request_changes", reason }, relationships: { build: { data: { type: "builds", id: <build_id> } } } } }` |

### AI-summary shape (v1)

`included[].build-summaries[0].attributes.summary` is a JSON string. Once parsed, it's an array of *change clusters*:

```json
[
  {
    "title": "Hero main heading text extended with appended em-dash...",
    "occurrences": 1,
    "snapshots": [
      {
        "snapshot_id": "1234567890",
        "comparisons": [
          { "comparison_id": 1234567891, "width": 289, "height": 125, "bounding_boxes": ["TM01IP"] }
        ]
      }
    ]
  }
]
```

**Important caveats:**
- Build-summary is **skipped** on large builds (`ai-details.summary-status: "skipped"`, `summary-reason: "too_many_comparisons"`). Plugin must handle this — fall back to per-comparison scan, grouped by snapshot.
- The summary tells you *what changed*, not *which clusters are bug-flagged*. To get the bug verdict, walk each cluster's comparisons, fetch them, and check `applied-regions[].classification === "bug"` or `ai-details.total-potential-bugs > 0`.
- `ai-details.ai-enabled` is the *AI auto-approve* toggle on the project — it can be `false` even when AI analysis IS present. **Don't gate on this field.** Gate on `total-comparisons-with-ai > 0` instead.

### Paid-tier detection

Probe one recent build for the project. If `ai-details.total-comparisons-with-ai > 0` or `ai-details.summary-status === "ok"`, the account has Percy AI. Otherwise, ask the user once and persist the answer in `.percy/config.yml`.

### Known MCP gaps (v0.2 work)

When the MCP server fixes these, the plugin switches to MCP-primary:

1. `percy_get_ai_summary` should return per-cluster *bug verdict*, not just *change clusters* — currently the plugin must walk per-comparison to assign verdicts.
2. `percy_approve_build` needs a `reject` action surfaced cleanly (the underlying `/reviews` endpoint supports it but the docs at `docs/percy-tools.md` don't enumerate it).
3. Paid-tier signal would benefit from a dedicated field, not inferred from AI-summary presence.
4. Polling-friendly build-state endpoint (light payload) for the wait loop.

---

## Paid-tier gating

`/percy-review` and `/percy-gate` rely on Percy's AI summary + bug classification, which are paid features. Plugin detects free-tier by probing one recent build for `ai_summary`; if absent, falls back to asking the user once, then disables classification-dependent skills. `/percy-visual-intent` and `/percy-run-build` continue to work on free tier.

---

## Iteration policy

Inside `/percy-gate`:
- **Hard cap:** 3 auto-iterations per session.
- **Delta gate:** stop early if iteration N has ≥ bug count of N-1.
- **Snapshot budget:** stop early if total snapshots used this session ≥ `PERCY_SNAPSHOT_BUDGET` (default 50).

All caps are configurable via env vars. Surface the stop reason to the user.

In v1, the agent surfaces the reject recommendation and waits for human confirmation before calling Percy reject. v2 will auto-reject high-confidence cases.

---

## Working agreement (for agents editing this repo)

- Skills are plain markdown — no build step.
- Skills must work identically across Claude Code, Cursor, Codex, and Antigravity. Avoid IDE-specific tool calls unless gated by an "if you are <IDE>" branch.
- **GitHub Copilot support is additive, never subtractive.** Copilot reads this `AGENTS.md` automatically (primary instructions) plus `.github/prompts/*.prompt.md` for slash commands. Those prompt files are **generated** from `skills/*/SKILL.md` by `scripts/gen-copilot.mjs` into `plugins/percy-visual-testing/copilot/` — the SKILLs stay canonical, the Copilot bundle is derived. After editing any skill, run `node scripts/gen-copilot.mjs` (CI runs `--check`). Never hand-edit the generated bundle, and never trim a skill to Copilot's lowest common denominator — degrade per-IDE via "if your IDE supports X" branches instead.
- Reference Percy MCP tools by their canonical names; if MCP is unavailable, describe the equivalent REST call.
- Do not invent Percy capabilities. If a tool doesn't exist, say so and degrade gracefully.
- Treat Percy's bug classification as authoritative. Do not soften with disclaimers about AI accuracy.
