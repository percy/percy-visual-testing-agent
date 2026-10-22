---
agent: agent
description: "The one command for reviewing a Percy build, for developers and QA alike. Developer PR loop: runs /percy-review, surfaces real bugs and unintended changes, rejects on confirmation, has the agent fix them and re-runs (up to 3 iterations, delta-gate, snapshot budget). QA / regression-suite repos (repo_role: regression-suite): morning triage of the latest nightly or regression run — explains each diff from the app PRs merged since the last approved run, approves explained and noise snapshots, flags unexplained ones and anomalies, and reports them the way the team files bugs; no code edits. Reviewing someone else's PR build: approve or request changes plus a PR comment. Every Percy write and every bug report waits for the human's yes."
---
<!-- AUTO-GENERATED from plugins/percy-visual-testing/skills/percy-gate/SKILL.md by scripts/gen-copilot.mjs — DO NOT EDIT BY HAND. Edit the SKILL and re-run the generator. -->

# /percy-gate — Percy Visual Testing (GitHub Copilot)

> Copilot port of the Percy `/percy-gate` skill. The shared workflow, verdict definitions, and Percy REST/MCP backend rules live in **AGENTS.md** at the repo root — Copilot reads it automatically as primary instructions, so this prompt only carries the skill-specific steps below.
> **Argument:** [optional: build ID; defaults to latest build on current branch]

# Percy Gate

The enforcement skill. Wraps `/percy-review` and turns its per-comparison verdicts into action: surface real bugs with reasoning, reject the build, prompt the agent to iterate, re-review. Loop terminates on a clean review, hitting the iteration cap, the delta-gate, or the snapshot budget.

In v1, **every reject decision is confirmed by the human** before Percy is actually called. v2 will auto-reject high-confidence cases.

## Prerequisites

- `/percy-setup` has been run.
- `.percy/config.yml` exists.
- A Percy Visual Intent section **should** exist for the current branch (run `/percy-visual-intent` first if not). If missing, the skill enters NO-INTENT degraded mode — see Step 7. Auto-reject and the iteration loop are disabled in that mode.

## User-Agent (every Percy API call)

Send one identifying User-Agent on **every** Percy REST call (it is how Percy tells plugin traffic apart — no personal data). Build it once per run:

```
PERCY_PLUGIN_UA="percy-visual-testing-agent/0.4.3 (agent=<agent>; channel=<channel>; role=<role>; skill=gate; install=<install_id>) curl/8.7.1"
```

- `agent` — `claude-code` if `CLAUDECODE=1` is set; `gemini-cli` if `GEMINI_CLI=1` is set; otherwise name the coding agent you are running in: `copilot-vscode`, `copilot-jetbrains`, `copilot-vs`, `copilot-cli`, `cursor`, `codex`, `gemini-code-assist`, `antigravity` — or `unknown` if unsure.
- `channel` / `install` — `install_channel` / `install_id` from `.percy/config.yml` (`unknown` / `none` if absent). `role` — `repo_role` from the same file (`app` if absent).
- Never put names, emails, tokens, or repo names in it. Keep the trailing `curl/8.7.1` — Percy's edge has blocked unrecognised agents before.

## Loop policy

Three stop conditions, all enforced:

