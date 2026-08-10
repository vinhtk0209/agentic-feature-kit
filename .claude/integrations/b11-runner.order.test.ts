/**
 * Regression guard: initial B11 captures may begin below HR35's verified-ratio threshold.
 * Playwright is the legitimate evidence writer, so coverage must run only after every
 * route has completed and the checklist update has been attempted.
 */
import { runTierBThenCoverage } from './b11-runner';

async function main(): Promise<void> {
  const events: string[] = [];
  const outcome = await runTierBThenCoverage({
    routes: ['/first', '/second'],
    tierBRan: true,
    runRoute: async (route) => {
      events.push(`route:${route}`);
      return { route, passed: true, checks: [] };
    },
    updateChecklist: (results) => {
      events.push(`checklist:${results.length}`);
      return true;
    },
    runCoverage: () => {
      events.push('coverage');
      return { coverageErrors: 0, coverageSummary: 'coverage=0 error(s)' };
    },
  });

  if (events.join('|') !== 'route:/first|route:/second|checklist:2|coverage') {
    throw new Error(`B11 stage ordering regressed: ${events.join('|')}`);
  }
  if (outcome.b11_b !== 'pass' || outcome.coverageErrors !== 0 || !outcome.checklistUpdated) {
    throw new Error(`Unexpected B11 post-Tier-B outcome: ${JSON.stringify(outcome)}`);
  }

  console.log('1 passed, 0 failed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
