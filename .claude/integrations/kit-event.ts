/**
 * Kit-owned progress event emitter.
 *
 * The workflow invokes this CLI instead of printing marker JSON itself. It is deliberately pure:
 * no filesystem, network, or shell access; one valid invocation emits exactly one sentinel line.
 */

const PHASE_RE = /^(?:B(?:0(?:\.5)?|1|2|3|4|5|6(?:\.5)?|7|8(?:\.[56])?|9(?:\.[56])?|10(?:\.5)?|11|12(?:\.8)?)|D(?:0(?:\.5)?|1(?:\.5)?|cross-2))$/;
const NONCE_RE = /^[a-f0-9]{64}$/;
const AWAITING = new Set(['gate', 'permission', 'none']);

type StateEvent = {
  v: 1;
  type: 'state';
  phase: string;
  awaiting?: 'gate' | 'permission' | 'none';
  expected?: boolean;
  runNonce?: string;
};

function fail(message: string): never {
  console.error(`kit-event: ${message}`);
  process.exit(2);
}

function parseState(args: string[]): StateEvent {
  if (args.length < 2 || args[0] !== 'state' || !PHASE_RE.test(args[1])) fail('usage: kit-event state <phase> [--awaiting <gate|permission|none>] [--expected <true|false>]');
  const event: StateEvent = { v: 1, type: 'state', phase: args[1] };
  const seen = new Set<string>();
  for (let index = 2; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || seen.has(flag)) fail('flags require one unique value');
    seen.add(flag);
    if (flag === '--awaiting' && AWAITING.has(value)) event.awaiting = value as StateEvent['awaiting'];
    else if (flag === '--expected' && (value === 'true' || value === 'false')) event.expected = value === 'true';
    else fail(`unsupported argument: ${flag}`);
  }
  if (event.awaiting === 'gate' && event.expected !== true) fail('designed gates require --expected true');
  if (event.expected !== undefined && event.awaiting !== 'gate') fail('--expected is valid only with --awaiting gate');
  const nonce = process.env.KIT_EVENT_NONCE;
  if (nonce !== undefined) {
    if (!NONCE_RE.test(nonce)) fail('KIT_EVENT_NONCE must be 64 lowercase hex characters');
    event.runNonce = nonce;
  }
  return event;
}

const event = parseState(process.argv.slice(2));
process.stdout.write(`@@KIT_EVENT@@ ${JSON.stringify(event)}\n`);
