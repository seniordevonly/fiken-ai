import { logger } from 'fiken-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { FikenContext } from '../context.js';
import { ToolRegistry } from './registry.js';
import { saleToolArgs, saleTools } from './sales.js';

const byName = (name: string) => saleTools.find(tool => tool.name === name)!;
const parse = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

const pages = {
  'Fiken-Api-Page': 0,
  'Fiken-Api-Page-Size': 25,
  'Fiken-Api-Page-Count': 3,
  'Fiken-Api-Result-Count': 61,
};

const eurSale = {
  saleId: 42,
  saleNumber: 'EXT-7',
  date: '2026-03-01',
  dueDate: '2026-03-15',
  kind: 'external_invoice',
  customer: { contactId: 9, name: 'Nordlys AS', email: 'post@nordlys.no' },
  currency: 'EUR',
  settled: false,
  outstandingBalance: 117500,
  outstandingBalanceInCurrency: 10000,
  lines: [
    { lineId: 1, description: 'Consulting', netPrice: 117500, vat: 0, netPriceInCurrency: 10000, vatInCurrency: 0 },
    { lineId: 2, description: 'Consulting', netPrice: 0, vat: 0, netPriceInCurrency: 0, vatInCurrency: 0 },
  ],
  salePayments: [],
  saleAttachments: [],
};

const created = (location: string) => ({ data: undefined, headers: undefined, location });

