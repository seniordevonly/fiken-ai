/**
 * The stdio transport, for local MCP clients that spawn the server as a subprocess.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from 'fiken-shared';
import { SERVER_INFO } from './config.js';
import type { ToolRegistry } from './tools/registry.js';

export async function startStdioServer(registry: ToolRegistry): Promise<void> {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: registry.list('stdio') }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // Spread into a plain object: the SDK's result type wants an index signature that the ToolResult interface lacks
    return { ...(await registry.call(name, args, 'stdio')) };
  });

  server.onerror = (error) => {
    logger.error('[MCP Error]', error);
  };

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(new StdioServerTransport());
  logger.info('Fiken MCP server running on stdio');
}
