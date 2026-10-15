import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { FikenContext } from '../context.js';
import {
  CounterSchema,
  InvoiceDraftQueryParamsSchema,
  InvoiceDraftRequestSchema,
  InvoiceQueryParamsSchema,
  InvoiceRequestSchema,
  SendInvoiceRequestSchema,
  UpdateInvoiceRequestSchema,
} from '../schemas/invoices.js';
import { invoiceTools } from './invoices.js';
import { ToolRegistry } from './registry.js';

const BASE = 'https://api.fiken.no/api/v2/companies/co';

const pageHeaders = {
  'Fiken-Api-Page': 0,
  'Fiken-Api-Page-Size': 25,
  'Fiken-Api-Page-Count': 2,
  'Fiken-Api-Result-Count': 30,
};

const fullInvoice = {
  invoiceId: 55,
  invoiceNumber: 10001,
  issueDate: '2024-01-15',
  dueDate: '2024-01-29',
  net: 100000,
  vat: 25000,
  gross: 125000,
  grossInNok: 125000,
  currency: 'NOK',
  kid: '0000100013',
  customer: { contactId: 42, name: 'Acme AS', address: { country: 'Norway' } },
  sale: { saleId: 9, settled: false, outstandingBalance: 125000, lines: [] },
  lines: [{ description: 'Consulting', quantity: 2, unitPrice: 50000 }],
  dispatches: [{ date: '2024-01-15', dispatchType: 'email' }],
  invoicePdf: { downloadUrl: 'https://example.com/pdf' },
};

const makeContext = () => {
  const invoices = {
    getInvoices: vi.fn(async () => ({ data: [fullInvoice], headers: pageHeaders })),
    getInvoice: vi.fn(async () => ({ data: fullInvoice })),
    createInvoice: vi.fn(async () => ({ data: undefined, location: `${BASE}/invoices/55` })),
    updateInvoice: vi.fn(async () => ({ data: '', location: `${BASE}/invoices/55` })),
    sendInvoice: vi.fn(async () => ({ data: undefined })),
    getInvoiceDrafts: vi.fn(async () => ({
      data: [{ draftId: 9, type: 'invoice', customers: [{ contactId: 42, name: 'Acme AS' }], net: 100, gross: 125, lines: [] }],
      headers: pageHeaders,
    })),
    createInvoiceDraft: vi.fn(async () => ({ data: undefined, location: `${BASE}/invoices/drafts/9` })),
    getInvoiceDraft: vi.fn(async () => ({ data: { draftId: 9, type: 'invoice' } })),
    updateInvoiceDraft: vi.fn(async () => ({ data: undefined, location: `${BASE}/invoices/drafts/9` })),
    createInvoiceFromDraft: vi.fn(async () => ({ data: undefined, location: `${BASE}/invoices/56` })),
    getInvoiceCounter: vi.fn(async () => ({ data: { value: 10042 } })),
    createInvoiceCounter: vi.fn(async () => ({ data: undefined })),
    getInvoiceAttachments: vi.fn(async () => ({ data: [{ filename: 'invoice.pdf', type: 'invoice' }] })),
    getInvoiceDraftAttachments: vi.fn(async () => ({ data: [] })),
  };
  const context = {
    ensureConfigured() {},
    resolveCompanySlug: (slug?: string) => slug ?? 'co',
    invoices,
  } as unknown as FikenContext;
  return { context, invoices, registry: new ToolRegistry(invoiceTools, context) };
};

const call = async (name: string, args: Record<string, any>) => {
  const { registry, invoices } = makeContext();
  const result = await registry.call(name, args, 'stdio');
  return { result, text: result.content[0].text, invoices };
};

const validInvoice = {
  issueDate: '2024-01-15',
  dueDate: '2024-01-29',
  customerId: 42,
  bankAccountCode: '1920:10001',
  cash: false,
  lines: [{ description: 'Consulting', quantity: 2, unitPrice: 50000, vatType: 'HIGH', incomeAccount: '3000' }],
};