describe('sale tools', () => {
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let context: FikenContext;
  let registry: ToolRegistry;

  beforeEach(() => {
    service = {
      getSales: vi.fn(async () => ({ data: [eurSale], headers: pages })),
      getSale: vi.fn(async () => ({ data: eurSale, headers: undefined })),
      createSale: vi.fn(async () => created('https://api.fiken.no/api/v2/companies/co/sales/42')),
      createSalePayment: vi.fn(async () => created('https://api.fiken.no/api/v2/companies/co/sales/42/payments/5')),
      getSalePayments: vi.fn(async () => ({ data: [{ paymentId: 5, amount: 100 }], headers: undefined })),
      getSaleDrafts: vi.fn(async () => ({
        data: [{
          draftId: 3,
          cash: false,
          paid: false,
          currency: 'NOK',
          contact: { name: 'Fjord AS' },
          lines: [{ text: 'Course', net: 80000, gross: 100000 }, { text: 'Book', net: 10000, gross: 11500 }],
          attachments: [],
        }],
        headers: pages,
      })),
      createSaleDraft: vi.fn(async () => created('https://api.fiken.no/api/v2/companies/co/sales/drafts/3')),
      createSaleFromDraft: vi.fn(async () => created('https://api.fiken.no/api/v2/companies/co/sales/77')),
    };
    context = {
      resolveCompanySlug: (slug?: string) => slug ?? 'co',
      client: () => service,
    } as unknown as FikenContext;
    registry = new ToolRegistry(saleTools, context);
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('definitions', () => {
    it('has unique fiken_ names and no delete or send tools', () => {
      const names = saleTools.map(tool => tool.name);

      expect(names).toHaveLength(16);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name).toMatch(/^fiken_[a-z_]+$/);
        expect(name).not.toMatch(/delete|send/);
      }
    });

    it('has an argument schema for every tool and no others', () => {
      expect(Object.keys(saleToolArgs).sort()).toEqual(saleTools.map(tool => tool.name).sort());
    });

    const unwrap = (schema: z.ZodTypeAny): z.ZodTypeAny => {
      if (schema instanceof z.ZodOptional) return unwrap(schema.unwrap());
      if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType);
      if (schema instanceof z.ZodEffects) return unwrap(schema.innerType());
      return schema;
    };

    // Walks zod and JSON schema together so nested request bodies can't drift apart either
    const expectSameShape = (zod: z.ZodTypeAny, json: any, path: string) => {
      const inner = unwrap(zod);
      if (inner instanceof z.ZodObject) {
        const shape = inner.shape as Record<string, z.ZodTypeAny>;
        expect(Object.keys(json.properties ?? {}).sort(), path).toEqual(Object.keys(shape).sort());
        const required = Object.keys(shape).filter(key => !shape[key].isOptional());
        expect([...(json.required ?? [])].sort(), `${path} required`).toEqual(required.sort());
        for (const key of Object.keys(shape)) {
          expectSameShape(shape[key], json.properties[key], `${path}.${key}`);
        }
      } else if (inner instanceof z.ZodArray) {
        expectSameShape(inner.element, json.items, `${path}[]`);
      } else if (inner instanceof z.ZodEnum) {
        expect(json.enum, path).toEqual(inner.options);
      }
    };

    it.each(saleTools.map(tool => [tool.name, tool] as const))('%s inputSchema matches its zod schema', (name, tool) => {
      const args = saleToolArgs[name as keyof typeof saleToolArgs];
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(Object.keys(args.shape).sort());
      expectSameShape(args, tool.inputSchema, name);
    });
  });

  describe('fiken_get_sales', () => {
    it('returns pagination and a compact summary per sale', async () => {
      const result = await byName('fiken_get_sales').handler({ params: { settled: false, pageSize: 25 } }, context);

      expect(service.getSales).toHaveBeenCalledWith('co', { settled: false, pageSize: 25 });
      expect(parse(result)).toEqual({
        pagination: { page: 0, pageSize: 25, pageCount: 3, resultCount: 61 },
        sales: [{
          saleId: 42,
          saleNumber: 'EXT-7',
          date: '2026-03-01',
          dueDate: '2026-03-15',
          kind: 'external_invoice',
          customer: 'Nordlys AS',
          description: 'Consulting',
          settled: false,
          amounts: {
            currency: 'EUR',
            net: 100,
            vat: 0,
            total: 100,
            netNok: 1175,
            vatNok: 0,
            totalNok: 1175,
            outstanding: 100,
            outstandingNok: 1175,
          },
        }],
      });
      expect(result.meta).toEqual({ items: 1 });
    });

    it('returns full records with amounts on detail=full', async () => {
      const { sales } = parse(await byName('fiken_get_sales').handler({ detail: 'full' }, context));

      expect(sales[0]).toMatchObject({ saleId: 42, lines: eurSale.lines, amounts: { outstanding: 100 } });
    });

    it('passes the company slug through', async () => {
      await byName('fiken_get_sales').handler({ companySlug: 'other' }, context);

      expect(service.getSales).toHaveBeenCalledWith('other', undefined);
    });
  });

  it('fiken_get_sale returns the sale with an amounts summary', async () => {
    const sale = parse(await byName('fiken_get_sale').handler({ saleId: 42 }, context));

    expect(service.getSale).toHaveBeenCalledWith('co', 42);
    expect(sale).toMatchObject({ ...eurSale, amounts: { currency: 'EUR', total: 100, totalNok: 1175 } });
  });

  it('fiken_get_sale_payments lists payments', async () => {
    const result = parse(await byName('fiken_get_sale_payments').handler({ saleId: 42 }, context));

    expect(result).toEqual({ payments: [{ paymentId: 5, amount: 100 }] });
  });

  it('fiken_get_sale_drafts summarises drafts in major units', async () => {
    const { drafts } = parse(await byName('fiken_get_sale_drafts').handler({}, context));

    expect(drafts).toEqual([{
      draftId: 3,
      cash: false,
      paid: false,
      customer: 'Fjord AS',
      description: 'Course; Book',
      amounts: { currency: 'NOK', net: 900, vat: 215, total: 1115 },
    }]);
  });

  describe('creates', () => {
    const sale = {
      date: '2026-03-01',
      kind: 'cash_sale',
      currency: 'NOK',
      paymentAccount: '1920:10001',
      lines: [{ description: 'Coffee', vatType: 'MEDIUM', netPrice: 10000, vat: 1500 }],
    };

    it('fiken_create_sale returns the new sale id', async () => {
      const result = parse(await byName('fiken_create_sale').handler({ sale }, context));

      expect(service.createSale).toHaveBeenCalledWith('co', sale);
      expect(result).toEqual({
        message: 'Sale created',
        id: 42,
        location: 'https://api.fiken.no/api/v2/companies/co/sales/42',
      });
    });

    it('fiken_create_sale_draft defaults paid to false', async () => {
      const draft = { cash: true, lines: [{ text: 'Course', vatType: 'HIGH', incomeAccount: '3000', net: 800, gross: 1000 }] };

      const result = parse(await byName('fiken_create_sale_draft').handler({ draft }, context));

      expect(service.createSaleDraft).toHaveBeenCalledWith('co', { ...draft, paid: false });
      expect(result.id).toBe(3);
    });

    it('fiken_create_sale_from_draft returns the new sale id', async () => {
      const result = parse(await byName('fiken_create_sale_from_draft').handler({ draftId: 3 }, context));

      expect(service.createSaleFromDraft).toHaveBeenCalledWith('co', 3);
      expect(result).toMatchObject({ message: 'Sale created from draft', id: 77 });
    });

    it('fiken_create_sale_payment returns the new payment id', async () => {
      const payment = { date: '2026-03-02', account: '1920:10001', amount: 11500 };

      const result = parse(await byName('fiken_create_sale_payment').handler({ saleId: 42, payment }, context));

      expect(service.createSalePayment).toHaveBeenCalledWith('co', 42, payment);
      expect(result.id).toBe(5);
    });
  });

  describe('argument errors name the field', () => {
    const errorFor = async (name: string, args: Record<string, unknown>) => {
      const result = await registry.call(name, args, 'stdio');
      expect(result.isError).toBe(true);
      return result.content[0].text;
    };

    it('reports a missing id', async () => {
      expect(await errorFor('fiken_get_sale', {})).toBe('Error: Invalid arguments: saleId: Required');
      expect(service.getSale).not.toHaveBeenCalled();
    });

    it('reports a non-integer id', async () => {
      expect(await errorFor('fiken_create_sale_from_draft', { draftId: 1.5 })).toMatch(/^Error: Invalid arguments: draftId: /);
    });

    it('reports nested problems in the sale', async () => {
      const text = await errorFor('fiken_create_sale', {
        sale: {
          date: '01.03.2026',
          kind: 'external_invoice',
          currency: 'NOK',
          lines: [{ description: 'x', vatType: 'HIGH_DIRECT' }],
        },
      });

      expect(text).toContain('sale.date: Expected a date in YYYY-MM-DD format');
      expect(text).toContain('sale.lines.0.vatType: ');
      expect(service.createSale).not.toHaveBeenCalled();
    });

    it('requires an amount on each sale line', async () => {
      const text = await errorFor('fiken_create_sale', {
        sale: { date: '2026-03-01', kind: 'invoice', currency: 'NOK', lines: [{ description: 'x', vatType: 'HIGH' }] },
      });

      expect(text).toBe('Error: Invalid arguments: sale.lines.0.netPrice: Either netPrice or netPriceInCurrency is required');
    });

    it('rejects unknown fields instead of dropping them', async () => {
      const text = await errorFor('fiken_create_sale', {
        sale: { date: '2026-03-01', kind: 'invoice', currency: 'NOK', contactId: 9, lines: [{ description: 'x', vatType: 'HIGH', netPrice: 1 }] },
      });

      expect(text).toContain("sale: Unrecognized key(s) in object: 'contactId'");
    });

    it('rejects a pageSize over 100', async () => {
      expect(await errorFor('fiken_get_sales', { params: { pageSize: 500 } })).toMatch(/params\.pageSize: /);
    });

    it('rejects an accrual account Fiken does not accept for sales', async () => {
      const text = await errorFor('fiken_create_sale_accrual', {
        saleId: 42,
        accrual: { lineId: 1, startDate: '2026-01-01', periods: 12, account: '1749' },
      });

      expect(text).toMatch(/accrual\.account: /);
    });
  });
});
