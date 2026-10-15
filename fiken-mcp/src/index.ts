#!/usr/bin/env node

/**
 * Fiken MCP Server
 *
 * Exposes Fiken purchase and invoice APIs as MCP tools. Runs over stdio for local clients,
 * or over HTTP with bearer/OAuth auth when PORT is set (e.g. on Railway for Hermes and ChatGPT).
 */

import { logger } from 'fiken-shared';
import { FikenContext } from './context.js';
import { startHttpServer } from './http/server.js';
import { startStdioServer } from './stdio.js';
import { invoiceTools } from './tools/invoices.js';
import { purchaseTools } from './tools/purchases.js';
import { ToolRegistry } from './tools/registry.js';
import { statusTools } from './tools/status.js';

async function main(): Promise<void> {
  logger.info(`MCP Server starting at ${new Date().toISOString()}`);
  logger.info('Environment', { PORT: process.env.PORT, Mode: process.env.PORT ? 'HTTP' : 'STDIO' });

  const context = FikenContext.fromEnvironment();
  const registry = new ToolRegistry([...statusTools, ...purchaseTools, ...invoiceTools], context);

  if (!process.env.PORT) {
    await startStdioServer(registry);
  } else {
    const httpServer = startHttpServer(registry, parseInt(process.env.PORT, 10));
    // Let in-flight requests finish when the platform stops the container
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.on(signal, () => {
        logger.info(`Received ${signal}, shutting down`);
        httpServer.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 10_000).unref();
      });
    }
  }

  logger.info('MCP Server started successfully');
}

main().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
