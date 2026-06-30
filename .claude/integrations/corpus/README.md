# Regression corpus

Golden cases that pin the **deterministic** toolchain (gates + detectors) the
self-improvement loop touches. Run by `regression-corpus.ts`:

```bash
npx tsx .claude/integrations/regression-corpus.ts          # human output, exits 1 on a regression
npx tsx .claude/integrations/regression-corpus.ts --json
```

It guards against learned rules, gate edits, threshold changes, and prompt/config
evolution silently regressing behavior — a known-good feature starting to fail
(false positive) or a known-bad one starting to pass (false negative). It does **not**
re-run the LLM workflow end-to-end (not reproducible in a script); it exercises the
gates/analyzers that those changes flow through.

## Managing cases (CLI)

`corpus-manager.ts` (A-02) scaffolds, lists, and validates cases so the corpus stays
consistent:

```bash
npm run corpus:add -- --name "modal-close" --tags "L-03,UI"   # scaffold a gate case
npm run corpus:add -- --name "b11-fail" --kind detector        # scaffold a detector case
npm run corpus:list -- --tag UI                                # filter by tag (or --kind)
npm run corpus:validate                                         # schema-check + runnable check
```

`corpus:validate` also runs in `npm run test:kit` via `test:corpus-manager` (unit tests of
the validator/scaffolder). It reports schema errors as hard failures and verdict
mismatches as a regression warning (the hard regression gate stays `test:regression-corpus`).

## Adding a case

Drop a `NN-name.case.json` file here (or scaffold one with `npm run corpus:add`). Each case
materializes its `files` in an isolated temp dir, runs one tool, and compares to `expect`.
An optional `"tags": ["UI", "L-03"]` field is supported for curation/filtering — the
regression runner ignores it; `corpus:list --tag` uses it. Two kinds:

### `gate` — runs `lint-feature`'s `lint()`

```jsonc
{
  "id": "short-id",
  "kind": "gate",
  "description": "why this case exists",
  "files": { "<relpath>": "<file content>" },        // include docs/specs/.learned-config.json
  "lint": {                                           //   to pin learned-rule state (reproducible)
    "folder": "feat",
    "uxStates": "docs/specs/F/ux-states.json",        // optional
    "checklist": "docs/specs/F/checklist.md",         // optional
    "codeOnly": false                                 // optional
  },
  "expect": {
    "gate": "pass",            // pass = 0 error-level findings
    "mustFlagRules": [],       // rule ids that MUST be errors (e.g. "HR33", "learned")
    "mustNotFlagRules": []     // rule ids that must NOT be errors (catches over-reach)
  }
}
```

Because each gate case bundles its own `.learned-config.json`, verdicts are
reproducible regardless of the live config.

### `detector` — runs `feedback-analyzer`'s `analyze()`

```jsonc
{
  "id": "short-id",
  "kind": "detector",
  "description": "...",
  "files": { "docs/specs/.feedback-history.md": "...entries..." },
  "expect": {
    "patterns": ["b11_agent_a_fail"],  // pattern ids that MUST be detected
    "notPatterns": [],                  // ids that must NOT be detected
    "minTotalRuns": 1
  }
}
```

## Guidance

- Add a case whenever you fix a false positive/negative, change a gate, or add a
  learned knob — capture the behavior you want to keep.
- Keep fixtures minimal: the smallest file set that triggers the verdict.
