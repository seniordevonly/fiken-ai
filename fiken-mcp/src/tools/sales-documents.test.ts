import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { FikenContext } from '../context.js';
import { ToolRegistry } from './registry.js';
import { salesDocumentToolArgs, salesDocumentTools } from './sales-documents.js';

const headers = {
  'Fiken-Api-Page': 0,
  'Fiken-Api-Page-Size': 25,
  'Fiken-Api-Page-Count': 1,
  'Fiken-Api-Result-Count': 1,
};
const base = 'https://api.fiken.no/api/v2/companies/co';

const creditNote = {
  creditNoteId: 11,
  creditNoteNumber: 10001,
  issueDate: '2024-03-01',
  customer: { contactId: 42, name: 'Acme AS', email: 'post@acme.no' },
  currency: 'NOK',
  net: 10000,
  vat: 2500,
  gross: 12500,
  netInNok: 10000,
  settled: false,
  associatedInvoiceId: 99,
  lines: [{ description: 'Refund', unitPrice: 10000, quantity: 1 }],
  address: { country: 'Norway' },
};

const recurringInvoice = {
  recurringInvoiceId: 5,
  description: 'Monthly support',
  active: true,
  daysUntilDueDate: 14,
  invoiceDraftUuid: 'abc',
  jobs: [{
    jobId: 6,
    customerId: 42,
    frequency: { interval: 1, intervalUnit: 'MONTH' },
    nextDate: '2024-04-01',
    active: true,
    currency: 'NOK',
    gross: 125000,
    lines: [{ description: 'Support' }],
    recipients: { emails: ['a@acme.no'] },
  }],
};

const line = { description: 'Consulting', unitPrice: 100000, quantity: 2, vatType: 'HIGH' };

const setup = () => {
  const service = {
    getCreditNotes: vi.fn().mockResolvedValue({ data: [creditNote], headers }),
    getCreditNote: vi.fn().mockResolvedValue({ data: creditNote }),
    createFullCreditNote: vi.fn().mockResolvedValue({ data: undefined, location: `${base}/creditNotes/12` }),
    createPartialCreditNote: vi.fn().mockResolvedValue({ data: undefined, location: `${base}/creditNotes/13` }),
    getOffers: vi.fn().mockResolvedValue({ data: [{ offerId: 3, offerNumber: 10002, gross: 500, lines: [] }], headers }),
    getDrafts: vi.fn().mockResolvedValue({
      data: [{ draftId: 8, type: 'offer', customers: [{ contactId: 42, name: 'Acme AS' }], net: 100, gross: 125, lines: [] }],
      headers,
    }),
    createDraft: vi.fn().mockResolvedValue({ data: undefined, location: `${base}/offers/drafts/8` }),
    createFromDraft: vi.fn().mockResolvedValue({ data: undefined, location: `${base}/offers/31` }),
    createInvoiceDraftFromOrderConfirmation: vi.fn().mockResolvedValue({ data: undefined, location: `${base}/invoices/drafts/77` }),
    createCounter: vi.fn().mockResolvedValue({ data: undefined }),
    getRecurringInvoices: vi.fn().mockResolvedValue({ data: [recurringInvoice], headers }),
    getRecurringInvoice: vi.fn().mockResolvedValue({ data: recurringInvoice }),
  };
  const context = { resolveCompanySlug: (s?: string) => s ?? 'co', client: () => service } as unknown as FikenContext;
  // Through the registry, so zod failures come back as the "Invalid arguments: field: problem" text agents see
  const registry = new ToolRegistry(salesDocumentTools, context);
  const call = (name: string, args: Record<string, any> = {}) => registry.call(name, args, 'stdio');
  const json = async (name: string, args?: Record<string, any>) => {
    const result = await call(name, args);
    expect(result.isError, result.content[0].text).toBeFalsy();
    return JSON.parse(result.content[0].text);
  };
  return { service, call, json };
};

