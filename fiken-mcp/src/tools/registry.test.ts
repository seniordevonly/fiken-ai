import { logger } from 'fiken-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FikenContext } from '../context.js';
import { ToolRegistry } from './registry.js';
import { jsonResult, textResult, type ToolDefinition } from './types.js';

const tool = (name: string, overrides: Partial<ToolDefinition> = {}): ToolDefinition => ({
  name,
  description: `${name} description`,
  inputSchema: { type: 'object', properties: {} },
  handler: async () => textResult(`${name} ran`),
  ...overrides,
});

describe('ToolRegistry', () => {
  const context = new FikenContext('co');
  let info: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list()', () => {
    const registry = new ToolRegistry([tool('a'), tool('local_only', { http: false }), tool('b', { http: true })], context);

    it('keeps registration order and hides http: false tools over HTTP', () => {
      expect(registry.list('http').map(t => t.name)).toEqual(['a', 'b']);
    });

    it('lists every tool over stdio', () => {
      expect(registry.list('stdio').map(t => t.name)).toEqual(['a', 'local_only', 'b']);
    });

    it('exposes only name, description and inputSchema', () => {
      expect(registry.list('stdio')[1]).toEqual({
        name: 'local_only',
        description: 'local_only description',
        inputSchema: { type: 'object', properties: {} },
      });
    });
  });

  describe('call()', () => {
    it('runs the handler with the args and the context', async () => {
      const handler = vi.fn(async () => textResult('done'));
      const registry = new ToolRegistry([tool('t', { handler })], context);

      const result = await registry.call('t', { x: 1 }, 'http');

      expect(result).toEqual({ content: [{ type: 'text', text: 'done' }] });
      expect(handler).toHaveBeenCalledWith({ x: 1 }, context);
    });

    it('passes {} when args is undefined', async () => {
      const handler = vi.fn(async () => textResult('done'));
      const registry = new ToolRegistry([tool('t', { handler })], context);

      await registry.call('t', undefined, 'stdio');

      expect(handler).toHaveBeenCalledWith({}, context);
    });

    it('strips meta from the result and logs it', async () => {
      const registry = new ToolRegistry([tool('t', { handler: async () => jsonResult([1, 2], { items: 2 }) })], context);

      const result = await registry.call('t', {}, 'stdio');

      expect(result).not.toHaveProperty('meta');
      expect(result.content[0].text).toBe(JSON.stringify([1, 2], null, 2));
      expect(info).toHaveBeenCalledWith('Tool call', {
        tool: 't',
        ok: true,
        durationMs: expect.any(Number),
        resultChars: result.content[0].text.length,
        items: 2,
      });
    });

    it('sums resultChars across content parts', async () => {
      const handler = async () => ({
        content: [
          { type: 'text' as const, text: 'abc' },
          { type: 'text' as const, text: 'de' },
        ],
      });
      const registry = new ToolRegistry([tool('t', { handler })], context);

      await registry.call('t', {}, 'stdio');

      expect(info).toHaveBeenCalledWith('Tool call', expect.objectContaining({ resultChars: 5, items: undefined }));
    });

    it('turns an unknown tool into an error result', async () => {
      const registry = new ToolRegistry([], context);

      expect(await registry.call('x', {}, 'stdio')).toEqual({
        content: [{ type: 'text', text: 'Error: Unknown tool: x' }],
        isError: true,
      });
      expect(warn).toHaveBeenCalledWith('Tool call', expect.objectContaining({ tool: 'x', ok: false, error: 'Unknown tool: x' }));
    });

    it('refuses http: false tools over HTTP without running them', async () => {
      const handler = vi.fn(async () => textResult('ran'));
      const registry = new ToolRegistry([tool('x', { http: false, handler })], context);

      expect(await registry.call('x', {}, 'http')).toEqual({
        content: [{ type: 'text', text: 'Error: Tool x is not available over HTTP' }],
        isError: true,
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('runs http: false tools over stdio', async () => {
      const registry = new ToolRegistry([tool('x', { http: false })], context);

      expect(await registry.call('x', {}, 'stdio')).toEqual({ content: [{ type: 'text', text: 'x ran' }] });
    });

    it('turns a throwing handler into an error result', async () => {
      const handler = async () => {
        throw new Error('boom');
      };
      const registry = new ToolRegistry([tool('t', { handler })], context);

      expect(await registry.call('t', {}, 'stdio')).toEqual({
        content: [{ type: 'text', text: 'Error: boom' }],
        isError: true,
      });
      expect(warn).toHaveBeenCalledWith('Tool call', {
        tool: 't',
        ok: false,
        durationMs: expect.any(Number),
        error: 'boom',
      });
    });

    it('uses a generic message when the handler throws a non-Error', async () => {
      const handler = async () => {
        throw 'nope';
      };
      const registry = new ToolRegistry([tool('t', { handler })], context);

      expect((await registry.call('t', {}, 'stdio')).content[0].text).toBe('Error: Unknown error occurred');
    });

    it('describes validation errors as field: problem instead of zod JSON', async () => {
      const schema = z.object({ date: z.string(), lines: z.array(z.object({ vat: z.number() })) });
      const handler = async (args: Record<string, any>) => {
        z.number().int().positive().parse(args.invoiceId, { path: ['invoiceId'] });
        return textResult(JSON.stringify(schema.parse(args.purchase, { path: ['purchase'] })));
      };
      const registry = new ToolRegistry([tool('t', { handler })], context);

      expect((await registry.call('t', { invoiceId: '12' }, 'stdio')).content[0].text)
        .toBe('Error: Invalid arguments: invoiceId: Expected number, received string');
      expect((await registry.call('t', { invoiceId: 1, purchase: { lines: [{ vat: 'x' }] } }, 'stdio')).content[0].text)
        .toBe('Error: Invalid arguments: purchase.date: Required; purchase.lines.0.vat: Expected number, received string');
    });
  });
});
