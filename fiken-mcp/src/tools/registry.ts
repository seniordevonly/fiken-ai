/**
 * Looks up tools by name, filters them per transport, and runs them with uniform error handling and logging.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { logger } from 'fiken-shared';
import { ZodError } from 'zod';
import type { FikenContext } from '../context.js';
import type { ToolDefinition, ToolResult } from './types.js';

export type Transport = 'stdio' | 'http';

export class ToolRegistry {
  private readonly byName: Map<string, ToolDefinition>;

  constructor(private readonly tools: ToolDefinition[], private readonly context: FikenContext) {
    this.byName = new Map(tools.map(tool => [tool.name, tool]));
  }

  list(transport: Transport): Tool[] {
    return this.tools
      .filter(tool => this.isAvailable(tool, transport))
      .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  }

  /** Never throws: failures become an isError result, as MCP expects for tool errors */
  async call(name: string, args: Record<string, any> | undefined, transport: Transport): Promise<ToolResult> {
    const startedAt = Date.now();
    try {
      const tool = this.byName.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      if (!this.isAvailable(tool, transport)) {
        throw new Error(`Tool ${name} is not available over HTTP`);
      }

      logger.debug('Tool call arguments', { tool: name, args });
      const { meta, ...result } = await tool.handler(args ?? {}, this.context);
      logger.info('Tool call', {
        tool: name,
        ok: true,
        durationMs: Date.now() - startedAt,
        resultChars: result.content.reduce((sum, part) => sum + (part.text?.length ?? 0), 0),
        items: meta?.items,
      });
      return result;
    } catch (error) {
      const errorMessage = describeError(error);
      logger.warn('Tool call', { tool: name, ok: false, durationMs: Date.now() - startedAt, error: errorMessage });
      return { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };
    }
  }

  private isAvailable(tool: ToolDefinition, transport: Transport): boolean {
    return transport === 'stdio' || tool.http !== false;
  }
}

// Zod's own message is a JSON dump of every issue; agents act on "field: problem" far more reliably
const describeError = (error: unknown): string => {
  if (error instanceof ZodError) {
    const issues = error.issues.map(issue => (issue.path.length ? `${issue.path.join('.')}: ` : '') + issue.message);
    return `Invalid arguments: ${issues.join('; ')}`;
  }
  return error instanceof Error ? error.message : 'Unknown error occurred';
};
