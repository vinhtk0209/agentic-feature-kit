# I1 self-improvement N→N+1 evidence — 2026-08-12

## Verdict

The first bounded 6F cycle is complete on disk. Lesson `L-2026-08-12-001` was generated from an
honest failing record-verify run N, applied through the canonical B11 state-evidence corrections,
and independently measured by a computed passing record-verify run N+1.

This is a mechanism-proven single-case cycle under `self-training-loop.md` §5.0/§5.1. It is not an
N≥20 correction-rate claim and does not claim statistical significance.

## Live provenance

Both records were read back from Supabase project `vkuojxgvkxndftenrdno` after the operator
explicitly authorized record-verify metadata writes:

| Measurement | Run N | Run N+1 |
|---|---|---|
| runner run ID | `run-1786549352630-cff07274` | `run-1786550374983-7888d526` |
| Tier A / Tier B | `1 / 1` | `0 / 0` |
| computed verified | `false` | `true` |
| recorded at | `2026-08-12T15:44:58.240Z` | `2026-08-12T16:03:13.596Z` |

The pair has the same:

- target HEAD `924a35926ba28345d6e4ffe7cdafe1ba6b5a1850`;
- feature `US-AD-095-ProgressReports`;
- task type `BASELINE` and phase `B11`;
- kit version `3.25.0`;
- content hash `a844049d2861382d5dd3334a0474cbb9bd4275ab747065ee17758997fd41cbf1`.

The exact canonical row-pair hash is
`d1c82c036fc980b1b9dcab318bf36aff98a6c07ca84a26b9343672248a7699e9`. The final verified Git
note hash is `bf1f3a058a4a8f9b4a99e209c09e0ee060f0ad6a7f8fa6b04a278a975a2b92ef`.

## Correction and measurable outcome

Run N exposed three parts of one canonical state-evidence contract:

1. the attempted Tier-A command omitted the workflow-required `--ux-states` input;
2. an active visual-baseline state performed a redundant interaction screenshot before its scoped
   baseline capture, allowing one-shot visual state to drift;
3. a later successful interaction-only state could leave an older cascade failure in the
   checklist.

The canonical workflow already declares checklist + `--ux-states` + `--min-verified 0.6 --gate`.
Kit commits `a8e0c90` and `a30416a` enforce single-shot baseline capture and interaction-only PASS
recovery without weakening baseline-backed visual verdicts. Run N+1 then changed the machine metric
`computed_verify_pass` from `0` to `1`; final B11 was visual `9/9`, UI `15/15`, AC `25/25`, named
Jest `3/3`, and live Tier B HTTP `200`.

## Registry and attack evidence

The authoritative registry is `i1-self-improvement-cycle-2026-08-12.json`:

- cycle hash: `bdd36d4783eaecffd7973b84daa1d2bcf3553ee52bb09c721e2f1daa217f09ed`;
- registry hash: `877d1e8bf64da658d2cf0075570060ae726c265246f2cbda0bbce930d2fee080`;
- status: `verified`;
- rollback required: `false`.

`npm run test:self-improvement-cycle` passed `9/9` attacks and then verified the real registry.
Coverage includes:

- fake/unvalidated lesson rejection;
- forged verified boolean versus Tier exits;
- snapshot mutation and missing provenance;
- harmful `1→0` outcome automatically retained as `rolled_back` with rollback required;
- registry/content hash tamper;
- duplicate lesson ID and evidence-pair replay;
- unknown schema fields and sensitive artifact paths;
- canonical Tier-A checklist/UX-state/hard-gate wiring.

Lesson registry tests passed `20/20`; the sync check passed `60/60` annotations. The final full kit
suite exited `0` in 173 seconds. Version stamps remained `v3.25`, feature index stayed synchronized,
and the flagship prompt remained within budget at 163,032 / 176,128 bytes.

No sync, push, target write, prompt auto-application, or additional Supabase mutation was performed
by the I1 cycle module. The prompt-evolution lesson entry is a separate reviewed source change.
