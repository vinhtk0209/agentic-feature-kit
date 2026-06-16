import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const INTEGRATIONS_DIR = join(process.cwd(), '.claude', 'integrations');

function runScript(
  script: string,
  args: string[],
  timeoutMs = 60000,
): { success: boolean; output: string } {
  const scriptPath = join(INTEGRATIONS_DIR, script);
  if (!existsSync(scriptPath)) {
    return { success: false, output: `Script not found: ${scriptPath}` };
  }
  try {
    const safeArgs = args.map((a) => JSON.stringify(a)).join(' ');
    const cmd = `npx tsx "${scriptPath}" ${safeArgs}`;
    const output = execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: timeoutMs,
    });
    return { success: true, output: output.trim() };
  } catch (err: unknown) {
    // A non-zero exit makes execSync throw, but the script's meaningful result
    // (e.g. b11-runner's JSON verdict) is on STDOUT, and a hard-gate failure is an
    // expected non-zero exit. Combine all captured streams — never drop stdout via
    // `stderr ?? stdout` (`??` keeps an empty-string stderr), or the caller is blinded.
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const detail =
      [e.stdout, e.stderr, e.message]
        .map((s) => (s ? String(s).trim() : ''))
        .filter(Boolean)
        .join('\n') || String(err);
    return { success: false, output: detail };
  }
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function fail(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true as const };
}

