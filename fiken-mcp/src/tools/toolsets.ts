/**
 * Groups tools into toolsets that can be switched on per deployment with FIKEN_TOOLSETS.
 * Every tool schema is sent to the client on each conversation, so the default is the set an accounting firm
 * (Fiken partner) uses for bookkeeping; tools a business uses to run itself (products, quotes, time) are opt-in.
 */

import { logger } from 'fiken-shared';
import { accountingTools } from './accounting.js';
import { contactTools } from './contacts.js';
import { invoiceTools } from './invoices.js';
import { purchaseTools } from './purchases.js';
import { salesDocumentTools } from './sales-documents.js';
import { saleTools } from './sales.js';
import { statusTools } from './status.js';
import type { ToolDefinition } from './types.js';
import { companyTools, inboxTools, projectTools, timeTools } from './workspace.js';

const pick = (tools: ToolDefinition[], names: string[]): ToolDefinition[] =>
  names.map(name => {
    const tool = tools.find(candidate => candidate.name === name);
    if (!tool) {
      // Fail at startup rather than silently dropping a renamed tool
      throw new Error(`Toolset references unknown tool ${name}`);
    }
    return tool;
  });

const omit = (tools: ToolDefinition[], names: string[]): ToolDefinition[] =>
  tools.filter(tool => !names.includes(tool.name));

const PRODUCT_TOOLS = ['fiken_get_products', 'fiken_get_product', 'fiken_create_product', 'fiken_update_product',
  'fiken_get_product_sales_report'];
const CONTACT_PERSON_TOOLS = ['fiken_get_contact_persons', 'fiken_get_contact_person', 'fiken_create_contact_person',
  'fiken_update_contact_person'];
const INVOICE_COUNTER_TOOLS = ['fiken_get_invoice_counter', 'fiken_create_invoice_counter'];
const SALES_DOCUMENT_COUNTER_TOOLS = ['fiken_get_sales_document_counter', 'fiken_create_sales_document_counter'];

// Always on: configuration status and company discovery (a partner works across many client companies)
export const CORE_TOOLS: ToolDefinition[] = [...statusTools, ...companyTools];

export const TOOLSETS: Record<string, ToolDefinition[]> = {
  // Bookkeeping (default)
  purchases: purchaseTools,
  sales: saleTools,
  invoices: omit(invoiceTools, INVOICE_COUNTER_TOOLS),
  contacts: omit(contactTools, [...PRODUCT_TOOLS, ...CONTACT_PERSON_TOOLS]),
  accounting: accountingTools,
  inbox: inboxTools,
  // Running the business (opt-in)
  'sales-documents': omit(salesDocumentTools, SALES_DOCUMENT_COUNTER_TOOLS),
  products: pick(contactTools, PRODUCT_TOOLS),
  'contact-persons': pick(contactTools, CONTACT_PERSON_TOOLS),
  projects: projectTools,
  time: timeTools,
  // One-off company setup (opt-in)
  setup: [...pick(invoiceTools, INVOICE_COUNTER_TOOLS), ...pick(salesDocumentTools, SALES_DOCUMENT_COUNTER_TOOLS)],
};

export const DEFAULT_TOOLSETS = ['purchases', 'sales', 'invoices', 'contacts', 'accounting', 'inbox'];

/** Parses a comma-separated FIKEN_TOOLSETS value ("all" enables everything); unknown names are logged and ignored */
export const resolveToolsetNames = (value: string | undefined): string[] => {
  const requested = value?.split(',').map(name => name.trim()).filter(Boolean);
  if (!requested?.length) {
    return DEFAULT_TOOLSETS;
  }
  if (requested.includes('all')) {
    return Object.keys(TOOLSETS);
  }

  const unknown = requested.filter(name => !Object.hasOwn(TOOLSETS, name));
  if (unknown.length) {
    logger.warn('Ignoring unknown FIKEN_TOOLSETS entries', { unknown, available: Object.keys(TOOLSETS) });
  }
  return [...new Set(requested.filter(name => Object.hasOwn(TOOLSETS, name)))];
};

export const selectTools = (toolsetNames: string[]): ToolDefinition[] => [
  ...CORE_TOOLS,
  ...toolsetNames.flatMap(name => TOOLSETS[name]),
];
