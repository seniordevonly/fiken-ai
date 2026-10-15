/**
 * The HTTP transport: routes requests to the info, health, OAuth, discovery, MCP and OpenAPI handlers.
 */

import http from 'node:http';
import { logger } from 'fiken-shared';
import { SERVER_INFO } from '../config.js';
import type { ToolRegistry } from '../tools/registry.js';
import { authenticateRequest, isOAuthEnabled, sendAuthError } from './auth.js';
import { handleMcpRequest } from './mcp.js';
import { handleAuthorizeGet, handleAuthorizePost, handleDiscovery, handleOAuthToken } from './oauth.js';
import { getOpenApiSpec } from './openapi.js';
import { sendJson } from './utils.js';

const route = async (registry: ToolRegistry, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
  const url = new URL(req.url!, 'http://localhost');
  const { pathname } = url;

  if (req.method === 'GET') {
    if (pathname === '/') {
      sendJson(res, 200, {
        name: 'Fiken MCP Server',
        version: SERVER_INFO.version,
        status: 'running',
        authentication: 'oauth2',
        token_endpoint: '/oauth/token',
        oauth_discovery: '/.well-known/oauth-authorization-server',
        tools: registry.list('http').map(tool => tool.name),
        protocols: ['mcp', 'http']
      });
      return;
    }
    if (pathname === '/health') {
      sendJson(res, 200, { status: 'healthy' });
      return;
    }
    if (handleDiscovery(pathname, req, res)) {
      return;
    }
    if (pathname === '/oauth/authorize') {
      handleAuthorizeGet(url, req, res);
      return;
    }
    if (pathname === '/openapi.json') {
      if (!authenticateRequest(req)) {
        sendAuthError(res);
        return;
      }
      sendJson(res, 200, getOpenApiSpec());
      return;
    }
  } else if (req.method === 'POST') {
    if (pathname === '/oauth/authorize') {
      handleAuthorizePost(res);
      return;
    }
    if (pathname === '/oauth/token') {
      await handleOAuthToken(req, res);
      return;
    }
    if (pathname === '/mcp') {
      await handleMcpRequest(registry, req, res);
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
};

export function startHttpServer(registry: ToolRegistry, port: number): http.Server {
  // HTTP mode is reachable over the network, so it never runs without a bearer token
  if (!process.env.MCP_AUTH_TOKEN?.trim()) {
    throw new Error('MCP_AUTH_TOKEN must be set when running in HTTP mode (PORT is set)');
  }

  if (!isOAuthEnabled()) {
    logger.info('OAuth disabled (OAUTH_CLIENT_ID/OAUTH_CLIENT_SECRET not set); only MCP_AUTH_TOKEN is accepted');
  }

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      await route(registry, req, res);
    } catch (error) {
      // Never let a single request take the process down
      logger.error('Unhandled error in HTTP request', error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal server error' });
      } else {
        res.end();
      }
    }
  });

  httpServer.listen(port, () => {
    logger.info(`Fiken MCP server running on HTTP port ${port}`);
  });

  return httpServer;
}
