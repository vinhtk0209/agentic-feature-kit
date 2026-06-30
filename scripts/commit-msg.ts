#!/usr/bin/env node
/**
 * commit-msg.ts — Conventional Commits enforcement (C-04), no commitlint dependency.
 *
 * Wired via a git hook (see .githooks/commit-msg + `npm run git-hooks:install`). Git passes
 * the path to the commit-message file as argv[2]; we validate the first line and exit 1 to
 * reject a non-conforming message. Shares the grammar with changelog.ts.
 *
 * Manual check: npx tsx scripts/commit-msg.ts <path-to-msg-file>
 */
import * as fs from 'fs';
import { validateCommitMessage } from './changelog';

const file = process.argv[2];
if (!file) {
  console.error('commit-msg: no message file path provided');
  process.exit(1);
}

let message: string;
try {
  message = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.error(`commit-msg: cannot read ${file} — ${(e as Error).message}`);
  process.exit(1);
}

const { ok, error } = validateCommitMessage(message);
if (!ok) {
  console.error(`\n❌ ${error}\n`);
  process.exit(1);
}
process.exit(0);
