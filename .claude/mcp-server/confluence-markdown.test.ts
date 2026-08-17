import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { stageConfluenceB0Source } from '../integrations/spec-intake-confluence';
import { htmlToMarkdown } from './confluence-markdown';

async function main(): Promise<void> {
  const html = [
    '<h1>Progress Reports</h1>',
    '<table><tbody>',
    '<tr><th>AC#</th><th>Given</th><th>When</th><th>Then</th></tr>',
    '<tr><td><p><strong>AC1</strong></p></td><td>Admin</td><td>Loads</td><td>Overview appears</td></tr>',
    '<tr><td><strong>AC2</strong></td><td>Admin</td><td>Sorts<br>learners</td><td>A | B remains inert</td></tr>',
    '</tbody></table>',
    '<ac:structured-macro><p>AC999 must not survive</p></ac:structured-macro>',
  ].join('');

  const markdown = htmlToMarkdown(html);
  const acLines = markdown.split(/\r?\n/).filter((line) => /^\|\s*(?:\*\*|__)?AC\d+(?:\*\*|__)?\s*\|/i.test(line));
  assert.deepEqual(acLines, [
    '| **AC1** | Admin | Loads | Overview appears |',
    '| **AC2** | Admin | Sorts learners | A \\| B remains inert |',
  ]);
  assert.equal(markdown.includes('AC999'), false, 'stripped Confluence macros must not become source prose');

  const source = [
    '# Progress Reports',
    '**Page ID:** 830569842',
    '',
    markdown,
  ].join('\n');
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'confluence-markdown-test-'));
  try {
    const staged = stageConfluenceB0Source(source, stagingDir);
    assert.equal(staged.ir.acceptanceCriteria.length, 2);
    assert.deepEqual(staged.ir.acceptanceCriteria.map((ac) => ac.id), ['AC-1', 'AC-2']);
    assert.deepEqual(
      staged.ir.acceptanceCriteria.map((ac) => ac.sourceQuote),
      acLines,
      'each live HTML row must retain its own literal source quote',
    );
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  console.log('Canary GREEN: Confluence export_view tables remain one Markdown row per AC and the canonical B0 adapter preserves exact row-level provenance.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