describe('salesDocumentTools', () => {
  it('has unique fiken_ names, no delete/send tools, and only read tools for recurring invoices', () => {
    const names = salesDocumentTools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^fiken_[a-z_]+$/);
      expect(name).not.toMatch(/delete|send/);
    }
    expect(names.filter(name => /recurring/.test(name))).toEqual(['fiken_get_recurring_invoices', 'fiken_get_recurring_invoice']);
  });

  it('advertises exactly the top-level fields its zod schema accepts', () => {
    expect(Object.keys(salesDocumentToolArgs).sort()).toEqual(salesDocumentTools.map(t => t.name).sort());
    for (const tool of salesDocumentTools) {
      const shape: z.ZodRawShape = salesDocumentToolArgs[tool.name as keyof typeof salesDocumentToolArgs].shape;
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort(), tool.name).toEqual(Object.keys(shape).sort());
      for (const field of (tool.inputSchema.required as string[] | undefined) ?? []) {
        expect(shape[field].isOptional(), `${tool.name}.${field}`).toBe(false);
      }
    }
  });

  it('advertises the same draft and credit note filter fields as the zod schema', () => {
    const props = (name: string, field: string) =>
      Object.keys((salesDocumentTools.find(t => t.name === name)!.inputSchema.properties as any)[field].properties).sort();
    const draftShape = salesDocumentToolArgs.fiken_create_sales_document_draft.shape.draft;
    expect(props('fiken_create_sales_document_draft', 'draft')).toEqual(Object.keys(draftShape.shape).sort());
    const filters = salesDocumentToolArgs.fiken_get_credit_notes.shape.params.unwrap().shape;
    expect(props('fiken_get_credit_notes', 'params')).toEqual(Object.keys(filters).sort());
  });

  describe('lists', () => {
    it('returns compact credit note summaries with pagination', async () => {
      const { service, json } = setup();
      const result = await json('fiken_get_credit_notes', { params: { settled: false, issueDateGe: '2024-01-01' } });

      expect(service.getCreditNotes).toHaveBeenCalledWith('co', { settled: false, issueDateGe: '2024-01-01' });
      expect(result.pagination).toEqual({ page: 0, pageSize: 25, pageCount: 1, resultCount: 1 });
      expect(result.creditNotes).toEqual([{
        creditNoteId: 11,
        creditNoteNumber: 10001,
        issueDate: '2024-03-01',
        customerId: 42,
        customerName: 'Acme AS',
        currency: 'NOK',
        net: 10000,
        vat: 2500,
        gross: 12500,
        settled: false,
        associatedInvoiceId: 99,
      }]);
    });

    it('returns full records with detail=full', async () => {
      const { json } = setup();
      const result = await json('fiken_get_credit_notes', { detail: 'full' });
      expect(result.creditNotes[0]).toEqual(creditNote);
    });

    it('summarizes drafts and recurring invoice jobs', async () => {
      const { service, json } = setup();
      const drafts = await json('fiken_get_sales_document_drafts', { documentType: 'offer', params: { pageSize: 50 } });
      expect(service.getDrafts).toHaveBeenCalledWith('co', 'offer', { pageSize: 50 });
      expect(drafts.drafts[0]).toMatchObject({ draftId: 8, customerId: 42, customerName: 'Acme AS', gross: 125 });
      expect(drafts.drafts[0]).not.toHaveProperty('lines');

      const recurring = await json('fiken_get_recurring_invoices', { params: { active: true } });
      expect(recurring.recurringInvoices[0].jobs[0]).toEqual({
        jobId: 6,
        customerId: 42,
        frequency: { interval: 1, intervalUnit: 'MONTH' },
        nextDate: '2024-04-01',
        active: true,
        currency: 'NOK',
        gross: 125000,
      });
    });
  });

  it('gets one credit note as returned by Fiken', async () => {
    const { service, json } = setup();
    expect(await json('fiken_get_credit_note', { companySlug: 'other', creditNoteId: 11 })).toEqual(creditNote);
    expect(service.getCreditNote).toHaveBeenCalledWith('other', 11);
  });

  describe('creates', () => {
    it('routes full and partial credit notes and returns the new id', async () => {
      const { service, json } = setup();
      const full = await json('fiken_create_credit_note', { kind: 'full', creditNote: { issueDate: '2024-03-01', invoiceId: 99 } });
      expect(full).toEqual({ message: 'Credit note created', id: 12, location: `${base}/creditNotes/12` });
      expect(service.createFullCreditNote).toHaveBeenCalledWith('co', { issueDate: '2024-03-01', invoiceId: 99 });

      const partial = await json('fiken_create_credit_note', {
        kind: 'partial',
        creditNote: { issueDate: '2024-03-01', contactId: 42, lines: [line] },
      });
      expect(partial.id).toBe(13);
      expect(service.createPartialCreditNote).toHaveBeenCalledWith('co', { issueDate: '2024-03-01', contactId: 42, lines: [line] });
    });

    it('rejects partial-only fields on a full credit note', async () => {
      const { service, call } = setup();
      const result = await call('fiken_create_credit_note', {
        kind: 'full',
        creditNote: { issueDate: '2024-03-01', invoiceId: 99, lines: [line] },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/^Error: Invalid arguments: creditNote: Unrecognized key\(s\) in object: 'lines'/);
      expect(service.createFullCreditNote).not.toHaveBeenCalled();
    });

    it('creates a draft for the chosen document type', async () => {
      const { service, json } = setup();
      const draft = { customerId: 42, daysUntilDueDate: 14, lines: [line] };
      const result = await json('fiken_create_sales_document_draft', { documentType: 'offer', draft });
      expect(result).toMatchObject({ message: 'Draft created', id: 8 });
      expect(service.createDraft).toHaveBeenCalledWith('co', 'offer', draft);
    });

    it('issues a document from a draft and an invoice draft from an order confirmation', async () => {
      const { service, json } = setup();
      expect(await json('fiken_create_sales_document_from_draft', { documentType: 'offer', draftId: 8 }))
        .toMatchObject({ message: 'Offer created from draft 8', id: 31 });
      expect(service.createFromDraft).toHaveBeenCalledWith('co', 'offer', 8);

      expect(await json('fiken_create_invoice_draft_from_order_confirmation', { confirmationId: 4 }))
        .toMatchObject({ message: 'Invoice draft created', id: 77 });
    });

    it('creates a counter with or without a start value', async () => {
      const { service, call } = setup();
      await call('fiken_create_sales_document_counter', { documentType: 'credit_note' });
      expect(service.createCounter).toHaveBeenLastCalledWith('co', 'credit_note', undefined);
      await call('fiken_create_sales_document_counter', { documentType: 'credit_note', value: 500 });
      expect(service.createCounter).toHaveBeenLastCalledWith('co', 'credit_note', { value: 500 });
    });
  });

  describe('validation errors name the field', () => {
    it.each([
      ['fiken_get_credit_note', { creditNoteId: -1 }, /^Error: Invalid arguments: creditNoteId: /],
      ['fiken_get_offers', { params: { pageSize: 500 } }, /^Error: Invalid arguments: params\.pageSize: /],
      ['fiken_get_sales_document_drafts', { documentType: 'invoice' }, /^Error: Invalid arguments: documentType: /],
      ['fiken_create_sales_document_draft', { documentType: 'offer', draft: { daysUntilDueDate: 14 } }, /^Error: Invalid arguments: draft\.customerId: Required/],
      ['fiken_create_sales_document_draft', { documentType: 'offer', draft: { customerId: 1, daysUntilDueDate: 14, lines: [{ count: 1 }] } }, /draft\.lines\.0: Unrecognized key\(s\) in object: 'count'/],
    ])('%s %j', async (name, args, message) => {
      const { call } = setup();
      const result = await call(name, args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(message);
    });
  });
});
