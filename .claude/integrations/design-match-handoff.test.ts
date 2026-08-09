#!/usr/bin/env tsx
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runD1, runD15 } from './design-match-handoff';
import { SpecIR } from './spec-ir';

const spec: SpecIR = { schemaVersion: 1, sourceKind: 'raw-us', sourceRef: 'fixture', sourceSha256: 'x', title: 'Feature', paragraphs: [{ anchor: 'p1', text: 'AC-1: view report' }], acceptanceCriteria: [{ id: 'AC-1', text: 'AC-1: view report', sourceAnchor: 'p1', sourceQuote: 'AC-1: view report' }], warnings: [] };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-handoff-'));
try {
  const file = path.join(dir, 'DesignModel.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, source: 'figma', hash: 'a'.repeat(64), fileKey: 'Abcdef123456', fileVersion: 'v1', refsHash: 'b'.repeat(64), screens: [{ ref: 'fixture', name: 'Progress report', assets: [], tokens: { colors: [], textStyles: [], namedStyles: [] }, tree: { id: '1', name: 'Progress', type: 'FRAME', children: [] }, components: [{ id: '2', name: 'Progress report' }], textNodes: [{ id: '3', name: 'title', characters: 'Progress report' }] }] }));
  const d1 = runD1(file, spec, ['Progress report', 'Course header']);
  assert.equal(d1.ok, true); if (!d1.ok) throw new Error(d1.detail);
  assert.ok(d1.matches.length >= 1); assert.equal(runD15(d1).requiresConfirmation, true);
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 2 }));
  const stale = runD1(file, spec, ['Progress report']);
  assert.equal(stale.ok, false); assert.equal(!stale.ok && stale.reason, 'handoff-schema-version-mismatch');
  console.log('design-match-handoff tests 2/2');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
