#!/usr/bin/env node
/**
 * design-intake.ts — fail-closed D0/D0.5 boundary for Design-to-UI Phase 2.
 *
 * D0 is deliberately pure: it validates the existing canonical Spec-IR input and
 * a Figma file key. D0.5 is the only layer allowed to call a DesignSource; it
 * writes a schema-versioned, content-addressed cache only after complete validation.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DesignModel, DesignSource } from './design-source';
import { intakeSpecFile } from './spec-intake';
import { SpecIR } from './spec-ir';

export const DESIGN_MODEL_SCHEMA_VERSION = 1 as const;

export type D0Reason =
  | 'intake-missing-confluence'
  | 'intake-missing-figma'
  | 'intake-malformed-confluence'
  | 'intake-malformed-figma-key';
export type D05Reason =
  | 'ingest-mcp-failed'
  | 'ingest-incomplete'
  | 'ingest-malformed-designmodel'
  | 'ingest-schema-version-mismatch'
  | 'ingest-image-hash-unresolved';

export type GateFailure<R extends string> = { ok: false; reason: R; detail: string };
export interface D0Success { ok: true; spec: SpecIR; figmaRefs: string[]; fileKey: string }
export type D0Result = D0Success | GateFailure<D0Reason>;

export interface D0Input { specPath?: string; figma?: string | string[] }

/** Validate either a Figma URL or its bare file key. D0 intentionally does not require node-id. */
export function extractFigmaFileKey(ref: string): string | null {
  const value = ref.trim();
  if (/^[A-Za-z0-9]{6,128}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!/(^|\.)figma\.com$/i.test(url.hostname)) return null;
    return url.pathname.match(/\/(?:design|file)\/([A-Za-z0-9]{6,128})(?:\/|$)/)?.[1] ?? null;
  } catch { return null; }
}

function normaliseRefs(input: D0Input['figma']): string[] {
  const refs = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  return refs.map((value) => value.trim()).filter(Boolean);
}

/** D0: canonical B0 parser reuse plus pure Figma-key validation. No MCP/cache/file writes. */
export function runD0(input: D0Input): D0Result {
  if (!input.specPath?.trim()) return { ok: false, reason: 'intake-missing-confluence', detail: 'no Confluence context/spec path supplied' };
  const figmaRefs = normaliseRefs(input.figma);
  if (figmaRefs.length === 0) return { ok: false, reason: 'intake-missing-figma', detail: 'no Figma link or file key supplied' };
  let spec: SpecIR;
  try { spec = intakeSpecFile(input.specPath); }
  catch (error) { return { ok: false, reason: 'intake-malformed-confluence', detail: error instanceof Error ? error.message : String(error) }; }
  const keys = figmaRefs.map(extractFigmaFileKey);
  if (keys.some((key) => key === null) || new Set(keys).size !== 1) {
    return { ok: false, reason: 'intake-malformed-figma-key', detail: 'Figma refs must be well-formed and belong to one file key' };
  }
  return { ok: true, spec, figmaRefs, fileKey: keys[0] as string };
}

/** A provider must expose a cheap, stable remote version before D0.5 may accept a cache hit. */
export interface VersionedDesignSource extends DesignSource {
  getFileVersion(fileKey: string): Promise<string>;
}

export interface StoredDesignModel extends DesignModel {
  schemaVersion: 1;
  fileKey: string;
  fileVersion: string;
  refsHash: string;
}

export interface D05Input {
  intake: D0Success;
  artifactDir: string;
  source: VersionedDesignSource;
  refreshDesign?: boolean;
}
export interface D05Success {
  ok: true;
  source: 'cache-hit' | 'mcp-fresh';
  modelPath: string;
  model: StoredDesignModel;
  log: string;
}
export type D05Result = D05Success | GateFailure<D05Reason>;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const modelFile = (dir: string) => path.join(dir, 'DesignModel.json');
const isContentHash = (value: string) => /^(?:sha256:)?[a-f0-9]{64}$/i.test(value);
const isFailure = <R extends string>(value: unknown): value is GateFailure<R> =>
  typeof value === 'object' && value !== null && 'ok' in value && (value as { ok?: unknown }).ok === false;

