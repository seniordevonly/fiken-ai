import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { logger } from 'fiken-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { FikenContext } from '../context.js';
import {
  AttachmentFileSchema,
  DraftRequestSchema,
  PaymentSchema,
  PurchaseAccrualRequestSchema,
  PurchaseDraftQueryParamsSchema,
  PurchaseQueryParamsSchema,
  PurchaseRequestSchema,
} from '../schemas.js';
import { purchaseTools } from './purchases.js';
import { ToolRegistry } from './registry.js';

const API = 'https://api.fiken.no/api/v2/companies/co';

const purchase = {
  purchaseId: 123,
  date: '2024-01-15',
  kind: 'supplier',
  paid: false,
  currency: 'NOK',
  supplier: { name: 'Acme AS' },
  lines: [{ description: 'Paper', vatType: 'HIGH', netPrice: 10000, vat: 2500 }],
};

const draft = {
  draftId: 45,
  cash: false,
  currency: 'NOK',
  lines: [{ text: 'Paper', vatType: 'HIGH', incomeAccount: '4000', net: 10000, gross: 12500 }],
};

const payment = { paymentId: 9, date: '2024-01-20', account: '1920:10001', amount: 12500 };

const accrual = { accrualId: 5, lineId: 77, account: '1700', startDate: '2024-01-01', periods: 12, amountPerPeriod: 1000 };

const fakeContext = () => {
  const purchases = {
    getPurchases: vi.fn(async () => ({
      data: [purchase],
      headers: { 'Fiken-Api-Page': 0, 'Fiken-Api-Page-Size': 25, 'Fiken-Api-Page-Count': 1, 'Fiken-Api-Result-Count': 1 },
    })),
    createPurchase: vi.fn(async () => ({ data: undefined, location: `${API}/purchases/123` })),
    getPurchase: vi.fn(async () => ({ data: purchase, headers: undefined })),
    createPurchaseDraft: vi.fn(async () => ({ data: undefined, location: `${API}/purchases/drafts/45` })),
    getPurchaseDraft: vi.fn(async () => ({ data: draft })),
    getPurchaseDraftAttachments: vi.fn(async () => ({ data: [{ uuid: 'abc', filename: 'invoice.pdf' }] })),
    addAttachmentToPurchaseDraft: vi.fn(async () => ({
      data: undefined,
      location: `${API}/purchases/drafts/45/attachments/745b2f15-1234-4408-8bf2-b1d2d7610cb2`,
    })),
    createPurchasePayment: vi.fn(async () => ({ data: undefined, location: `${API}/purchases/123/payments/9` })),
    getPurchaseDrafts: vi.fn(async () => ({
      data: [{ ...draft, contact: { name: 'Acme AS' } }],
      headers: { 'Fiken-Api-Page': 0, 'Fiken-Api-Page-Size': 25, 'Fiken-Api-Page-Count': 1, 'Fiken-Api-Result-Count': 1 },
    })),
    updatePurchaseDraft: vi.fn(async () => ({ data: undefined, location: `${API}/purchases/drafts/45` })),
    createPurchaseFromDraft: vi.fn(async () => ({ data: undefined, location: `${API}/purchases/456` })),
    getPurchaseAttachments: vi.fn(async () => ({ data: [{ uuid: 'def', filename: 'receipt.png' }] })),
    getPurchasePayments: vi.fn(async () => ({ data: [payment] })),
    getPurchasePayment: vi.fn(async () => ({ data: payment })),
    getPurchaseAccruals: vi.fn(async () => ({ data: [accrual] })),
    getPurchaseAccrual: vi.fn(async () => ({ data: accrual })),
    createPurchaseAccrual: vi.fn(async () => ({ data: undefined, location: `${API}/purchases/123/accruals/5` })),
  };
  const context = {
    ensureConfigured() {},
    resolveCompanySlug: (slug?: string) => slug ?? 'co',
    purchases,
  } as unknown as FikenContext;
  return { context, purchases };
};

