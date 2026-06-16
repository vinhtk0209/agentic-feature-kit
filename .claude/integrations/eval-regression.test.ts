/**
 * Regression guard: scores the reference feature and asserts it has not dropped below the
 * committed baseline. Auto-catches (a) a tooling/gate change that lowers scoring, or
 * (b) accidental degradation of the reference feature.
 *
 *   npx tsx .claude/integrations/eval-regression.test.ts   (or: npm run test:eval-regression)
 *
 * Update the baseline ONLY when an intentional change moves the score:
 *   npm run eval:feature -- src/sample-app/analyze-data \
 *     --spec docs/specs/AnalyzeData \
 *     --write-baseline docs/specs/AnalyzeData/eval-baseline.json
 *
 * NOTE: this is NOT prompt-regression (that needs re-running B0–B12). It guards the harness +
 * the committed reference feature against silent drops.
 */

import * as fs from 'fs';
import { scoreFeature, compareBaseline, Scorecard } from './eval-feature';

const FOLDER = 'src/sample-app/analyze-data';
const SPEC = 'docs/specs/AnalyzeData';
const BASELINE = 'docs/specs/AnalyzeData/eval-baseline.json';

let failed = 0;
function check(name: string, cond: boolean, detail = '') { if (cond) { console.log(`✅ ${name}`); } else { failed += 1; console.log(`❌ ${name}\n     ${detail}`); } }

if (!fs.existsSync(BASELINE)) {
  console.log(`⚠️  no baseline at ${BASELINE} — skipping regression guard (run --write-baseline to create one)`);
  process.exit(0);
}

const card = scoreFeature({ folder: FOLDER, specDir: SPEC });
const base: Scorecard = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const regs = compareBaseline(card, base);

console.log(`reference: ${card.feature}  overall ${card.overall}% (baseline ${base.overall}%)`);
check('no category regressed below baseline', regs.length === 0, `regressions: ${regs.join(' · ')}`);
check('overall did not drop', card.overall >= base.overall, `overall ${card.overall} < baseline ${base.overall}`);

console.log(`\n${failed === 0 ? 'regression guard OK' : `${failed} regression(s)`}`);
process.exit(failed > 0 ? 1 : 0);