1. **Hard cap:** maximum 3 iterations per session (configurable via `PERCY_GATE_MAX_ITERATIONS`).
2. **Delta gate:** stop early if iteration N has ≥ the *iterate-set* count (likely-bugs + confident-unintended unplanned, or the rejected build's changed comparisons) of iteration N-1. The agent is thrashing, not converging.
3. **Snapshot budget:** stop early if total snapshots used this session ≥ `PERCY_SNAPSHOT_BUDGET` (default 50). Count only **iteration builds** — builds the loop itself triggers — the initial CI build doesn't count (it was spent before the gate ran, and charging it means one nightly-sized build exhausts the budget before iteration 1). The default can be raised via `PERCY_SNAPSHOT_BUDGET`; `/percy-setup` may size it as `max(50, 3× typical build size)` from its recent-builds probe.

On any early-stop, surface the reason explicitly:
> Stopping at iteration 2: bug count went 3 → 3 (delta-gate). Handing back to human.

## Steps

### Iteration state (per session)

```
iteration = 0
prior_likely_bug_count = null
snapshots_used = 0
```

### 1. Run `/percy-review`

Invoke `/percy-review` and collect the structured verdict object. The relevant per-comparison fields:
- `verdict` — one of `expected | likely-bug | unplanned-change | needs-human | likely-flaky-test | asset-capture-issue`
- `regions[]` — Percy's per-region data (titles, descriptions, `change_reason`, `visual_quality`)
- `reasoning` — the agent's per-comparison rationale
- `code_change_matched` — whether a code change in the git diff corresponds to this comparison's flagged surface

Aggregate (v0.3 verdict tiers):
- `likely_bugs` — comparisons with verdict `likely-bug`
- `unplanned_changes` — comparisons with verdict `unplanned-change`. Split by the `actionable_unintended` flag from `/percy-review`:
  - **`actionable_unplanned`** — `unplanned-change` where the agent is **confident the change is unintended** (a real side-effect / ripple the developer did not mean to introduce — not a plausibly-deliberate-but-unstated change). These are fixable without a human deciding, so they go into the **iterate set** alongside bugs.
  - **`ambiguous_unplanned`** — `unplanned-change` that could plausibly be a deliberate-but-unstated change. These still go to human review (Case B) — the agent shouldn't auto-revert something the developer may have meant.
- `needs_human` — comparisons the agent couldn't resolve from Percy text + code context + intent
- `likely_flaky_tests` — comparisons with verdict `likely-flaky-test` (snapshot history / dynamic-content)
- `asset_capture_issues` — comparisons with verdict `asset-capture-issue` (Percy network-logs flagged asset failures)
- `expected` — comparisons with verdict `expected`

**Iterate set** = `likely_bugs` + `actionable_unplanned`. This is the set the plugin will reject + auto-iterate on. (Bugs *and* changes the plugin is confident weren't intended both get fixed; only genuinely ambiguous cases wait for a human.)

(There is no `ambiguous` tier — `/percy-review` resolves those inline via `change_reason` + code context, producing `expected`, `likely-bug`, `unplanned-change`, or `needs-human`.)

### 2. Decide

**BrowserStack credentials (approve / flag / network-logs).** These are your **BrowserStack** username + access key — from BrowserStack → Account → Profile — in `BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY`, the same pair the BrowserStack SDKs use (so teams on BrowserStack Automate usually have them set already). The older names `PERCY_USERNAME` / `PERCY_ACCESS_KEY` are still accepted: use whichever pair is set. Look in `.percy/.env` and the repo's other gitignored secrets files (`.env`, `.env.local`, `.envrc`) first, then the shell environment. **People often have more than one BrowserStack account, so check the pair can see this project before relying on it:** `GET /api/v1/builds/<build id>` with HTTP Basic auth must return 200. If the first pair gets 401/403 and another pair is available (e.g. `BROWSERSTACK_*` in the shell vs `PERCY_*` or the repo's `.percy/.env`), try that one. If none can, say so plainly — *"Your BrowserStack credentials (`<username>`) don't have access to this Percy project — use an account in the project's Percy organization"* — and continue in recommendation mode. Never ask the user to paste credentials into the chat.

**Pre-flight — write creds.** Before showing **any** reject/approve confirm, check `write_creds_verified` in `.percy/config.yml` (or `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` — or the older `PERCY_USERNAME` + `PERCY_ACCESS_KEY` — in the env or `.percy/.env`). If missing, say so **at the top**, in one line, with the fix — *"I can't approve or flag yet: add `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` (BrowserStack → Account → Profile) to `.percy/.env` in your editor, then re-run"* — and present the Percy actions as recommendations with dashboard deep-links instead. Never walk the user through a y/n confirm and then 401 after they say yes. **Questions that don't need Percy credentials — like the bug-reporting route (Step R2) — are still asked as real choices.**

**Ask questions as real choices.** Every confirm and every multiple-choice question (approve? flag? which reporting route? save to repo or just for me?) goes through your agent's structured question tool when it has one — Claude Code's ask-user-question tool, Copilot's or another IDE's equivalent — with the recommended option first and labeled *(Recommended)*. Only when no such tool exists, ask one numbered question at a time in plain text and wait for the answer. Never bury a question inside a paragraph or a bullet list.

**Case D — the build was already rejected by a human (check this FIRST):**

*(PR-author flow only. In regression mode → Case R; when reviewing someone else's PR → Case V. Neither edits code.)*

Before evaluating the plugin's own verdicts, look at the resolved build's `review-state` (from `/percy-review` Step 1). If it is `rejected` / `changes_requested` **and the plugin did not just reject it itself this invocation** — i.e. a *human* rejected it (directly in Percy, or after a Case B handoff where they reviewed a flagged comparison and decided it's wrong) — then the decision is already made. **Do not re-derive a verdict to decide whether to reject; go straight to the iterate-on-fix loop.**

- Run `/percy-review` only to gather *what changed and why* (Percy's per-region `change_description` / `visual_quality_reason` for the build's changed comparisons) — not to re-decide.
- **Confirm before fixing (Step 4's fix-confirmation gate).** The reject already happened, so skip Step 3 — but the agent still must NOT edit code without a go-ahead. Surface what was rejected + what you'd change, and ask. Then **jump to Step 4** with that list.
- The same loop caps apply (Step 5): 3 iterations, delta-gate, snapshot budget.

This is the key path that makes iteration fire on **any** reject — the plugin's own *and* a human's — including after a manual review of a `needs-human` / flagged comparison.

**Case R — regression run (no PR): triage, don't iterate.**

If `/percy-review` ran in **regression mode** (regression branch / non-PR / scheduled run — intent = what was **merged in the app repos since the last approved baseline**, per review Step 7.4), the gate's job changes: there is no PR diff to fix, so the **iterate loop does not apply** and **no code is edited**. Instead, triage into four buckets (review Step 8's regression rules decide which):

| Bucket | What's in it | Action |
|---|---|---|
| ✅ **Explained** | `expected` — matches a merged PR (link the PR and say what the match rests on — see the table rules) | Approve (snapshot-scoped), one confirm for the batch |
| 🔁 **Noise** | `expected` (noise) / `likely-flaky-test` — dynamic content, rendering variation, flaky capture per history | Approve with the explained batch — list them separately so the user sees what's noise |
| ⚠️ **Unexplained** | `unplanned-change` — Percy says valid, but nothing merged explains it (possible deploy, rollback, config or data change) | **Do not approve.** Flag via `request_changes`, then report (Step R2) |
| 🛑 **Anomaly** | `likely-bug` — Percy flagged a defect that nothing merged explains, or an explained surface that changed in a broken-looking way | Flag via `request_changes`, then report (Step R2) |
| 🙋 **Needs your eyes** | `needs-human` | Leave unreviewed; show Percy's reasoning verbatim + deep link |

**Percy's own bug flags stay the primary defect signal**: merged-PR context only *explains* a change — it never clears an `irregularity` on its own.

**Step R0 — carry forward last run's open flags (do this before triaging).** ⚠️ Verified live: when a snapshot was flagged `changes_requested` and the problem is **not** fixed, the next run captures the same pixels, diffs **0** against the flagged capture, and Percy marks it **`approved` / `no_diffs` automatically** — the anomaly silently becomes baseline and never shows up as a diff again. So the gate must remember:
1. Find the previous regression build(s) on this branch since the last fully-approved one (`GET /builds?filter[branch]=<branch>`), and collect snapshots whose `review-state` was `changes_requested`.
2. For each, look at the same-named snapshot in this build:
   - **diff 0 / `no_diffs`** → **🔁 Still unresolved** — the flagged state is still live (Percy auto-approved it only because nothing changed). Never count it as clean.
   - **a diff that restores the pre-flag look** ("prices visible again", "teal is back") → **✅ Fixed** — approve it with the Explained batch and close/comment on its ticket.
   - **a different new diff** → triage it normally.
3. Show **Still unresolved** as its own bucket at the top of the summary, with the ticket from the earlier run, and offer to comment on that ticket (*"still present in nightly #10"*) rather than filing a new one. Percy's own `approved` state on these snapshots doesn't change that; say so plainly.

**Present ONE build's triage, in this exact shape** (same table style as the developer flow — users compare them):

> **Nightly #<n> triage** — [build #<n> ↗](<build web-url>) · `<regression_branch>` · <N> changed snapshots · compared with build #<base> ([↗](<base web-url>), <approved | unreviewed | changes requested>)
> Merged in `<app repo>` since then: [#<pr> <title>](<pr url>), [#<pr> <title>](<pr url>) — or "nothing".

| # | Snapshot | Browsers @ widths | Bucket | What changed (Percy) | Why | Suggested action | Open |
|---|---|---|---|---|---|---|---|
| 1 | Home | Chrome, Firefox, Safari, Edge @ 375, 1280 | ✅ Explained | Primary buttons navy → teal | [PR #12 Brand refresh](<pr url>) — intent section says buttons go teal; changes `assets/site.css` | Approve | [Home ↗](<this build's snapshot deep-link>) |
| 2 | Journal | … | 🔁 Noise | Promo banner text changed | Percy: *"rotating promotional content…"*; changed in 4 of last 5 runs | Approve | [Journal ↗](…) |
| 3 | Shop | … | 🛑 Anomaly | Product prices missing on all cards | Percy flagged `irregularity`; no merged PR touches prices (#12 only `site.css` colour, #13 only footer copy) → deploy / hotfix / config | Flag (request changes) + report | [Shop ↗](…) |

Rules for the table:
- **One row per snapshot** (that's what gets approved or flagged). If a snapshot has several changes, list them in "What changed" and give the worst bucket.
- **Every PR citation is a Markdown link** with the PR title, plus the file(s) that explain the change — the user will open the PR's *Files changed* tab to show it. Never a bare "#12".
- **Every "Open" link points into THIS build** (`…/builds/<this build>/changed/<snapshot_id>`). Earlier builds may be linked only in the "Still unresolved" section below, clearly labeled as earlier.
- **Say what the explanation rests on, plainly and confidently** — never jargon like "weak intent". Three cases:
  - PR has a Percy Visual Intent section that covers it → *"[PR #12 Brand refresh](…): its Visual Intent says primary buttons go teal; changes `assets/site.css`."*
  - No Visual Intent section, but the PR's **code change** clearly produces it → *"[PR #13 Footer tagline](…) edits this exact footer line in `blog.html`."* This is a strong match — state it as fact; at most add *"(the PR has no Visual Intent section, so this is matched on its code change)"*.
  - Only the PR's **title or description** points to it and the code change doesn't show it clearly → *"Probably [PR #14 Pricing copy](…): its description mentions price labels, but its code change doesn't show this line — worth a glance."* Suggested action: *"Approve after a quick look"*. This is the only case that should sound tentative.
- After the table, one line of totals: *"Approve 4 · Flag 1 · Needs your eyes 0"*.

**🔁 Still unresolved from earlier runs** (only if Step R0 found any) — a second, short table: Snapshot · flagged in [build #<n> ↗](<that snapshot in the earlier build>) · ticket link · now: *"no diff tonight — Percy auto-approved it because nothing changed since the flagged capture; the problem is still live"* · [current capture ↗](<this build>).

Then ask, in this order:

1. **Approve the Explained + Noise snapshots?** — `action: "approve"` + the `snapshots` relationship (one confirm, listing them with their matched PR#s). Scoping is respected: exactly those snapshots flip to `approved`, so the baseline advances for those surfaces. If *everything* is Explained/Noise, this is the whole job — the QA time-saver: snapshot-by-snapshot eyeballing becomes one line.
2. **Flag the Unexplained + Anomaly snapshots?** — `action: "request_changes"` + the `snapshots` relationship (one confirm, with Percy's reasoning + deep links). Scoping is respected: the flagged snapshots go `changes_requested`, the build becomes `changes_requested (changes_requested_snapshot)`, and the approvals from (1) stick.
3. **Report them?** — Step R2.

The `/reviews` relationship shape:
  ```json
  "relationships": {
    "build": { "data": { "type": "builds", "id": "<build_id>" } },
    "snapshots": { "data": [{ "type": "snapshots", "id": "<snapshot_id>" }, ...] }
  }
  ```

⚠️ **Never send `action: "reject"` with a `snapshots` relationship.** Verified live: reject **ignores the snapshot scope entirely** — it rejects the whole build, wipes any per-snapshot approvals already made, and leaves the build terminally locked (`409 "Can only review non-rejected builds"` on every further action, including `unapprove`). Per-snapshot "reject" in Percy is `request_changes`. A build-level `reject` is only acceptable when the run is anomalies-only **and** the user explicitly wants the whole build rejected.

**Baseline mechanics:** a `changes_requested` build still becomes the next build's base build. The approved snapshots' surfaces are baseline now (next run diffs them at 0.0), and the flagged snapshot diffs against its *flagged* capture — so after the external fix lands, the next morning shows a "fix restored parity" diff on exactly that snapshot; approve it and the run is clean. **If the fix has NOT landed, the flagged snapshot diffs 0 and Percy auto-approves it (`no_diffs`)** — which is why Step R0 carries open flags forward.

Anomalies came from *outside* this repo (a deploy, rollback, backend/data change, environment drift) — hand them off for investigation ("correlate with what shipped since the last approved run"); never start a code-fix loop in a regression-suite repo.

**Step R2 — Report flagged snapshots (learn the team's route once, confirm every time).**

Reporting goes wherever *this team* reports bugs. Don't assume Jira or GitHub.

*Saved route?* Read `reporting:` from `.percy/config.local.yml` (per person, wins if present) or `.percy/config.yml` (team-wide). If present, propose it as the default — *"File 2 issues in Jira WEB like last time (one per anomaly, label `visual-regression`)? [Enter] / change / skip"* — and act only on a yes.

*No saved route (first run)?* **Discover, then ask** — never a blank question:
1. Look for signals: Jira keys in recent app-PR titles/branches (`gh pr list -R <app_repo> --state merged --limit 30 --json title,headRefName` → `[A-Z][A-Z0-9]+-\d+`); an Atlassian/Jira tool available to you (MCP) or a `jira` CLI on PATH; GitHub issues labeled `bug`/`regression`/`visual` in the app repos; issue templates (`.github/ISSUE_TEMPLATE/`).
2. Propose the likely route with what you found, then ask how the team does it:
   - **New ticket per anomaly**
   - **One ticket for the whole run** (anomalies as a checklist)
   - **Comment on the existing ticket of the suspected PR** (the Jira key or issue linked from the PR merged in the window)
   - **GitHub issue in the app repo**
   - **Something else** (Slack channel, internal tracker) → you draft the text for the user to paste
   - **Don't report**
3. Ask only the details that route needs (project key, issue type, labels, component; never assignee unless they name one). **For Jira, read the project's create metadata first** (issue types + required fields — via your Jira tool, or `GET /rest/api/3/issue/createmeta/<project>/issuetypes/<typeId>`) and offer the real options: enterprise projects often **don't have the type you'd guess** (e.g. no `Task`) and **require custom fields** (e.g. *Source*, *Work category*) that make a create fail with 400 until set. Ask for each required field once, using its allowed values, and save the choices so later runs file in one step.
4. **Ask where to save it**, recommending the repo: *"Save this in `.percy/config.yml` so the whole QA team files the same way (recommended — reporting is a team convention), or just for you in `.percy/config.local.yml`?"* Write:
   ```yaml
   reporting:
     route: jira-new | jira-run | jira-comment-pr | github-issue | draft | none
     jira:                                                                    # jira-* routes
       project: WEB
       issue_type: Bug
       labels: [visual-regression]
       required_fields: { customfield_10104: { id: "10545" } }               # saved answers for required custom fields
     github: { repo: owner/app, labels: [visual-regression] }              # github-issue
     saved_by_choice: repo | local
   ```
   `.percy/config.local.yml` must be gitignored — add it if missing. Never store tokens here.

*Filing (after the yes):*
- **Content per anomaly:** title `Visual regression: <snapshot> — <Percy change_title>`; body with snapshot, browsers/widths, Percy's `change_description` + `change_reason` quoted, the snapshot deep link, the build link, suspected PR(s) from the window (or "nothing merged explains it — possible deploy/rollback"), and the regression branch + build number.
- **Jira:** use the Atlassian/Jira tool you have (MCP), else the `jira` CLI; if neither is available, fall back to drafting the ticket text and say why.
- **GitHub:** `gh issue create -R <repo> --title … --body-file … --label …`.
- **Don't duplicate:** before filing, look for an open ticket for this snapshot + regression branch; if one exists, add a comment with the new build instead of a new ticket. Jira: JQL on the saved project/labels plus a summary match. GitHub: **list, don't search** — `gh issue list -R <repo> --label <label> --state open --json number,title` and match titles locally; `gh issue list --search` goes through GitHub's search index, which lags just-created issues (verified: a same-minute search missed the issue just filed).
- Print every created/updated ticket as a link.

Loop caps don't apply (no loop). Everything else — human confirm before every approve / flag / report, verbatim Percy reasoning, deep links — unchanged.

**Case V — reviewing someone else's PR build (reviewer mode).**

When the user is **reviewing**, not authoring — the PR's author isn't the current user (`gh pr view <n> --json author` vs `gh api user -q .login`), the user says "review PR #123's Percy build", or the repo is `repo_role: regression-suite` and the PR is in an app repo — the gate must not offer to edit code. Run `/percy-review` against that PR's build (intent = the PR's `## Percy Visual Intent`, else its title/body + diff via `gh pr diff`), then:
- **Clean** (Case A conditions) → *"Approve the Percy build? (y/n)"* → `action: "approve"`.
- **Anything to fix** (likely-bug / unplanned / needs-human) → *"Request changes on the Percy snapshots and leave a PR comment? (y/n)"* → snapshot-scoped `request_changes` + `gh pr review <n> -R <repo> --comment --body-file …` summarising each finding with Percy's reasoning and deep links. **No fix loop, no commits** — the author fixes; the reviewer's job ends at the verdict.
- When the author pushes a fix, the next `/percy-gate` on that PR re-reviews the new build the same way.

**Case A — clean (zero likely-bugs, zero unplanned-changes, zero needs-human, zero flaky-tests, zero asset-capture-issues):**

Every comparison is `expected` — the build is visually clean per stated intent. Recommend auto-approving the Percy build and **wait for human confirmation** (symmetric with the reject path; same v1 human-in-the-loop guardrail).

Surface a summary table so the user can sanity-check what they're about to approve:

> ✅ **Percy gate verdict: PASS**
>
> All N snapshots changed in ways that match stated intent:
> - [`<snapshot>`](<snapshot deep-link>) (<browser> @ <width>px) — matches intent: "<intent clause>"
> - [`<snapshot>`](<snapshot deep-link>) (<browser> @ <width>px) — matches intent: "<intent clause>"
> - … (truncate to 10 rows; show "…and X more" if more)
>
> Proceed with approve? (y/n)

Approve guardrails — only run this path if **all** of these hold:
- `likely_bugs`, `unplanned_changes`, `needs_human`, `likely_flaky_tests`, `asset_capture_issues` are all empty
- At least one comparison was AI-processed (don't auto-approve in NO-AI mode)
- Visual Intent was present (don't auto-approve in NO-INTENT mode — that's already gated upstream by `/percy-review`)

On confirm: call the Percy reviews endpoint with `action: "approve"` — same auth and endpoint as reject, different action value. See "On confirm: approve" below for the request body.

If the user says no, stop without calling the API. The Percy build stays in `unreviewed` state — same outcome as before this skill ran.

**Case A.1 — only `likely-flaky-test` verdicts (no real bugs):**
- Print: "🔁 Percy gate found N flaky-test captures (snapshot pre-loaded). Build itself is visually clean."
- For each `likely-flaky-test` comparison, surface:
  > `<snapshot_name>` was [blank / incomplete / loader-rendered] in [X of last 20] builds. Likely a wait-condition bug in the test, not a UI regression.
  > Recommend fixing the test's page-load wait before next run. [open the flagged snapshot ↗](<dashboard_url>)
- Do NOT auto-reject. The build passes UI review; test instrumentation is the real fix.

**Case A.2 — only `asset-capture-issue` verdicts:**
- Print: "⚙️ Percy gate found N broken-image comparisons caused by Percy's asset capturer, not UI regressions."
- Surface the failing resource URLs from `/api/v1/network-logs`.
- Recommend reviewing Percy's [Snapshot Debug docs on asset capture](https://www.browserstack.com/docs/percy/troubleshoot/self-debug) — usually a CDN allowlist or `network-idle` timeout issue.
- Do NOT auto-reject.

**Case B — only `needs-human` + `ambiguous_unplanned` (iterate set is empty):**
- This is the residual that genuinely needs a person: comparisons the agent couldn't resolve, plus unplanned changes that *might* be deliberate-but-unstated (so the plugin won't auto-revert them). Actionable unplanned changes are NOT here — they're in the iterate set (Case C).
- Don't recommend reject. Surface these comparisons with their dashboard links and Percy's per-region reasoning verbatim.
- **If the human then rejects** one of these in Percy after reviewing, the next `/percy-gate` invocation picks it up via **Case D** and iterates on the fix.
- Output format:
  > ⚠️ Percy gate found N comparisons needing human review (no clear bugs).
  > 
  > Needs human (couldn't resolve from Percy reasoning + code context + intent):
  > 1. `<Snapshot>` / `<Browser>` / `<width>px` — Percy: "<region change_description>"
  >    Percy's concern: "<visual_quality_reason>"
  >    Agent's note: "<why it couldn't decide>"
  >    [open the flagged snapshot ↗](<dashboard_url>)
  > 
  > Unplanned changes (diff exists, not in intent, Percy didn't flag as bug):
  > 1. `<Snapshot>` / `<Browser>` / `<width>px` — Percy: "<region change_description>"
  >    Not covered by stated intent. Verify this wasn't an unintended side effect.
  >    [open the flagged snapshot ↗](<dashboard_url>)
- Wait for human acknowledgement. Do not reject. Hand off — the human approves/rejects in Percy.

**Case C — iterate set non-empty (likely-bugs and/or confident-unintended unplanned changes):**

Surface the iterate set with full Percy reasoning, grouped by snapshot. Include both `likely_bugs` and `actionable_unplanned` — for the latter, frame it as "a real change that wasn't in your stated intent and looks unintended." (If the developer says it *was* deliberate, the fix is to add it to the Visual Intent and re-run, not to revert — call this out in the prompt.)

> 🛑 Percy gate found N items to fix — M likely-bugs + K unintended changes (iteration <i>/<cap>):
>
> Snapshot `<name>`:
>   - <browser> @ <width>px — Region: "<change_title>"
>     Percy: "<change_description>"
>     Why it's a bug: "<visual_quality_reason>"
>     Why this isn't intent: <agent's reasoning>
>     Cluster bug-promoted from sibling: yes/no
>     [open the flagged snapshot ↗](<dashboard_url>)
>
> Snapshot `<name>`:
>   - ...
>
> I believe these are wrong and want to try to fix them. Reject this build and let me attempt the fix? (y/n)
> — If any are actually deliberate, tell me and I'll add them to the Visual Intent instead of changing code.

Wait for human confirmation. This single yes authorizes **both** the Percy reject **and** the agent's fix attempt. **Do not auto-reject — and do not edit code — without it (v1).**

### 3. On confirm: reject *or* approve

Both actions hit the same Percy reviews endpoint, with different `action` values. Auth differs from reads:

- Both `reject` and `approve` require **BrowserStack user credentials** (`BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`), not the project `PERCY_TOKEN`.
- Project tokens return 403 on `/reviews`.

**On confirm: reject** (Case C):
```
POST /api/v1/reviews
Authorization: Basic <base64(BROWSERSTACK_USERNAME:BROWSERSTACK_ACCESS_KEY)>
User-Agent: $PERCY_PLUGIN_UA
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "reviews",
    "attributes": {
      "action": "reject",
      "reason": "Auto-rejected by percy-gate: <N> likely-bug(s) — <short summary>"
    },
    "relationships": {
      "build": { "data": { "type": "builds", "id": "<build_id>" } }
    }
  }
}
```

**On confirm: approve** (Case A):
```
POST /api/v1/reviews
Authorization: Basic <base64(BROWSERSTACK_USERNAME:BROWSERSTACK_ACCESS_KEY)>
User-Agent: $PERCY_PLUGIN_UA
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "reviews",
    "attributes": {
      "action": "approve",
      "reason": "Auto-approved by percy-gate: all <N> snapshot diff(s) match stated visual intent"
    },
    "relationships": {
      "build": { "data": { "type": "builds", "id": "<build_id>" } }
    }
  }
}
```

Verify the response status is 201. If 401 ("No user found"), the BrowserStack creds are missing or aren't linked to a Percy user — surface the actual error and point the user at `/percy-setup` (Step 1c adds and verifies the access key), then stop. On 409, **read the error body before concluding anything**: "approve action is already performed" / "reject action is already performed" means the build was already actioned — surface and stop without retrying. But a 409 can also fire **right after build finalization** while snapshots are still processing — body: `"Can only review finished builds"` (the build can sit in `state: processing` for a minute or more after the CLI prints "Finalized"). For that body, poll `GET /builds/<id>` until `state: finished`, then retry the review once.

### 4. Fix-confirmation gate, then hand iteration back to the agent

**The agent must NOT edit code to "fix" a visual issue without an explicit go-ahead.** Before the first fix attempt of the loop, the user has to have confirmed:
- **Case C** — the combined "reject this build and let me attempt the fix? (y/n)" already covers it (one yes authorizes reject *and* fix).
- **Case D** (human already rejected) — there was no reject prompt, so ask the fix-confirmation here before editing:
  > 🔧 This build was rejected. I think these <N> changes are wrong and want to try to fix them:
  > - <snapshot> / <browser> @ <width>px — <one-line: what's wrong>
  > Want me to attempt the fix? (y/n) — if any were actually intended, tell me and I'll leave them.

On **no** → stop and hand back to the human; don't touch code. On **yes** → proceed with the prompt below. (The 3-iteration cap, delta-gate, and snapshot budget still bound everything after the yes.)

Prompt (covers Case C *and* Case D — plugin-rejected or human-rejected):
> Iteration <i>: build rejected. Fix the <N> items above — **while preserving the developer's stated visual intent.** Your job is "keep the intent, remove the defect," NOT "make Percy green by any means."
>
> **Before editing, re-read the `## Percy Visual Intent` for this branch** (PR description or `.percy/intent-<branch>.md`). Then fix under these rules:
> 1. **Preserve the stated intent.** The fix must keep expressing what the developer declared they wanted. Change the *implementation* that causes the defect — not the goal.
> 2. **Fix the cause, not the change.** Prefer the smallest edit that removes the defect while keeping the goal — e.g. `height` → `min-height`, raise/clamp the cap, adjust the one property that overflows — over reverting the rule or commit that introduced the intended change.
> 3. **Never silently revert to baseline.** If a candidate fix would make the build identical to the approved baseline (the intended change fully gone), that is a **FAILED fix, not a success** — do not do it.
> 4. **If the intent genuinely can't be satisfied without the defect, STOP and ask — don't decide for the user:** "This change can't be done as stated without <defect>. Options: (a) revert it, (b) try alternative approach X, (c) you adjust the intent." Wait for their call.
>
> - For an **unintended change**: if it was actually deliberate, add it to the Visual Intent and re-run instead of reverting; otherwise fix per the rules above.
> - When done, commit and either let CI re-run Percy or run `/percy-run-build`. Then re-invoke `/percy-gate`.

> **Worked counter-example — don't "fix" by reverting the feature.** Intent: *"give content cards a uniform fixed height so the grid lines up"* (`.card { height: 150px; overflow: hidden }`). Percy correctly flags a bug: text-heavy cards get **clipped**. The WRONG fix is to delete the `height`/`overflow` — that removes the intended change entirely and leaves the build identical to `main` (no diff). The RIGHT fix keeps the goal and removes the defect: `height` → `min-height: 150px` (uniform-ish, no clipping), or a taller cap, or clamping the text. Reverting to baseline is the one outcome that is *never* a valid fix when the developer declared that change as intended.

Track (delta-gate uses the full iterate set, not just bugs):
```
iteration += 1
prior_iterate_count = len(iterate_set)   # likely_bugs + actionable_unplanned (Case C); or the rejected build's changed-comparison count (Case D)
# snapshots_used counts ITERATION builds only — add each fix-attempt build's
# total_snapshots when it lands; the initial CI build is never charged.
```

Stop and return — the agent fixes, kicks a new build, and re-invokes `/percy-gate`.

### 5. On next invocation: check stop conditions first

When `/percy-gate` is re-invoked:
- **Empty-diff guard (check FIRST, when `iteration > 0`).** If the new build has `total-comparisons-diff === 0` vs the approved baseline — i.e. the change vanished — the fix likely **reverted the intended change** instead of fixing the defect. Do **not** treat this as a PASS. Surface:
  > ⚠️ The fix appears to have undone your change entirely — this build has no diff vs the approved baseline, so the intended change is gone. That's not a valid fix. Handing back: re-apply the intent and fix the *defect* (e.g. `min-height` instead of removing `height`), or tell me to stop.
  
  Stop the loop and hand to the human. Never auto-approve an empty-diff build that came out of an active fix iteration.
- If `iteration >= max_iterations` → stop, surface "Hit max iterations. Handing back to human."
- If `len(new_iterate_set) >= prior_iterate_count` → stop, surface "Not converging (was N, now M items). Handing back to human."
- If `snapshots_used >= snapshot_budget` → stop, surface "Snapshot budget exhausted."
- Otherwise: go to Step 1 with the new build, update `prior_iterate_count` from the new iterate-set count.

### 6. NO-AI mode (degraded path)

If `/percy-review` returns NO-AI fallback output:
- **Do not auto-reject AND do not auto-approve** — there's no AI signal to justify either action.
- Show the user all changed snapshots with dashboard links.
- Recommend manual review.
- Surface the cause (free tier vs browser-pool config vs browser-upgrade limbo — per `/percy-review` Step 8.2).
- Stop. No iteration loop.

### 7. NO-INTENT mode (degraded path)

If `/percy-review` returns NO-INTENT degraded output (verdicts like `candidate-bug` and `unverified-change` instead of `likely-bug` etc.):
- **Do not auto-reject AND do not auto-approve.** Without a stated intent, auto-rejecting would frequently flag intentional changes; auto-approving would silently ship regressions Percy correctly flagged.
- Surface the full candidate-bug list to the user with dashboard links and Percy's `change_description` + `visual_quality_reason` verbatim.
- Strong prompt to run `/percy-visual-intent` first:
  > ⚠️ Cannot recommend a binary verdict — no Visual Intent was provided. Each ⚠️ candidate-bug below needs your eyes to decide if it's intentional or a regression.
  > 
  > To get auto-verdicts, run `/percy-visual-intent`, then re-run `/percy-gate` — the existing build is re-reviewed; no rebuild needed. The intent doc lets the agent filter intentional changes (A/B tests, feature toggles, redesigns) from genuine bugs.
- Show all candidate-bug comparisons with deep-links. Show all unverified-change comparisons collapsed (one count, not per-row) since they're low-priority.
- Stop. No iteration loop in NO-INTENT mode either.

## Important

- **One human confirmation per reject in v1.** Don't reject builds without explicit user approval.
- **No code edits without a go-ahead (v1).** The agent never edits code to "fix" a visual issue until the user confirms — the combined reject+fix yes (Case C) or the fix-confirmation (Case D). It surfaces *what it found and why it thinks it's wrong* first; the user can also say "that was intentional" to send it to intent instead of a code change.
- **Surface Percy reasoning verbatim** (`change_description`, `visual_quality_reason`). The user needs to see *why* Percy thinks something is a bug, not your paraphrase.
- **Links must be specific + clickable** (see `/percy-review` → "Link formatting"). Every link you surface to the user is a **Markdown** link — `[<snapshot> — <browser> @ <width>px](<deep-link>)`, never a bare/angle-bracketed URL (those render as plain text in the IDE) and never inside a code fence. **Deep-link to the specific snapshot that has the issue** (`…/changed/<snapshot_id>`), not the build root — if a single comparison is flagged, point straight at it. Reserve the build-root link for build-wide actions (e.g. "approve the whole build"). When you tell the user to review the GitHub PR, link it too: `[PR #<n>](<pr_url>)`.
- **The delta-gate matters more than the iteration cap.** If iteration 2 has the same bugs as iteration 1, the agent isn't converging — stop early.
- **Snapshot budget protects the user's Percy quota.** Don't iterate past it even if other conditions allow.
- **State is per-session.** If the user closes the IDE and reopens, the iteration counter resets. That's intentional — a fresh session deserves a fresh budget.
- **Reject and approve use the same auth.** Both actions hit `POST /api/v1/reviews` with HTTP Basic Auth (`BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`, BrowserStack creds), not the project `PERCY_TOKEN`. Only the `action` field differs (`"reject"` vs `"approve"`).
- **Auto-approve is symmetric with auto-reject.** Both require human confirmation in v1; both stop without calling the API if the user declines; both refuse to fire in NO-AI or NO-INTENT degraded modes. Treat them as mirrored paths — same guardrails, same auth, same UX.
