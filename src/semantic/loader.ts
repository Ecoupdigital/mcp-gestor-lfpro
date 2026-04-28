import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { SemanticLayer } from './types.js';

let cached: SemanticLayer | null = null;

function findYamlPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/index.js (single bundle) ou dist/semantic/loader.js (multi-arquivo)
  // Tenta varios candidatos para suportar layouts diferentes do build (tsup vs tsx).
  const candidates = [
    resolve(here, '../config/metrics.yaml'),
    resolve(here, '../../config/metrics.yaml'),
    resolve(here, '../../../config/metrics.yaml'),
    resolve(process.cwd(), 'config/metrics.yaml'),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c, 'utf-8');
      return c;
    } catch {
      continue;
    }
  }
  throw new Error(
    `metrics.yaml not found. Tried: ${candidates.join(', ')}. Run from repo root or check Dockerfile COPY.`,
  );
}

export function loadSemanticLayer(): SemanticLayer {
  if (cached) return cached;
  const yamlPath = findYamlPath();
  const raw = readFileSync(yamlPath, 'utf-8');
  const parsed = yaml.load(raw) as SemanticLayer;
  if (!parsed.metrics || !parsed.segments) {
    throw new Error('metrics.yaml missing required keys: metrics, segments');
  }
  cached = parsed;
  return parsed;
}

export function getMetric(name: string): SemanticLayer['metrics'][string] {
  const layer = loadSemanticLayer();
  const m = layer.metrics[name];
  if (!m) throw new Error(`unknown metric: ${name}`);
  return m;
}

export function getSegment(name: string): SemanticLayer['segments'][string] {
  const layer = loadSemanticLayer();
  const s = layer.segments[name];
  if (!s) throw new Error(`unknown segment: ${name}`);
  return s;
}

export function resetSemanticCache(): void {
  cached = null;
}
