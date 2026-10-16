/**
 * Tools for inspecting and configuring the Fiken API connection.
 */

import { ConfigSchema, getEnvConfig } from '../config.js';
import { jsonResult, textResult, ToolDefinition } from './types.js';

export const statusTools: ToolDefinition[] = [
  {
    name: 'fiken_status',
    description: 'Check the current configuration status of the Fiken MCP server',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      const envConfig = getEnvConfig();
      const isConfigured = context.isConfigured;

      return jsonResult({
        configured: isConfigured,
        autoConfiguredFromEnv: isConfigured && !!envConfig.apiToken,
        hasApiToken: !!envConfig.apiToken,
        hasDefaultCompanySlug: !!context.defaultCompanySlug,
        defaultCompanySlug: context.defaultCompanySlug,
        environmentVariables: {
          FIKEN_API_TOKEN: envConfig.apiToken ? 'SET' : 'NOT SET',
          FIKEN_COMPANY_SLUG: envConfig.companySlug || 'NOT SET',
          FIKEN_BASE_URL: envConfig.baseUrl || 'NOT SET',
          FIKEN_TIMEOUT: envConfig.timeout ? envConfig.timeout.toString() : 'NOT SET',
        },
      });
    },
  },
  {
    name: 'fiken_configure',
    description: 'Configure the Fiken API connection with authentication token',
    inputSchema: {
      type: 'object',
      properties: {
        apiToken: {
          type: 'string',
          description: 'Fiken API authentication token',
        },
        baseUrl: {
          type: 'string',
          description: 'Base URL for Fiken API (optional, defaults to https://api.fiken.no/api/v2)',
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds (optional, defaults to 30000)',
        },
      },
      required: ['apiToken'],
    },
    // On a shared remote server this would let any caller repoint the API client (and its token)
    http: false,
    handler: async (args, context) => {
      const envConfig = getEnvConfig();

      // Merge environment variables with provided args, giving priority to args
      const config = ConfigSchema.parse({
        apiToken: args.apiToken || envConfig.apiToken,
        baseUrl: args.baseUrl || envConfig.baseUrl,
        timeout: args.timeout || envConfig.timeout,
      });
      context.configure(config);

      return textResult(`Fiken Purchase Service configured successfully${envConfig.apiToken ? ' (using environment variables)' : ''}`);
    },
  },
];
