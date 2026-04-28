import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type ToolArea =
  | 'performance'
  | 'cro'
  | 'crm'
  | 'growth'
  | 'regional'
  | 'products'
  | 'traffic'
  | 'cross';

export interface ToolDef<I extends z.ZodTypeAny = z.ZodTypeAny, O = unknown> {
  name: string;
  area: ToolArea;
  description: string;
  inputSchema: I;
  handler: (input: z.infer<I>) => Promise<O>;
}

const TOOLS = new Map<string, ToolDef>();

export function registerTool<I extends z.ZodTypeAny, O>(def: ToolDef<I, O>): void {
  if (TOOLS.has(def.name)) {
    throw new Error(`duplicate tool: ${def.name}`);
  }
  TOOLS.set(def.name, def as unknown as ToolDef);
}

export function listTools(): Array<{ name: string; description: string; inputSchema: unknown }> {
  return Array.from(TOOLS.values()).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }),
  }));
}

export async function callTool(name: string, args: unknown): Promise<unknown> {
  const def = TOOLS.get(name);
  if (!def) throw new Error(`unknown tool: ${name}`);
  const parsed = def.inputSchema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new Error(
      `invalid args for ${name}: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
  return def.handler(parsed.data);
}

export function getToolCount(): number {
  return TOOLS.size;
}

export function listToolsByArea(area: ToolArea): string[] {
  return Array.from(TOOLS.values())
    .filter((t) => t.area === area)
    .map((t) => t.name);
}

export function resetRegistry(): void {
  TOOLS.clear();
}
