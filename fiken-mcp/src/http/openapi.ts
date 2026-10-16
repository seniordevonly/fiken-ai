/**
 * OpenAPI description of the /mcp endpoint, served at /openapi.json.
 */

export const getOpenApiSpec = () => {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Fiken MCP Server',
      version: '0.1.0',
      description: 'Fiken API tools via MCP protocol'
    },
    servers: [
      {
        // TODO: stale Heroku URL from before the move to Railway; derive it from the request host instead
        url: 'https://fiken-ai-dev-5bab4c9f4bc4.herokuapp.com',
        description: 'Fiken MCP Server'
      }
    ],
    paths: {
      '/mcp': {
        post: {
          summary: 'MCP Protocol Endpoint',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    jsonrpc: { type: 'string', example: '2.0' },
                    id: { type: 'number', example: 1 },
                    method: { type: 'string', example: 'tools/list' },
                    params: { type: 'object' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'MCP Response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            }
          }
        }
      }
    }
  };
};