const server = new Server(
  { name: 'feature-workflow', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'save_workflow_context',
      description:
        'Persist the current workflow phase to docs/specs/<featureName>/context-summary.md. ' +
        'Implements ★5 CONTEXT SUMMARY — call after every confirm gate (B4, B6, B8, B9, B11).',
      inputSchema: {
        type: 'object',
        properties: {
          phase: {
            type: 'string',
            description:
              'Phase name, e.g. scope_confirmed / files_confirmed / plan_confirmed / final_confirmed / verify_complete',
          },
          data: {
            type: 'object',
            description:
              'Context payload, e.g. {"featureName":"UserProfile","taskType":"NEW","userAnswers":{...}}',
          },
        },
        required: ['phase', 'data'],
      },
    },
    {
      name: 'load_workflow_context',
      description:
        'Load workflow context from docs/specs/<featureName>/context-summary.md. ' +
        'Use in SESSION BOOTSTRAP (Step 1) to check for an in-progress session.',
      inputSchema: {
        type: 'object',
        properties: {
          featureName: {
            type: 'string',
            description: 'Feature name. If omitted, reads from .current-feature pointer file.',
          },
        },
        required: [],
      },
    },
    {
      name: 'verify_feature_route',
      description:
        'Run 5 Playwright smoke-test checks on a feature route (B11 UI verification). ' +
        'Requires the dev server running at http://localhost:3000 (or DEV_SERVER_URL env var). ' +
        'Auth tokens read from .env.playwright or .env.private automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          route: {
            type: 'string',
            description: 'App route to verify, e.g. /your-app/feature-route',
          },
          featureName: {
            type: 'string',
            description: 'Feature name for screenshot output directory',
          },
          screenshot: {
            type: 'boolean',
            description: 'Whether to capture a screenshot (default: true)',
          },
        },
        required: ['route', 'featureName'],
      },
    },
    {
      name: 'analyze_feedback_patterns',
      description:
        'Analyze docs/specs/.feedback-history.md for recurring failure patterns (★6 LEARN). ' +
        'Returns top patterns and improvement proposals. Call in SESSION BOOTSTRAP (Step 2) ' +
        'and B12.5 to drive self-improvement.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'run_b11',
      description:
        'Run full B11 verification in one call: scoped types + lint (static analysis) + ' +
        'Playwright smoke-tests for all routes defined in ux-states.json. ' +
        'Auto-updates checklist.md PLAYWRIGHT rows. ' +
        'Returns { b11_a, b11_b, typeErrors, lintErrors, routeResults[], checklistUpdated, summary }.',
      inputSchema: {
        type: 'object',
        properties: {
          featureName: {
            type: 'string',
            description: 'Feature name, e.g. AdminTaskProcessing',
          },
          featurePath: {
            type: 'string',
            description:
              'Relative path to feature folder for scoped lint, e.g. src/your-app/tabs/admin-tasks',
          },
          noPlaywright: {
            type: 'boolean',
            description: 'Skip Playwright and run static analysis only (default: false)',
          },
        },
        required: ['featureName'],
      },
    },
    {
      name: 'run_feedback_append',
      description:
        'Append a B12.5 feedback entry to docs/specs/.feedback-history.md (global) and ' +
        'docs/specs/<featureName>/feedback.log (per-feature). Trims global history to 10 entries. ' +
        'Returns { ok: true, entryCount: N }.',
      inputSchema: {
        type: 'object',
        properties: {
          featureName: {
            type: 'string',
            description: 'Feature name, e.g. AdminTaskProcessing',
          },
          metrics: {
            type: 'object',
            description:
              'Metrics object: { reflectionFinal, recoveries, b11_a, b11_b, b9_6, ' +
              'peerConflict, skipped, designCycleback, gatesRevised, userFeedback }',
          },
        },
        required: ['featureName', 'metrics'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === 'save_workflow_context') {
    const { phase, data } = args as { phase: string; data: Record<string, unknown> };
    if (!phase) return fail('Missing required argument: phase');
    const payload = JSON.stringify(data ?? {});
    const result = runScript('memory.ts', ['save', phase, payload]);
    return result.success ? ok(result.output) : fail(result.output);
  }

  if (name === 'load_workflow_context') {
    const { featureName } = args as { featureName?: string };
    const scriptArgs = featureName ? ['load', featureName] : ['load'];
    const result = runScript('memory.ts', scriptArgs);
    return result.success ? ok(result.output) : fail(result.output);
  }

  if (name === 'verify_feature_route') {
    const { route, featureName, screenshot = true } = args as {
      route: string;
      featureName: string;
      screenshot?: boolean;
    };
    if (!route) return fail('Missing required argument: route');
    if (!featureName) return fail('Missing required argument: featureName');

    const scriptArgs = [route, '--feature-name', featureName];
    if (screenshot) scriptArgs.push('--screenshot');

    const result = runScript('playwright-runner.ts', scriptArgs, 120000);
    return result.success ? ok(result.output) : fail(result.output);
  }

  if (name === 'analyze_feedback_patterns') {
    const result = runScript('feedback-analyzer.ts', ['--summary']);
    if (!result.success) {
      // Non-fatal — return empty analysis so caller can continue
      return ok(JSON.stringify({ totalRuns: 0, topPatterns: [], highPriority: [] }));
    }
    return ok(result.output);
  }

  if (name === 'run_b11') {
    const { featureName, featurePath, noPlaywright = false } = args as {
      featureName: string;
      featurePath?: string;
      noPlaywright?: boolean;
    };
    if (!featureName) return fail('Missing required argument: featureName');

    const scriptArgs = [featureName];
    if (featurePath) { scriptArgs.push('--feature-path', featurePath); }
    if (noPlaywright) { scriptArgs.push('--no-playwright'); }

    // B11 can take a while: 4 routes × ~30s each + static analysis = ~3 min
    const result = runScript('b11-runner.ts', scriptArgs, 300000);
    return result.success ? ok(result.output) : fail(result.output);
  }

  if (name === 'run_feedback_append') {
    const { featureName, metrics } = args as {
      featureName: string;
      metrics: Record<string, unknown>;
    };
    if (!featureName) return fail('Missing required argument: featureName');
    if (!metrics) return fail('Missing required argument: metrics');

    const metricsJson = JSON.stringify(metrics);
    const result = runScript('b12-logger.ts', [featureName, metricsJson]);
    return result.success ? ok(result.output) : fail(result.output);
  }

  return fail(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
