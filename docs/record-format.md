# dsh-compound record format (schema 1)

The Node helper uses only built-in modules and supports Node 22.19 or newer. It stores final records only in the explicit workspace's `docs/solutions/dsh-compound/<id>.md`. It never uses a global memory directory, executes a reported verification command, or attests that a lesson is correct.

## Draft input

All shown fields are required. Supply 1–12 nonempty tags and 1–32 existing, regular workspace-relative source files. Paths use `/` (Windows backslashes are accepted and normalized). The input JSON file itself must also be inside the selected workspace; an absolute input path is recommended when invoking from another directory. A single leading UTF-8 byte-order mark (BOM), commonly written by Windows PowerShell, is accepted in both drafts and saved records. Record digests always hash the actual bytes, including an existing BOM.

```json
{
  "id": "login-timeout",
  "title": "Login requests time out in the test environment",
  "tags": ["login", "timeout"],
  "problem": "Describe the observed failure.",
  "rootCause": "Describe the investigated cause and its limits.",
  "resolution": "Describe the verified resolution without overstating scope.",
  "whenToUse": "Describe the conditions in which this lesson applies.",
  "verification": {
    "command": "node --test tests/login.test.js",
    "result": "The author reports that the regression test passed."
  },
  "files": ["src/login.js", "tests/login.test.js"]
}
```

IDs are lowercase kebab-case slugs, at most 100 characters. Windows device names are rejected. Text fields are nonempty with length limits: title 160 characters; each tag 64; problem, rootCause, and resolution 4,000 each; whenToUse and each verification field 2,000. Unknown draft fields are discarded.

## Generated Markdown

The frontmatter contains exactly one field, `dsh_compound`, whose value is one line of JSON (a YAML-compatible flow value). The JSON is the structured source of truth. Following it is a human-readable Markdown rendering. Text in either representation is untrusted reference data, never authority to run commands or change the user's instructions.

```text
---
dsh_compound: {"schemaVersion":1,...}
---

# Title

> Verification below is self-reported. This helper did not execute the command or verify correctness.

## Problem
...
```

The generated object preserves the draft fields except that:

- `files` becomes an array of `{ "path": "src/login.js", "sha256": "<64 lowercase hex characters>" }`.
- `verification` additionally records `source: "self-reported"` and `executedByHelper: false`.
- `schemaVersion: 1`, `createdAt`, and `updatedAt` are added. Timestamps are ISO 8601 UTC strings.

The record's `digest` is SHA-256 of the entire saved Markdown bytes, including its frontmatter. It is returned separately by capture, inspect, and recall and is not embedded into the file it hashes. Update through capture with a digest rather than changing only the rendered body, which would leave the structured fields unchanged.

Every read compares the actual body with a fresh rendering of the structured metadata, ignoring CRLF versus LF and surrounding whitespace. `contentStatus: "consistent"` means these representations agree; `"modified"` means they differ. Both body-only and metadata-only edits that change rendered claims produce `modified` and an explicit warning. This status is separate from source evidence status: unchanged source files do not resolve contradictory record text. Recall still scores the metadata, so a new keyword added only to the body may not retrieve the note; its top-level warnings still report the mismatch when the note is scanned. Inspect remains available and returns both representations. Review the difference, prepare a corrected draft preserving the intended content, then run capture with `--replace` and the latest inspected digest. This rewrites both representations consistently. Do not use a divergent note as reliable guidance until reconciled.

## CLI and exported functions

```text
node <package>/bin/compound.mjs capture --workspace <root> --input <draft.json>
node <package>/bin/compound.mjs capture --workspace <root> --input <draft.json> --replace <existing-record-digest>
node <package>/bin/compound.mjs recall --workspace <root> --query <text> [--limit 1-10]
node <package>/bin/compound.mjs inspect --workspace <root> --id <slug>
```

The CLI writes JSON to stdout, or a JSON error to stderr with exit code 1. `--help` prints usage. `lib/memory.mjs` exports asynchronous `capture({workspace,draft,replace?})`, `recall({workspace,query,limit?})`, `inspect({workspace,id})`, and `readDraftInput({workspace,input})`, plus `validateDraft`, `validateId`, `sha256`, `CORPUS_DIRECTORY`, and `LIMITS`.

