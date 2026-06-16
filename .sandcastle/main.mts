// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             An agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations, capped by ISSUE_TIMEOUT_MS).
//                               If it produces commits, a reviewer runs in
//                               the same sandbox on the same branch
//                               (1 iteration). All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Merge):            A single agent merges all completed branches
//                               into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";
// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10;

// Maximum wall-clock time allowed for a single issue's implementer phase
// before it is abandoned for this iteration. Without this, one stuck agent
// (e.g. a Docker test-runner hang) can block the whole iteration — including
// other issues that already finished — from ever reaching the merge phase.
// A timed-out issue produces zero commits, so the merge phase simply skips
// it; the planner will re-pick it (with no progress lost, since nothing
// from this attempt was ever committed) on the next iteration.
const ISSUE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
const hooks = {
  sandbox: {
    onSandboxReady: [
      { command: "HUSKY=0 npm install" },
      { command: "git config core.hooksPath /dev/null" }
    ]
  },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree: string[] = [];
// ---------------------------------------------------------------------------
// Agent model
// ---------------------------------------------------------------------------
//
// Using DeepSeek V4 Pro via OpenCode's custom provider config.
// The opencode.json at ~/.config/opencode/opencode.json must have a "deepseek"
// provider block pointing at https://api.deepseek.com with DEEPSEEK_API_KEY.
// The .sandcastle/.env must set OPENCODE_API_KEY=<your DeepSeek key> —
// Sandcastle injects it into the Docker container as OPENCODE_API_KEY,
// and the opencode.json inside the container reads it via {env:OPENCODE_API_KEY}.
//
// deepseek-v4-pro is used for planning and implementation. Reviewer and
// merger use deepseek-v4-flash — cheaper and fast enough for the more
// constrained, single-iteration tasks they perform.
const PLANNER_MODEL     = "deepseek/deepseek-v4-pro";
const IMPLEMENTER_MODEL = "deepseek/deepseek-v4-pro";
const REVIEWER_MODEL    = "deepseek/deepseek-v4-flash";
const MERGER_MODEL      = "deepseek/deepseek-v4-flash";

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent reads the open issue list, builds a dependency graph,
  // and selects the issues that can be worked in parallel right now (i.e., no
  // blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — Output.object parses and validates it.
  // -------------------------------------------------------------------------
  const plan = await sandcastle.run({
    hooks,
    sandbox: docker(),
    name: "planner",
    // One iteration is enough: the planner just needs to read and reason,
    // not write code. (Structured output requires maxIterations: 1.)
    maxIterations: 1,
    agent: sandcastle.opencode(PLANNER_MODEL),
    promptFile: "./.sandcastle/plan-prompt.md",
    // Extract and validate the <plan> JSON into a typed object. Throws
    // StructuredOutputError if the tag is missing, the JSON is malformed, or
    // validation fails — which aborts the loop.
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });

  const issues = plan.output.issues;

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    console.log("No unblocked issues to work on. Exiting.");
    break;
  }

  console.log(
    `Planning complete. ${issues.length} issue(s) to work in parallel:`,
  );
  for (const issue of issues) {
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review
  //
  // For each issue, create a sandbox via createSandbox() so the implementer
  // and reviewer share the same sandbox instance per branch. The implementer
  // runs first (capped at ISSUE_TIMEOUT_MS); if it produces commits, the
  // reviewer runs in the same sandbox.
  //
  // Promise.allSettled means one failing or timed-out pipeline doesn't
  // cancel the others, and doesn't block the iteration from completing.
  // -------------------------------------------------------------------------

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: docker(),
        hooks,
        copyToWorktree,
      });

      try {
        // Run the implementer, capped at ISSUE_TIMEOUT_MS. If it times out,
        // this throws and the issue is treated as having produced no
        // commits — see the rejected-outcome handling below.
        const implement = await withTimeout(
          sandbox.run({
            name: "implementer",
            maxIterations: 100,
            agent: sandcastle.opencode(IMPLEMENTER_MODEL),
            promptFile: "./.sandcastle/implement-prompt.md",
            promptArgs: {
              TASK_ID: issue.id,
              ISSUE_TITLE: issue.title,
              BRANCH: issue.branch,
            },
          }),
          ISSUE_TIMEOUT_MS,
          `implementer for ${issue.id}`,
        );

        // Only review if the implementer produced commits
        if (implement.commits.length > 0) {
          const review = await sandbox.run({
            name: "reviewer",
            maxIterations: 1,
            agent: sandcastle.opencode(REVIEWER_MODEL),
            promptFile: "./.sandcastle/review-prompt.md",
            promptArgs: {
              BRANCH: issue.branch,
            },
          });

          // Merge commits from both runs so the merge phase sees all of them.
          return {
            ...review,
            commits: [...implement.commits, ...review.commits],
          };
        }

        return implement;
      } finally {
        // Always close the sandbox, even on timeout — the timeout only
        // rejects the awaited promise, it does not stop the underlying
        // Docker container by itself. This finally block stops it.
        await sandbox.close();
      }
    }),
  );

  // Log any agents that threw (network error, sandbox crash, timeout, etc.).
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(
        `  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`,
      );
    }
  }

  // Only pass branches that actually produced commits to the merge phase.
  // A timed-out or crashed issue has no commits and is simply skipped here;
  // it remains open on GitHub and the planner will re-pick it next iteration.
  const completedIssues = settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (entry) =>
        entry.outcome.status === "fulfilled" &&
        entry.outcome.value.commits.length > 0,
    )
    .map((entry) => entry.issue);

  const completedBranches = completedIssues.map((i) => i.branch);

  console.log(
    `\nExecution complete. ${completedBranches.length} branch(es) with commits:`,
  );
  for (const branch of completedBranches) {
    console.log(`  ${branch}`);
  }

  if (completedBranches.length === 0) {
    console.log("No commits produced. Nothing to merge.");
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 3: Merge
  // -------------------------------------------------------------------------
  await sandcastle.run({
    hooks,
    sandbox: docker(),
    name: "merger",
    maxIterations: 1,
    agent: sandcastle.opencode(MERGER_MODEL),
    promptFile: "./.sandcastle/merge-prompt.md",
    promptArgs: {
      BRANCHES: completedBranches.map((b) => `- ${b}`).join("\n"),
      ISSUES: completedIssues.map((i) => `- ${i.id}: ${i.title}`).join("\n"),
    },
  });

  console.log("\nBranches merged.");
}

console.log("\nAll done.");