describe('invoice tools', () => {
  describe('created ids', () => {
    it('fiken_create_invoice returns the new invoiceId from Location', async () => {
      const { result, text, invoices } = await call('fiken_create_invoice', { invoice: validInvoice });

      expect(result.isError).toBeUndefined();
      expect(JSON.parse(text)).toEqual({ message: 'Invoice created', id: 55, location: `${BASE}/invoices/55` });
      expect(invoices.createInvoice).toHaveBeenCalledWith('co', validInvoice);
    });

    it('fiken_create_invoice_draft returns the new draftId from Location', async () => {
      const draft = { type: 'invoice', customerId: 42, daysUntilDueDate: 14, lines: [{ quantity: 1, unitPrice: 100 }] };
      const { text, invoices } = await call('fiken_create_invoice_draft', { draft });

      expect(JSON.parse(text)).toMatchObject({ message: 'Invoice draft created', id: 9 });
      expect(invoices.createInvoiceDraft).toHaveBeenCalledWith('co', draft);
    });

    it('fiken_send_invoice reports what was sent and defaults includeDocumentAttachments', async () => {
      const { text, invoices } = await call('fiken_send_invoice', { sendRequest: { invoiceId: 55, method: ['ehf', 'email'] } });

      expect(JSON.parse(text)).toEqual({ message: 'Invoice sent', invoiceId: 55, method: ['ehf', 'email'] });
      expect(invoices.sendInvoice).toHaveBeenCalledWith('co', {
        invoiceId: 55,
        method: ['ehf', 'email'],
        includeDocumentAttachments: true,
      });
    });

    it('fiken_update_invoice sends newDueDate and returns the invoice id', async () => {
      const { text, invoices } = await call('fiken_update_invoice', { invoiceId: 55, updates: { newDueDate: '2024-02-15' } });

      expect(JSON.parse(text)).toEqual({ message: 'Invoice updated', invoiceId: 55, location: `${BASE}/invoices/55` });
      expect(invoices.updateInvoice).toHaveBeenCalledWith('co', 55, { newDueDate: '2024-02-15' });
    });
  });

  describe('drafts, counter and attachments', () => {
    it('fiken_get_invoice_draft returns the draft itself', async () => {
      const { text, invoices } = await call('fiken_get_invoice_draft', { draftId: 9 });

      expect(JSON.parse(text)).toEqual({ draftId: 9, type: 'invoice' });
      expect(invoices.getInvoiceDraft).toHaveBeenCalledWith('co', 9);
    });

    it('fiken_update_invoice_draft drops read-only line fields copied from a fetched draft', async () => {
      const draft = {
        type: 'invoice',
        customerId: 42,
        daysUntilDueDate: 14,
        lines: [{ invoiceishDraftLineId: 77, lastModifiedDate: '2024-01-01', quantity: 1, unitPrice: 100 }],
      };
      const { text, invoices } = await call('fiken_update_invoice_draft', { draftId: 9, draft });

      expect(JSON.parse(text)).toMatchObject({ message: 'Invoice draft updated', id: 9 });
      expect(invoices.updateInvoiceDraft).toHaveBeenCalledWith('co', 9, {
        type: 'invoice',
        customerId: 42,
        daysUntilDueDate: 14,
        lines: [{ quantity: 1, unitPrice: 100 }],
      });
    });

    it('fiken_create_invoice_from_draft returns the new invoiceId', async () => {
      const { text, invoices } = await call('fiken_create_invoice_from_draft', { draftId: 9 });

      expect(JSON.parse(text)).toEqual({ message: 'Invoice created from draft', id: 56, location: `${BASE}/invoices/56` });
      expect(invoices.createInvoiceFromDraft).toHaveBeenCalledWith('co', 9);
    });

    it('fiken_get_invoice_counter returns the counter', async () => {
      expect(JSON.parse((await call('fiken_get_invoice_counter', {})).text)).toEqual({ value: 10042 });
    });

    it('fiken_create_invoice_counter sends the value, or nothing for Fiken\'s default', async () => {
      const custom = await call('fiken_create_invoice_counter', { counter: { value: 20000 } });
      expect(JSON.parse(custom.text)).toEqual({ message: 'Invoice counter created', value: 20000 });
      expect(custom.invoices.createInvoiceCounter).toHaveBeenCalledWith('co', { value: 20000 });

      const fallback = await call('fiken_create_invoice_counter', {});
      expect(JSON.parse(fallback.text)).toEqual({ message: 'Invoice counter created', value: 10000 });
      expect(fallback.invoices.createInvoiceCounter).toHaveBeenCalledWith('co', undefined);

      expect((await call('fiken_create_invoice_counter', { counter: { value: 'x' } })).text)
        .toBe('Error: Invalid arguments: counter.value: Expected number, received string');
    });

    it('attachment lists return {attachments}', async () => {
      const { text, invoices } = await call('fiken_get_invoice_attachments', { invoiceId: 55 });
      expect(JSON.parse(text)).toEqual({ attachments: [{ filename: 'invoice.pdf', type: 'invoice' }] });
      expect(invoices.getInvoiceAttachments).toHaveBeenCalledWith('co', 55);

      expect(JSON.parse((await call('fiken_get_invoice_draft_attachments', { draftId: 9 })).text))
        .toEqual({ attachments: [] });
    });

    it.each([
      'fiken_get_invoice_draft',
      'fiken_update_invoice_draft',
      'fiken_create_invoice_from_draft',
      'fiken_get_invoice_draft_attachments',
    ])('%s requires draftId', async name => {
      expect((await call(name, { draftId: 'nine' })).text)
        .toBe('Error: Invalid arguments: draftId: Expected number, received string');
    });
  });

  describe('validation errors name the field', () => {
    it.each([
      ['fiken_create_invoice', {}, 'invoice: Required'],
      ['fiken_create_invoice_draft', {}, 'draft: Required'],
      ['fiken_send_invoice', {}, 'sendRequest: Required'],
      ['fiken_update_invoice', { invoiceId: 55 }, 'updates: Required'],
      ['fiken_get_invoice', {}, 'invoiceId: Required'],
    ])('%s with %j', async (name, args, message) => {
      const { result, text } = await call(name, args);

      expect(result.isError).toBe(true);
      expect(text).toBe(`Error: Invalid arguments: ${message}`);
    });

    it('rejects the old field names instead of dropping them', async () => {
      const { text, invoices } = await call('fiken_create_invoice', {
        invoice: { ...validInvoice, contactId: 42, lines: [{ description: 'x', count: 1 }] },
      });

      expect(text).toContain("invoice: Unrecognized key(s) in object: 'contactId'");
      expect(text).toContain('invoice.lines.0.quantity: Required');
      expect(text).toContain("invoice.lines.0: Unrecognized key(s) in object: 'count'");
      expect(invoices.createInvoice).not.toHaveBeenCalled();
    });

    it('requires the spec fields on an invoice', async () => {
      const { text } = await call('fiken_create_invoice', { invoice: { issueDate: '2024-01-15', lines: [] } });

      for (const field of ['dueDate', 'customerId', 'bankAccountCode', 'cash']) {
        expect(text).toContain(`invoice.${field}: Required`);
      }
      expect(text).toContain('invoice.lines: At least one line is required');
    });

    it('rejects fractional cents', async () => {
      const { text } = await call('fiken_create_invoice', {
        invoice: { ...validInvoice, lines: [{ quantity: 1, unitPrice: 99.5 }] },
      });

      expect(text).toBe('Error: Invalid arguments: invoice.lines.0.unitPrice: Must be an integer amount in cents (øre)');
    });

    it('requires the send method to be an array of spec channels', async () => {
      expect((await call('fiken_send_invoice', { sendRequest: { invoiceId: 55, method: 'email' } })).text)
        .toBe('Error: Invalid arguments: sendRequest.method: Expected array, received string');
      expect((await call('fiken_send_invoice', { sendRequest: { invoiceId: 55, method: ['vipps'] } })).text)
        .toContain('sendRequest.method.0: Invalid enum value');
    });

    it('requires type, customerId and daysUntilDueDate on a draft, and rejects repeating_invoice drafts', async () => {
      const { text } = await call('fiken_create_invoice_draft', { draft: { lines: [] } });
      for (const field of ['type', 'customerId', 'daysUntilDueDate']) {
        expect(text).toContain(`draft.${field}: Required`);
      }

      const repeating = await call('fiken_create_invoice_draft', {
        draft: { type: 'repeating_invoice', customerId: 42, daysUntilDueDate: 14, startDate: '2024-01-01' },
      });
      expect(repeating.text).toContain('draft.type: Invalid enum value');
      expect(repeating.text).toContain("Unrecognized key(s) in object: 'startDate'");
      expect(repeating.invoices.createInvoiceDraft).not.toHaveBeenCalled();
    });

    it('rejects an empty update and the old dueDate name', async () => {
      expect((await call('fiken_update_invoice', { invoiceId: 55, updates: {} })).text)
        .toBe('Error: Invalid arguments: updates: Provide newDueDate and/or sentManually');
      expect((await call('fiken_update_invoice', { invoiceId: 55, updates: { dueDate: '2024-02-15' } })).text)
        .toContain("Unrecognized key(s) in object: 'dueDate'");
    });

    it('validates list query params', async () => {
      const { text, invoices } = await call('fiken_get_invoices', { params: { pageSize: 500, issueDateGe: '15.01.2024' } });

      expect(text).toContain('params.pageSize: Number must be less than or equal to 100');
      expect(text).toContain('params.issueDateGe: Expected a date in YYYY-MM-DD format');
      expect(invoices.getInvoices).not.toHaveBeenCalled();
    });
  });

  describe('outputs', () => {
    it('fiken_get_invoice returns the invoice itself, not a {data, headers} wrapper', async () => {
      const { text } = await call('fiken_get_invoice', { invoiceId: 55 });

      expect(JSON.parse(text)).toEqual(fullInvoice);
    });

    it('fiken_get_invoices returns pagination and compact summaries by default, minified', async () => {
      const { text, invoices } = await call('fiken_get_invoices', { params: { settled: false, customerId: 42 } });

      expect(text).not.toContain('\n');
      expect(invoices.getInvoices).toHaveBeenCalledWith('co', { settled: false, customerId: 42 });
      expect(JSON.parse(text)).toEqual({
        pagination: { page: 0, pageSize: 25, pageCount: 2, resultCount: 30 },
        invoices: [{
          invoiceId: 55,
          invoiceNumber: 10001,
          issueDate: '2024-01-15',
          dueDate: '2024-01-29',
          customerId: 42,
          customer: 'Acme AS',
          description: 'Consulting',
          currency: 'NOK',
          net: 100000,
          vat: 25000,
          gross: 125000,
          grossInNok: 125000,
          settled: false,
          outstandingBalanceInNok: 125000,
          sent: true,
          kid: '0000100013',
        }],
      });
    });

    it('fiken_get_invoices returns full records with detail="full"', async () => {
      const { text } = await call('fiken_get_invoices', { detail: 'full' });

      expect(JSON.parse(text).invoices).toEqual([fullInvoice]);
    });

    it('fiken_get_invoice_drafts returns pagination and draft summaries', async () => {
      const { text } = await call('fiken_get_invoice_drafts', {});

      expect(JSON.parse(text)).toEqual({
        pagination: { page: 0, pageSize: 25, pageCount: 2, resultCount: 30 },
        drafts: [{ draftId: 9, type: 'invoice', customerId: 42, customer: 'Acme AS', net: 100, gross: 125 }],
      });
    });
  });

  describe('input schemas advertise every zod field', () => {
    const unwrap = (schema: z.ZodTypeAny): z.ZodTypeAny => {
      if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) return unwrap(schema._def.innerType);
      // Covers refine() and preprocess()
      if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema);
      return schema;
    };
    const isOptional = (schema: z.ZodTypeAny) => schema.isOptional() || schema instanceof z.ZodDefault;

    // Walks a zod schema alongside its JSON schema, collecting every mismatch in field names or required-ness
    const diff = (zodSchema: z.ZodTypeAny, json: any, path: string): string[] => {
      const inner = unwrap(zodSchema);
      if (inner instanceof z.ZodArray) return diff(inner.element, json.items, `${path}[]`);
      if (!(inner instanceof z.ZodObject)) return [];

      const shape = inner.shape as Record<string, z.ZodTypeAny>;
      const zodKeys = Object.keys(shape).sort();
      const jsonKeys = Object.keys(json.properties ?? {}).sort();
      const zodRequired = zodKeys.filter(key => !isOptional(shape[key]));
      const problems: string[] = [];
      if (zodKeys.join() !== jsonKeys.join()) problems.push(`${path} properties: zod [${zodKeys}] vs json [${jsonKeys}]`);
      if (zodRequired.join() !== [...(json.required ?? [])].sort().join()) {
        problems.push(`${path} required: zod [${zodRequired}] vs json [${json.required ?? []}]`);
      }
      for (const key of zodKeys) {
        if (json.properties?.[key]) problems.push(...diff(shape[key], json.properties[key], `${path}.${key}`));
      }
      return problems;
    };

    const tool = (name: string) => invoiceTools.find(t => t.name === name)!.inputSchema as any;

    it.each([
      ['fiken_get_invoices', 'params', InvoiceQueryParamsSchema],
      ['fiken_get_invoice_drafts', 'params', InvoiceDraftQueryParamsSchema],
      ['fiken_create_invoice', 'invoice', InvoiceRequestSchema],
      ['fiken_update_invoice', 'updates', UpdateInvoiceRequestSchema],
      ['fiken_send_invoice', 'sendRequest', SendInvoiceRequestSchema],
      ['fiken_create_invoice_draft', 'draft', InvoiceDraftRequestSchema],
      ['fiken_update_invoice_draft', 'draft', InvoiceDraftRequestSchema],
      ['fiken_create_invoice_counter', 'counter', CounterSchema],
    ] as const)('%s.%s', (name, arg, schema) => {
      expect(diff(schema, tool(name).properties[arg], arg)).toEqual([]);
    });

    it('every invoice tool has a description and object input schema', () => {
      for (const t of invoiceTools) {
        expect(t.description.length).toBeGreaterThan(20);
        expect(t.inputSchema.type).toBe('object');
        expect(t.inputSchema.properties).toHaveProperty('companySlug');
      }
    });

    it('has unique fiken_ names, no delete or recurring-invoice tools, and no send tool besides fiken_send_invoice', () => {
      const names = invoiceTools.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.every(name => name.startsWith('fiken_'))).toBe(true);
      expect(names.filter(name => /delete/.test(name))).toEqual([]);
      expect(names.filter(name => /recurring|repeating/.test(name))).toEqual([]);
      expect(names.filter(name => /send/.test(name))).toEqual(['fiken_send_invoice']);
    });
  });
});