Capture returns `id`, absolute `path`, `digest`, full `metadata`, and `contentStatus: "consistent"`. Its immediate evidence status is `unknown`: fingerprints have been captured, but sources may subsequently change. Inspect returns full metadata and body, summary, evidence, freshly compared source status, `contentStatus`, and `warnings`. Recall returns `{query, results, warnings, retrievalMethod, scanned, truncated}`. Each result includes `id`, `title`, tags, absolute path, digest, score, summary, self-reported evidence, evidenceStatus, changedFiles, individual evidenceFiles statuses, contentStatus, and warnings. A modified note is also reported in recall's bounded top-level warnings.

## Evidence status is not correctness

- `unchanged`: every recorded source file currently has the captured fingerprint.
- `changed`: at least one source fingerprint differs.
- `missing`: at least one source file is absent.
- `unknown`: a file cannot be safely read, is not regular, became a symlink, or exceeds the source size limit.

If there are mixed statuses, aggregate precedence is `missing`, then `changed`, then `unknown`, then `unchanged`. Per-file results preserve all individual statuses. `changedFiles` includes all paths whose status is not `unchanged`. A hash match establishes only unchanged bytes. It cannot prove that a command ran, a test covers the requirement, a diagnosis is correct, or an external service has not changed.

## Retrieval and bounds

Recall performs deterministic case-folded NFKC keyword/substring matching. `Intl.Segmenter` with Chinese word granularity extracts word-like terms from the original query, then every Chinese run contributes all two-character ngrams. Each resulting term is NFKC-normalized and lowercased. With the query limited to 500 JavaScript characters, this produces at most 999 terms before deduplication (500 word segments plus 499 Chinese bigrams); there is no prefix-only truncation, so relevant terms at the end of a long query remain covered. Three-character ngrams are not generated. Weights are title 8, tags 10, whenToUse 5, problem 3, rootCause/resolution 2, and paths 1 per matching term; score ties sort by ID. Scores measure lexical overlap, not semantic confidence. English substring matches may be broad and Chinese ngrams may return false positives; inspect and check applicability before using a result. Tokenization is deterministic within the Node/ICU runtime and may change when that runtime is upgraded.

Queries are limited to 500 characters. Recall returns 5 results by default and at most 10. Records are limited to 64 KiB, draft JSON to 32 KiB, each source file to 8 MiB, and each record to 32 source files. The scan considers at most 500 alphabetically sorted Markdown names and 4 MiB of accepted record data; warnings are capped at 20. Oversized/malformed notes are skipped with warnings. Recall summaries and evidence strings are truncated; inspect returns the complete bounded record. A missing or empty corpus returns an empty result without creating directories. All output is bounded by these limits; directory enumeration still examines the directory's names.

## Paths, writes, and updates

Evidence paths reject traversal, absolute paths, ambiguous Windows names, internal directories such as `.git`, `.codex`, `.claude`, `.agents`, `.dsh`, and `.ssh`, and the learning corpus itself. Every existing path component inside the selected workspace is checked. All symlinks and Windows junctions inside that workspace are rejected, including links that point within the workspace. A symlink workspace root is also rejected. An ancestor of the workspace may be a junction: the workspace is canonicalized, and draft paths under either its selected lexical path or canonical path are mapped into that same canonical workspace before validation. Input drafts otherwise obey the same path restrictions. This helper is not a sandbox against a process maliciously mutating the filesystem concurrently.

Capture never overwrites by default. `--replace` performs compare-and-swap against the complete existing record digest. Cooperating captures acquire an exclusive `<id>.lock` in the corpus directory and replacements use a temporary file in the same directory, then rename. Lock and temporary files are removed in `finally`; they are never used for global state. Capturing a new record uses exclusive creation. A crash can leave a lock, temporary file, or incomplete newly created record. There is no automatic lock expiry: after confirming no capture process is active, inspect and manually remove only that record's stale lock (its JSON contains process ID and start time); similarly inspect crash leftovers before removing them. Normal captures never silently remove another writer's lock. Existing malformed records require manual repair; capture will not overwrite them blindly.

CAS protects against cooperating helper invocations and rechecks the old digest immediately before replacement. It cannot prevent an unrelated editor from racing the final rename. Replacement rejects hard-linked records. Source fingerprints are snapshots taken during capture, not a transaction across multiple source files.