const tool = (name: string) => {
  const found = purchaseTools.find(t => t.name === name);
  if (!found) throw new Error(`No tool ${name}`);
  return found;
};

const run = async (name: string, args: Record<string, unknown>, context: FikenContext) => {
  const result = await tool(name).handler(args, context);
  return JSON.parse(result.content[0].text);
};

const validPurchase = {
  date: '2024-01-15',
  kind: 'supplier',
  currency: 'NOK',
  lines: [{ description: 'Paper', vatType: 'HIGH', netPrice: 10000, vat: 2500 }],
};

const validDraft = {
  cash: false,
  lines: [{ text: 'Paper', vatType: 'HIGH', incomeAccount: '4000', net: 10000, gross: 12500 }],
};

const validPayment = { date: '2024-01-20', account: '1920:10001', amount: 12500 };

describe('purchase tools', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create tools return the new id', () => {
    it('fiken_create_purchase', async () => {
      const { context, purchases } = fakeContext();

      const output = await run('fiken_create_purchase', { purchase: validPurchase }, context);

      expect(output).toEqual({ message: 'Purchase created.', id: 123, location: `${API}/purchases/123` });
      // paid is required by the spec, so the schema defaults it
      expect(purchases.createPurchase).toHaveBeenCalledWith('co', { ...validPurchase, paid: false });
    });

    it('fiken_create_purchase_draft', async () => {
      const { context } = fakeContext();

      const output = await run('fiken_create_purchase_draft', { draft: validDraft }, context);

      expect(output).toMatchObject({ message: 'Purchase draft created.', id: 45 });
    });

    it('fiken_create_purchase_payment passes foreign-currency fields through', async () => {
      const { context, purchases } = fakeContext();
      const payment = { ...validPayment, currency: 'EUR', amount: 1000, amountInNok: 11500, fee: 2500 };

      const output = await run('fiken_create_purchase_payment', { purchaseId: 123, payment }, context);

      expect(output).toMatchObject({ message: 'Payment created.', id: 9 });
      expect(purchases.createPurchasePayment).toHaveBeenCalledWith('co', 123, payment);
    });

    it('fiken_add_attachment_to_purchase_draft uploads the file without attach flags', async () => {
      const { context, purchases } = fakeContext();
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fiken-mcp-'));
      const filePath = path.join(dir, 'invoice.pdf');
      await fs.writeFile(filePath, 'pdf');

      try {
        const output = await run(
          'fiken_add_attachment_to_purchase_draft',
          { draftId: 45, attachment: { filename: 'invoice.pdf', filePath } },
          context,
        );

        expect(output).toEqual({
          message: 'Attachment uploaded to purchase draft.',
          location: `${API}/purchases/drafts/45/attachments/745b2f15-1234-4408-8bf2-b1d2d7610cb2`,
        });
        expect(purchases.addAttachmentToPurchaseDraft).toHaveBeenCalledWith('co', 45, {
          filename: 'invoice.pdf',
          file: Buffer.from('pdf'),
        });
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it('fiken_update_purchase_draft sends the whole draft', async () => {
      const { context, purchases } = fakeContext();

      const output = await run('fiken_update_purchase_draft', { draftId: 45, draft: validDraft }, context);

      expect(output).toMatchObject({ message: 'Purchase draft updated.', id: 45 });
      expect(purchases.updatePurchaseDraft).toHaveBeenCalledWith('co', 45, { ...validDraft, paid: false });
    });

    it('fiken_create_purchase_from_draft returns the new purchaseId', async () => {
      const { context, purchases } = fakeContext();

      expect(await run('fiken_create_purchase_from_draft', { draftId: 45 }, context))
        .toMatchObject({ message: 'Purchase created from draft.', id: 456 });
      expect(purchases.createPurchaseFromDraft).toHaveBeenCalledWith('co', 45);
    });

    it('fiken_create_purchase_accrual returns the new accrualId', async () => {
      const { context, purchases } = fakeContext();
      const request = { lineId: 77, startDate: '2024-01-01', periods: 12, account: '1700' };

      expect(await run('fiken_create_purchase_accrual', { purchaseId: 123, accrual: request }, context))
        .toMatchObject({ message: 'Accrual created.', id: 5 });
      expect(purchases.createPurchaseAccrual).toHaveBeenCalledWith('co', 123, request);
    });

    it('keeps the attachment tool off the HTTP transport', () => {
      expect(tool('fiken_add_attachment_to_purchase_draft').http).toBe(false);
    });
  });

  describe('validation errors name the field', () => {
    const errorFor = async (name: string, args: Record<string, unknown>) => {
      const registry = new ToolRegistry(purchaseTools, fakeContext().context);
      const result = await registry.call(name, args, 'stdio');
      expect(result.isError).toBe(true);
      return result.content[0].text;
    };

    it('reports a missing payload', async () => {
      expect(await errorFor('fiken_create_purchase', {})).toBe('Error: Invalid arguments: purchase: Required');
      expect(await errorFor('fiken_create_purchase_draft', {})).toBe('Error: Invalid arguments: draft: Required');
      expect(await errorFor('fiken_create_purchase_payment', { purchaseId: 1 }))
        .toBe('Error: Invalid arguments: payment: Required');
      expect(await errorFor('fiken_add_attachment_to_purchase_draft', { draftId: 1 }))
        .toBe('Error: Invalid arguments: attachment: Required');
    });

    it('reports a missing id', async () => {
      expect(await errorFor('fiken_get_purchase', {})).toBe('Error: Invalid arguments: purchaseId: Required');
      expect(await errorFor('fiken_create_purchase_payment', { payment: validPayment }))
        .toBe('Error: Invalid arguments: purchaseId: Required');
    });

    it('requires an amount on each purchase line', async () => {
      const lines = [{ description: 'Paper', vatType: 'HIGH' }];

      expect(await errorFor('fiken_create_purchase', { purchase: { ...validPurchase, lines } }))
        .toBe('Error: Invalid arguments: purchase.lines.0.netPrice: Either netPrice or netPriceInCurrency is required');
    });

    it('accepts netPriceInCurrency instead of netPrice', async () => {
      const { context } = fakeContext();
      const lines = [{ description: 'Hosting', vatType: 'HIGH_FOREIGN_SERVICE_DEDUCTIBLE', netPriceInCurrency: 6800 }];

      const output = await run('fiken_create_purchase', { purchase: { ...validPurchase, currency: 'EUR', lines } }, context);

      expect(output.id).toBe(123);
    });

    it('rejects sales-only VAT types and non-integer amounts', async () => {
      const lines = [{ description: 'Paper', vatType: 'EXEMPT', netPrice: 100.5 }];
      const message = await errorFor('fiken_create_purchase', { purchase: { ...validPurchase, lines } });

      expect(message).toContain('purchase.lines.0.vatType: Invalid enum value');
      expect(message).toContain('purchase.lines.0.netPrice: Amounts are integer cents (øre)');
    });

    it('requires payments on a paid draft', async () => {
      expect(await errorFor('fiken_create_purchase_draft', { draft: { ...validDraft, paid: true } }))
        .toBe('Error: Invalid arguments: draft.payments: When paid is true, at least one payment is required');
    });

    it('rejects an attachment filename Fiken would refuse', async () => {
      expect(await errorFor('fiken_add_attachment_to_purchase_draft', {
        draftId: 1,
        attachment: { filename: 'notes.txt', filePath: '/tmp/notes.txt' },
      })).toBe('Error: Invalid arguments: attachment.filename: Filename must end with .png, .jpeg, .jpg, .gif or .pdf');
    });

    it('rejects an accrual account or period count outside the spec', async () => {
      const message = await errorFor('fiken_create_purchase_accrual', {
        purchaseId: 1,
        accrual: { lineId: 77, startDate: '2024-01-01', periods: 121, account: '1530' },
      });

      expect(message).toContain('accrual.periods: Number must be less than or equal to 120');
      expect(message).toContain('accrual.account: Invalid enum value');
    });

    it('reports a missing paymentId and draft on update', async () => {
      expect(await errorFor('fiken_get_purchase_payment', { purchaseId: 1 })).toBe('Error: Invalid arguments: paymentId: Required');
      expect(await errorFor('fiken_update_purchase_draft', { draftId: 1 })).toBe('Error: Invalid arguments: draft: Required');
    });

    it('rejects a sort order purchases do not support', async () => {
      expect(await errorFor('fiken_get_purchases', { params: { sortBy: 'createdDate asc' } }))
        .toContain('params.sortBy: Invalid enum value');
    });
  });

  describe('outputs', () => {
    it('fiken_get_purchase returns the purchase itself with amounts', async () => {
      const { context } = fakeContext();

      const output = await run('fiken_get_purchase', { purchaseId: 123 }, context);

      expect(output).not.toHaveProperty('data');
      expect(output).toMatchObject({ purchaseId: 123, amounts: { currency: 'NOK', net: 100, vat: 25, total: 125 } });
    });

    it('fiken_get_purchase_draft returns the draft itself with amounts', async () => {
      const { context } = fakeContext();

      expect(await run('fiken_get_purchase_draft', { draftId: 45 }, context))
        .toEqual({ ...draft, amounts: { currency: 'NOK', net: 100, vat: 25, total: 125 } });
    });

    it('fiken_get_purchase_drafts returns { pagination, drafts } with summaries', async () => {
      const { context, purchases } = fakeContext();

      const output = await run('fiken_get_purchase_drafts', { params: { page: 1 } }, context);

      expect(purchases.getPurchaseDrafts).toHaveBeenCalledWith('co', { page: 1 });
      expect(output.pagination).toMatchObject({ resultCount: 1 });
      expect(output.drafts).toEqual([expect.objectContaining({ draftId: 45, contact: 'Acme AS', description: 'Paper' })]);
      expect(output.drafts[0]).not.toHaveProperty('lines');

      const full = await run('fiken_get_purchase_drafts', { detail: 'full' }, context);
      expect(full.drafts[0]).toMatchObject({ lines: draft.lines, amounts: { total: 125 } });
    });

    it.each([
      ['fiken_get_purchase_attachments', 'attachments', [{ uuid: 'def', filename: 'receipt.png' }]],
      ['fiken_get_purchase_payments', 'payments', [payment]],
      ['fiken_get_purchase_accruals', 'accruals', [accrual]],
    ])('%s returns { %s }', async (name, key, items) => {
      const { context } = fakeContext();

      expect(await run(name, { purchaseId: 123 }, context)).toEqual({ [key]: items });
    });

    it('fiken_get_purchase_payment and fiken_get_purchase_accrual return the resource', async () => {
      const { context, purchases } = fakeContext();

      expect(await run('fiken_get_purchase_payment', { purchaseId: 123, paymentId: 9 }, context)).toEqual(payment);
      expect(purchases.getPurchasePayment).toHaveBeenCalledWith('co', 123, 9);
      expect(await run('fiken_get_purchase_accrual', { purchaseId: 123, accrualId: 5 }, context)).toEqual(accrual);
      expect(purchases.getPurchaseAccrual).toHaveBeenCalledWith('co', 123, 5);
    });

    it('fiken_get_purchase_draft_attachments returns { attachments }', async () => {
      const { context } = fakeContext();

      expect(await run('fiken_get_purchase_draft_attachments', { draftId: 45 }, context))
        .toEqual({ attachments: [{ uuid: 'abc', filename: 'invoice.pdf' }] });
    });

    it('fiken_get_purchases returns { pagination, purchases } with summaries and passes the filters', async () => {
      const { context, purchases } = fakeContext();
      const params = { contactId: 7, settledDateGe: '2024-01-01', lastModifiedGe: '2024-02-01', sortBy: 'date desc' };

      const output = await run('fiken_get_purchases', { params }, context);

      expect(purchases.getPurchases).toHaveBeenCalledWith('co', params);
      expect(output.pagination).toEqual({ page: 0, pageSize: 25, pageCount: 1, resultCount: 1 });
      expect(output.purchases).toEqual([expect.objectContaining({ purchaseId: 123, supplier: 'Acme AS', description: 'Paper' })]);
      expect(output.purchases[0]).not.toHaveProperty('lines');
    });
  });

  describe('input schemas advertise every field the zod schema accepts', () => {
    const unwrap = (schema: z.ZodTypeAny): z.ZodTypeAny => {
      if (schema instanceof z.ZodEffects) return unwrap(schema.innerType());
      if (schema instanceof z.ZodOptional) return unwrap(schema.unwrap());
      if (schema instanceof z.ZodDefault) return unwrap(schema.removeDefault());
      return schema;
    };

    // Walks objects and arrays, comparing property names, required lists and enum values
    const expectMatchingFields = (zodSchema: z.ZodTypeAny, json: any, at: string) => {
      const schema = unwrap(zodSchema);
      if (schema instanceof z.ZodObject) {
        const shape = schema.shape as Record<string, z.ZodTypeAny>;
        expect(Object.keys(json.properties ?? {}).sort(), at).toEqual(Object.keys(shape).sort());
        const required = Object.keys(shape).filter(key => !shape[key].isOptional());
        expect([...(json.required ?? [])].sort(), `${at} required`).toEqual(required.sort());
        for (const [key, value] of Object.entries(shape)) {
          expectMatchingFields(value, json.properties[key], `${at}.${key}`);
        }
      } else if (schema instanceof z.ZodArray) {
        expectMatchingFields(schema.element, json.items, `${at}[]`);
      } else if (schema instanceof z.ZodEnum) {
        expect(json.enum, at).toEqual(schema.options);
      }
    };

    it.each([
      ['fiken_get_purchases', 'params', PurchaseQueryParamsSchema],
      ['fiken_create_purchase', 'purchase', PurchaseRequestSchema],
      ['fiken_get_purchase_drafts', 'params', PurchaseDraftQueryParamsSchema],
      ['fiken_create_purchase_draft', 'draft', DraftRequestSchema],
      ['fiken_update_purchase_draft', 'draft', DraftRequestSchema],
      ['fiken_create_purchase_accrual', 'accrual', PurchaseAccrualRequestSchema],
      ['fiken_add_attachment_to_purchase_draft', 'attachment', AttachmentFileSchema],
      ['fiken_create_purchase_payment', 'payment', PaymentSchema],
    ] as const)('%s %s', (name, property, schema) => {
      const json = tool(name).inputSchema.properties![property];
      expectMatchingFields(schema, json, property);
    });
  });

  describe('tool names', () => {
    it('are unique, start with fiken_ and declare only advertised required fields', () => {
      const names = purchaseTools.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
      for (const t of purchaseTools) {
        expect(t.name).toMatch(/^fiken_/);
        const properties = Object.keys(t.inputSchema.properties ?? {});
        expect(properties, t.name).toContain('companySlug');
        for (const field of (t.inputSchema.required as string[] | undefined) ?? []) {
          expect(properties, t.name).toContain(field);
        }
      }
    });

    it('add no send or delete tools', () => {
      const names = purchaseTools.map(t => t.name);
      expect(names.filter(name => /send/.test(name))).toEqual([]);
      expect(names.filter(name => /delete/.test(name))).toEqual([]);
    });
  });
});
