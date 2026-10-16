/**
 * The contract every tool module implements, plus helpers for building results.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { FikenPaginationHeaders } from 'fiken-shared';
import type { FikenContext } from '../context.js';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** A tool result plus metadata that is logged but never sent to the client */
export interface ToolOutput extends ToolResult {
  meta?: { items?: number };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Tool['inputSchema'];
  /**
   * Set to false for tools that are unsafe on a shared remote server, e.g. ones that repoint the API
   * client (and its token) or read paths from the server's disk. Defaults to true.
   */
  http?: boolean;
  handler: (args: Record<string, any>, context: FikenContext) => Promise<ToolOutput>;
}

export const textResult = (text: string): ToolOutput => ({ content: [{ type: 'text', text }] });

/**
 * Result for create/send calls: Fiken returns the new resource's URL in the Location header, and agents need its id
 * to follow up (e.g. attach a receipt to the draft they just created)
 */
export const createdResult = (message: string, response: { location?: string }): ToolOutput => {
  const id = response.location?.match(/\/(\d+)\/?$/)?.[1];
  return jsonResult({ message, ...(id && { id: Number(id) }), ...(response.location && { location: response.location }) });
};

/** Pretty-printed by default to match the historic output; pass pretty: false for large payloads */
export const jsonResult = (value: unknown, options: { pretty?: boolean; items?: number } = {}): ToolOutput => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, options.pretty === false ? undefined : 2) }],
  ...(options.items !== undefined && { meta: { items: options.items } }),
});

export const paginationFrom = (headers: FikenPaginationHeaders | undefined) => headers && {
  page: headers['Fiken-Api-Page'],
  pageSize: headers['Fiken-Api-Page-Size'],
  pageCount: headers['Fiken-Api-Page-Count'],
  resultCount: headers['Fiken-Api-Result-Count'],
};

/**
 * Standard list output: { pagination, <key>: items }, minified because lists get large. Map items to a compact
 * summary by default and offer detail: "full" for complete records, as fiken_get_purchases does.
 */
export const listResult = (
  key: string,
  response: { data: unknown; headers?: FikenPaginationHeaders },
  mapItem: (item: any) => unknown = item => item,
): ToolOutput => {
  const items = Array.isArray(response.data) ? response.data.map(mapItem) : [];
  return jsonResult({ pagination: paginationFrom(response.headers), [key]: items }, { pretty: false, items: items.length });
};