function readModel(file: string): StoredDesignModel | GateFailure<D05Reason> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredDesignModel;
    if (parsed.schemaVersion !== DESIGN_MODEL_SCHEMA_VERSION) return { ok: false, reason: 'ingest-schema-version-mismatch', detail: `expected schemaVersion ${DESIGN_MODEL_SCHEMA_VERSION}, received ${String(parsed.schemaVersion)}` };
    if (parsed.source !== 'figma' || !Array.isArray(parsed.screens) || !parsed.screens.length || typeof parsed.hash !== 'string') {
      return { ok: false, reason: 'ingest-malformed-designmodel', detail: 'DesignModel missing source/screens/hash' };
    }
    if (parsed.screens.some((screen) => !Array.isArray(screen.assets) || screen.assets.some((asset) => !isContentHash(asset.ref)))) {
      return { ok: false, reason: 'ingest-image-hash-unresolved', detail: 'an exported image lacks a valid content hash' };
    }
    return parsed;
  } catch (error) {
    return { ok: false, reason: 'ingest-malformed-designmodel', detail: error instanceof Error ? error.message : String(error) };
  }
}

function writeAtomic(file: string, body: string): void {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, body, 'utf8');
  fs.renameSync(temporary, file);
}

function annotations(model: StoredDesignModel): { images: string; visual: string } {
  const assets = model.screens.flatMap((screen) => screen.assets.map((asset) => `- ${asset.type}: ${asset.ref}`));
  const colors = [...new Set(model.screens.flatMap((screen) => screen.tokens.colors.map((color) => color.hex)))];
  const textStyles = model.screens.flatMap((screen) => screen.tokens.textStyles).length;
  return {
    images: `# Image annotations\n\n${assets.length ? assets.join('\n') : 'No exported images.'}\n`,
    visual: `# Visual properties\n\n## Colors\n${colors.map((color) => `- ${color}`).join('\n') || '- none'}\n\n## Typography\n- text styles: ${textStyles}\n`,
  };
}

/** D0.5: cache check first, then exactly one design-tree resolution when regeneration is required. */
export async function runD05(input: D05Input): Promise<D05Result> {
  let fileVersion: string;
  try {
    fileVersion = await input.source.getFileVersion(input.intake.fileKey);
    if (!fileVersion.trim()) throw new Error('provider returned an empty file version');
  } catch (error) {
    return { ok: false, reason: 'ingest-mcp-failed', detail: error instanceof Error ? error.message : String(error) };
  }
  const refsHash = sha256(JSON.stringify(input.intake.figmaRefs));
  const output = modelFile(input.artifactDir);
  if (!input.refreshDesign && fs.existsSync(output)) {
    const cached = readModel(output);
    if (!isFailure(cached) && cached.fileKey === input.intake.fileKey && cached.fileVersion === fileVersion && cached.refsHash === refsHash) {
      return { ok: true, source: 'cache-hit', modelPath: output, model: cached, log: `[D0.5-ingest] source=cache-hit hash=${cached.hash}` };
    }
  }
  let model: DesignModel;
  try { model = await input.source.resolveCluster(input.intake.figmaRefs); }
  catch (error) { return { ok: false, reason: 'ingest-mcp-failed', detail: error instanceof Error ? error.message : String(error) }; }
  const stored: StoredDesignModel = { ...model, schemaVersion: DESIGN_MODEL_SCHEMA_VERSION, fileKey: input.intake.fileKey, fileVersion, refsHash };
  const checked = readModelFromValue(stored);
  if (isFailure(checked)) return checked;
  try {
    fs.mkdirSync(input.artifactDir, { recursive: true });
    const notes = annotations(stored);
    writeAtomic(path.join(input.artifactDir, 'image-annotations.md'), notes.images);
    writeAtomic(path.join(input.artifactDir, 'visual-properties.md'), notes.visual);
    // Model is published last: readers never observe a partially written DesignModel cache.
    writeAtomic(output, `${JSON.stringify(stored, null, 2)}\n`);
  } catch (error) { return { ok: false, reason: 'ingest-mcp-failed', detail: error instanceof Error ? error.message : String(error) }; }
  return { ok: true, source: 'mcp-fresh', modelPath: output, model: stored, log: `[D0.5-ingest] source=mcp-fresh hash=${stored.hash} images=${stored.screens.reduce((n, screen) => n + screen.assets.length, 0)}` };
}

function readModelFromValue(model: StoredDesignModel): StoredDesignModel | GateFailure<D05Reason> {
  if (model.schemaVersion !== DESIGN_MODEL_SCHEMA_VERSION) return { ok: false, reason: 'ingest-schema-version-mismatch', detail: 'new model schema version is unsupported' };
  if (model.source !== 'figma' || !Array.isArray(model.screens) || model.screens.length === 0 || !model.hash) return { ok: false, reason: 'ingest-incomplete', detail: 'Figma source returned no complete design tree' };
  if (model.screens.some((screen) => !Array.isArray(screen.assets) || screen.assets.some((asset) => !isContentHash(asset.ref)))) return { ok: false, reason: 'ingest-image-hash-unresolved', detail: 'an exported image lacks a valid content hash' };
  return model;
}
