import { describe, it, expect, beforeAll } from 'vitest';
import {
  listTools,
  listToolsByArea,
  callTool,
  getToolCount,
  resetRegistry,
} from '../src/tools/registry.js';
import { registerAllTools } from '../src/tools/index.js';

beforeAll(() => {
  resetRegistry();
  registerAllTools();
});

describe('tool registry', () => {
  it('registers exactly 40 tools', () => {
    expect(getToolCount()).toBe(40);
  });

  it('groups tools in 7 areas + cross', () => {
    expect(listToolsByArea('performance')).toHaveLength(7);
    expect(listToolsByArea('cro')).toHaveLength(5);
    expect(listToolsByArea('crm')).toHaveLength(6);
    expect(listToolsByArea('growth')).toHaveLength(4);
    expect(listToolsByArea('regional')).toHaveLength(3);
    expect(listToolsByArea('products')).toHaveLength(5);
    expect(listToolsByArea('traffic')).toHaveLength(4);
    expect(listToolsByArea('cross')).toHaveLength(6);
    const total =
      listToolsByArea('performance').length +
      listToolsByArea('cro').length +
      listToolsByArea('crm').length +
      listToolsByArea('growth').length +
      listToolsByArea('regional').length +
      listToolsByArea('products').length +
      listToolsByArea('traffic').length +
      listToolsByArea('cross').length;
    expect(total).toBe(40);
  });

  it('listTools returns valid JSON Schema', () => {
    const tools = listTools();
    expect(tools).toHaveLength(40);
    for (const t of tools) {
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(typeof t.inputSchema).toBe('object');
    }
  });

  it('rejects invalid input via Zod safeParse', async () => {
    await expect(callTool('get_revenue', { period: 'invalid' })).rejects.toThrow(/invalid args/i);
  });

  it('rejects unknown tool', async () => {
    await expect(callTool('nope_tool_xyz', {})).rejects.toThrow(/unknown tool/);
  });

  it('rejects bad period.from > period.to', async () => {
    await expect(
      callTool('get_revenue', { period: { from: '2026-04-30', to: '2026-04-01' } }),
    ).rejects.toThrow(/invalid args/i);
  });
});
