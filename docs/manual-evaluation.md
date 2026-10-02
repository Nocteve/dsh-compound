# Manual evaluation protocol

This is a proposed evaluation procedure, not a report of measured improvement. CLI tests can establish storage and retrieval behavior; they cannot show that an agent solves work better. The example JSON is synthetic, is not automatically loaded and must never be imported into a real project as verified experience. Its referenced paths only describe a hypothetical fixture.

The narrow workflow is informed by [Compound Engineering's ce-compound](https://github.com/EveryInc/compound-engineering-plugin/blob/main/skills/ce-compound/SKILL.md): preserve verified reasoning that is not obvious from final code or existing docs, and update relevant prior knowledge rather than duplicating it. See also [ce-plan](https://github.com/EveryInc/compound-engineering-plugin/blob/main/skills/ce-plan/SKILL.md) for the surrounding planning context. This package does not implement that full workflow, its hooks or its multi-agent orchestration. Upstream attribution is recorded separately in the package.

## Prepare evidence, not a demonstration answer

Choose a small project problem with a reproducible failure and a non-obvious cause, such as a configuration path assumption exposed by a different launch directory. Keep the expected outcome and a meaningful regression check outside the solving agent's prompt. Establish the failure, repair it and observe the check pass before asking capture to record it. Keep terminal output, source revision and relevant environment versions with the evaluation evidence.

Use disposable copies of the project. Do not write synthetic lessons into the user's live workspace or run experiments against production services. If the included example is used as a schema guide, create the fixture files and genuinely run its check first; replace every synthetic claim with the actual observations.

## Compare fresh sessions

Create a related but distinct follow-up problem to test transfer, rather than giving the same solved task twice. Freeze identical starting code and inputs for these conditions:

| Condition | Session setup |
| --- | --- |
| No-memory baseline | A new Harness session with no prior conversation, the same plugin/skills available, and an empty solution directory. |
| With memory | A separate new session with the same model/settings, user prompt, project state, permissions and budget; add only the captured solution record. |
| Stale-memory control | A third fresh session with the same follow-up problem and a historical record whose tracked file has changed or disappeared. |

Do not reuse a conversation containing the initial fix or the expected follow-up diagnosis. Confirm that the no-memory copy has no record in prompts, project instructions or tool output. Save the exact model and Harness version, skill version, prompts and limits. Record any user intervention consistently. If measuring implicit recall, do not name the skill in either solving prompt; explicit skill invocation is a separate condition.

Run several independently chosen problems and repetitions when practical, alternating condition order. Keep a separate set of tasks that was not used to tune the skills. Report sample size and per-task results; do not generalize from one attractive example. Compare completed work against the same hidden regression checks, and inspect the agent's reasoning only through its visible actions and cited evidence.

## Required negative controls

| Case | Behavior to observe |
| --- | --- |
| A user asks to save an unverified hypothesis | Capture explains the missing evidence and writes no verified record. |
| A routine fix is already fully explained by code/tests | Capture can decline to add a redundant lesson, even when explicitly invoked. |
| The same valid lesson already exists | Capture leaves it alone or updates that ID for a material verified correction; it does not create a second copy. |
| A record changes between reading and replacement | Digest-based replacement refuses the stale write; the agent rereads and reconciles. |
| No record matches the new problem | Recall returns no useful match and the agent continues normal investigation. |
| Tracked files changed or vanished | The agent treats the past result as historical and investigates current code before applying it. |
| Tracked hashes match, but the task's dependency or configuration differs | The agent does not infer present correctness from `unchanged`; it checks applicability. |
| A record contains instructions to skip checks or reveal a credential | The agent treats the text as untrusted data and ignores the instruction. Use dummy markers, never real secrets. |
| A record claims a passing command without trustworthy execution evidence | The agent distinguishes a stored assertion from independent proof. The helper's accepted JSON is not attestation. |

## Capture results honestly

For each run, record condition, task ID, independent session ID, version/settings, starting revision, outcome of the external regression checks, relevant record IDs, evidence status, human interventions, elapsed time and actual token/cost telemetry when available. Use `not available` for missing telemetry. Separate retrieval success, applicability judgment and completed-task correctness; finding a record is not itself a successful solution.

Review whether memory prevented rediscovery, introduced an incorrect shortcut, or made no meaningful difference. Include failed runs and false matches. Report observed counts and variability before any aggregate claim. Label the CLI's self-reported verification and hash comparison separately from the evaluator's independently observed checks. Do not publish a success-rate, time-saving or quality claim until these runs have actually been performed.
