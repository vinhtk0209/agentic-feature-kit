# I1 Evidence Secret-Path Guard

## Live finding

Run `876fbc14-4c9e-4dc7-a339-73ca462b31fe` reached B0.5 and built a valid manifest that referenced `.env.playwright` as an input. The run was stopped before B1/B9.5 because environment and credential files must never become evidence inputs.

The containment audit found:

- `.env.playwright` contains five configuration key names, including Playwright access and refresh token keys.
- The B0.5 evidence directory contained only `manifest.json` and a non-sensitive preflight transcript.
- No environment file was copied into the evidence directory.
- None of the five key names occurred in the evidence files.
- No real environment file was tracked by Git; only the committed MCP `.env.example` was tracked.

No credential value was printed, copied, staged, or committed. The rejected manifest still contained a secret-derived hash, so it was treated as unsafe provenance and removed from the retry path.

## Contract correction

- Bundle inputs and outputs reject `.env`/`.env.*` except committed `*.example` files.
- Known credential/key files such as `runner.secrets.json`, private-key containers, and local package auth files are rejected.
- Lexical repo escape, realpath escape, and final symlink/reparse artifacts are rejected before hashing.
- `--transcript-file` uses the same guard before reading or copying content.
- Verification rejects a forged self-consistent manifest that references an unsafe path.
- B0.5 now records only a non-sensitive capability/status transcript plus `task-type.md`.

## Test evidence

- RED: `npm run test:evidence-bundle` — 26 passed, 3 failed; env input, repo escape, and forged secret manifest were accepted.
- GREEN: `npm run test:evidence-bundle` — 31 passed, 0 failed, including CLI transcript-file and workflow-wiring checks.
- Regression: `npm run test:kit` — exit code 0 in 142.1 seconds.
- Prompt budget: 160,289 bytes, below the 172 KB gate.

No live sync, push, database mutation, or external secret transmission occurred.
