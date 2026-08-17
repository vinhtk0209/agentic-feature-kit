# P17-010 — CLI Reliability and Direct Integration Evidence

Date: 2026-08-13  
Status: DONE  
Scope: `feedback-analyzer` and `kpi-report` public process boundaries

## Outcome

The two previously untested public CLIs now share one small reliability boundary for strict argument
parsing, structured errors, read-error classification, and rollback-safe text replacement. Their
analysis/report domain logic remains in the existing modules; the CLI adapters only parse, invoke,
render, and map failures to deterministic process behavior.

Invalid input exits `2`, emits exactly one `@@CLI_ERROR@@` JSON record on stderr, and emits no success
stdout. The envelope contains `schemaVersion`, `tool`, `code`, and `message`; codes are bounded to
`ARGUMENT_ERROR`, `INPUT_NOT_FOUND`, `INPUT_READ_FAILED`, `MALFORMED_INPUT`, and
`OUTPUT_WRITE_FAILED`. Successful JSON modes emit one JSON document and exit `0`.

KPI dashboard output is staged beside the destination, never written partially, and restores the
previous report if the final rename fails. The helper accepts a narrow filesystem port solely for
deterministic failure injection; production uses Node's filesystem implementation.

## Architecture and artifacts

| Layer | Responsibility | Artifact | SHA-256 |
|---|---|---|---|
| Reliability core | strict flags, error envelope, atomic replace/rollback | `.claude/integrations/cli-reliability.ts` | `4f42cfb3de8016c226a6d14e8003f1feb25bca9fb28f1002fd815a86d09a7fc6` |
| CLI adapter/domain | feedback parsing and presentation | `.claude/integrations/feedback-analyzer.ts` | `2e478fa4fc7a90b08aa464626a77ce781c4948bd9013dc05098186f3acd625a7` |
| CLI adapter/domain | KPI parsing, reporting, atomic dashboard commit | `.claude/integrations/kpi-report.ts` | `4a7f41b2a02cd907b9c91900e72cb994aae3ff33db32fc24aa861b5d475d158e` |
| Process contract | real child-process and hostile filesystem controls | `.claude/integrations/cli-reliability.test.ts` | `82297a6ecfca0324ab2d6b27867d79d4e14afdca4a245d9bf6a2a41052924b72` |

Both CLIs now use explicit `main` functions and filename-bound direct-execution guards. Importing KPI
report code produces no output or filesystem side effect. This is a ports-and-adapters boundary, not
a broad rewrite of the mature analyzers.

## Focused proof

`npm run test:cli-reliability` passes seven grouped scenarios containing four positive paths and
eleven negative controls:

- valid feedback JSON, valid KPI JSON, side-effect-free KPI import, and successful dashboard output;
- missing feedback file, malformed feedback block, and a directory used as an unreadable input;
- unknown, duplicate, and missing-value feedback arguments;
- malformed KPI JSON, duplicate output mode, invalid `--last-n`, and unknown KPI argument;
- simulated `EACCES` on the final atomic rename, proving the prior report is restored and staging or
  rollback debris is removed.

The direct process harness invokes the local `tsx` launcher through `process.execPath` with
`shell:false`, so spaces and shell metacharacters are not reinterpreted by PowerShell or `cmd.exe`.
An isolated TypeScript 5.7.3 no-emit compilation of all four changed TypeScript files exits `0`.

## Regression proof

- `npm run test:improve-trigger`: 58 passed.
- `npm run test:regression-corpus`: 3 passed.
- `npm run test:playwright-runner`: 63 passed.
- Default first-run feedback and KPI commands remain successful with no history present.
- Full kit `npm test`: exit `0`, 213 seconds.
- Dashboard full Vitest while P17-010 was active: 57 files / 420 tests, 7.98 seconds.
- Final roadmap catalog suite after status closeout: 21 tasks / 4 initiatives pass.
- Final dashboard focused suite: 2 files / 6 tests pass in 1.84 seconds.
- Final dashboard TypeScript and both repository diff checks: exit `0`.

## Boundaries

No blanket synchronous-I/O replacement, Playwright refactor, provider/model execution, credential
access, user-directory install, publication, sync, push, or target `.Codex` edit occurred. The
bounded operations are filesystem and JSON/text processing; TypeScript met the correctness and
performance needs, so Python, Rust, and Go were not justified.
