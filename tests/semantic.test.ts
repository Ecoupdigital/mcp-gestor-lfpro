import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSemanticLayer,
  getMetric,
  getSegment,
  resetSemanticCache,
} from '../src/semantic/loader.js';

describe('semantic layer', () => {
  beforeEach(() => resetSemanticCache());

  it('loads metrics.yaml', () => {
    const layer = loadSemanticLayer();
    expect(Object.keys(layer.metrics).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(layer.segments).length).toBeGreaterThanOrEqual(5);
  });

  it('returns metric def by name', () => {
    expect(getMetric('roas').description).toContain('Ad Spend');
    expect(getMetric('aov').unit).toBe('currency_brl');
    expect(getMetric('revenue').cents_to_brl).toBe(true);
  });

  it('returns segment def', () => {
    expect(getSegment('rfm_at_risk').rule).toMatch(/r_score/);
    expect(getSegment('rfm_champions').rule).toContain('5');
  });

  it('throws on unknown metric', () => {
    expect(() => getMetric('nonexistent_metric_xyz')).toThrow(/unknown metric/);
  });

  it('throws on unknown segment', () => {
    expect(() => getSegment('nonexistent_segment_xyz')).toThrow(/unknown segment/);
  });

  it('exposes conventions', () => {
    const layer = loadSemanticLayer();
    expect(layer.conventions.timezone).toBe('America/Sao_Paulo');
    expect(layer.conventions.money_storage).toBe('cents');
    expect(layer.conventions.paid_statuses).toContain('PAID');
    expect(layer.conventions.paid_statuses).toContain('PARTIALLY_PAID');
    expect(layer.conventions.test_orders_excluded).toBe(true);
  });
});
