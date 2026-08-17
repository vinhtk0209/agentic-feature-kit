# Post-17 Wave 1 input-readiness evidence — 2026-08-13

## Verdict

The implementation inputs that previously blocked `P17-002` and `P17-008` are complete and
machine-validated. Both tasks are now `ready`; their declared dependencies still prevent execution
out of order. This checkpoint does not implement the shared core, skills, agents, or provider
bundles.

## Source-bound orchestrator map

- Flagship: `.claude/commands/feature-from-confluence.md`.
- Git commit at derivation: `ceff52345351da873250868c9666d4f1000d2387`.
- Git blob: `1900e29c790332eadab0a86441724e1b6a697a95`.
- SHA-256: `627a44d0c7139d269ed14b3629ecb0e0a1be2414d12354bbc744832de18fe449`.
- Length: 2,691 lines.
- Runtime registry: 23 mandatory phases plus conditional `D-cross-2`.
- Visible decomposition: eight ordered stages from `INTAKE` through `LEARN`.

`docs/roadmap/post-17-orchestrator-boundaries.json` binds every phase to its current source line,
stage owner, bounded inputs/outputs, execution policy, and gate. It also binds the existing
`evidence-bundle`, `kit-event`, `record-verify`, and role-DAG boundaries. The contract preserves
separate gate markers, bundle-only fail-closed resume, the single trusted verification writer, and
the rule that provider adapters cannot weaken gates or add unauthorized external writes.

CodeGraph was attempted first as required by the workspace. Both the broad 124-second query and a
narrowed 65-second query timed out without output. Heading discovery then used an `rg` positive
control followed by independent `rg` and PowerShell `Select-String` extraction; both returned the
same phase locations.

## Golden conservation baseline

`docs/roadmap/post-17-orchestrator-golden.json` binds later decomposed comparisons to the sanctioned
canonical `US-AD-095-ProgressReports` capture:

- page `830569842`;
- source SHA-256 `dd36b30b0c1c162bafac9f6b464105da6ad3310014a13ce81931f02d41c9ea93`;
- 19,310 bytes, 95 paragraphs, and 19 anchored source ACs;
- verified run `run-1786560631191-1cd57bdc`;
- implementation commit `94c682cf370402f5fca86b90e20efed95b141b15`;
- Tier A/B `0/0`, computed `verified=true`;
- content hash `4ba67560faf6cd54250c684efea84c221e025a87ff805df702759683bd702af3`;
- all 23 mandatory bundles valid and bundle-only resume `DONE`.

The comparison requires source, feature, AC, phase, gate, artifact-class, evidence, and trusted
verification conservation. It explicitly permits reported provider/model/run/cost/latency and
semantically equivalent formatting or partitioning differences. It forbids byte identity as a
substitute for semantic proof and forbids action smoke from being reported as implementation
parity.

## Current provider packaging contracts

The packaging input was checked against current official sources on 2026-08-13:

- OpenAI Codex skills and `.codex-plugin/plugin.json` packaging:
  `https://developers.openai.com/codex/skills/` and
  `https://developers.openai.com/plugins/build/plugins`.
- Claude Code `.claude-plugin/plugin.json`, `skills/`, and `agents/` packaging:
  `https://code.claude.com/docs/en/plugins` and
  `https://code.claude.com/docs/en/plugins-reference`.
- GitHub Copilot project Agent Skills and `.github/agents/*.agent.md`:
  `https://docs.github.com/en/copilot/concepts/agents/about-agent-skills` and
  `https://docs.github.com/en/copilot/reference/custom-agents-configuration`.

The selected boundary is private/local repository packaging. The Copilot package deliberately does
not invent a plugin manifest; prompt files are optional preview surfaces rather than the primary
contract. Installation into user/admin directories, provider execution, marketplace/public
publication, sync, and push remain separately authorized actions.

## Test evidence

Initial RED was retained: the first focused run rejected the valid Codex package because the test
incorrectly required four paths. The provider contract was not padded with an invented agent file;
the test was corrected to accept the real manifest-plus-two-skills minimum. A later negative-test
matcher was also corrected to match Node's actual deep-equality error text.

Final results:

- `npm run test:post-17-wave-1-inputs`: PASS — 23 mandatory phases, one conditional phase, three
  providers, and seven negative controls.
- Negative controls: missing phase, duplicate stage ownership, weakened B9 gate, flagship hash
  drift, missing trusted-verification artifact class, adapter auto-approval, and fabricated Copilot
  plugin manifest.
- `npm run test:post-17-roadmap`: PASS — 21 tasks and four initiatives.
- Full kit `npm test`: exit `0` in 136 seconds with the new focused suite registered in `test:kit`.
- Kit `git diff --check`: PASS.

## Safety and rollback

The verified 2026-08-13 kit snapshot was reused. No target `.Codex` directory, provider credential,
external provider, marketplace, sync path, push path, or database was touched. Rollback remains the
daily snapshot plus the local Git commit created after this evidence review.

