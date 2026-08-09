#!/usr/bin/env tsx
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const command = fs.readFileSync(path.join(__dirname, 'feature-from-confluence.md'), 'utf8');
const wrapper = fs.readFileSync(path.join(__dirname, 'design-to-ui.md'), 'utf8');
const required = (text: string) => assert.ok(command.includes(text), `missing flagship hook: ${text}`);
required('--design-source=figma');
required('--figma=<one-or-more-comma-separated-Figma-refs>');
required('Run D0 only after B0 has produced the canonical Spec-IR');
required('D0.5 is the **sole** DesignSource/Figma caller');
required('MUST NOT re-parse the Confluence source and MUST NOT call Figma/MCP');
assert.ok(wrapper.includes('/feature-from-confluence <confluence-value> --repo=<repo> --design-source=figma --figma=<figma-refs> [--refresh-design]'));
assert.ok(wrapper.includes('never owns pipeline ordering'));
console.log('design-to-ui prompt wiring 7/7');
