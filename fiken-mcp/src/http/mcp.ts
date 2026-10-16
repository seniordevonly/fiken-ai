/**
 * MCP JSON-RPC over plain HTTP POST: one request per body, no batches, no streaming.
 */

import type http from 'node:http';
import { SERVER_INFO } from '../config.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolResult } from '../tools/types.js';
import { authenticateRequest, sendAuthError } from './auth.js';
import { readBody, sendJson } from './utils.js';

export const handleMcpRequest = async (
  registry: ToolRegistry,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  const body = await readBody(req);
  if (body === null) {
    res.setHeader('Connection', 'close');
    sendJson(res, 413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request body too large' } });
    return;
  }

  let mcpRequest;
  try {
    mcpRequest = JSON.parse(body);
  } catch {
    sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  if (!mcpRequest || typeof mcpRequest !== 'object' || Array.isArray(mcpRequest)) {
    sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request (batches are not supported)' } });
    return;
  }

  // Allow initialize method without authentication for OAuth discovery
  if (mcpRequest.method === 'initialize') {
    sendJson(res, 200, {
      jsonrpc: '2.0',
      id: mcpRequest.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          authentication: {
            type: 'oauth2',
            oauth2: {
              issuer: `https://${req.headers.host}`,
              authorizationEndpoint: `https://${req.headers.host}/oauth/authorize`,
              tokenEndpoint: `https://${req.headers.host}/oauth/token`,
              grantTypes: ['client_credentials'],
              scopes: ['fiken:read', 'fiken:write'],
              clientAuthenticationMethods: ['client_secret_post', 'client_secret_basic']
            }
          }
        },
        serverInfo: {
          ...SERVER_INFO,
          authentication: {
            type: 'oauth2',
            required: true
          }
        }
      }
    });
    return;
  }

  // All other methods require authentication
  if (!authenticateRequest(req)) {
    sendAuthError(res);
    return;
  }

  await processMcpRequest(registry, mcpRequest, res);
};

const processMcpRequest = async (registry: ToolRegistry, mcpRequest: any, res: http.ServerResponse): Promise<void> => {
  let mcpResponse;

  if (mcpRequest.id === undefined) {
    // Notifications (e.g. notifications/initialized) get 202 Accepted with no body
    res.writeHead(202);
    res.end();
    return;
  } else if (mcpRequest.method === 'ping') {
    mcpResponse = { jsonrpc: '2.0', id: mcpRequest.id, result: {} };
  } else if (mcpRequest.method === 'tools/list') {
    mcpResponse = { jsonrpc: '2.0', id: mcpRequest.id, result: { tools: registry.list('http') } };
  } else if (mcpRequest.method === 'tools/call') {
    let result: ToolResult;
    try {
      // Destructured from params as before, so a missing params object reports the same error text
      const { name, arguments: args } = mcpRequest.params;
      result = await registry.call(name, args, 'http');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      result = { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };
    }
    mcpResponse = { jsonrpc: '2.0', id: mcpRequest.id, result };
  } else {
    mcpResponse = { jsonrpc: '2.0', id: mcpRequest.id, error: { code: -32601, message: 'Method not found' } };
  }

  sendJson(res, 200, mcpResponse);
};
