/**
 * Server identity, limits and environment configuration.
 */

import { z } from 'zod';

export const SERVER_INFO = { name: 'fiken-mcp', version: '0.1.0' } as const;

export const MAX_HTTP_BODY_BYTES = 1024 * 1024;

export const getEnvConfig = () => ({
  apiToken: process.env.FIKEN_API_TOKEN,
  companySlug: process.env.FIKEN_COMPANY_SLUG,
  baseUrl: process.env.FIKEN_BASE_URL,
  timeout: process.env.FIKEN_TIMEOUT ? parseInt(process.env.FIKEN_TIMEOUT, 10) : undefined,
});

export const ConfigSchema = z.object({
  apiToken: z.string().min(1, 'API token is required'),
  baseUrl: z.string().url().startsWith('https://', 'Base URL must use https').optional(),
  timeout: z.number().positive().optional(),
});

export type FikenClientConfig = z.infer<typeof ConfigSchema>;
